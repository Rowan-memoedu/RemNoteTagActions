// Opt-in live acceptance for this plugin only. Private evidence stays in artifactsRoot.
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {loadConfig} from '../src/config.mjs';
import {jsonRead,jsonWrite} from '../src/io.mjs';
const config=await loadConfig(),evidence=join(config.artifactsRoot,'native-session-canary');
await mkdir(evidence,{recursive:true});
const {token}=await jsonRead(join(config.dataRoot,'transport.json'));
const api=async(path,data)=>{const r=await fetch('http://127.0.0.1:43171'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(90000)});const b=await r.json();if(!r.ok)throw Error(b.error);return b;};
const state=await api('/api/status'),kbId=state.kbId??'local-mcp-canary';
const recordPath=join(evidence,'session.json');
if(process.argv[2]==='image') {
  if(await jsonRead(recordPath,null))throw Error('Canary already exists; use status/followup/fork rather than create another');
  const imagePath=process.argv[3];if(!imagePath)throw Error('Supply a synthetic image path');
  const image=await api('/api/attachments',{name:'验收图片.png',kbId,base64:(await readFile(imagePath)).toString('base64')});
  const request={requestId:randomUUID(),text:'这是 RemNote 助手的图片功能验收。请实际查看附图，只用一句话描述图中的形状和颜色，并读出图上的四位数字。不要读取或修改知识库，不要读取其他本地文件。',attachmentIds:[image.id],kbId};
  await jsonWrite(recordPath,{request});const job=await api('/api/chats',request);await jsonWrite(recordPath,{request,jobId:job.id});console.log(JSON.stringify({jobId:job.id,status:job.status}));
} else {
  const record=await jsonRead(recordPath);const job=state.jobs.find(j=>j.id===record.jobId||j.requestId===record.request.requestId);if(!job)throw Error('Canary delivery not found');
  if(process.argv[2]==='followup') {
    record.followup??={requestId:randomUUID(),text:'继续同一个对话。请仅依据刚才看过的图片和你的回答，重复其中四位数字，不要重新打开图片，也不要修改笔记。',kbId};await jsonWrite(recordPath,record);
    const result=await api('/api/chats/'+job.id+'/messages',record.followup);console.log(JSON.stringify(result));
  } else if(process.argv[2]==='fork') {
    record.fork??={requestId:randomUUID(),kbId};await jsonWrite(recordPath,record);
    console.log(JSON.stringify(await api('/api/chats/'+job.id+'/fork',record.fork)));
  } else if(process.argv[2]==='fork-followup') {
    const child=state.jobs.find(j=>j.requestId===record.fork?.requestId);if(!child)throw Error('Fork has not been accepted');
    record.forkFollowup??={requestId:randomUUID(),text:'这是分叉恢复验收。请只复述父对话图片中的四位数字，不重新读图，不修改知识库。',kbId};await jsonWrite(recordPath,record);
    console.log(JSON.stringify(await api('/api/chats/'+child.id+'/messages',record.forkFollowup)));
  } else if(process.argv[2]==='status') {
    const snapshot=await api('/api/chats/'+job.id);await jsonWrite(join(evidence,'native-readback.json'),snapshot);
    console.log(JSON.stringify({job:snapshot.job,turns:snapshot.turns,messages:snapshot.messages.map(m=>({role:m.role,content:m.content}))},null,2));
  } else throw Error('image PATH | followup | fork | status');
}
