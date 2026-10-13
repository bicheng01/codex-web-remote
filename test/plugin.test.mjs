import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

test('Plugin MCP lists tools and owns service lifecycle without sending Desktop messages',{skip:!process.env.THREAD_ID},async()=>{
 const runtime=await mkdtemp(path.join(os.tmpdir(),'web-remote-plugin-'));
 const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../plugin/mcp.mjs',import.meta.url))],env:{...process.env,REMOTE_RUNTIME_DIR:runtime}});
 const client=new Client({name:'plugin-test',version:'1.0.0'});
 async function call(name,args={}){const reply=await client.callTool({name,arguments:args});assert.ok(!reply.isError,reply.content[0].text);const metadata=JSON.parse(reply.content[0].text);assert.ok(!metadata.adminUrl);if(['start_remote','refresh_qr'].includes(name)){const image=reply.content.find(x=>x.type==='image');assert.equal(image?.mimeType,'image/png');assert.equal(Buffer.from(image.data,'base64').subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.ok(metadata.imagePath.startsWith(runtime));assert.ok(metadata.expires>Date.now())}return metadata}
 try{
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length,4);
  assert.equal((await call('remote_status')).running,false);
  const started=await call('start_remote',{thread_id:process.env.THREAD_ID,mode:'lan',port:43129});
  assert.equal(started.running,true);assert.equal(started.mode,'lan');
  assert.equal((await call('start_remote')).reused,true);
  assert.equal((await call('refresh_qr')).qrRefreshed,true);
  const stopped=await call('stop_remote');assert.equal(stopped.backgroundServiceStopped,true);assert.equal(stopped.desktopTaskContinues,true);
  assert.equal((await call('remote_status')).running,false);
  // Wait for the guarded supervisor shutdown; the unrelated live service remains up.
  for(let i=0;i<30;i++){try{await fetch('http://127.0.0.1:43129/',{signal:AbortSignal.timeout(100)});await new Promise(r=>setTimeout(r,100))}catch{return}}
  assert.fail('Owned service did not exit');
 }finally{await client.close();await rm(runtime,{recursive:true,force:true})}
});
