import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Runtime} from '../src/runtime.mjs';
import {verifyGeneration} from '../src/generation.mjs';
import {messagesFromNative} from '../src/native.mjs';
import {serve,imageType} from '../src/server.mjs';
import {jsonRead,jsonWrite} from '../src/io.mjs';

async function fixture() {
  const root=await mkdtemp('D:/Artifacts/RemNoteTagActions/test-');await mkdir(join(root,'plugin'));await writeFile(join(root,'plugin/index.html'),'<!--LOCAL_BOOTSTRAP-->');
  const notes={start:{remId:'start',title:'Start'},end:{remId:'end',title:'End'},root:{remId:'root',title:'Root',tags:[],ancestors:[]},child:{remId:'child',title:'Child',tags:[],ancestors:[{remId:'root'}]}};
  const writes=[],deliveries=new Map(),sends=[];let enqueueThrows=false,sendThrows=false;
  const config={dataRoot:join(root,'data'),artifactsRoot:root,rules:[{id:'any-rule',handler:'test-handler',triggerTagId:'start',triggerTagName:'Start',completedTagId:'end',completedTagName:'End'}],pollMs:60000};
  const runtime=new Runtime(config,{log:()=>{},handlers:{'test-handler':{prepare:async()=> 'Read the original node',verify:async()=>({completed:false})}},mcp:{read:async id=>structuredClone(notes[id]),call:async(name,args)=>{writes.push(args);notes[args.remId].tags=[{tagRemId:args.addTagRemIds[0]}];},tagged:async()=>[notes.root]},wakewire:{enqueue:async(key,prompt)=>{if(enqueueThrows)throw Error('network uncertain');deliveries.set(key,{id:key,threadId:'native'});return deliveries.get(key);},delivery:async key=>deliveries.get(key)},native:{visible:async()=>({title:'Native title'}),read:async()=>({thread:{id:'native',status:{type:'idle'}},turns:[{id:'turn-1',status:'completed',items:[]}]}),send:async(...args)=>{sends.push(args);if(sendThrows)throw Error('unknown result');return {threadId:'native'};},close:async()=>{}}});
  return {runtime,root,notes,writes,deliveries,sends,setEnqueueThrows:v=>enqueueThrows=v,setSendThrows:v=>sendThrows=v};
}
test('concurrent duplicate selection uses one job and collapses child selections',async()=>{
  const f=await fixture(),request={requestId:'req',kbId:'kb',ruleId:'any-rule',remIds:['root','child']};
  const [a,b]=await Promise.all([f.runtime.submitRule(request),f.runtime.submitRule(request)]);
  assert.equal(a.accepted.length,1);assert.equal(a.accepted[0].id,b.accepted[0].id);assert.equal(f.writes.length,1);assert.equal(f.deliveries.size,1);
});
test('selected ancestors beyond the first context page still collapse to one target',async()=>{
  const f=await fixture();f.notes.child.ancestors=[{remId:'middle'}];f.notes.child.ancestorsTruncated=true;f.notes.middle={remId:'middle',title:'Middle',ancestors:[{remId:'root'}]};
  const r=await f.runtime.submitRule({requestId:'deep',kbId:'kb',ruleId:'any-rule',remIds:['root','child']});assert.equal(r.accepted.length,1);assert.equal(r.accepted[0].remId,'root');
});
test('completed native turn without verified content retains the trigger tag',async()=>{
  const f=await fixture();await f.runtime.submitRule({requestId:'req',kbId:'kb',ruleId:'any-rule',remIds:['root']});
  await f.runtime.tick({scan:false});assert.equal(f.writes.length,1);assert.equal((await f.runtime.state()).jobs[0].status,'awaiting-input');
});
test('unknown WakeWire acceptance recovers with the same idempotency key',async()=>{
  const f=await fixture();f.setEnqueueThrows(true);
  const job=await f.runtime.chat({requestId:'req',kbId:'kb',text:'Do work'});assert.equal(job.status,'acceptance-unknown');
  f.deliveries.set(job.id,{id:job.id,threadId:'native'});await f.runtime.tick({scan:false});
  const state=await f.runtime.state();assert.equal(state.jobs.length,1);assert.equal(state.jobs[0].threadId,'native');assert.equal(state.jobs[0].visible,true);
});
test('unknown native follow-up is held, not resent on retry or restart',async()=>{
  const f=await fixture();const job=await f.runtime.chat({requestId:'new',kbId:'kb',text:'Hello'});f.setSendThrows(true);
  const data={requestId:'follow',kbId:'kb',text:'Continue'};
  assert.equal((await f.runtime.followup(job.id,data)).status,'unknown');await f.runtime.followup(job.id,data);
  await assert.rejects(f.runtime.followup(job.id,{...data,requestId:'other'}),/结果未确认/);assert.equal(f.sends.length,1);
});
test('native renderer excludes reasoning and raw tool content and preserves chronological turns',()=>{
  const s={turns:[{id:'2',items:[{id:'b',type:'agentMessage',text:'second'}]},{id:'1',items:[{id:'u',type:'userMessage',content:[{type:'text',text:'first'}]},{type:'reasoning',summary:'private'},{type:'commandExecution',command:'secret'}]}]};
  assert.deepEqual(messagesFromNative(s).map(m=>m.content),['first','second']);
});
test('native cross-Thread prompts render and recover through the official delegation output only',async()=>{
  const f=await fixture(),job=await f.runtime.chat({requestId:'initial',kbId:'kb',text:'First'});f.setSendThrows(true);
  await f.runtime.followup(job.id,{requestId:'uncertain',kbId:'kb',text:'More'});
  const prompt=f.sends[0][1],item={type:'functionCallOutput',id:'input',namespace:'codex_app',name:'send_message_to_thread',output:{text:'<codex_delegation>\n<source_thread_id>owner</source_thread_id>\n<input>'+prompt+'</input>\n</codex_delegation>',truncated:false}};
  const snapshot={thread:{status:{type:'idle'}},turns:[{id:'new-turn',status:'completed',items:[item,{...item,id:'other',namespace:'untrusted'}]}]};
  assert.equal(messagesFromNative(snapshot).length,1);assert.equal(messagesFromNative(snapshot)[0].content,prompt);
  f.runtime.native.read=async()=>snapshot;await f.runtime.tick({scan:false});assert.equal((await f.runtime.state()).attempts.uncertain.status,'accepted');assert.equal(f.sends.length,1);
});
function trees(){const n={remId:'root',title:'Instruction',parentRemId:'doc',children:[],remType:'text',cardDirection:null,tags:['start'],inlineRefs:[],media:[]};return {before:{rootId:'root',nodes:{root:n}},after:{rootId:'root',nodes:{root:{...n,title:'Answer'}}},result:{version:1,rootId:'root',expectedNodes:[{remId:'root',title:'Answer',parentRemId:'doc'}],consumedInstructionIds:[]},read:async()=>{},trashRemId:'trash'};}
test('receipt is independently checked against live content and protected structure',async()=>{
  await verifyGeneration(trees());
  const wrong=trees();wrong.after.nodes.root.title='different';await assert.rejects(verifyGeneration(wrong),/readback differs/);
  const moved=trees();moved.after.nodes.root.parentRemId='elsewhere';await assert.rejects(verifyGeneration(moved),/hierarchy/);
  const missing=trees();missing.after.nodes.extra={...missing.after.nodes.root,remId:'extra'};await assert.rejects(verifyGeneration(missing),/Unreported new/);
});
test('HTTP API rejects third-party origins and unauthenticated requests; boot token stays in the plugin frame',async()=>{
  const f=await fixture(),service=await serve(f.runtime,{port:0,startPolling:false,ipv6:false});
  try {
    const origin='http://127.0.0.1:'+service.server.address().port,{token}=await jsonRead(join(f.root,'data/transport.json'));
    assert.equal((await fetch(origin+'/api/status')).status,401);
    assert.equal((await fetch(origin+'/api/status',{headers:{Origin:'https://evil.example',Authorization:'Bearer '+token}})).status,403);
    assert.equal((await fetch(origin+'/')).status,403);
    const frame=await fetch(origin+'/',{headers:{'Sec-Fetch-Dest':'iframe'}});assert(frame.headers.get('content-security-policy').includes('frame-ancestors'));assert((await frame.text()).includes(token));
    assert.equal((await fetch(origin+'/api/status',{headers:{Origin:'null',Authorization:'Bearer '+token}})).status,200);
  }finally{await service.close();}
});
test('image uploads reject scriptable SVG content',()=>{assert.throws(()=>imageType(Buffer.from('<svg onload="alert(1)"/>')));});
