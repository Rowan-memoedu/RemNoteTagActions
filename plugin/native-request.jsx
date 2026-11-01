// Explicit user responses to the native protocol; never auto-approve or auto-answer.
import React,{useState} from 'react';

export function NativeRequest({request,onRespond,busy}) {
  const [values,setValues]=useState({}),p=request.params??{},method=request.method;
  const set=(key,value)=>setValues(old=>({...old,[key]:value}));
  if(method==='item/tool/requestUserInput')return <form className="native-request" onSubmit={e=>{e.preventDefault();void onRespond(request,{answers:Object.fromEntries(p.questions.map(q=>[q.id,{answers:[values[q.id]]}]))});}}>
    <strong>Codex 需要补充信息</strong>{p.questions.map(q=><label key={q.id}>{q.question}<input required disabled={busy} value={values[q.id]??''} onChange={e=>set(q.id,e.target.value)} list={'choices-'+q.id}/>{q.options?.length>0&&<datalist id={'choices-'+q.id}>{q.options.map(o=><option key={o.label} value={o.label}>{o.description}</option>)}</datalist>}</label>)}<button disabled={busy} type="submit">提交回答</button>
  </form>;
  if(['item/commandExecution/requestApproval','item/fileChange/requestApproval'].includes(method))return <div className="native-request"><strong>Codex 请求本次操作许可</strong><p>{p.reason??'请核对以下操作'}</p><pre>{p.command??p.grantRoot??'文件修改：请先在原生对话中核对具体变更。'}</pre><div className="native-request-actions">{(p.command||p.grantRoot)&&<button disabled={busy} onClick={()=>onRespond(request,{decision:'accept'})}>允许本次</button>}<button disabled={busy} onClick={()=>onRespond(request,{decision:'decline'})}>拒绝</button></div></div>;
  if(method!=='mcpServer/elicitation/request')return <div className="native-request" role="status">原生对话正在等待专用验证。请停止本轮后在支持该验证的客户端继续。</div>;
  const fields=Object.entries(p.requestedSchema?.properties??{}),required=p.requestedSchema?.required??[];
  const supported=['form','openai/form','openaiForm'].includes(p.mode)&&fields.every(([,f])=>['string','boolean','integer','number'].includes(f.type));
  return <form className="native-request" onSubmit={e=>{e.preventDefault();void onRespond(request,{action:'accept',content:values});}}>
    <strong>Codex 需要确认</strong><p>{p.message??p.description??p.title}</p>
    {p._meta?.tool_params_display?.length>0&&<dl>{p._meta.tool_params_display.map((f,i)=><React.Fragment key={i}><dt>{f.display_name??f.name}</dt><dd>{typeof f.value==='string'?f.value:JSON.stringify(f.value)}</dd></React.Fragment>)}</dl>}
    {supported?fields.map(([key,f])=><label key={key}>{f.title??key}{f.description&&<small>{f.description}</small>}
      {f.enum||f.type==='boolean'?<select required={required.includes(key)} disabled={busy} value={values[key]===undefined?'':String(values[key])} onChange={e=>set(key,f.type==='boolean'?e.target.value==='true':e.target.value)}><option value="">请选择</option>{(f.enum??[true,false]).map((v,i)=><option key={String(v)} value={String(v)}>{f.enumNames?.[i]??(typeof v==='boolean'?(v?'是':'否'):String(v))}</option>)}</select>:<input type={['number','integer'].includes(f.type)?'number':f.format==='password'?'password':'text'} step={f.type==='integer'?1:'any'} required={required.includes(key)} disabled={busy} value={values[key]??''} onChange={e=>set(key,['number','integer'].includes(f.type)?Number(e.target.value):e.target.value)}/>}
    </label>):<p>此请求需要专用验证，侧栏无法代为完成。</p>}
    <div className="native-request-actions">{supported&&<button disabled={busy} type="submit">确认本次</button>}<button disabled={busy} type="button" onClick={()=>onRespond(request,{action:'decline'})}>拒绝</button><button disabled={busy} type="button" onClick={()=>onRespond(request,{action:'cancel'})}>取消</button></div>
  </form>;
}
