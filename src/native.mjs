// Connection logic adapted from WakeWire native-project.ts (MIT), commit 5f2ff8a.
// All Thread state remains owned by the installed official app-tools server.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

export class NativeThreads {
  constructor(config) {this.config=config;}
  async connect() {
    if(this.client)return;
    if(this.connecting)return this.connecting;
    this.connecting=(async()=>{
      const root=path.join(process.env.CODEX_HOME??path.join(os.homedir(),'.codex'),'plugins/cache/openai-bundled/codex-app-tools');
      const servers=fs.readdirSync(root,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>path.join(root,e.name,'server.mjs')).filter(f=>fs.existsSync(f)).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs);
      if(!servers[0])throw Error('Official Codex app-tools server is not installed');
      let pipe=process.env.CODEX_APP_TOOLS_PIPE_PATH;
      if(!pipe){const names=fs.readdirSync('\\\\.\\pipe\\').filter(n=>n.startsWith('codex-app-tools-'));if(names.length!==1)throw Error('需要一个正在运行的 ChatGPT 桌面端中的 Codex');pipe='\\\\.\\pipe\\'+names[0];}
      const client=new Client({name:'remnote-tag-actions-native',version:'0.2.0'});
      const env=Object.fromEntries(Object.entries(process.env).filter(([,v])=>v!==undefined));
      try {
        await client.connect(new StdioClientTransport({command:process.execPath,args:[servers[0]],env:{...env,CODEX_APP_TOOLS_PIPE_PATH:pipe},stderr:'ignore'}));
        this.client=client;
      } catch(e){await client.close().catch(()=>{});throw e;}
    })();
    try{await this.connecting;}finally{this.connecting=null;}
  }
  async call(name,args={}) {
    await this.connect();
    let r;try{r=await this.client.callTool({name,arguments:args,_meta:{'openai/threadId':this.config.appOwnerThreadId}},undefined,{timeout:60000});}
    catch(e){await this.close().catch(()=>{});throw e;}
    if(r.isError)throw Error(`原生 ${name} 调用失败：${r.content?.find(c=>c.type==='text')?.text??'unknown error'}`);
    return r.structuredContent??JSON.parse(r.content.find(c=>c.type==='text').text);
  }
  async check() {
    const r=await this.call('list_projects');
    const p=r.projects.find(p=>p.projectId===this.config.appProjectId);
    if(p?.hostId!=='local'||path.resolve(p.path??'').toLowerCase()!==path.resolve(this.config.workspace).toLowerCase())throw Error('Saved Project identity or workspace differs');
    const tools=await this.client.listTools();
    return {visible:true,followup:tools.tools.some(t=>t.name==='send_message_to_thread'),fork:tools.tools.some(t=>t.name==='fork_thread'),recover:true,images:'local-file',stop:false};
  }
  async visible(threadId) {
    let cursor;const seen=new Set();
    do {
      const r=await this.call('list_threads',{mode:'history',source:'codex',hostId:'local',limit:50,...(cursor?{cursor}:{})});
      const t=r.threads.find(t=>t.id===threadId);
      if(t){if(t.projectId!==this.config.appProjectId||path.resolve(t.cwd??'').toLowerCase()!==path.resolve(this.config.workspace).toLowerCase())throw Error('Visible Thread project mismatch');return t;}
      cursor=r.nextCursor;if(cursor&&seen.has(cursor))throw Error('Native pagination repeated');seen.add(cursor);
    } while(cursor);
    throw Error('Thread 尚未出现在原生列表中');
  }
  read(threadId,cursor) {return this.call('read_thread',{threadId,hostId:'local',turnLimit:10,includeOutputs:true,maxOutputCharsPerItem:20000,...(cursor?{cursor}:{})});}
  send(threadId,prompt) {return this.call('send_message_to_thread',{threadId,hostId:'local',prompt});}
  fork(threadId) {return this.call('fork_thread',{threadId,environment:{type:'same-directory'}});}
  async close() {await this.client?.close();this.client=null;}
}

// Only render user-visible messages, not reasoning, tool arguments or shell output.
export function messagesFromNative(snapshot) {
  return [...(snapshot.turns??[])].reverse().flatMap(turn=>(turn.items??[]).flatMap(item=>{
    if(item.type==='agentMessage')return [{id:item.id,role:'assistant',content:item.text??'',phase:item.phase,turnId:turn.id}];
    const input=inputFromNative(item);
    if(input!==null)return [{id:item.id,role:'user',content:input,turnId:turn.id,truncated:!!item.output?.truncated}];
    return [];
  }));
}

export function inputFromNative(item) {
  if(item.type==='userMessage')return (item.content??[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');
  // Native cross-Thread prompts arrive as official codex_app function outputs.
  if(item.type!=='functionCallOutput'||item.namespace!=='codex_app'||!['create_thread','send_message_to_thread'].includes(item.name))return null;
  const text=item.output?.text;
  if(typeof text!=='string'||!text.startsWith('<codex_delegation>'))return null;
  const start=text.indexOf('<input>'),end=text.lastIndexOf('</input>');
  if(start<0)return null;
  if(end<start)return item.output?.truncated?text.slice(start+7)+'\n[消息较长，请在 Codex 中查看完整内容]':null;
  return text.slice(start+7,end);
}
export const promptIdentity=text=>String(text).replace(/\r\n/g,'\n').trimEnd();
