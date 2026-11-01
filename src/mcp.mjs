import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export class RemNote {
  constructor(url) { this.url=url; }
  async connect() {
    this.client = new Client({name:'remnote-tag-actions',version:'0.1.0'});
    await this.client.connect(new StreamableHTTPClientTransport(new URL(this.url)));
    const status = await this.call('remnote_status');
    if(!status.connected) throw Error('RemNote bridge is disconnected');
    if(!status.acceptWriteOperations) throw Error('RemNote writes are disabled');
    return this;
  }
  async call(name,args={}) {
    const r=await this.client.callTool({name,arguments:args},undefined,{timeout:130000});
    if(r.isError) throw Error(`${name}: ${r.content?.find(x=>x.type==='text')?.text ?? 'MCP error'}`);
    return r.structuredContent??JSON.parse(r.content.find(x=>x.type==='text').text);
  }
  async read(remId) {
    const r=await this.call('remnote_read_note',{remId,depth:0,contentMode:'none',includeMediaMetadata:true,ancestorDepth:10,view:'full'});
    if(r.remId!==remId) throw Error('MCP returned an unexpected Rem');
    return r;
  }
  async children(parentRemId) {
    const result=[]; let cursor;
    do {
      const p=await this.call('remnote_list_children',{parentRemId,limit:150,view:'full',...(cursor?{cursor}:{})});
      const items=p.children??p.results;
      if(!Array.isArray(items)) throw Error('Unknown child-list response');
      result.push(...items);
      if(!p.hasMore) break;
      if(!p.nextCursor||p.nextCursor===cursor) throw Error('Child pagination did not advance');
      cursor=p.nextCursor;
      if(result.length>20000) throw Error('Child pagination safety ceiling');
    } while(true);
    return result;
  }
  async tagged(tagRemId) {
    const result=[]; let cursor;
    do {
      const p=await this.call('remnote_search_by_tag',{tagRemId,resultMode:'tagged',contentMode:'none',view:'standard',limit:150,...(cursor?{cursor}:{})});
      if(p.truncated) throw Error('Tag search truncated; refusing incomplete scan');
      result.push(...(p.results??[]));
      if(!p.hasMore) break;
      if(!p.nextCursor||p.nextCursor===cursor) throw Error('Tag pagination did not advance');
      cursor=p.nextCursor;
    } while(true);
    return result;
  }
  async snapshot(rootId,maxNodes=500) {
    const nodes={};
    const visit=async remId=>{
      if(nodes[remId]) throw Error('Duplicate/cyclic Rem tree');
      if(Object.keys(nodes).length>=maxNodes) throw Error(`Subtree exceeds ${maxNodes} nodes; no write performed`);
      const r=await this.read(remId);
      const children=await this.children(remId);
      const tags=(r.tags??[]).map(t=>t.tagRemId).sort();
      nodes[remId]={remId,title:r.title??'',headline:r.headline??r.title??'',parentRemId:r.parentRemId??null,remType:r.remType,cardDirection:r.cardDirection??null,tags,inlineRefs:r.inlineRefs??[],media:r.media??[],children:children.map(x=>x.remId)};
      for(const child of children) await visit(child.remId);
    };
    await visit(rootId);
    return {rootId,nodes};
  }
  async close() {await this.client?.close();}
}
