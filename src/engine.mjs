import {join} from 'node:path';
import {jsonWrite,same} from './io.mjs';
import {validatePlan,assertFresh,contentView} from './plan.mjs';

export async function applyPlan({mcp,config,rule,snapshot,plan,jobDir,checkpoint=async()=>{}}) {
  validatePlan(snapshot,plan);
  let expected=snapshot;
  const receipt={status:'prepared',steps:[],created:[],archived:[]};
  const save=()=>jsonWrite(join(jobDir,'apply.json'),receipt);
  const current=()=>mcp.snapshot(snapshot.rootId,config.maxNodes);
  await save();
  const references=new Map(Object.keys(snapshot.nodes).map(x=>[x,x]));
  await jsonWrite(join(jobDir,'last-verified.json'),expected);
  const step=async(operation,execute,verify)=>{
    assertFresh(expected,await current());
    receipt.status='applying';receipt.steps.push({operation,status:'prepared'});await save();await checkpoint('applying');
    const result=await execute();
    receipt.steps.at(-1).result=result;await save();
    const after=await current();
    await verify(result,after);
    expected=after;
    await jsonWrite(join(jobDir,'last-verified.json'),expected);
    receipt.steps.at(-1).status='verified';receipt.steps.at(-1).result=result;await save();
  };
  try {
    for(const update of plan.updates) await step({kind:'update',...update},()=>mcp.call('remnote_update_note',update),async(_r,after)=>{
      const target=after.nodes[update.remId];
      if(target?.title!==update.title) throw Error('Updated text readback differs from candidate');
      const allowed=structuredClone(expected);allowed.nodes[update.remId].title=target.title;allowed.nodes[update.remId].headline=target.headline;allowed.nodes[update.remId].inlineRefs=target.inlineRefs;
      assertFresh(allowed,after);
    });
    for(const create of plan.creates) {
      const parentId=references.get(create.parentRef);
      await step({kind:'create',...create,parentId},()=>mcp.call('remnote_create_note',{parentId,title:create.title}),async(r,after)=>{
        const added=Object.keys(after.nodes).filter(x=>!expected.nodes[x]);
        if(added.length!==1||after.nodes[added[0]].title!==create.title||after.nodes[added[0]].parentRemId!==parentId) throw Error('Create readback mismatch');
        const newId=added[0];
        const allowed=structuredClone(expected);allowed.nodes[parentId].children.push(newId);allowed.nodes[newId]=after.nodes[newId];assertFresh(allowed,after);
        references.set(create.key,newId);receipt.created.push({key:create.key,remId:newId,parentId});
      });
    }
    for(const remId of plan.archives) {
      const oldParent=expected.nodes[remId].parentRemId;
      const trash=await mcp.read(config.trashRemId);
      if(trash.parentRemId||trash.title!=='trash') throw Error('Configured trash must be the exact root trash');
      await step({kind:'archive',remId,oldParent},async()=>{
        await mcp.call('remnote_move_note',{remId,newParentRemId:config.trashRemId,expectedOldParentRemId:oldParent,dryRun:true});
        return mcp.call('remnote_move_note',{remId,newParentRemId:config.trashRemId,expectedOldParentRemId:oldParent,dryRun:false});
      },async(_r,after)=>{
        const moved=await mcp.read(remId);
        if(moved.parentRemId!==config.trashRemId) throw Error('Archive readback mismatch');
        const allowed=structuredClone(expected);delete allowed.nodes[remId];allowed.nodes[oldParent].children=allowed.nodes[oldParent].children.filter(x=>x!==remId);assertFresh(allowed,after);
        receipt.archived.push({remId,oldParent});
      });
    }
    assertFresh(expected,await current());
    receipt.status='content-verified';await save();await checkpoint('content-verified');
    // Add completion first. If removing trigger fails, the durable journal
    // blocks re-generation and allows a tag-only recovery.
    await mcp.call('remnote_update_tags',{remId:snapshot.rootId,addTagRemIds:[rule.completedTagId]});
    let tagged=await current();
    if(!same(contentView(expected),contentView(tagged))) throw Error('Content changed during completion tagging');
    const expectedTags=[...new Set([...expected.nodes[snapshot.rootId].tags,rule.completedTagId])].sort();
    if(!same(expectedTags,tagged.nodes[snapshot.rootId].tags)) throw Error('Unexpected tags after completion add');
    await mcp.call('remnote_update_tags',{remId:snapshot.rootId,removeTagRemIds:[rule.triggerTagId]});
    const final=await current();
    if(!same(contentView(expected),contentView(final))||!same(expectedTags.filter(t=>t!==rule.triggerTagId),final.nodes[snapshot.rootId].tags)) throw Error('Final readback mismatch');
    receipt.status='completed';await save();await jsonWrite(join(jobDir,'after.json'),final);return receipt;
  } catch(error) {
    receipt.status=receipt.steps.length?'needs-review':'failed';receipt.error=error.message;await save();throw error;
  }
}
