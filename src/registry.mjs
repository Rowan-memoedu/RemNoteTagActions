import * as generate from '../handlers/generate/index.mjs';

// New behaviors implement prepare(context) and are registered here. The worker,
// queue, tag transitions and UI do not contain generation-specific branches.
const handlers=new Map([['codex-generate',generate]]);
export function handler(name) {
  const found=handlers.get(name);
  if(!found) throw Error(`Unknown action handler: ${name}`);
  return found;
}
export function registerHandler(name,implementation) {
  if(handlers.has(name)||typeof implementation.prepare!=='function') throw Error('Invalid handler registration');
  handlers.set(name,implementation);
}
