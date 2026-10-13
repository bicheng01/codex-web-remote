import {spawn} from 'node:child_process';
let child,stopping=false;
function stop(){if(stopping)return;stopping=true;child?.kill('SIGTERM');setTimeout(()=>{if(child?.exitCode===null)child.kill('SIGKILL');process.exit(0)},700)}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
for(let attempt=1;attempt<=3&&!stopping;attempt++){
 let log='';
 const code=await new Promise(resolve=>{
  child=spawn('cloudflared',['tunnel','--no-autoupdate','--protocol','http2','--url',`http://127.0.0.1:${process.env.PORT??43127}`],{stdio:['ignore','pipe','pipe']});
  for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{log=(log+b.toString()).slice(-16000);process.stderr.write(b)});
  child.on('error',()=>resolve(127));child.on('exit',code=>resolve(code??1));
 });
 if(stopping)break;
 if(attempt<3&&/failed to request quick Tunnel.*(?:deadline exceeded|timeout|temporar|connection reset)/is.test(log)){
  console.log('REMOTE_PROGRESS retry');await new Promise(r=>setTimeout(r,attempt*1000));continue;
 }
 if(/failed to request quick Tunnel/i.test(log))console.log('REMOTE_ERROR Cloudflare 临时域名申请失败（网络超时或接口不可用），请稍后重试');
 else if(code===127)console.log('REMOTE_ERROR cloudflared 无法启动，请检查是否已安装');
 else console.log('REMOTE_ERROR Cloudflare 隧道进程退出（code '+code+'）');
 process.exitCode=code||1;break;
}
