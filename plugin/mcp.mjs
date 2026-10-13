#!/usr/bin/env node
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {start,status,refresh,stop,pairingQr} from './control.mjs';
const server=new Server({name:'codex-web-remote',version:'0.5.0'},{capabilities:{tools:{}}});
const tools=[
 {name:'start_remote',description:'开启扫码手机遥控服务；复用已运行服务。公网模式使用 Cloudflare HTTPS 隧道。配对二维码应直接显示在会话内。',inputSchema:{type:'object',properties:{thread_id:{type:'string',description:'首次启动需要当前本机 Desktop 会话 ID'},mode:{type:'string',enum:['public','lan'],default:'public'},port:{type:'integer',minimum:1024,maximum:65535,default:43127}},additionalProperties:false}},
 {name:'remote_status',description:'读取扫码遥控服务和配对状态，不读取会话内容。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'refresh_qr',description:'一次调用刷新配对码并直接返回二维码 PNG 图片和本机图片路径。立即展示图片，无需读取管理接口或打开浏览器。',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'stop_remote',description:'撤销所有手机连接，并停止插件拥有的后台服务及隧道；电脑上的 Codex 任务继续运行。',inputSchema:{type:'object',properties:{},additionalProperties:false}}
];
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools}));
let queue=Promise.resolve();
server.setRequestHandler(CallToolRequestSchema,async({params})=>{
 const run=async()=>{try{const functions={start_remote:start,remote_status:status,refresh_qr:refresh,stop_remote:stop};if(!functions[params.name])throw Error('Unknown tool');const args=params.arguments??{};if(params.name==='start_remote'&&((args.mode&&!['public','lan'].includes(args.mode))||(args.port&&(!Number.isInteger(args.port)||args.port<1024||args.port>65535))))throw Error('Invalid mode or port');let value=await functions[params.name](args);if(params.name==='start_remote'&&!value.qrBase64)value={...value,...await pairingQr()};const {qrBase64,link,adminUrl,...metadata}=value;return{content:[{type:'text',text:JSON.stringify(metadata)},...(qrBase64?[{type:'image',mimeType:'image/png',data:qrBase64}]:[])]}}catch(e){return{isError:true,content:[{type:'text',text:e.message}]}}};
 const result=queue.then(run);queue=result.then(()=>{},()=>{});return result;
});
await server.connect(new StdioServerTransport());
