import {join} from 'node:path';
import {jsonRead,same} from './io.mjs';

export class WakeWire {
  constructor(config) {this.config=config;}
  async api(path,body) {
    const daemon=await jsonRead(join(this.config.wakewireHome,'daemon.json'));
    if(!Number.isInteger(daemon.port)||!daemon.token)throw Error('WakeWire daemon is not ready');
    const r=await fetch(`http://127.0.0.1:${daemon.port}${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${daemon.token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
    const value=await r.json();if(!r.ok)throw Error(`WakeWire ${r.status}: ${value.error??'request failed'}`);return value;
  }
  routeInput() {
    return {name:'RemNote Tag Actions · visible threads',source:'webhook',match:{provider:'remnote-tag-actions'},target:{type:'new-thread',cwd:this.config.workspace,worktree:false,promptMode:'verbatim',maxConcurrent:2,appProjectId:this.config.appProjectId,appOwnerThreadId:this.config.appOwnerThreadId},sandbox:'user-config',rateLimitPerMinute:30,enabled:true};
  }
  async route() {
    const expected=this.routeInput();const {routes}=await this.api('/api/routes');
    const matches=routes.filter(r=>r.name===expected.name);
    if(matches.length>1)throw Error('Duplicate WakeWire plugin routes');
    if(matches[0]) {
      const r=matches[0];
      if(!same(r.target,expected.target)||!same(r.match,expected.match)||r.sandbox!==expected.sandbox||!r.enabled)throw Error('Existing WakeWire route differs; refusing silent replacement');
      this.routeId=r.id;
    } else this.routeId=(await this.api('/api/routes',expected)).route.id;
    return this.routeId;
  }
  async enqueue(key,prompt) {return (await this.api(`/api/routes/${this.routeId}/prompts`,{sourceDeliveryId:key,prompt})).delivery;}
  async delivery(key) {return (await this.api(`/api/deliveries?routeId=${encodeURIComponent(this.routeId)}&sourceDeliveryId=${encodeURIComponent(key)}&limit=1`)).deliveries[0]??null;}
}
