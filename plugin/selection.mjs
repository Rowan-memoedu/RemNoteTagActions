// SDK adapter injected by the index/header; unit tests need no browser runtime.
export async function captureTarget(plugin,paneId) {
  const actualPane=await plugin.window.getFocusedPaneId();
  if(paneId&&actualPane!==paneId)throw Error('请先在这个窗格中将光标放在节点文字上，或选中节点');
  const selection=await plugin.editor.getSelection();
  let remIds,focusedId;
  if(selection?.remIds?.length)remIds=selection.remIds;
  else if(selection?.remId)remIds=[selection.remId];
  else {
    const focused=await plugin.focus.getFocusedRem();
    const text=await plugin.editor.getFocusedEditorText();
    if(!focused||text===undefined)throw Error('请先将光标放在节点文字上，或选中节点');
    remIds=[focused._id];
    focusedId=focused._id;
  }
  remIds=[...new Set(remIds)];
  if(!remIds.length||remIds.length>50)throw Error('每次请选择 1–50 个节点');
  const kbId=(await plugin.kb.getCurrentKnowledgeBaseData())._id;
  // Never fall back to the document title or a remembered stale selection.
  const recheck=await plugin.editor.getSelection();
  if(JSON.stringify(selection)!==JSON.stringify(recheck))throw Error('读取时选区发生变化，请重新触发');
  if(focusedId&&focusedId!==(await plugin.focus.getFocusedRem())?._id)throw Error('读取时光标所在节点发生变化，请重新触发');
  if(actualPane!==await plugin.window.getFocusedPaneId())throw Error('读取时切换了窗格，请重新触发');
  return {remIds,kbId,paneId:actualPane,capturedAt:Date.now()};
}
