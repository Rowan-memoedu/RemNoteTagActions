import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {validatePlan} from '../src/plan.mjs';
import {applyPlan} from '../src/engine.mjs';
import {codexArgs} from '../handlers/generate/index.mjs';
import {registerHandler,handler} from '../src/registry.mjs';
import {finalizeVerified} from '../src/recovery.mjs';
import {Worker} from '../src/worker.mjs';
import {jsonWrite} from '../src/io.mjs';

function fixture() {
  const node=(remId,title,parentRemId,children=[],tags=[])=>({remId,title,headline:title,parentRemId,children,tags,remType:'text',cardDirection:null,inlineRefs:[],media:[]});
  return {rootId:'root',nodes:{root:node('root','实验',null,['instruction','keep'],['trigger','personal']),instruction:node('instruction','列出两种颜色','root'),keep:node('keep','原文保持','root')}};
}
const plan=()=>({status:'ready',reason:'',readRemIds:['root'],updates:[{remId:'instruction',title:'红色'}],creates:[{key:'new_blue',parentRef:'root',title:'蓝色'}],archives:[],evidence:[]});
function fake() {
  let state=fixture(),serial=0;const calls=[];
  return {calls,get state(){return state;},snapshot:async()=>structuredClone(state),call:async(name,args)=>{
    calls.push({name,args});
    if(name==='remnote_update_note'){state.nodes[args.remId].title=args.title;state.nodes[args.remId].headline=args.title;return{remIds:[args.remId]};}
    if(name==='remnote_create_note'){const newId=`created_${++serial}`;state.nodes[newId]={...structuredClone(state.nodes.instruction),remId:newId,title:args.title,headline:args.title,parentRemId:args.parentId,children:[]};state.nodes[args.parentId].children.push(newId);return{remIds:[newId]};}
    if(name==='remnote_update_tags'){let n=state.nodes[args.remId];n.tags=[...new Set([...n.tags,...(args.addTagRemIds??[])])].filter(t=>!args.removeTagRemIds?.includes(t)).sort();return{remIds:[args.remId]};}
    throw Error('unexpected tool');
  }};
}
async function options(mcp) {
  const jobDir=await mkdtemp('D:/Artifacts/RemNoteTagActions/test-');
  return {mcp,config:{maxNodes:30},rule:{triggerTagId:'trigger',completedTagId:'done'},snapshot:fixture(),plan:plan(),jobDir};
}
test('content is read back before tag transition; unrelated content and tags survive',async()=>{
  const mcp=fake(),o=await options(mcp),r=await applyPlan(o);
  assert.equal(r.status,'completed');assert.deepEqual(mcp.state.nodes.root.tags,['done','personal']);
  assert.equal(mcp.state.nodes.keep.title,'原文保持');assert.equal(mcp.state.nodes.instruction.title,'红色');
  assert.deepEqual(mcp.calls.map(x=>x.name),['remnote_update_note','remnote_create_note','remnote_update_tags','remnote_update_tags']);
  assert.equal(JSON.parse(await readFile(join(o.jobDir,'apply.json'),'utf8')).status,'completed');
});
test('concurrent content edit prevents all writes',async()=>{
  const mcp=fake(),o=await options(mcp);mcp.state.nodes.keep.title='用户的新修改';
  await assert.rejects(applyPlan(o),/Source changed/);assert.equal(mcp.calls.length,0);
});
test('write failure retains trigger and is held for recovery',async()=>{
  const mcp=fake(),o=await options(mcp),call=mcp.call;
  mcp.call=async(name,args)=>{if(name==='remnote_create_note')throw Error('Disconnected');return call(name,args);};
  await assert.rejects(applyPlan(o),/Disconnected/);assert.deepEqual(mcp.state.nodes.root.tags,['trigger','personal']);
  assert.equal(JSON.parse(await readFile(join(o.jobDir,'apply.json'),'utf8')).status,'needs-review');
});
test('truncated or corrupt readback cannot mark completion',async()=>{
  const mcp=fake(),o=await options(mcp),call=mcp.call;
  mcp.call=async(name,args)=>{const r=await call(name,args);if(name==='remnote_update_note')mcp.state.nodes.instruction.title='错误结果';return r;};
  await assert.rejects(applyPlan(o),/readback differs/);assert(!mcp.calls.some(x=>x.name==='remnote_update_tags'));
});
test('arbitrary targets, root deletion and protected leaves are rejected',()=>{
  const s=fixture();assert.throws(()=>validatePlan(s,{...plan(),updates:[{remId:'outside',title:'x'}]}),/outside/);
  assert.throws(()=>validatePlan(s,{...plan(),archives:['root']}),/instruction leaves/);
  s.nodes.keep.media=[{kind:'image'}];assert.throws(()=>validatePlan(s,{...plan(),archives:['keep']}),/instruction leaves/);
  s.nodes.instruction.inlineRefs=[{targetRemId:'target'}];assert.throws(()=>validatePlan(s,plan()),/reference/);
});
test('hidden URL markup is rejected before any mutation',()=>{
  assert.throws(()=>validatePlan(fixture(),{...plan(),updates:[{remId:'instruction',title:'[链接](https://example.com)'}]}),/visible URLs/);
});
test('new nodes may depend only on previous declared parents',()=>{
  assert.throws(()=>validatePlan(fixture(),{...plan(),creates:[{key:'a',parentRef:'future',title:'x'}]}),/dependency/);
  assert.doesNotThrow(()=>validatePlan(fixture(),{...plan(),creates:[{key:'a',parentRef:'root',title:'x'},{key:'b',parentRef:'a',title:'y'}]}));
});
test('second handler and tag rule require no runtime branch',()=>{
  const second={prepare:async()=>({status:'blocked'})};registerHandler('independent-fixture-handler',second);assert.equal(handler('independent-fixture-handler'),second);
});
test('Codex uses explicitly selected workspace and read-only MCP tools',()=>{
  const a=codexArgs({workspace:'D:/Workspaces/新建文件夹',model:'configured-model',mcpUrl:'http://127.0.0.1:1/mcp'},'D:/Artifacts/result.json');
  assert.equal(a[a.indexOf('--cd')+1],'D:/Workspaces/新建文件夹');assert.equal(a[a.indexOf('--sandbox')+1],'read-only');
  assert(a.includes('--ignore-user-config'));assert(!a.some(x=>x.includes('remnote_update_note')));assert(a.some(x=>x.includes('enabled_tools=')));
});
test('an uncertain final tag write recovers without regenerating content',async()=>{
  const mcp=fake(),o=await options(mcp),call=mcp.call;
  mcp.call=async(name,args)=>{if(name==='remnote_update_tags'&&args.removeTagRemIds)throw Error('Connection dropped');return call(name,args);};
  await assert.rejects(applyPlan(o),/Connection dropped/);
  await jsonWrite(join(o.jobDir,'plan.json'),o.plan);
  const beforeCalls=mcp.calls.length; mcp.call=call;
  const state={entries:{'other-rule:root':{jobDir:o.jobDir,status:'needs-review'}}};
  const worker={locked:f=>f(),state:async()=>state,rule:()=>o.rule,checkTags:async()=>{},save:async()=>{},mcp,config:o.config};
  const result=await finalizeVerified(worker,'other-rule','root');
  assert.equal(result.status,'completed');assert.deepEqual(mcp.state.nodes.root.tags,['done','personal']);
  assert.deepEqual(mcp.calls.slice(beforeCalls).map(x=>x.name),['remnote_update_tags']);
});
test('two workers cannot write concurrently',async()=>{
  const dataRoot=await mkdtemp('D:/Artifacts/RemNoteTagActions/lock-test-');
  const first=new Worker({dataRoot}),second=new Worker({dataRoot});let release,entered;
  const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
  const running=first.locked(async()=>{entered();await gate;});await ready;
  await assert.rejects(second.locked(async()=>{}),/Another worker/);release();await running;
  await assert.doesNotReject(second.locked(async()=>{}));
});
