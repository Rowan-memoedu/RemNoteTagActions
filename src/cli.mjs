import {loadConfig} from './config.mjs';
import {Runtime} from './runtime.mjs';
import {serve} from './server.mjs';
import {acquireLease} from './lease.mjs';

const args=process.argv.slice(2),configAt=args.indexOf('--config');
const config=await loadConfig(configAt<0?undefined:args[configAt+1]),runtime=new Runtime(config);
let release;
try {
  if(args[0]==='status')console.log(JSON.stringify(await runtime.state(),null,2));
  else {
    if(['serve','scan'].includes(args[0]))release=await acquireLease(config.dataRoot);
    if(args[0]==='serve') {
      const service=await serve(runtime);console.log('RemNote Tag Actions ready on loopback port '+service.server.address().port);
      for(const sig of ['SIGINT','SIGTERM'])process.on(sig,async()=>{await service.close();await runtime.close();await release?.();release=null;process.exit(0);});
      await new Promise(()=>{});
    }else {
      console.log(JSON.stringify({ready:await runtime.ready()}));
      if(args[0]==='scan')console.log(JSON.stringify(await runtime.tick(),null,2));
      else if(args[0]!=='check')throw Error('Usage: check | status | scan | serve [--config PATH]');
    }
  }
}catch(e){console.error(e.message);process.exitCode=1;}finally{await runtime.close();await release?.();}
