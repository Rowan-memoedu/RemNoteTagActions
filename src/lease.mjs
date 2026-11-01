import {open,mkdir,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {jsonRead} from './io.mjs';

// One metadata writer. A crashed process can recover; a live process is never replaced.
export async function acquireLease(dataRoot) {
  await mkdir(dataRoot,{recursive:true});const path=join(dataRoot,'service-v2.lock');
  for(let attempt=0;attempt<2;attempt++) {
    try {
      const handle=await open(path,'wx');await handle.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));
      return async()=>{await handle.close();await unlink(path);};
    }catch(e){
      if(e.code!=='EEXIST')throw e;
      const owner=await jsonRead(path);if(!Number.isInteger(owner.pid)||owner.pid<=0)throw Error('Invalid service lease; inspect before recovery');
      let alive=true;try{process.kill(owner.pid,0);}catch(err){if(err.code==='ESRCH')alive=false;else throw err;}
      if(alive)throw Error('RemNote Tag Actions 已在运行，请使用现有服务');
      await unlink(path);
    }
  }
  throw Error('Could not acquire service lease');
}
