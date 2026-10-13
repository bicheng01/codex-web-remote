import {spawn} from 'node:child_process';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),runtime=process.env.REMOTE_RUNTIME_DIR,port=Number(process.env.PORT??43127),mode=process.env.REMOTE_MODE??'public';
await mkdir(runtime,{recursive:true,mode:0o700});
let stopping=false,buffer='';
const child=spawn(process.execPath,[mode==='public'?'public-launcher.mjs':'server.mjs'],{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});
async function output(b){process.stdout.write(b);buffer=(buffer+b.toString()).slice(-16000);const admin=buffer.match(/Desktop pairing panel: http:\/\/127\.0\.0\.1:\d+\/admin#admin=([A-Za-z0-9_-]+)/)?.[1];if(admin){buffer='';await writeFile(path.join(runtime,'service.json'),JSON.stringify({port,mode,admin,supervisorPid:process.pid}),{mode:0o600})}}
child.stdout.on('data',b=>output(b).catch(e=>{console.error(e.message);stop(1)}));child.stderr.on('data',b=>process.stderr.write(b));
child.on('error',e=>{console.error(e.message);stop(1)});child.on('exit',code=>stop(code??0));
async function stop(code=0){if(stopping)return;stopping=true;child.kill('SIGTERM');try{const r=JSON.parse(await (await import('node:fs/promises')).readFile(path.join(runtime,'service.json'),'utf8'));if(r.supervisorPid===process.pid)await rm(path.join(runtime,'service.json'),{force:true})}catch{}setTimeout(()=>process.exit(code),1500)}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
