// Adapted from WakeWire src/cli/codex-session.ts and src/sinks/jsonrpc.ts (MIT).
// One authenticated session carries the official native protocol unchanged.
import WebSocket from 'ws';
import {join} from 'node:path';
import {jsonRead} from './io.mjs';

export function sessionOverrides(config) {
  const p=config.nativePermissions??{},values=[];
  if(p.approvalPolicy)values.push('approval_policy='+JSON.stringify(p.approvalPolicy));
  if(p.sandbox)values.push('sandbox_mode='+JSON.stringify(p.sandbox));
  for(const [server,mode] of Object.entries(p.mcpServers??{})){
    if(!/^[A-Za-z0-9_-]+$/.test(server))throw Error('Unsupported MCP server configuration key');
    values.push(`mcp_servers.${server}.default_tools_approval_mode=${JSON.stringify(mode)}`);
  }
  return values;
}

export class NativeRpcError extends Error {
  constructor(message,{code,uncertain=false}={}) {super(message);this.code=code;this.uncertain=uncertain;}
}

export class WakeWireSession {
  constructor(config) {this.config=config;this.pending=new Map();this.nextId=1;this.serverRequests=new Map();}
  get alive() {return this.socket?.readyState===WebSocket.OPEN&&this.ready;}
  async connect() {
    const configOverrides=sessionOverrides(this.config);
    const state=await jsonRead(join(this.config.wakewireHome,'daemon.json'));
    if(!Number.isInteger(state.port)||!state.token)throw Error('WakeWire daemon state is invalid');
    const socket=this.socket=new WebSocket(`ws://127.0.0.1:${state.port}/api/codex/session`,{
      headers:{Authorization:`Bearer ${state.token}`},maxPayload:64*1024*1024,handshakeTimeout:10000,
    });
    try {
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{reject(Error('WakeWire session handshake timed out'));socket.close();},15000);
        const fail=()=>{clearTimeout(timer);reject(Error('WakeWire session connection failed'));};
        socket.once('error',fail);socket.once('close',fail);
        socket.once('open',()=>socket.send(JSON.stringify({protocolVersion:1,client:'async_workflow',codexPath:this.config.codexPath,cwd:this.config.workspace,configOverrides})));
        socket.once('message',raw=>{
          clearTimeout(timer);socket.off('error',fail);socket.off('close',fail);
          try {const ack=JSON.parse(raw.toString());if(ack.wakewire!=='ready'||ack.protocolVersion!==1)throw Error();this.ready=true;resolve();}
          catch{reject(Error('WakeWire session protocol mismatch'));}
        });
      });
      socket.on('message',raw=>this.receive(raw));
      socket.on('error',()=>this.fail('WakeWire session connection lost'));
      socket.on('close',()=>this.fail('WakeWire session closed; native mutations were not replayed'));
      await this.request('initialize',{clientInfo:{name:'remnote_tag_actions',title:'RemNote Tag Actions',version:'0.3.0'},capabilities:{experimentalApi:true}});
      this.notify('initialized',{});
      return this;
    }catch(e){await this.close();throw e;}
  }
  receive(raw) {
    let message;try{message=JSON.parse(raw.toString());}catch{return this.fail('Invalid native response');}
    if(message.id!==undefined&&('result' in message||'error' in message)) {
      const pending=this.pending.get(message.id);if(!pending)return;
      this.pending.delete(message.id);clearTimeout(pending.timer);
      if(message.error)pending.reject(new NativeRpcError(message.error.message??'Native request failed',{code:message.error.code}));
      else pending.resolve(message.result);
    }else if(message.id!==undefined&&message.method) {
      // Never fabricate an approval or user answer. Preserve the pending native request.
      this.serverRequests.set(message.id,message);this.onRequest?.(message);
    }else if(message.method)this.onNotification?.(message.method,message.params);
  }
  request(method,params,timeoutMs=60000) {
    if(!this.alive)return Promise.reject(new NativeRpcError('WakeWire session is not open'));
    const id=this.nextId++;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new NativeRpcError(`${method} response unknown; request was not replayed`,{uncertain:true}));},timeoutMs);
      this.pending.set(id,{resolve,reject,timer});
      this.socket.send(JSON.stringify({id,method,params}),error=>{if(error){const p=this.pending.get(id);if(p){clearTimeout(p.timer);this.pending.delete(id);reject(new NativeRpcError('Native send result unknown',{uncertain:true}));}}});
    });
  }
  notify(method,params) {if(this.alive)this.socket.send(JSON.stringify({method,params}));}
  async respond(id,result) {
    if(!this.alive||!this.serverRequests.has(id))throw Error('原生请求已失效，请重新读取');
    await new Promise((resolve,reject)=>this.socket.send(JSON.stringify({id,result}),e=>e?reject(Error('答复发送结果未确认，请重新读取')):resolve()));
    this.serverRequests.delete(id);
  }
  fail(message) {
    this.ready=false;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new NativeRpcError(message,{uncertain:true}));}this.pending.clear();this.onClose?.();
  }
  async close() {
    const socket=this.socket;if(!socket)return;this.socket=null;this.ready=false;
    if(socket.readyState===WebSocket.CLOSED)return;
    await new Promise(resolve=>{const timer=setTimeout(()=>{socket.terminate();resolve();},6000);socket.once('close',()=>{clearTimeout(timer);resolve();});socket.close(1000);});
  }
}
