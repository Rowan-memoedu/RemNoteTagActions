import {captureTarget} from './selection.mjs';
import {request} from './api.mjs';

export async function trigger(plugin,action,paneId,captured) {
  const capture=captured??await captureTarget(plugin,paneId);
  if(captured&&(Date.now()-captured.capturedAt>60000||captured.kbId!==(await plugin.kb.getCurrentKnowledgeBaseData())._id))throw Error('选区已过期，请关闭菜单后重新选择节点');
  const result=await request('/api/request',{requestId:crypto.randomUUID(),ruleId:action.id,...capture});
  const latest=result.accepted[0];
  if(latest)await plugin.storage.setLocal('tag-actions.selected',latest.id);
  if(result.accepted.some(j=>j.status==='overlap-active'))throw Error('已有任务正在处理重叠的节点范围，可在右侧对话中继续；本次未重复提交');
  return result;
}
