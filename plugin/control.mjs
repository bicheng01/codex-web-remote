import {readFile,writeFile,mkdir,rm,open} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export const runtime=process.env.REMOTE_RUNTIME_DIR??path.join(process.env.CODEX_HOME??path.join(os.homedir(),'.codex'),'web-remote');
const file=path.join(runtime,'service.json');
async function waitForExit(pid){for(let i=0;i<50;i++){try{process.kill(pid,0)}catch{return true}await new Promise(resolve=>setTimeout(resolve,100))}return false}
async function checkPort(port){await new Promise((resolve,reject)=>{const probe=net.createServer();probe.once('error',e=>reject(Error(e.code==='EADDRINUSE'?`本机端口 ${port} 已被占用，请停止占用服务或使用 --port 指定其他端口`:e.message)));probe.listen(port,'0.0.0.0',()=>probe.close(resolve))})}
async function record(){try{return JSON.parse(await readFile(file,'utf8'))}catch{return null}}
async function request(r,route,data){const res=await fetch(`http://127.0.0.1:${r.port}${route}`,{signal:AbortSignal.timeout(3000),method:data===undefined?'GET':'POST',headers:{Authorization:'Bearer '+r.admin,...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)});const value=await res.json();if(!res.ok)throw Error(value.error??'Remote service unavailable');return value}
export async function status(){const r=await record();if(!r)return{running:false};try{const p=await request(r,'/api/admin/pairing');return{running:true,enabled:p.enabled,mode:r.mode,port:r.port,devices:p.devices,connected:p.view.connected,adminUrl:`http://127.0.0.1:${r.port}/admin#admin=${r.admin}`}}catch{return{running:false}}}
export async function start({mode='public',port=43127}={}, {onProgress=()=>{}}={}){
  const current=await status();if(current.running){if(!current.enabled){const fresh=await refresh();return{...fresh,reused:true}}return{...current,reused:true}}
  await mkdir(runtime,{recursive:true,mode:0o700});
  const lock=path.join(runtime,'start.lock');try{await mkdir(lock)}catch{throw Error('启动正在进行，请稍后查看状态；若异常退出，请删除 start.lock 后重试')}
  try{
    await checkPort(port);
    await rm(file,{force:true});await rm(path.join(runtime,'startup.json'),{force:true});await rm(path.join(runtime,'startup-error.json'),{force:true});onProgress(mode==='public'?'tunnel':'local');
    const log=await open(path.join(runtime,'service.log'),'a',0o600);
    const child=spawn(process.execPath,[path.join(root,'plugin/supervisor.mjs')],{cwd:root,detached:true,stdio:['ignore',log.fd,log.fd],env:{...process.env,REMOTE_MODE:mode,PORT:String(port),REMOTE_RUNTIME_DIR:runtime}});
    const failed=new Promise((_,reject)=>{child.once('error',reject);child.once('exit',async()=>{let error='后台服务启动失败，请查看本机 service.log';try{error=JSON.parse(await readFile(path.join(runtime,'startup-error.json'),'utf8')).error}catch{}reject(Error(error))})});child.unref();await log.close();
    let waiting=true,lastStage=null;
    const ready=(async()=>{for(let i=0;waiting&&i<375;i++){try{const {stage}=JSON.parse(await readFile(path.join(runtime,'startup.json'),'utf8'));if(stage!==lastStage){lastStage=stage;onProgress(stage)}}catch{}const s=await status();if(s.running)return s;await new Promise(r=>setTimeout(r,200))}if(waiting)throw Error('公网启动超时，请查看本机 service.log（其中含管理凭证，勿分享）')})();
    try{return await Promise.race([ready,failed])}catch(e){child.kill('SIGTERM');await waitForExit(child.pid);throw e}finally{waiting=false}
  }finally{await rm(lock,{recursive:true,force:true})}
}
export async function pairingQr({rotate=false}={}){
  const started=performance.now(),r=await record();if(!r)throw Error('请先开启手机遥控');
  if(rotate)await request(r,'/api/admin/refresh',{});
  let p=await request(r,'/api/admin/pairing');
  if(!p.qr){await request(r,'/api/admin/refresh',{});p=await request(r,'/api/admin/pairing')}
  if(!p.qr?.startsWith('data:image/png;base64,')||!p.link)throw Error('未生成配对二维码');
  const qrBase64=p.qr.split(',')[1],imagePath=path.join(runtime,`pairing-${Date.now()}.png`);
  await writeFile(imagePath,Buffer.from(qrBase64,'base64'),{mode:0o600});
  return{running:true,enabled:p.enabled,mode:r.mode,port:r.port,connected:p.view.connected,imagePath,expires:p.expires,qrRefreshed:rotate,elapsedMs:Math.round(performance.now()-started),qrBase64,link:p.link};
}
export async function refresh(){return pairingQr({rotate:true})}
export async function stop(){const r=await record();if(!r)return{stopped:true};try{await request(r,'/api/admin/stop',{})}catch(e){if((await status()).running)throw e}
  // Revoke adopted services without claiming or destroying another installation's process.
  let backgroundServiceStopped=false;
  if(r.supervisorPid){
    const {execFile}=await import('node:child_process');
    const command=await new Promise(resolve=>execFile('/bin/ps',['-p',String(r.supervisorPid),'-o','command='],(_,out)=>resolve(out??'')));
    if(command.includes(path.join(root,'plugin/supervisor.mjs'))){
      try{process.kill(r.supervisorPid,'SIGTERM');backgroundServiceStopped=true}catch{}
      if(backgroundServiceStopped){
        await rm(file,{force:true});
        // Wait for the owned supervisor to release its port before a subsequent start.
        const exited=await waitForExit(r.supervisorPid);
        if(!exited)throw Error('后台服务仍在退出，请稍后再启动');
      }
    }
  }
  return{stopped:true,phoneConnectionsRevoked:true,desktopTaskContinues:true,backgroundServiceStopped};
}
