import {captureTarget} from './selection.mjs';
import {request} from './api.mjs';

export async function trigger(plugin,action,paneId,captured) {
  const capture=captured??await captureTarget(plugin,paneId);
  if(captured&&(Date.now()-captured.capturedAt>60000||captured.kbId!==(await plugin.kb.getCurrentKnowledgeBaseData())._id))throw Error('选区已过期，请关闭菜单后重新选择节点');
  const result=await request('/api/request',{ruleId:action.id,...capture});
  const held=result.accepted.filter(x=>x.status==='needs-review');
  if(held.length)throw Error('上次写入需要核对，已保留恢复记录；本次未重复生成');
  return result;
}
