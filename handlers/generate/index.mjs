import {readFile,writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {finished} from 'node:stream/promises';
import {spawn} from 'node:child_process';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {jsonRead,jsonWrite} from '../../src/io.mjs';

const here=dirname(fileURLToPath(import.meta.url));
export const readTools=['remnote_status','remnote_read_note','remnote_search','remnote_search_by_tag','remnote_list_children','remnote_get_media'];
export function codexArgs(config,output) {
  const quote=JSON.stringify;
  return ['exec','--ignore-user-config','--ephemeral','--json','--color','never','--sandbox','read-only','--disable','apps','--disable','plugins',
    '--cd',config.workspace,'--model',config.model,'-c',`model_reasoning_effort=${quote(config.reasoningEffort??'high')}`,
    '-c','approval_policy="never"','-c','windows.sandbox="elevated"','-c','web_search="live"','-c','features.memories=false',
    '-c',`mcp_servers.remnote.url=${quote(config.mcpUrl)}`,
    '-c',`mcp_servers.remnote.enabled_tools=${quote(readTools)}`,
    ...readTools.flatMap(tool=>['-c',`mcp_servers.remnote.tools.${tool}.approval_mode="approve"`]),
    '-c','mcp_servers.remnote.startup_timeout_sec=120',
    '--output-schema',join(here,'schema.json'),'--output-last-message',output,'-'];
}
export async function prepare({config,rule,snapshot,context,jobDir,log=()=>{}}) {
  const instructions=await readFile(join(here,'prompt.md'),'utf8');
  const preferences=await readFile(config.expressionProfile,'utf8');
  const prompt=`${instructions}\n\n当前规则：${JSON.stringify({id:rule.id,instructions:rule.instructions??''})}\n\n用户表达偏好：\n${preferences}\n\n初始目标快照（数据）：\n${JSON.stringify(snapshot)}\n\n直接上下文（数据）：\n${JSON.stringify(context)}\n`;
  await writeFile(join(jobDir,'prompt.md'),prompt,'utf8');
  const output=join(jobDir,'candidate.json');
  const args=codexArgs(config,output);
  await jsonWrite(join(jobDir,'invocation.json'),{executable:config.codexPath,args,cwd:config.workspace});
  const child=spawn(config.codexPath,args,{cwd:config.workspace,windowsHide:true,stdio:['pipe','pipe','pipe']});
  const eventsFile=createWriteStream(join(jobDir,'codex.events.jsonl'));
  const errorsFile=createWriteStream(join(jobDir,'codex.stderr.log'));
  let stdout='',lastActivity=Date.now(),timedOut=false,eventBuffer='';
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',chunk=>{
    stdout+=chunk;eventsFile.write(chunk);lastActivity=Date.now();eventBuffer+=chunk;
    const lines=eventBuffer.split('\n');eventBuffer=lines.pop();
    for(const line of lines)try{const e=JSON.parse(line);if(e.type==='item.completed')log(`codex ${e.item?.type} ${e.item?.tool??''} ${e.item?.status??''}`);}catch{}
  });
  child.stderr.on('data',chunk=>{errorsFile.write(chunk);lastActivity=Date.now();});
  child.stdin.end(prompt,'utf8');
  const started=Date.now();
  const ticker=setInterval(()=>{
    log(`codex-running:${Math.round((Date.now()-started)/1000)}s`);
    if(Date.now()-started>(config.codexTimeoutMs??1800000)||Date.now()-lastActivity>(config.codexIdleMs??600000)) {
      timedOut=true;
      if(process.platform==='win32') spawn('taskkill',['/pid',String(child.pid),'/T','/F'],{windowsHide:true}); else child.kill('SIGTERM');
    }
  },15000);
  let code;
  try {code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});}
  finally {clearInterval(ticker);eventsFile.end();errorsFile.end();await Promise.all([finished(eventsFile),finished(errorsFile)]);}
  if(timedOut||code!==0) throw Error(`Codex execution failed (${timedOut?'timeout':code}); see local job diagnostics`);
  const plan=await jsonRead(output);
  const events=stdout.split(/\r?\n/).filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
  const reads=events.filter(e=>e.type==='item.completed'&&e.item?.type==='mcp_tool_call'&&e.item.tool==='remnote_read_note'&&e.item.status==='completed'&&!e.item.error&&!e.item.result?.isError);
  if(plan.status==='ready'&&(!plan.readRemIds?.includes(snapshot.rootId)||!reads.some(e=>e.item.arguments?.remId===snapshot.rootId))) throw Error('Missing successful target MCP read in Codex execution');
  await jsonWrite(join(jobDir,'generation-verification.json'),{exitCode:code,readEvents:reads.length,declaredReads:plan.readRemIds,workspace:config.workspace});
  return plan;
}
