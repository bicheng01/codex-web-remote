import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('.',import.meta.url));
const port=process.env.PORT??'43127';
let service,started=false,stopping=false;
const tunnel=spawn('cloudflared',['tunnel','--no-autoupdate','--protocol','http2','--url',`http://127.0.0.1:${port}`],{stdio:['ignore','pipe','pipe']});
let buffer='';
function output(chunk){const s=chunk.toString();process.stderr.write(s);buffer=(buffer+s).slice(-10000);const url=buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];if(url&&!started){started=true;service=spawn(process.execPath,['server.mjs'],{cwd,env:{...process.env,PUBLIC_ORIGIN:url},stdio:'inherit'});service.on('error',e=>{console.error(e.message);stop(1)});service.on('exit',code=>stop(code??1))}}
tunnel.stdout.on('data',output);tunnel.stderr.on('data',output);
tunnel.on('error',e=>{console.error('请先通过 Homebrew 安装 cloudflared:',e.message);stop(1)});
tunnel.on('exit',code=>stop(code??1));
const timer=setTimeout(()=>{if(!started){console.error('HTTPS 隧道建立超时');stop(1)}},45000);timer.unref();
function stop(code=0){if(stopping)return;stopping=true;clearTimeout(timer);service?.kill('SIGTERM');tunnel.kill('SIGTERM');setTimeout(()=>{if(tunnel.exitCode===null)tunnel.kill('SIGKILL');if(service?.exitCode===null)service.kill('SIGKILL');process.exit(code)},1200).unref()}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
