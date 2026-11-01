export async function request(path,data) {
  const token=globalThis.__RNTA_TOKEN,origin=globalThis.__RNTA_ORIGIN;
  if(!token||!origin)throw Error('插件连接配置未就绪，请重新加载插件');
  const response=await fetch(origin+path,{method:data===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,...(data===undefined?{}:{'Content-Type':'application/json'})},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(20000)});
  const result=await response.json();if(!response.ok)throw Error(result.error??'后台请求失败');return result;
}
