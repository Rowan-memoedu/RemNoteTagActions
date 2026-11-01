import React,{useEffect,useState} from 'react';
import {renderWidget,usePlugin} from '@remnote/plugin-sdk';
import {request} from './api.mjs';
import {trigger} from './action.mjs';
import {captureTarget} from './selection.mjs';
import tokens from '../theme.css';
import css from './style.css';

export function ActionIcon({state}) {
  if(state==='success')return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>;
  if(state==='error')return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v9m0 4h.01"/><circle cx="12" cy="12" r="10"/></svg>;
  if(state==='loading')return <svg viewBox="0 0 24 24" aria-hidden="true" className="loading-mark"><circle cx="12" cy="12" r="8" strokeDasharray="30 20"/></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h8l9 9-9 9-9-9V4a1 1 0 0 1 1-1Z"/><circle cx="7.5" cy="7.5" r="1"/><path d="m11 10 5 3-5 3Z"/></svg>;
}
function Header() {
  const plugin=usePlugin(),[actions,setActions]=useState([]),[context,setContext]=useState(null),[state,setState]=useState('default'),[message,setMessage]=useState('');
  useEffect(()=>{let active=true;Promise.all([request('/api/actions'),plugin.widget.getWidgetContext()]).then(([r,c])=>{if(active){setActions(r.actions);setContext(c);}}).catch(e=>{setState('error');setMessage(e.message);});return()=>{active=false;};},[]);
  const action=actions[0];
  async function openMenu(){try{const capture=await captureTarget(plugin,context?.paneId);await plugin.widget.openPopup('menu',{capture},false);}catch(error){setState('error');setMessage(error.message);await plugin.app.toast(error.message);}}
  async function run(){
    if(!action)return;setState('loading');setMessage('正在提交');
    try{const result=await trigger(plugin,action,context?.paneId);setState('success');setMessage(`已提交 ${result.accepted.length} 个节点`);setTimeout(()=>setState('default'),2000);}
    catch(error){setState('error');setMessage(error.message);await plugin.app.toast(error.message);}
  }
  async function openChat(){
    let capture;try{capture=await captureTarget(plugin,context?.paneId);}catch{}
    await plugin.window.openWidgetInRightSidebar('sidebar',capture?{capture}:{});
  }
  return <><style>{tokens+css}</style><div className="toolbar">
    <button className="action-button" data-state={state} disabled={!action||state==='loading'} aria-label={action?`${action.label} (${action.shortcut??''})`:'标签处理'} aria-busy={state==='loading'} aria-invalid={state==='error'} title={message||`${action?.label??'标签处理'} · ${action?.shortcut??''}`} onPointerDown={e=>e.preventDefault()} onClick={run}><ActionIcon state={state}/></button>
    {actions.length>1&&<button className="action-button more" aria-label="更多标签处理" title="更多标签处理" onPointerDown={e=>e.preventDefault()} onClick={openMenu}>⌄</button>}
    <button className="action-button" aria-label="打开 RemNote 助手" title="打开右侧助手，可持续对话" onPointerDown={e=>e.preventDefault()} onClick={()=>openChat().catch(e=>plugin.app.toast(e.message))}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9.5 9.5 0 0 1 19 0Z"/><path d="M7 9h10M7 13h7"/></svg></button>
    <span className="sr-only" role="status" aria-live="polite">{message}</span>
  </div></>;
}
renderWidget(Header);
