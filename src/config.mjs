import {jsonRead} from './io.mjs';
import {isAbsolute} from 'node:path';

export const defaultConfigPath = 'D:/AppData/RemNoteTagActions/config.json';
export async function loadConfig(path = defaultConfigPath) {
  const c = await jsonRead(path);
  if(c.version !== 3 || !Array.isArray(c.rules)) throw Error('Independent WakeWire session configuration version 3 required');
  const url = new URL(c.mcpUrl);
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)) throw Error('MCP must use local loopback');
  for(const key of ['dataRoot','artifactsRoot','workspace','wakewireHome','codexPath']) if(!isAbsolute(c[key])) throw Error(`Absolute ${key} required`);
  if(!c.nativeProjectId) throw Error('Saved native Project identity is required');
  if(c.appOwnerThreadId)throw Error('Cross-chat ownership is not supported by this workflow');
  const permissions=c.nativePermissions;
  if(!permissions||!['never','on-request','untrusted'].includes(permissions.approvalPolicy)||!['danger-full-access','workspace-write','read-only'].includes(permissions.sandbox)||!permissions.mcpServers||Object.values(permissions.mcpServers).some(m=>!['approve','prompt','auto','writes'].includes(m)))throw Error('Explicit native permission settings required');
  const names = new Set();
  for(const r of c.rules) {
    if(!r.id || names.has(r.id) || !r.handler || !r.triggerTagId || !r.completedTagId || r.triggerTagId===r.completedTagId) throw Error('Invalid or duplicate action rule');
    names.add(r.id);
  }
  return {...c,configPath:path,pollMs:c.pollMs??15000,maxNodes:c.maxNodes??500};
}
