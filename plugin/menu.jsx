import React,{useEffect,useState} from 'react';
import {renderWidget,usePlugin} from '@remnote/plugin-sdk';
import {request} from './api.mjs';
import {trigger} from './action.mjs';
import tokens from '../tokens.css';
import css from './style.css';
function Menu(){
  const plugin=usePlugin(),[actions,setActions]=useState([]),[capture,setCapture]=useState(null),[pending,setPending]=useState(null),[error,setError]=useState('');
  useEffect(()=>{Promise.all([request('/api/actions'),plugin.widget.getWidgetContext()]).then(([r,c])=>{setActions(r.actions);setCapture(c.contextData?.capture??c.capture);}).catch(e=>setError(e.message));},[]);
  async function run(action){setPending(action.id);try{if(!capture)throw Error('请选择节点后重新打开菜单');await trigger(plugin,action,capture.paneId,capture);await plugin.widget.closePopup();}catch(e){setError(e.message);}finally{setPending(null);}}
  return <><style>{tokens+css}</style><div className="action-menu"><p>标签处理{capture?` · ${capture.remIds.length} 个节点`:''}</p>{actions.map(action=><button key={action.id} className="menu-action" disabled={!!pending||!capture} data-state={pending===action.id?'loading':error?'error':'default'} onPointerDown={e=>e.preventDefault()} onClick={()=>run(action)}>{action.label}<kbd>{action.shortcut}</kbd></button>)}<p role="status">{error}</p></div></>;
}
renderWidget(Menu);
