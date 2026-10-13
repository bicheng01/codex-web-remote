#!/usr/bin/env node
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {start,status,refresh,stop,pairingQr} from './control.mjs';
const server=new Server({name:'codex-web-remote',version:'0.5.1'},{capabilities:{tools:{}}});
const tools=[
 {name:'start_remote',description:'开启手机遥控，内部复用服务，无需先查状态。启动无需会话 ID，扫码后列出全部会话，手机选择后连接。延续用户的网络方式；公网经 Cloudflare 转发。返回 PNG 和 imagePath：在最终回复用 Markdown 图片显示二维码，不仅放在工具结果里。不要重复读取或生成图片，不打开浏览器，不自动发送测试消息。',inputSchema:{type:'object',properties:{mode:{type:'string',enum:['public','lan'],default:'public'},port:{type:'integer',minimum:1024,maximum:65535,default:43127}},additionalProperties:false}},
 {name:'remote_status',description:'读取扫码遥控服务和配对状态，不读取会话内容。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'refresh_qr',description:'一次调用刷新并返回 PNG 和 imagePath，在最终回复用 Markdown 图片显示二维码，不仅放在工具结果里。不要预先查状态、另读接口、重复生成图片或打开浏览器；出错再诊断。',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'stop_remote',description:'撤销所有手机连接，并停止插件拥有的后台服务及隧道；电脑上的 Codex 任务继续运行。',inputSchema:{type:'object',properties:{},additionalProperties:false}}
];
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools}));
let queue=Promise.resolve();
server.setRequestHandler(CallToolRequestSchema,async({params})=>{
 const run=async()=>{try{const functions={start_remote:start,remote_status:status,refresh_qr:refresh,stop_remote:stop};if(!functions[params.name])throw Error('Unknown tool');const args=params.arguments??{};if(params.name==='start_remote'&&((args.mode&&!['public','lan'].includes(args.mode))||(args.port&&(!Number.isInteger(args.port)||args.port<1024||args.port>65535))))throw Error('Invalid mode or port');let value=await functions[params.name](args);if(params.name==='start_remote'&&!value.qrBase64)value={...value,...await pairingQr()};const {qrBase64,link,adminUrl,...metadata}=value;return{content:[{type:'text',text:JSON.stringify(metadata)},...(qrBase64?[{type:'image',mimeType:'image/png',data:qrBase64}]:[])]}}catch(e){return{isError:true,content:[{type:'text',text:e.message}]}}};
 const result=queue.then(run);queue=result.then(()=>{},()=>{});return result;
});
await server.connect(new StdioServerTransport());
