import test from 'node:test';
import assert from 'node:assert/strict';
import {captureTarget} from '../plugin/selection.mjs';

function sdk({selection,focus='node_a',text='text',panes=['pane_a','pane_a'],selections,focuses}={}) {
  let pi=0,si=0,fi=0;
  return {window:{getFocusedPaneId:async()=>panes[Math.min(pi++,panes.length-1)]},
    editor:{getSelection:async()=>selections?selections[Math.min(si++,selections.length-1)]:selection,getFocusedEditorText:async()=>text},
    focus:{getFocusedRem:async()=>{const id=focuses?focuses[Math.min(fi++,focuses.length-1)]:focus;return id?{_id:id}:undefined;}},
    kb:{getCurrentKnowledgeBaseData:async()=>({_id:'kb_a'})}};
}
test('caret in editor selects its exact node',async()=>{assert.deepEqual((await captureTarget(sdk(),'pane_a')).remIds,['node_a']);});
test('text selection and multi-node selection preserve exact IDs',async()=>{
  assert.deepEqual((await captureTarget(sdk({selection:{remId:'text_node'}}))).remIds,['text_node']);
  assert.deepEqual((await captureTarget(sdk({selection:{remIds:['a','b','a']}}))).remIds,['a','b']);
});
test('document focus alone never becomes an implicit target',async()=>{
  const plugin=sdk();plugin.editor.getFocusedEditorText=async()=>undefined;
  await assert.rejects(captureTarget(plugin),/光标/);
});
test('header from another pane and changing pane are rejected',async()=>{
  await assert.rejects(captureTarget(sdk(),'other_pane'),/窗格/);
  await assert.rejects(captureTarget(sdk({panes:['pane_a','pane_b']})),/切换/);
});
test('changing selection or caret cannot dispatch a stale node',async()=>{
  await assert.rejects(captureTarget(sdk({selections:[{remIds:['a']},{remIds:['b']}]})),/选区/);
  await assert.rejects(captureTarget(sdk({focuses:['a','b']})),/光标所在/);
});
