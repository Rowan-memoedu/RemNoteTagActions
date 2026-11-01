import {loadConfig} from './config.mjs';
import {Worker} from './worker.mjs';
import {finalizeVerified} from './recovery.mjs';
import {serve} from './server.mjs';

const args=process.argv.slice(2),command=args[0];
const configAt=args.indexOf('--config');
const config=await loadConfig(configAt<0?undefined:args[configAt+1]);
const worker=new Worker(config);
try {
  if(command==='status') console.log(JSON.stringify(await worker.state(),null,2));
  else if(command==='serve') {await serve(worker);await new Promise(()=>{});}
  else {
    await worker.connect();
    if(command==='scan') console.log(JSON.stringify(await worker.scan(),null,2));
    else if(command==='run'||command==='retry') {
      const result=await worker.run(args[1],args[2],{retry:command==='retry'});console.log(JSON.stringify(result,null,2));
      if(!['completed','not-triggered'].includes(result.status))process.exitCode=1;
    } else if(command==='finalize') console.log(JSON.stringify(await finalizeVerified(worker,args[1],args[2]),null,2));
    else throw Error('Usage: scan | status | run RULE REM | retry RULE REM | finalize RULE REM | serve [--config PATH]');
  }
} catch(error) {console.error(error.message);process.exitCode=1;}
finally {await worker.mcp?.close();}
