import path from 'node:path';
import {WakeWireSession} from './wakewire.mjs';

const samePath=(a,b)=>path.resolve(a??'').toLowerCase()===path.resolve(b??'').toLowerCase();
export class NativeThreads {
  constructor(config,{sessionFactory=()=>new WakeWireSession(config)}={}) {
    this.config=config;this.sessionFactory=sessionFactory;this.sessions=new Map();
  }
  async session() {
    const session=await this.sessionFactory().connect();
    session.onNotification=(method,params)=>{
      if(method==='turn/started'){const entry=this.sessions.get(params.threadId);if(entry)entry.turnId=params.turn.id;}
      if(method==='turn/completed'&&this.sessions.get(params.threadId)?.session===session)void this.finish(params.threadId,session);
    };
    return session;
  }
  async using(fn) {const s=await this.session();try{return await fn(s);}finally{await s.close();}}
  async check() {
    await this.using(async s=>{
      const {project}=await s.request('project/read',{projectId:this.config.nativeProjectId});
      if(!project.roots?.some(r=>samePath(r.path,this.config.workspace)))throw Error('Native Project identity or workspace differs');
      const {config}=await s.request('config/read',{includeLayers:false}),permissions=this.config.nativePermissions;
      if(permissions&&(config.approval_policy!==permissions.approvalPolicy||config.sandbox_mode!==permissions.sandbox))throw Error('原生会话未使用配置的完整访问策略');
      for(const [server,mode] of Object.entries(permissions?.mcpServers??{}))if(config.mcp_servers?.[server]?.default_tools_approval_mode!==mode)throw Error('MCP 权限未生效：'+server);
    });
    return {visible:true,followup:true,fork:true,recover:true,images:'native',stop:true,origin:'independent-workflow'};
  }
  async create({title}={}) {
    const s=await this.session();
    try {
      const r=await s.request('thread/start',{cwd:this.config.workspace,projectId:this.config.nativeProjectId,ephemeral:false,serviceName:'remnote_tag_actions',approvalPolicy:this.config.nativePermissions?.approvalPolicy,sandbox:this.config.nativePermissions?.sandbox});
      this.sessions.set(r.thread.id,{session:s,title});return {threadId:r.thread.id};
    }catch(e){await s.close();throw e;}
  }
  async send(threadId,prompt,{images=[],messageId}={}) {
    let entry=this.sessions.get(threadId);
    if(!entry?.session.alive) {
      const s=await this.session();
      try {await s.request('thread/resume',{threadId,excludeTurns:true,approvalPolicy:this.config.nativePermissions?.approvalPolicy,sandbox:this.config.nativePermissions?.sandbox});}
      catch(e){await s.close();throw e;}
      entry={session:s};this.sessions.set(threadId,entry);
    }
    try {
      const r=await entry.session.request('turn/start',{threadId,clientUserMessageId:messageId,input:[{type:'text',text:prompt},...images.map(path=>({type:'localImage',path}))],turnTrigger:'remnote_tag_actions'});
      entry.turnId=r.turn.id;
      if(entry.title)try{await entry.session.request('thread/name/set',{threadId,name:entry.title});entry.title=null;}catch{/* Naming may precede the first durable history write; finish retries it. */}
      return {threadId,turnId:r.turn.id};
    }catch(e){if(!e.uncertain)await this.release(threadId,entry.session);throw e;}
  }
  async read(threadId,cursor) {
    const read=async s=>{
      const {thread}=await s.request('thread/read',{threadId,includeTurns:false});
      const page=await s.request('thread/turns/list',{threadId,limit:10,itemsView:'full',sortDirection:'desc',...(cursor?{cursor}:{})});
      return {thread,turns:page.data,page:{nextCursor:page.nextCursor,hasMore:!!page.nextCursor},pendingRequests:[...s.serverRequests.values()]};
    };
    const entry=this.sessions.get(threadId);
    return entry?.session.alive?read(entry.session):this.using(read);
  }
  async visible(threadId) {
    return this.using(async s=>{
      const {thread}=await s.request('thread/read',{threadId,includeTurns:false});
      const searchTerm=(thread.name??thread.preview??'').slice(0,60);
      if(!searchTerm)throw Error('Thread 尚无持久消息，等待首次输入');
      let cursor;const seen=new Set();
      do {
        const r=await s.request('thread/list',{cwd:thread.cwd,projectId:this.config.nativeProjectId,searchTerm,useStateDbOnly:true,limit:50,...(cursor?{cursor}:{})});
        const t=r.data.find(t=>t.id===threadId);
        if(t){if(t.projectId!==this.config.nativeProjectId||!samePath(t.cwd,this.config.workspace))throw Error('Native Thread project mismatch');return {...t,title:t.name??t.preview?.slice(0,60)};}
        cursor=r.nextCursor;if(cursor&&seen.has(cursor))throw Error('Native pagination repeated');seen.add(cursor);
      }while(cursor);
      throw Error('Thread 尚未出现在原生历史列表中');
    });
  }
  async fork(threadId) {
    return this.using(async s=>{
      const r=await s.request('thread/fork',{threadId,cwd:this.config.workspace,ephemeral:false,excludeTurns:true,approvalPolicy:this.config.nativePermissions?.approvalPolicy,sandbox:this.config.nativePermissions?.sandbox});
      return {threadId:r.thread.id};
    });
  }
  async stop(threadId) {
    const entry=this.sessions.get(threadId);
    if(!entry?.session.alive||!entry.turnId)throw Error('本插件没有该回合的执行连接，请在正在运行它的 Codex 窗口停止');
    await entry.session.request('turn/interrupt',{threadId,turnId:entry.turnId});
    return {threadId,turnId:entry.turnId,status:'stopping'};
  }
  async respond(threadId,requestId,result) {
    const session=this.sessions.get(threadId)?.session,request=session?.serverRequests.get(requestId);
    if(!request||request.params?.threadId!==threadId)throw Error('原生请求不属于当前对话，或已失效');
    if(request.method==='mcpServer/elicitation/request') {
      if(!['accept','decline','cancel'].includes(result?.action))throw Error('Invalid elicitation action');
      if(result.action==='accept'&&!['form','openai/form','openaiForm'].includes(request.params.mode))throw Error('该原生请求需要专用验证，不能在此确认');
    }else if(['item/commandExecution/requestApproval','item/fileChange/requestApproval'].includes(request.method)) {
      if(!['accept','decline','cancel'].includes(result?.decision))throw Error('Invalid native decision');
    }else if(request.method==='item/tool/requestUserInput') {
      if(!result?.answers||request.params.questions.some(q=>!Array.isArray(result.answers[q.id]?.answers)||!result.answers[q.id].answers.length))throw Error('请回答全部问题');
    }else throw Error('此原生请求暂不支持在侧栏回复');
    await session.respond(requestId,result);return {accepted:true};
  }
  async release(threadId,session) {if(this.sessions.get(threadId)?.session===session)this.sessions.delete(threadId);await session.close();}
  async finish(threadId,session) {
    const entry=this.sessions.get(threadId);
    try{if(entry?.session===session&&entry.title)await session.request('thread/name/set',{threadId,name:entry.title});}
    catch{/* A naming error must not retain the writer or replay the turn. */}
    finally{await this.release(threadId,session);}
  }
  async close() {await Promise.all([...this.sessions.values()].map(e=>e.session.close()));this.sessions.clear();}
}

// Render actual native messages only. Delegation tool outputs are not user input.
export function messagesFromNative(snapshot) {
  return [...(snapshot.turns??[])].reverse().flatMap(turn=>(turn.items??[]).flatMap(item=>{
    if(item.type==='agentMessage')return [{id:item.id,role:'assistant',content:item.text??'',phase:item.phase,turnId:turn.id}];
    const input=inputFromNative(item);
    if(input!==null)return [{id:item.id,role:'user',content:input,turnId:turn.id,images:(item.content??[]).filter(c=>['image','localImage'].includes(c.type)).length}];
    return [];
  }));
}
export function inputFromNative(item) {
  return item.type==='userMessage'?(item.content??[]).filter(c=>c.type==='text').map(c=>c.text).join('\n'):null;
}
export const promptIdentity=text=>String(text).replace(/\r\n/g,'\n').trimEnd();
