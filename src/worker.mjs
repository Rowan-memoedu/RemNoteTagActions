import {join} from 'node:path';
import {mkdir,open,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {RemNote} from './mcp.mjs';
import {jsonRead,jsonWrite,digest} from './io.mjs';
import {handler} from './registry.mjs';
import {applyPlan} from './engine.mjs';

export class Worker {
  constructor(config,{mcp,log=message=>process.stdout.write(`${new Date().toISOString()} ${message}\n`)}={}) {this.config=config;this.mcp=mcp;this.log=log;this.busy=false;}
  async connect() {this.mcp??=await new RemNote(this.config.mcpUrl).connect();return this;}
  async locked(action) {
    await mkdir(this.config.dataRoot,{recursive:true});
    const path=join(this.config.dataRoot,'worker.lock');let lock;
    try{lock=await open(path,'wx');await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));}
    catch(e){if(e.code==='EEXIST')throw Error('Another worker owns the lock; inspect its PID before recovery');throw e;}
    try{return await action();}finally{await lock.close();await unlink(path);}
  }
  async state() {return jsonRead(join(this.config.dataRoot,'state.json'),{version:1,entries:{}});}
  async save(state) {await jsonWrite(join(this.config.dataRoot,'state.json'),state);}
  rule(id) {const r=this.config.rules.find(r=>r.id===id&&r.enabled!==false);if(!r)throw Error('Unknown or disabled rule');handler(r.handler);return r;}
  async checkTags(rule) {
    await this.connect();
    for(const [tagId,name] of [[rule.triggerTagId,rule.triggerTagName],[rule.completedTagId,rule.completedTagName]]) {
      const tag=await this.mcp.read(tagId);
      if(name&&tag.title!==name) throw Error('Configured tag identity does not match the connected knowledge base');
    }
  }
  async scan() {
    const results=[];
    for(const rule of this.config.rules.filter(r=>r.enabled!==false)) {await this.checkTags(rule);for(const n of await this.mcp.tagged(rule.triggerTagId)) results.push({ruleId:rule.id,remId:n.remId,title:n.title});}
    return results;
  }
  async run(ruleId,remId,{retry=false}={}) {
    return this.locked(async()=>{
      const rule=this.rule(ruleId);await this.checkTags(rule);
      const state=await this.state(),key=`${ruleId}:${remId}`,prior=state.entries[key];
      if(prior&&['capturing','generating','applying','content-verified','needs-review'].includes(prior.status)) throw Error('Unfinished job requires recovery; refusing a duplicate run');
      if(prior&&['failed','blocked'].includes(prior.status)&&!retry) return {status:'held',jobId:prior.jobId};
      const snapshot=await this.mcp.snapshot(remId,this.config.maxNodes);
      if(!snapshot.nodes[remId].tags.includes(rule.triggerTagId)) return {status:'not-triggered'};
      const jobId=`${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`;
      const jobDir=join(this.config.artifactsRoot,'jobs',jobId);await mkdir(jobDir,{recursive:true});
      const entry={jobId,ruleId,remId,status:'capturing',jobDir,startedAt:new Date().toISOString(),sourceHash:digest(snapshot)};
      state.entries[key]=entry;await this.save(state);await jsonWrite(join(jobDir,'before.json'),snapshot);
      try {
        const root=await this.mcp.read(remId);
        const context=root.parentRemId?await this.mcp.call('remnote_read_note',{remId:root.parentRemId,contentMode:'structured',depth:2,childLimit:100,ancestorDepth:10,view:'full',maxContentLength:60000}):root;
        await jsonWrite(join(jobDir,'context.json'),context);
        entry.status='generating';await this.save(state);this.log(`job-start ${jobId}`);
        const plan=await handler(rule.handler).prepare({config:this.config,rule,snapshot,context,jobDir,log:this.log});
        await jsonWrite(join(jobDir,'plan.json'),plan);
        if(plan.status==='blocked') {entry.status='blocked';entry.error=plan.reason;await this.save(state);return entry;}
        const result=await applyPlan({mcp:this.mcp,config:this.config,rule,snapshot,plan,jobDir,checkpoint:async status=>{entry.status=status;await this.save(state);}});
        entry.status=result.status;entry.finishedAt=new Date().toISOString();await this.save(state);this.log(`job-completed ${jobId}`);return entry;
      } catch(error) {
        entry.status=['applying','content-verified'].includes(entry.status)?'needs-review':'failed';entry.error=error.message;entry.finishedAt=new Date().toISOString();await this.save(state);this.log(`job-${entry.status} ${jobId}: ${error.message}`);return entry;
      }
    });
  }
  async poll() {
    if(this.busy)return;this.busy=true;
    try {for(const match of await this.scan()) {
      try {await this.run(match.ruleId,match.remId);} catch(error) {this.log(`item-held ${match.ruleId}:${match.remId}: ${error.message}`);}
    }}
    catch(error){this.log(`poll-error: ${error.message}`);}
    finally{this.busy=false;}
  }
}
