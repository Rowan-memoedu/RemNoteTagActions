import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeThreads} from '../src/native.mjs';
import {sessionOverrides} from '../src/wakewire.mjs';

test('workflow creates native user turns with rich image input and no source chat',async()=>{
  const calls=[];let closed=0;
  const session={alive:true,serverRequests:new Map(),connect:async()=>session,close:async()=>{closed++;},request:async(method,params)=>{
    calls.push({method,params});
    if(method==='thread/start')return {thread:{id:'independent'}};
    if(method==='turn/start')return {turn:{id:'turn'}};
    if(method==='turn/interrupt')return {};
    throw Error('Unexpected method '+method);
  }};
  const n=new NativeThreads({workspace:'D:/Workspaces/example',nativeProjectId:'project'},{sessionFactory:()=>session});
  const result=await n.create();await n.send(result.threadId,'Original instruction',{messageId:'request',images:['D:/Artifacts/image.png']});
  assert.deepEqual(calls.map(c=>c.method),['thread/start','turn/start']);
  assert.equal(calls[0].params.projectId,'project');assert.equal(calls[0].params.ephemeral,false);
  const p=calls[1].params;assert.deepEqual(p.input,[{type:'text',text:'Original instruction'},{type:'localImage',path:'D:/Artifacts/image.png'}]);
  assert.equal(p.parentTurnId,undefined);assert.equal(p.rootTurnId,undefined);assert.equal(p.toolOutput,undefined);
  assert(!JSON.stringify(calls).includes('codex_delegation'));
  session.onNotification('turn/completed',{threadId:'another-thread',turn:{id:'unrelated',status:'completed'}});
  assert.equal(closed,0);assert.equal(n.sessions.size,1);
  await n.stop(result.threadId);assert.equal(calls.at(-1).method,'turn/interrupt');assert.equal(closed,0);
  session.onNotification('turn/completed',{threadId:result.threadId,turn:{id:'turn',status:'interrupted'}});
  await new Promise(r=>setImmediate(r));assert.equal(n.sessions.size,0);assert.equal(closed,1);
});
test('native confirmations require an explicit response to the matching live Thread',async()=>{
  const replies=[],pending=new Map([[0,{method:'mcpServer/elicitation/request',params:{threadId:'own',mode:'form'}}],[1,{method:'mcpServer/elicitation/request',params:{threadId:'other',mode:'form'}}],[2,{method:'mcpServer/elicitation/request',params:{threadId:'own',mode:'openai/userVerification'}}]]);
  const n=new NativeThreads({});n.sessions.set('own',{session:{serverRequests:pending,respond:async(...args)=>replies.push(args)}});
  assert.equal(replies.length,0);await assert.rejects(n.respond('own',1,{action:'accept'}),/不属于/);await assert.rejects(n.respond('own',2,{action:'accept'}),/专用验证/);
  await n.respond('own',0,{action:'accept',content:{}});assert.deepEqual(replies,[[0,{action:'accept',content:{}}]]);
});
test('authorized full access reaches WakeWire as session-scoped native configuration',()=>{
  assert.deepEqual(sessionOverrides({nativePermissions:{approvalPolicy:'never',sandbox:'danger-full-access',mcpServers:{remnote:'approve'}}}),['approval_policy="never"','sandbox_mode="danger-full-access"','mcp_servers.remnote.default_tools_approval_mode="approve"']);
});
