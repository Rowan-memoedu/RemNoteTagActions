// Isolated component/SDK-contract tests. Never opens RemNote or a user browser profile.
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';

const output='D:/Artifacts/RemNoteTagActions/browser-test';await mkdir(output,{recursive:true});
const stub=`import React from 'react';import ReactDOM from 'react-dom';
const storage={getLocal:async k=>JSON.parse(localStorage.getItem(k)??'null'),setLocal:async(k,v)=>localStorage.setItem(k,JSON.stringify(v)),getSession:async k=>JSON.parse(sessionStorage.getItem(k)??'null'),setSession:async(k,v)=>sessionStorage.setItem(k,JSON.stringify(v))};
const plugin={storage,kb:{getCurrentKnowledgeBaseData:async()=>({_id:'fixture-kb'})},widget:{getWidgetContext:async()=>({paneId:'pane',contextData:{}}),openPopup:async()=>{}},editor:{getSelection:async()=>({remIds:['fixture-rem']}),getFocusedEditorText:async()=> 'Selected'},focus:{getFocusedRem:async()=>({_id:'fixture-rem'})},window:{getFocusedPaneId:async()=> 'pane',openWidgetInRightSidebar:async(...args)=>{window.sidebarOpened=args;}},rem:{findOne:async()=>({_id:'fixture-tag'})},app:{toast:async()=>{},registerWidget:async(...args)=>{window.registeredWidgets.push(args);},unregisterWidget:async()=>{},registerCommand:async c=>{window.registeredCommands.push(c);}}};
window.registeredWidgets=[];window.registeredCommands=[];
export const usePlugin=()=>plugin;
export const renderWidget=C=>ReactDOM.render(React.createElement(C),document.getElementById('root'));
export const WidgetLocation={RightSidebar:'RightSidebar',PaneHeader:'PaneHeader',Popup:'Popup'};
export const declareIndexPlugin=fn=>{window.indexReady=fn(plugin);};`;
const bundles={};
for(const entry of ['sidebar','header','index']) {
  const result=await build({entryPoints:['plugin/'+entry+'.jsx'],bundle:true,write:false,format:'iife',platform:'browser',target:'es2020',loader:{'.css':'text'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'sdk-fixture',setup(b){b.onResolve({filter:/^@remnote\/plugin-sdk$/},()=>({path:'sdk-fixture',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:stub,loader:'js',resolveDir:process.cwd()}));}}]});bundles[entry]=result.outputFiles[0].text;
}
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');const entry=new URL(req.url,'http://localhost').searchParams.get('entry')??'sidebar';res.end('<!doctype html><meta charset="utf-8"><div id="root"></div><script>globalThis.__RNTA_TOKEN="fixture";globalThis.__RNTA_ORIGIN="http://127.0.0.1:43171";</script><script>'+bundles[entry]+'</script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const context=await browser.newContext({viewport:{width:360,height:720}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const state={jobs:[],attempts:{},capabilities:{visible:true,followup:true,fork:true,recover:true,images:'local-file',stop:false}};
  const calls=[];let failFirst=true;
  await page.route('http://127.0.0.1:43171/**',async route=>{
    const r=route.request(),path=new URL(r.url()).pathname,data=r.postDataJSON();
    if(r.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type'}});
    let result;
    if(path==='/api/status')result=state;
    else if(path==='/api/actions')result={actions:[{id:'generate',label:'按要求生成',triggerTagId:'fixture-tag',shortcut:'ctrl+shift+g'}],capabilities:state.capabilities};
    else if(path==='/api/plugin')result={ok:true};
    else if(path==='/api/request'){calls.push({path,data});result={accepted:[{id:'job1',status:'queued'}]};}
    else if(path==='/api/chats') {
      calls.push({path,data});if(failFirst){failFirst=false;return route.abort('failed');}
      const job={id:'job1',requestId:data.requestId,title:'整理节点内容',status:'ready',visible:true,threadId:'native1'};state.jobs.push(job);result=job;
    } else if(path.endsWith('/messages')) {
      calls.push({path,data});result={requestId:data.requestId,status:'accepted'};state.attempts[data.requestId]=result;
    } else if(path.endsWith('/fork')) {
      calls.push({path,data});const job={id:'job2',requestId:data.requestId,title:'整理节点内容 · 分叉',status:'ready',visible:true,threadId:'native2'};state.jobs.push(job);result={status:'accepted',childJobId:'job2'};
    } else if(path.startsWith('/api/chats/'))result={job:state.jobs.find(j=>j.id===path.split('/').pop()),thread:{id:'native1',status:{type:'idle'}},turns:[{id:'turn1',status:'completed'}],messages:[{id:'u',role:'user',content:'整理选中的节点，保留原文。'},{id:'a',role:'assistant',content:'已读取节点上下文，保留原文并补全了说明。\n\n- 保留层级与引用\n- 写入后回读确认'}],page:{hasMore:false}};
    else return route.fulfill({status:404,body:'{}'});
    return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(result)});
  });
  await page.goto(url);const input=page.getByRole('textbox',{name:'对 RemNote 的指令'});await expect(input).toBeEnabled();
  await input.fill('整理节点内容');await input.dispatchEvent('compositionstart');await input.press('Enter');assert.equal(calls.length,0);await input.dispatchEvent('compositionend');
  await input.press('Shift+Enter');await input.type('保留原文');await page.getByRole('button',{name:'发送',exact:true}).click();await expect(page.getByRole('button',{name:'恢复同一请求',exact:true})).toBeEnabled();assert.equal(calls.length,1);await expect(input).toContainText('保留原文');
  await page.screenshot({path:join(output,'retry.png')});await page.getByRole('button',{name:'恢复同一请求',exact:true}).click();await expect(input).toHaveValue('');assert.equal(calls[0].data.requestId,calls[1].data.requestId);
  await expect(page.getByText('Codex 中可见 · 可继续对话')).toBeVisible();
  await input.fill('补充一个例子');await page.getByRole('button',{name:'发送',exact:true}).click();await expect(input).toHaveValue('');assert.equal(calls.at(-1).path,'/api/chats/job1/messages');
  await input.fill('尚未发送的草稿');await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tag-actions.draft.job1')??'{}').text)).toBe('尚未发送的草稿');await page.reload();await expect(input).toHaveValue('尚未发送的草稿');
  await page.getByRole('button',{name:'分叉',exact:true}).click();await expect(page.getByRole('button',{name:/整理节点内容 · 分叉/})).toBeVisible();
  await page.screenshot({path:join(output,'sidebar-light.png'),animations:'disabled'});await page.setViewportSize({width:320,height:640});await page.emulateMedia({colorScheme:'dark'});await page.screenshot({path:join(output,'sidebar-dark-320.png'),animations:'disabled'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const colors=await page.evaluate(()=>Object.fromEntries(['.chat-session-btn','.chat-input','.chat-container','.chat-markdown'].map(s=>{const c=getComputedStyle(document.querySelector(s));return [s,{color:c.color,background:c.backgroundColor,ink:c.getPropertyValue('--color-ink'),paper:c.getPropertyValue('--color-paper')}];})));await writeFile(join(output,'dark-colors.json'),JSON.stringify(colors,null,2));
  await page.goto(url+'?entry=header');await page.getByRole('button',{name:/按要求生成/}).click();await expect.poll(()=>calls.filter(c=>c.path==='/api/request').length).toBe(1);assert.deepEqual(calls.at(-1).data.remIds,['fixture-rem']);await page.getByRole('button',{name:'打开 RemNote 助手',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.sidebarOpened?.[0])).toBe('sidebar');
  await page.goto(url+'?entry=index');await page.evaluate(()=>window.indexReady);assert((await page.evaluate(()=>window.registeredWidgets)).some(w=>w[0]==='sidebar'&&w[1]==='RightSidebar'));assert((await page.evaluate(()=>window.registeredCommands.map(c=>({id:c.id,shortcut:c.keyboardShortcut})))).some(c=>c.shortcut==='ctrl+shift+g'));
  assert.deepEqual(errors,[]);await writeFile(join(output,'result.json'),JSON.stringify({passed:true,checks:['IME enter guard','multiline','failed request keeps draft','same request retry','same Thread followup','draft survives reload','native fork selection','320px dark layout','exact selected node','sidebar icon','SDK sidebar and shortcut registration']}));console.log('Browser fixture: 11 checks passed. Screenshots: '+output);
}finally{await browser.close();await new Promise(r=>server.close(r));}
