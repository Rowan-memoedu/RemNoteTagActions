import {same,id} from './io.mjs';

export function validatePlan(snapshot,plan) {
  if(plan.status!=='ready') throw Error(`Handler blocked: ${plan.reason||'No safe result'}`);
  if(!Array.isArray(plan.updates)||!Array.isArray(plan.creates)||!Array.isArray(plan.archives)) throw Error('Malformed edit plan');
  const count=plan.updates.length+plan.creates.length+plan.archives.length;
  if(!count||count>500) throw Error('Empty or oversized edit plan');
  const known=new Set(Object.keys(snapshot.nodes)), touched=new Set(), refs=new Set(known);
  const text=t=>typeof t==='string'&&t.trim()&&t.length<=100000;
  for(const {title} of [...plan.updates,...plan.creates])if(typeof title==='string'&&(/\]\([^\n]*\)/.test(title)||/\[\[|\*\*|__|<a\b|!\[/.test(title)))throw Error('Use readable plain text and visible URLs; rich text cannot be verified by this MCP adapter');
  for(const change of plan.updates) {
    const n=snapshot.nodes[change.remId];
    if(!n||touched.has(change.remId)||!text(change.title)) throw Error('Update outside target, duplicate, or empty');
    if(n.cardDirection||n.media.length) throw Error('Editing media/card nodes is not supported by this handler');
    for(const ref of n.inlineRefs) if(!change.title.includes(`[[id:${ref.targetRemId}]]`)) throw Error('Existing inline reference would be lost');
    if(n.title===change.title) throw Error('No-op title change');
    touched.add(change.remId);
  }
  for(const create of plan.creates) {
    if(!id(create.key)||refs.has(create.key)||!refs.has(create.parentRef)||!text(create.title)) throw Error('Invalid create dependency, key, or title');
    refs.add(create.key);
  }
  for(const remId of plan.archives) {
    const n=snapshot.nodes[remId];
    if(!n||remId===snapshot.rootId||touched.has(remId)||n.children.length||n.tags.length||n.inlineRefs.length||n.media.length||n.cardDirection) throw Error('Only unprotected instruction leaves may be archived');
    if(plan.creates.some(c=>c.parentRef===remId)) throw Error('Cannot create under an archived node');
    touched.add(remId);
  }
  return plan;
}
export function assertFresh(expected,current) {if(!same(expected,current)) throw Error('Source changed since capture; stopped before overwrite');}
export function contentView(snapshot) {
  const copy=structuredClone(snapshot);
  delete copy.nodes[copy.rootId].tags;
  return copy;
}
