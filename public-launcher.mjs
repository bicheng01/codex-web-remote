import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {waitPublicPage} from './public-ready.mjs';
import {tunnelOrigin} from './tunnel-log.mjs';
const cwd=fileURLToPath(new URL('.',import.meta.url)),port=process.env.PORT??'43127';
let service,started=false,stopping=false,registered=false,origin=null,admin=null,checking=false;
const abort=new AbortController();
const progress=stage=>console.log('REMOTE_PROGRESS '+stage);
progress('tunnel');
const tunnel=spawn(process.execPath,['tunnel-process.mjs'],{stdio:['ignore','pipe','pipe']});
let buffer='',serverBuffer='';
async function check(){
  if(checking||!registered||!admin||stopping)return;checking=true;progress('verify');
  try{
    // Warm the local catalog before the phone's first pairing request.
    const catalog=await fetch(`http://127.0.0.1:${port}/api/catalog`,{headers:{Authorization:'Bearer '+admin},signal:AbortSignal.any([abort.signal,AbortSignal.timeout(5000)])});
    if(!catalog.ok)throw Error('本机会话列表加载失败');await catalog.json();
    await waitPublicPage(origin,{signal:abort.signal});
    if(stopping)return;
    // Create a fresh five-minute code only after the public assets are accessible.
    const refreshed=await fetch(`http://127.0.0.1:${port}/api/admin/refresh`,{method:'POST',headers:{Authorization:'Bearer '+admin,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(3000)])});
    if(!refreshed.ok)throw Error('刷新配对码失败');
    clearTimeout(timer);progress('ready');console.log(`Desktop pairing panel: http://127.0.0.1:${port}/admin#admin=${admin}`);
  }catch(e){if(!stopping){console.error(e.message);console.log('REMOTE_ERROR '+e.message);stop(1)}}
}
function output(chunk){
  const s=chunk.toString();process.stderr.write(s);for(const marker of s.matchAll(/REMOTE_(?:ERROR|PROGRESS) [^\n]+/g))console.log(marker[0]);buffer=(buffer+s).slice(-10000);
  if(buffer.includes('Registered tunnel connection'))registered=true;
  const url=tunnelOrigin(buffer);
  if(url&&!started){started=true;origin=url;progress('connect');service=spawn(process.execPath,['server.mjs'],{cwd,env:{...process.env,PUBLIC_ORIGIN:url},stdio:['ignore','pipe','pipe']});
    service.stdout.on('data',b=>{serverBuffer=(serverBuffer+b.toString()).slice(-16000);admin=serverBuffer.match(/#admin=([A-Za-z0-9_-]+)/)?.[1]??admin;check()});
    service.stderr.on('data',b=>{process.stderr.write(b);if(b.toString().includes('EADDRINUSE'))console.log('REMOTE_ERROR 本机端口 '+port+' 已被占用')});service.on('error',e=>{console.error(e.message);console.log('REMOTE_ERROR '+e.message);stop(1)});service.on('exit',code=>stop(code??1));
  }check();
}
tunnel.stdout.on('data',output);tunnel.stderr.on('data',output);
tunnel.on('error',e=>{console.error('cloudflared 启动失败：'+e.message);stop(1)});tunnel.on('exit',code=>stop(code??1));
const timer=setTimeout(()=>{console.error('公网隧道就绪超时');console.log('REMOTE_ERROR 公网隧道就绪超时');stop(1)},70000);timer.unref();
function stop(code=0){if(stopping)return;stopping=true;abort.abort();clearTimeout(timer);service?.kill('SIGTERM');tunnel.kill('SIGTERM');setTimeout(()=>{if(tunnel.exitCode===null)tunnel.kill('SIGKILL');if(service?.exitCode===null)service.kill('SIGKILL');process.exit(code)},1200)}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
