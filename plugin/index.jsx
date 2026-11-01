import {declareIndexPlugin,WidgetLocation} from '@remnote/plugin-sdk';
import {request} from './api.mjs';
import {trigger} from './action.mjs';
let heartbeat;
declareIndexPlugin(async plugin=>{
  const {actions}=await request('/api/actions');
  await plugin.storage.setSession('tag-actions.rules',actions);
  // Native sidebar registration adapted from remnote-chat, commit 8ab2c4fe (MIT).
  await plugin.app.registerWidget('sidebar',WidgetLocation.RightSidebar,{dimensions:{height:'auto',width:'100%'},widgetTabIcon:globalThis.__RNTA_ORIGIN+'/chat.svg'});
  await plugin.app.registerWidget('header',WidgetLocation.PaneHeader,{dimensions:{width:actions.length>1?100:72,height:32}});
  await plugin.app.registerWidget('menu',WidgetLocation.Popup,{dimensions:{width:280,height:Math.min(420,60+actions.length*44)}});
  const commands=[];
  await plugin.app.registerCommand({id:'open-tag-actions-chat',name:'打开 RemNote 助手',action:()=>plugin.window.openWidgetInRightSidebar('sidebar')});
  for(const action of actions) {
    const commandId=`tag-action-${action.id}`;
    await plugin.app.registerCommand({id:commandId,name:`标签处理：${action.label}`,keyboardShortcut:action.shortcut,description:'处理光标所在或选中的节点',action:async()=>{
      try {const r=await trigger(plugin,action);await plugin.app.toast(`已提交 ${r.accepted.length} 个节点`);}
      catch(error){await plugin.app.toast(error.message);}
    }});
    commands.push(commandId);
  }
  const report=async()=>{try{
    for(const action of actions)if(!await plugin.rem.findOne(action.triggerTagId))throw Error('请切回绑定的知识库');
    await request('/api/plugin',{version:'0.2.0',commands,headerRegistered:true,sidebarRegistered:true,kbId:(await plugin.kb.getCurrentKnowledgeBaseData())._id});
  }catch(e){await plugin.storage.setSession('tag-actions.connectionError',e.message);}};
  await report();heartbeat=setInterval(report,20000);
},async plugin=>{clearInterval(heartbeat);await plugin.app.unregisterWidget('header',WidgetLocation.PaneHeader);await plugin.app.unregisterWidget('menu',WidgetLocation.Popup);await plugin.app.unregisterWidget('sidebar',WidgetLocation.RightSidebar);});
