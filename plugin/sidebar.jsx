// Native sidebar and message layout adapted from remnote-chat (MIT), commit 8ab2c4fe.
// Native Thread messages replace upstream's chat-command mailbox and private history.
import React,{useEffect,useRef,useState} from 'react';
import {renderWidget,usePlugin} from '@remnote/plugin-sdk';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {CodeBlock,SendIcon,TypingIndicator} from './upstream/chat-components';
import {appendRawDraftSuffix} from './upstream/draft';
import {request} from './api.mjs';
import upstreamCss from './upstream/chat.css';
import css from './sidebar.css';
import tokens from '../theme.css';

const labels={preparing:'读取节点',queued:'正在建立 Thread','acceptance-unknown':'正在恢复投递',running:'执行中',ready:'可继续对话',forked:'已分叉，等待首条指令',completed:'内容已完成','awaiting-input':'等待补充','needs-attention':'需要处理'};
function Sidebar() {
  const plugin=usePlugin(),[jobs,setJobs]=useState([]),[selected,setSelected]=useState(null),[messages,setMessages]=useState([]),[page,setPage]=useState({}),[text,setText]=useState(''),[files,setFiles]=useState([]),[error,setError]=useState(''),[connected,setConnected]=useState(false),[busy,setBusy]=useState(false),[pending,setPending]=useState(null),[context,setContext]=useState(null),[caps,setCaps]=useState({}),[menu,setMenu]=useState(false),[ready,setReady]=useState(false),[running,setRunning]=useState(false);
  const selectedRef=useRef(null),pendingRef=useRef(null),draftRef=useRef({text:'',files:[]}),alive=useRef(true),scroll=useRef(null),end=useRef(null),pinBottom=useRef(true),composing=useRef(false),fileInput=useRef(null),seq=useRef(0);
  selectedRef.current=selected;pendingRef.current=pending;draftRef.current={text,files};
  const draftKey=id=>'tag-actions.draft.'+(id??'new');
  async function choose(id) {
    if(pendingRef.current)throw Error('请先恢复上次发送状态');
    await plugin.storage.setLocal(draftKey(selectedRef.current),draftRef.current);
    const version=++seq.current,draft=await plugin.storage.getLocal(draftKey(id));
    if(version!==seq.current)return;
    setText(appendRawDraftSuffix(draft?.text??'',''));setFiles(draft?.files??[]);setSelected(id);selectedRef.current=id;setMessages([]);setPage({});setMenu(false);setError('');pinBottom.current=true;
    await plugin.storage.setLocal('tag-actions.selected',id);
  }
  async function accepted(p,jobId) {
    if(pendingRef.current?.requestId!==p.requestId)return;
    pendingRef.current=null;setPending(null);await plugin.storage.setLocal('tag-actions.pending',null);
    if(p.kind==='fork'){if(jobId)await choose(jobId);setError('');return;}
    await plugin.storage.setLocal(draftKey(p.jobId),{text:'',files:[]});setText('');setFiles([]);
    if(jobId){setSelected(jobId);selectedRef.current=jobId;await plugin.storage.setLocal('tag-actions.selected',jobId);}
    setError('');
  }
  async function refresh() {
    try {
      const state=await request('/api/status');if(!alive.current)return;
      setJobs([...state.jobs].reverse());setCaps(state.capabilities??{});setConnected(!state.bridgeError);
      if(state.bridgeError)setError(state.bridgeError);
      const p=pendingRef.current;
      if(p){const job=state.jobs.find(j=>j.requestId===p.requestId),attempt=state.attempts[p.requestId];
        if(job)await accepted(p,job.id);
        else if(attempt?.status==='accepted')await accepted(p,attempt.childJobId??p.jobId);
        else if(attempt?.status==='unknown')setError('发送结果尚未确认；保留草稿，请恢复读取，勿重复发送。');
      }
      const current=selectedRef.current;if(!current)return;
      const snapshot=await request('/api/chats/'+current);
      if(alive.current&&selectedRef.current===current){setMessages(old=>mergeMessages(old,snapshot.messages));setPage(old=>old.loadedOlder?old:snapshot.page??{});setRunning(snapshot.turns?.some(t=>t.status==='inProgress')??false);}
    }catch(e){if(alive.current){setConnected(false);setError(e.message);}}
  }
  useEffect(()=>{
    alive.current=true;let timer;
    (async()=>{
      const [id,p,c]=await Promise.all([plugin.storage.getLocal('tag-actions.selected'),plugin.storage.getLocal('tag-actions.pending'),plugin.widget.getWidgetContext()]);
      if(!alive.current)return;
      const d=await plugin.storage.getLocal(draftKey(id));selectedRef.current=id??null;setSelected(id??null);pendingRef.current=p??null;setPending(p??null);setText(d?.text??p?.text??'');setFiles(d?.files??p?.files??[]);setContext(c?.contextData?.capture??c?.capture??null);setReady(true);
      const poll=async()=>{await refresh();if(alive.current)timer=setTimeout(poll,5000);};void poll();
    })().catch(e=>setError(e.message));return()=>{alive.current=false;clearTimeout(timer);};
  },[]);
  useEffect(()=>{if(ready){const timer=setTimeout(()=>plugin.storage.setLocal(draftKey(selected),{text,files}),250);return()=>clearTimeout(timer);}},[text,files,selected,ready]);
  useEffect(()=>{if(pinBottom.current)end.current?.scrollIntoView({block:'end'});},[messages,running]);
  async function send() {
    if(pendingRef.current?.kind==='fork')return fork();
    if(busy||running)return;setBusy(true);setError('');
    try {
      const kbId=(await plugin.kb.getCurrentKnowledgeBaseData())._id;
      const p=pendingRef.current??{requestId:crypto.randomUUID(),jobId:selected,text,files,kbId,context:context&&Date.now()-context.capturedAt<60000?context:null};
      pendingRef.current=p;setPending(p);await plugin.storage.setLocal('tag-actions.pending',p);
      const result=await request(p.jobId?'/api/chats/'+p.jobId+'/messages':'/api/chats',{...p,attachmentIds:p.files.map(f=>f.id)});
      if(result.status==='unknown')setError('发送结果待确认，草稿已保留。点击恢复状态读取原 Thread。');
      else await accepted(p,p.jobId??result.id);
      pinBottom.current=true;await refresh();
    }catch(e){setError(e.message+'；草稿和请求编号已保留。');}finally{setBusy(false);}
  }
  async function upload(list) {
    if(busy||pending)return;setBusy(true);setError('');
    try {
      if(files.length+list.length>8)throw Error('每次最多 8 张图片');
      const kbId=(await plugin.kb.getCurrentKnowledgeBaseData())._id;
      for(const f of list){if(f.size>8*1024*1024)throw Error('每张图片不超过 8 MB');const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=reject;r.onload=()=>resolve(String(r.result).split(',')[1]);r.readAsDataURL(f);});const saved=await request('/api/attachments',{kbId,name:f.name,base64});setFiles(old=>[...old,saved]);}
    }catch(e){setError(e.message);}finally{setBusy(false);if(fileInput.current)fileInput.current.value='';}
  }
  async function fork() {
    if(!selected||busy||(pendingRef.current&&pendingRef.current.kind!=='fork'))return;setBusy(true);setError('');
    try {
      const p=pendingRef.current??{kind:'fork',requestId:crypto.randomUUID(),jobId:selected,text,files,kbId:(await plugin.kb.getCurrentKnowledgeBaseData())._id};
      pendingRef.current=p;setPending(p);await plugin.storage.setLocal('tag-actions.pending',p);
      const result=await request('/api/chats/'+p.jobId+'/fork',p);
      if(result.childJobId)await accepted(p,result.childJobId);else throw Error('分叉结果未确认，原 Thread 已保留；请检查 Codex，不要重复点击');
      await refresh();
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function older() {
    setBusy(true);try{const current=selected,s=await request('/api/chats/'+current+'?cursor='+encodeURIComponent(page.nextCursor));if(selectedRef.current===current){setMessages(old=>mergeMessages(s.messages,old));setPage({...s.page,loadedOlder:true});}}catch(e){setError(e.message);}finally{setBusy(false);}
  }
  const job=jobs.find(j=>j.id===selected),canSend=ready&&connected&&!busy&&!running&&(!!text.trim()||files.length>0||!!pending);
  return <><style>{tokens+upstreamCss+css}</style><div className="chat-container">
    <div className="chat-header"><div className="chat-header-left"><span className={'chat-status-dot chat-status-dot--'+(connected?'connected':'disconnected')} aria-label={connected?'已连接':'连接中断'}/><button className="chat-session-btn" onClick={()=>setMenu(!menu)} title="恢复已有对话">{job?.title??'RemNote 助手'} <span className="chevron">▾</span></button></div><button className="chat-new-btn" onClick={()=>choose(null).catch(e=>setError(e.message))} disabled={!!pending||busy} title="新对话" aria-label="新对话">+</button></div>
    {menu&&<div className="chat-session-list" aria-label="对话列表">{jobs.map(j=><button key={j.id} className={'chat-session-item'+(j.id===selected?' chat-session-item--active':'')} disabled={!!pending} onClick={()=>choose(j.id).catch(e=>setError(e.message))}><span className="chat-session-item-title">{j.title}</span><small>{labels[j.status]??j.status}</small></button>)}{!jobs.length&&<div className="chat-session-empty">还没有对话</div>}</div>}
    {job&&<div className="thread-status"><span>{job.visible?'Codex 中可见 · ':''}{running?'执行中':labels[job.status]??job.status}</span><div className="thread-actions"><button disabled={!job.threadId||busy||!!pending||!caps.fork} onClick={fork} title="保留当前全部历史，新建原生分叉">分叉</button><button onClick={()=>{setError('');void refresh();}} disabled={busy}>恢复状态</button></div></div>}
    {(error||job?.error)&&<div className="chat-error" role="alert">{error||job.error}<button onClick={()=>void refresh()}>重读状态</button></div>}
    <div className="chat-messages" ref={scroll} onScroll={()=>{const e=scroll.current;pinBottom.current=e.scrollHeight-e.scrollTop-e.clientHeight<70;}}>
      {page.hasMore&&<button className="load-older" disabled={busy} onClick={older}>加载较早消息</button>}
      {messages.length===0&&<div className="chat-empty-state">{job?'正在读取原生对话…':'输入你对知识库的要求。每个新对话会出现在 ChatGPT 桌面端中的 Codex。'}</div>}
      {messages.map(msg=><div key={msg.id} className={'chat-message chat-message--'+msg.role}><span className="chat-message-label">{msg.role==='user'?'你':'Codex'}</span>{msg.role==='user'?<div className="chat-bubble chat-bubble--user">{msg.content}</div>:<div className="chat-assistant-flow"><div className="chat-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{code:CodeBlock,img:({alt})=><span>[图片：{alt??''}]</span>,a:({href,children})=><a href={href} target="_blank" rel="noreferrer">{children}</a>}}>{msg.content}</ReactMarkdown></div></div>}</div>)}
      {running&&<div className="working"><TypingIndicator/><span>正在执行；可在 Codex 中停止</span></div>}<div ref={end}/>
    </div>
    {files.length>0&&<div className="attachments">{files.map(f=><span key={f.id}>{f.name}<button disabled={!!pending||busy} aria-label={'移除 '+f.name} onClick={()=>setFiles(files.filter(x=>x.id!==f.id))}>×</button></span>)}</div>}
    {context?.remIds?.length>0&&<div className="selection-context">已附 {context.remIds.length} 个节点上下文<button onClick={()=>setContext(null)}>移除</button></div>}
    <div className="chat-input-area"><textarea className="chat-input" rows={3} value={text} disabled={!ready||!!pending} onChange={e=>setText(e.target.value)} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!composing.current&&!e.nativeEvent.isComposing&&e.keyCode!==229){e.preventDefault();if(canSend)void send();}}} onPaste={e=>{const imgs=[...e.clipboardData.files].filter(f=>f.type.startsWith('image/'));if(imgs.length){e.preventDefault();void upload(imgs);}}} placeholder="输入指令… Shift+Enter 换行" aria-label="对 RemNote 的指令"/><div className="composer-buttons"><button className="image-button" aria-label="附加图片" title="附加本地图片" disabled={busy||!!pending||!caps.images} onClick={()=>fileInput.current?.click()}>＋图</button><button className="chat-send-btn" disabled={!canSend} title={pending?'恢复同一请求':'发送'} aria-label={pending?'恢复同一请求':'发送'} onClick={send}><SendIcon/></button></div><input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden ref={fileInput} onChange={e=>void upload([...e.target.files])}/></div>
  </div></>;
}
function mergeMessages(first,last){const map=new Map(first.map(m=>[m.id,m]));for(const m of last)map.set(m.id,m);return [...map.values()];}
renderWidget(Sidebar);
