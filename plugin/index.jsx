import {declareIndexPlugin,WidgetLocation} from '@remnote/plugin-sdk';
import {request} from './api.mjs';
import {trigger} from './action.mjs';
let heartbeat;
declareIndexPlugin(async plugin=>{
  const {actions}=await request('/api/actions');
  await plugin.storage.setSession('tag-actions.rules',actions);
  await plugin.app.registerWidget('header',WidgetLocation.PaneHeader,{dimensions:{width:actions.length>1?64:36,height:32}});
  await plugin.app.registerWidget('menu',WidgetLocation.Popup,{dimensions:{width:280,height:Math.min(420,60+actions.length*44)}});
  const commands=[];
  for(const action of actions) {
    const commandId=`tag-action-${action.id}`;
    await plugin.app.registerCommand({id:commandId,name:`标签处理：${action.label}`,keyboardShortcut:action.shortcut,description:'处理光标所在或选中的节点',action:async()=>{
      try {const r=await trigger(plugin,action);await plugin.app.toast(`已提交 ${r.accepted.length} 个节点`);}
      catch(error){await plugin.app.toast(error.message);}
    }});
    commands.push(commandId);
  }
  const report=async()=>{try{await request('/api/plugin',{version:'0.1.0',commands,headerRegistered:true,kbId:(await plugin.kb.getCurrentKnowledgeBaseData())._id});}catch{}};
  await report();heartbeat=setInterval(report,20000);
},async plugin=>{clearInterval(heartbeat);await plugin.app.unregisterWidget('header',WidgetLocation.PaneHeader);await plugin.app.unregisterWidget('menu',WidgetLocation.Popup);});
