import {join} from 'node:path';
import {jsonRead,jsonWrite,same} from './io.mjs';
import {contentView} from './plan.mjs';

// Only completes the tag transition of an already fully verified content commit.
// Partial or ambiguous content writes remain held; they are never re-generated.
export async function finalizeVerified(worker,ruleId,remId) {
  return worker.locked(async()=>{
    const state=await worker.state(),entry=state.entries[`${ruleId}:${remId}`];
    if(!entry)throw Error('No recoverable job');
    const rule=worker.rule(ruleId);await worker.checkTags(rule);
    const receipt=await jsonRead(join(entry.jobDir,'apply.json'));
    const plan=await jsonRead(join(entry.jobDir,'plan.json'));
    if(receipt.steps.length!==plan.updates.length+plan.creates.length+plan.archives.length||receipt.steps.some(s=>s.status!=='verified')) throw Error('Content is not fully verified; inspect the operation journal before recovery');
    const expected=await jsonRead(join(entry.jobDir,'last-verified.json'));
    const current=await worker.mcp.snapshot(remId,worker.config.maxNodes);
    if(!same(contentView(expected),contentView(current)))throw Error('Content changed; tag recovery refused');
    const unrelated=s=>s.nodes[remId].tags.filter(x=>![rule.triggerTagId,rule.completedTagId].includes(x));
    if(!same(unrelated(expected),unrelated(current)))throw Error('Other tags changed; recovery refused');
    await worker.mcp.call('remnote_update_tags',{remId,addTagRemIds:[rule.completedTagId],removeTagRemIds:[rule.triggerTagId]});
    const after=await worker.mcp.snapshot(remId,worker.config.maxNodes);
    if(!same(contentView(expected),contentView(after))||after.nodes[remId].tags.includes(rule.triggerTagId)||!after.nodes[remId].tags.includes(rule.completedTagId))throw Error('Tag recovery readback failed');
    receipt.status='completed';receipt.tagRecoveryAt=new Date().toISOString();await jsonWrite(join(entry.jobDir,'apply.json'),receipt);await jsonWrite(join(entry.jobDir,'after.json'),after);
    entry.status='completed';entry.finishedAt=new Date().toISOString();delete entry.error;await worker.save(state);return entry;
  });
}
