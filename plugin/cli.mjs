#!/usr/bin/env node
import {readFile,writeFile,mkdir,copyFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import QRCode from 'qrcode';
const root=fileURLToPath(new URL('../',import.meta.url));
const help=`Codex Web Remote CLI

  codex-remote start [--mode public|lan] [--port PORT]
  codex-remote status
  codex-remote threads [--json]
  codex-remote qr [--output FILE]
  codex-remote stop

  --json          输出 JSON，不打印终端二维码
  --runtime DIR   指定服务状态目录（默认与本地插件共用）
  --output FILE   保存二维码 PNG（start/qr）

扫码后显示全部工作区和会话，点击会话后连接。
start 复用已有服务；qr 刷新配对码；stop 断开手机连接，电脑任务继续运行。
`;
export function parseArgs(args){
 const result={command:args[0]??'help'};if(['-h','--help'].includes(result.command))result.command='help';
 const aliases={start_remote:'start',remote_status:'status',refresh_qr:'qr',refresh:'qr',stop_remote:'stop'};result.command=aliases[result.command]??result.command;
 if(!['help','start','status','qr','stop','threads'].includes(result.command))throw Error('未知命令：'+result.command);
 for(let i=1;i<args.length;i++){const flag=args[i];if(flag==='--help'||flag==='-h'){result.command='help';continue}if(flag==='--json'){result.json=true;continue}const key={'--mode':'mode','--port':'port','--runtime':'runtime','--output':'output'}[flag];if(!key)throw Error('未知选项：'+flag);const value=args[++i];if(!value||value.startsWith('--'))throw Error(flag+' 缺少参数');result[key]=value}
 if(result.mode&&!['public','lan'].includes(result.mode))throw Error('--mode 必须是 public 或 lan');
 if(result.port){const n=Number(result.port);if(!/^\d+$/.test(result.port)||!Number.isInteger(n)||n<1024||n>65535)throw Error('--port 必须是 1024–65535');result.port=n}
 if(result.command!=='start'&&['mode','port'].some(k=>result[k]!==undefined))throw Error('--mode、--port 仅用于 start');
 if(result.output&&!['start','qr'].includes(result.command))throw Error('--output 仅用于 start/qr');return result;
}
export async function run(args,{control,write=text=>process.stdout.write(text),progress=text=>process.stderr.write(text)}={}){
 const options=parseArgs(args);if(options.command==='help'){write(help);return}
 if(!control){if(options.runtime)process.env.REMOTE_RUNTIME_DIR=path.resolve(options.runtime);control=await import('./control.mjs')}
 if(options.command==='threads'){const {readCatalog}=await import('../catalog.mjs');const catalog=await readCatalog();const tasks=catalog.workspaces.flatMap(w=>w.tasks.map(t=>({id:t.id,title:t.title,workspace:w.name})));write(options.json?JSON.stringify(tasks,null,2)+'\n':tasks.map(t=>`${t.id}  ${t.workspace} / ${t.title}`).join('\n')+'\n');return tasks}
 const runtime=options.runtime?path.resolve(options.runtime):control.runtime;
 let value;
 if(options.command==='status')value=await control.status();
 else if(options.command==='stop')value=await control.stop();
 else if(options.command==='qr')value=await control.refresh();
 else{
  let remembered={};try{remembered=JSON.parse(await readFile(path.join(runtime,'cli-session.json'),'utf8'))}catch{}
  const stages={tunnel:'正在申请公网地址…',connect:'正在连接公网隧道…',verify:'正在验证公网页面和脚本…',ready:'公网已就绪，正在生成二维码…',local:'正在启动局域网服务…'};let previous;
  const started=await control.start({mode:options.mode??remembered.mode??'public',port:options.port??remembered.port??43127},{onProgress:stage=>{if(!options.json&&stages[stage]&&previous!==stage){previous=stage;progress(stages[stage]+'\n')}}});
  if(runtime){await mkdir(runtime,{recursive:true,mode:0o700});await writeFile(path.join(runtime,'cli-session.json'),JSON.stringify({mode:started.mode,port:started.port??options.port??remembered.port??43127})+'\n',{mode:0o600})}
  value=started.qrBase64?started:{...started,...await control.pairingQr()};
 }
 if(options.output){const target=path.resolve(options.output);await copyFile(value.imagePath,target);value={...value,imagePath:target}}
 const {adminUrl,qrBase64,link,...safe}=value;
 if(options.json){write(JSON.stringify(safe,null,2)+'\n');return safe}
 if(link){write(await QRCode.toString(link,{type:'terminal',small:true}));write(`手机扫码即可连接，约 ${Math.max(0,Math.ceil((value.expires-Date.now())/60000))} 分钟有效。\nPNG: ${value.imagePath}\n`)}
 else if(options.command==='status')write(value.running?`服务：${value.enabled?'已开启':'已暂停'}\n网络：${value.mode}\nDesktop：${value.connected?'已连接':'未连接'}\n设备：${value.devices}\n`:'服务未运行\n');
 else write('手机遥控已停止，电脑任务继续运行。\n');return safe;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(await realpath(process.argv[1])).href){run(process.argv.slice(2)).catch(e=>{console.error('codex-remote: '+e.message);process.exitCode=1})}
