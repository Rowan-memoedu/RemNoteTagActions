import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {jsonRead,jsonWrite,id} from './io.mjs';

const corsOrigins=new Set(['null']);
const hosts=new Set(['127.0.0.1','localhost','::1','[::1]']);
const active=new Set(['capturing','generating','applying','content-verified','needs-review']);
export function authorized(request,token) {
  const supplied=request.headers.authorization?.replace(/^Bearer /,'')??'';
  return supplied.length===token.length&&timingSafeEqual(Buffer.from(supplied),Buffer.from(token));
}
export async function serve(worker,{port=worker.config.port??43171}={}) {
  const {config}=worker;
  await mkdir(config.dataRoot,{recursive:true});
  const credentialsPath=join(config.dataRoot,'transport.json');
  let credentials=await jsonRead(credentialsPath,null);
  if(!credentials){credentials={token:randomBytes(32).toString('hex')};await jsonWrite(credentialsPath,credentials);}
  const {token}=credentials,queue=new Map();let draining=false,lastScanError=null,pluginSeen=null;
  async function drain() {
    if(draining)return;draining=true;
    try {
      for(const [key,request] of queue) {
        queue.delete(key);
        try{await worker.run(request.ruleId,request.remId,{retry:request.retry});}
        catch(error){worker.log(`request-held ${key}: ${error.message}`);}
      }
    } finally {draining=false;}
  }
  async function scan() {
    if(draining)return;
    try {for(const match of await worker.scan())queue.set(`${match.ruleId}:${match.remId}`,{...match,retry:false});lastScanError=null;}
    catch(error){lastScanError=error.message;worker.log(`scan-error: ${error.message}`);await worker.mcp?.close().catch(()=>{});worker.mcp=undefined;}
    void drain();
  }
  function respond(response,status,value,headers={}) {
    response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});response.end(JSON.stringify(value));
  }
  async function body(request) {
    if(!request.headers['content-type']?.startsWith('application/json'))throw Error('JSON body required');
    let content='';for await(const chunk of request){content+=chunk;if(content.length>20000)throw Error('Request too large');}
    return JSON.parse(content);
  }
  const server=http.createServer(async(request,response)=>{
    try {
      const origin=request.headers.origin;
      const host=new URL(`http://${request.headers.host??''}`).hostname;
      if(!hosts.has(host))return respond(response,403,{error:'Host rejected'});
      const path=new URL(request.url,'http://localhost').pathname;
      const api=path.startsWith('/api/');
      const cors=origin&&corsOrigins.has(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{};
      if(api&&origin&&!corsOrigins.has(origin))return respond(response,403,{error:'Origin rejected'});
      if(api&&request.method==='OPTIONS')return respond(response,204,null,{...cors,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type'});
      if(path==='/health')return respond(response,200,{app:'RemNoteTagActions',version:'0.1.0',busy:draining,queued:queue.size,bridgeError:lastScanError,pluginConnected:pluginSeen&&Date.now()-pluginSeen.at<60000});
      if(api&&!authorized(request,token))return respond(response,401,{error:'Unauthorized'},cors);
      if(path==='/api/actions'&&request.method==='GET')return respond(response,200,{actions:config.rules.filter(r=>r.enabled!==false).map(r=>({id:r.id,label:r.label,triggerTagId:r.triggerTagId,shortcut:r.shortcut}))},cors);
      if(path==='/api/status'&&request.method==='GET')return respond(response,200,{...await worker.state(),queued:[...queue.values()],pluginSeen},cors);
      if(path==='/api/plugin'&&request.method==='POST') {
        const data=await body(request);
        pluginSeen={at:Date.now(),version:String(data.version??''),commands:Array.isArray(data.commands)?data.commands.slice(0,50):[],headerRegistered:data.headerRegistered===true,kbId:String(data.kbId??'')};
        return respond(response,200,{ok:true},cors);
      }
      if(path==='/api/request'&&request.method==='POST') {
        const data=await body(request),rule=worker.rule(data.ruleId);
        if(!Array.isArray(data.remIds)||!data.remIds.length||data.remIds.length>50||data.remIds.some(r=>!id(r)))throw Error('Choose 1–50 valid Rems');
        await worker.checkTags(rule);
        const selected=[...new Set(data.remIds)],notes=[];
        for(const remId of selected)notes.push(await worker.mcp.read(remId));
        const roots=notes.filter(n=>!n.ancestors?.some(a=>selected.includes(a.remId)));
        const state=await worker.state(),accepted=[];
        for(const note of roots) {
          if([rule.triggerTagId,rule.completedTagId,config.trashRemId].includes(note.remId))throw Error('Cannot process a workflow tag or trash');
          const key=`${rule.id}:${note.remId}`,prior=state.entries[key];
          if(prior&&active.has(prior.status)){accepted.push({remId:note.remId,status:prior.status,jobId:prior.jobId});continue;}
          await worker.mcp.call('remnote_update_tags',{remId:note.remId,addTagRemIds:[rule.triggerTagId],removeTagRemIds:[rule.completedTagId]});
          const fresh=await worker.mcp.read(note.remId);
          if(!fresh.tags?.some(t=>t.tagRemId===rule.triggerTagId))throw Error('Trigger tag readback failed');
          queue.set(key,{ruleId:rule.id,remId:note.remId,retry:true});accepted.push({remId:note.remId,status:'queued'});
        }
        respond(response,202,{accepted},cors);void drain();return;
      }
      if(api)return respond(response,404,{error:'Unknown API route'},cors);
      const files={'/':'index.html','/index.html':'index.html','/manifest.json':'manifest.json','/index.js':'index.js','/header.js':'header.js','/menu.js':'menu.js','/icon.svg':'icon.svg'};
      if(request.method!=='GET'||!files[path])return respond(response,404,{error:'Not found'});
      const file=files[path],html=file.endsWith('.html');
      if(html&&request.headers['sec-fetch-dest']!=='iframe')return respond(response,403,{error:'Plugin frame navigation required'});
      let data=await readFile(join(config.artifactsRoot,'plugin',file));
      if(html)data=Buffer.from(data.toString().replace('<!--LOCAL_BOOTSTRAP-->',`<script>globalThis.__RNTA_TOKEN=${JSON.stringify(token)};globalThis.__RNTA_ORIGIN=${JSON.stringify(`http://127.0.0.1:${port}`)};</script>`));
      const type=html?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.svg')?'image/svg+xml':'application/json';
      const headers={'Content-Type':`${type}; charset=utf-8`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
      if(html)headers['Content-Security-Policy']="frame-ancestors https://*.remnote.com https://remnote.com; object-src 'none'; base-uri 'none'";
      else headers['Access-Control-Allow-Origin']='*';
      response.writeHead(200,headers);response.end(data);
    } catch(error){respond(response,error.code==='ENOENT'?404:400,{error:error.message},request.headers.origin==='null'?{'Access-Control-Allow-Origin':'null','Vary':'Origin'}:{});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  port=server.address().port;
  const timer=setInterval(()=>void scan(),config.pollMs);void scan();
  await jsonWrite(join(config.dataRoot,'service.json'),{pid:process.pid,port,startedAt:new Date().toISOString(),origin:`http://127.0.0.1:${port}`});
  worker.log(`service-ready http://127.0.0.1:${port}`);
  return {server,close:async()=>{clearInterval(timer);await new Promise(resolve=>server.close(resolve));}};
}
