import {mkdir, readFile, writeFile, rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';

export async function jsonRead(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
}
export async function jsonWrite(path, value) {
  await mkdir(dirname(path), {recursive:true});
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), {encoding:'utf8', mode:0o600});
  await rename(temp, path);
}
export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  return value;
}
export const digest = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
export const same = (a,b) => digest(a) === digest(b);
export const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
