import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {jsonRead,jsonWrite,id} from './io.mjs';

export function authorized(request,token) {
  const supplied=request.headers.authorization?.replace(/^Bearer /,'')??'';
  const a=Buffer.from(supplied),b=Buffer.from(token);
  return a.length===b.length&&timingSafeEqual(a,b);
}
export function imageType(bytes) {
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpg';
  if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return 'webp';
  throw Error('支持 PNG、JPEG、WebP 图片');
}
export async function serve(runtime,{port=runtime.config.port??43171,startPolling=true,ipv6=true}={}) {
  const {config}=runtime;await mkdir(config.dataRoot,{recursive:true});
  const credentialsPath=join(config.dataRoot,'transport.json');
  let credentials=await jsonRead(credentialsPath,null);
  if(!credentials){credentials={token:randomBytes(32).toString('hex')};await jsonWrite(credentialsPath,credentials);}
  const {token}=credentials;let busy=false,lastError=null;
  async function tick(){if(busy)return;busy=true;try{if(!runtime.wakewire.routeId)await runtime.ready();await runtime.tick();lastError=null;}catch(e){lastError=e.message;runtime.log('bridge: '+e.message);}finally{busy=false;}}
  const respond=(res,status,value,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(status===204?undefined:JSON.stringify(value));};
  async function body(req) {
    if(!req.headers['content-type']?.startsWith('application/json'))throw Error('JSON body required');
    let size=0;const parts=[];for await(const chunk of req){size+=chunk.length;if(size>12*1024*1024)throw Error('Request too large');parts.push(chunk);}return JSON.parse(Buffer.concat(parts).toString('utf8'));
  }
  const handler=async(req,res)=>{
    const origin=req.headers.origin,allowedOrigins=['null','http://localhost:'+port,'http://127.0.0.1:'+port,'http://[::1]:'+port];
    const cors=allowedOrigins.includes(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{};
    try {
      const host=new URL('http://'+(req.headers.host??'')).hostname;
      if(!['127.0.0.1','localhost','[::1]'].includes(host))return respond(res,403,{error:'Host rejected'});
      const url=new URL(req.url,'http://localhost'),path=url.pathname,api=path.startsWith('/api/');
      if(api&&origin&&!allowedOrigins.includes(origin))return respond(res,403,{error:'Origin rejected'});
      if(api&&req.method==='OPTIONS')return respond(res,204,null,{...cors,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type'});
      if(path==='/health')return respond(res,200,{app:'RemNoteTagActions',version:'0.2.0',busy,bridgeError:lastError});
      if(api&&!authorized(req,token))return respond(res,401,{error:'Unauthorized'},cors);
      if(path==='/api/actions'&&req.method==='GET')return respond(res,200,{actions:config.rules.filter(r=>r.enabled!==false).map(r=>({id:r.id,label:r.label,triggerTagId:r.triggerTagId,shortcut:r.shortcut})),capabilities:runtime.capabilities},cors);
      if(path==='/api/status'&&req.method==='GET')return respond(res,200,{...await runtime.state(),capabilities:runtime.capabilities,bridgeError:lastError},cors);
      if(path==='/api/plugin'&&req.method==='POST')return respond(res,200,await runtime.pluginSeen(await body(req)),cors);
      if(path==='/api/request'&&req.method==='POST')return respond(res,202,await runtime.submitRule(await body(req)),cors);
      if(path==='/api/chats'&&req.method==='POST')return respond(res,202,await runtime.chat(await body(req)),cors);
      if(path==='/api/attachments'&&req.method==='POST') {
        const data=await body(req);await runtime.checkKb(data.kbId);
        if(typeof data.base64!=='string'||!data.base64.length||data.base64.length>11200000||!/^[A-Za-z0-9+/]*={0,2}$/.test(data.base64))throw Error('Invalid image data');
        const bytes=Buffer.from(data.base64,'base64');if(bytes.length>8*1024*1024)throw Error('每张图片不超过 8 MB');
        const ext=imageType(bytes),imageId=randomUUID(),dir=join(config.dataRoot,'attachments');await mkdir(dir,{recursive:true});
        const metadata={id:imageId,name:String(data.name??'图片').slice(0,120),path:join(dir,imageId+'.'+ext),size:bytes.length,createdAt:new Date().toISOString()};
        await writeFile(metadata.path,bytes,{flag:'wx'});await jsonWrite(join(dir,imageId+'.json'),metadata);
        return respond(res,201,{id:imageId,name:metadata.name,size:metadata.size},cors);
      }
      const chat=path.match(/^\/api\/chats\/([\w-]+)(?:\/(messages|fork))?$/);
      if(chat){
        if(!chat[2]&&req.method==='GET')return respond(res,200,await runtime.thread(chat[1],url.searchParams.get('cursor')),cors);
        if(chat[2]==='messages'&&req.method==='POST')return respond(res,202,await runtime.followup(chat[1],await body(req)),cors);
        if(chat[2]==='fork'&&req.method==='POST')return respond(res,202,await runtime.fork(chat[1],await body(req)),cors);
      }
      if(api)return respond(res,404,{error:'Unknown API route'},cors);
      const files={'/':'index.html','/index.html':'index.html','/manifest.json':'manifest.json','/index.js':'index.js','/header.js':'header.js','/menu.js':'menu.js','/sidebar.js':'sidebar.js','/icon.svg':'icon.svg','/chat.svg':'chat.svg'};
      if(req.method!=='GET'||!files[path])return respond(res,404,{error:'Not found'});
      const file=files[path],html=file.endsWith('.html');
      if(html&&req.headers['sec-fetch-dest']!=='iframe')return respond(res,403,{error:'Plugin frame navigation required'});
      let data=await readFile(join(config.artifactsRoot,'plugin',file));
      if(html)data=Buffer.from(data.toString().replace('<!--LOCAL_BOOTSTRAP-->',`<script>globalThis.__RNTA_TOKEN=${JSON.stringify(token)};globalThis.__RNTA_ORIGIN=${JSON.stringify('http://127.0.0.1:'+port)};</script>`));
      const type=html?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.svg')?'image/svg+xml':'application/json';
      const headers={'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
      if(html)headers['Content-Security-Policy']="frame-ancestors https://*.remnote.com https://remnote.com; object-src 'none'; base-uri 'none'";
      else headers['Access-Control-Allow-Origin']='*';
      res.writeHead(200,headers);res.end(data);
    }catch(e){respond(res,e.code==='ENOENT'?404:400,{error:e.message},cors);}
  };
  const server=http.createServer(handler);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});port=server.address().port;
  let server6;
  if(ipv6){server6=http.createServer(handler);try{await new Promise((resolve,reject)=>{server6.once('error',reject);server6.listen(port,'::1',resolve);});}catch(e){server.close();throw e;}}
  const timer=startPolling?setInterval(()=>void tick(),config.pollMs):null;if(startPolling)void tick();
  await jsonWrite(join(config.dataRoot,'service.json'),{pid:process.pid,port,startedAt:new Date().toISOString(),version:'0.2.0'});
  return {server,close:async()=>{clearInterval(timer);await Promise.all([server,server6].filter(Boolean).map(s=>new Promise(r=>s.close(r))));}};
}
