import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {serve} from '../src/server.mjs';
import {jsonRead} from '../src/io.mjs';

async function fixture() {
  const root=await mkdtemp('D:/Artifacts/RemNoteTagActions/http-test-');
  await mkdir(join(root,'plugin'));await writeFile(join(root,'plugin','index.html'),'<!doctype html><!--LOCAL_BOOTSTRAP-->');
  const writes=[],runs=[],notes={parent:{remId:'parent',title:'Parent',tags:[],ancestors:[]},child:{remId:'child',title:'Child',tags:[],ancestors:[{remId:'parent'}]}};
  const worker={config:{dataRoot:join(root,'data'),artifactsRoot:root,pollMs:60000,rules:[{id:'arbitrary-action',label:'Synthetic',handler:'fixture',triggerTagId:'start',completedTagId:'end'}]},log:()=>{},scan:async()=>[],rule(id){if(id!=='arbitrary-action')throw Error('Unknown rule');return this.config.rules[0];},checkTags:async()=>{},state:async()=>({entries:{}}),run:async(...args)=>{runs.push(args);},mcp:{read:async id=>structuredClone(notes[id]),call:async(name,args)=>{writes.push({name,args});notes[args.remId].tags=[{tagRemId:'start'}];return{};}}};
  const service=await serve(worker,{port:0}),origin=`http://127.0.0.1:${service.server.address().port}`;
  const {token}=await jsonRead(join(root,'data','transport.json'));
  return {service,origin,token,writes,runs};
}
test('unauthenticated and website-origin requests cannot queue work',async()=>{
  const f=await fixture();
  try {
    const payload={ruleId:'arbitrary-action',remIds:['parent']};
    assert.equal((await fetch(f.origin+'/api/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})).status,401);
    assert.equal((await fetch(f.origin+'/api/request',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://untrusted.example',Authorization:'Bearer '+f.token},body:JSON.stringify(payload)})).status,403);
    assert.equal(f.writes.length,0);
  }finally{await f.service.close();}
});
test('authenticated request applies the configured tag and collapses selected descendants',async()=>{
  const f=await fixture();
  try {
    const result=await fetch(f.origin+'/api/request',{method:'POST',headers:{'Content-Type':'application/json',Origin:'null',Authorization:'Bearer '+f.token},body:JSON.stringify({ruleId:'arbitrary-action',remIds:['parent','child']})});
    assert.equal(result.status,202);assert.equal((await result.json()).accepted.length,1);
    assert.deepEqual(f.writes[0].args,{remId:'parent',addTagRemIds:['start'],removeTagRemIds:['end']});assert.equal(f.runs.length,1);
  }finally{await f.service.close();}
});
test('credentials are restricted to frame HTML with frame-ancestor protection',async()=>{
  const f=await fixture();
  try {
    assert.equal((await fetch(f.origin+'/')).status,403);
    const r=await fetch(f.origin+'/',{headers:{'Sec-Fetch-Dest':'iframe'}});
    assert.equal(r.status,200);assert(r.headers.get('content-security-policy').includes('frame-ancestors'));
    assert.equal(r.headers.get('access-control-allow-origin'),null);assert((await r.text()).includes(f.token));
  }finally{await f.service.close();}
});
