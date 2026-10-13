import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
test('Cold startup pairs and lists chats without a default thread or IPC connection',{timeout:15000},async()=>{
 const port=43130,base=`http://127.0.0.1:${port}`,env={...process.env,PORT:String(port),LAN_IP:'127.0.0.1',DESKTOP_SOCKET:'/nonexistent/remote-test.sock'};delete env.THREAD_ID;
 const child=spawn(process.execPath,['server.mjs'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env,stdio:['ignore','pipe','pipe']});let logs='';child.stderr.on('data',()=>{});
 try{const admin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timeout')),5000);child.stdout.on('data',b=>{logs+=b;const m=logs.match(/#admin=([\w-]+)/);if(m){clearTimeout(timer);resolve(m[1])}});child.once('error',e=>{clearTimeout(timer);reject(e)})});
 const panel=await(await fetch(base+'/api/admin/pairing',{headers:{Authorization:`Bearer ${admin}`}})).json();assert.equal(panel.view.connectedThreads,0);assert.ok(panel.qr.startsWith('data:image/png'));
 const response=await fetch(base+'/api/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:new URL(panel.link).hash.slice(6)})});assert.equal(response.status,200);const pair=await response.json();assert.ok(Array.isArray(pair.catalog.workspaces));const headers={Authorization:`Bearer ${pair.session}`};const catalog=await(await fetch(base+'/api/catalog',{headers})).json();assert.equal(catalog.currentThreadId,undefined);assert.deepEqual(catalog.workspaces,pair.catalog.workspaces);
 const unselected=await fetch(base+'/api/state',{headers});assert.equal(unselected.status,400);assert.match((await unselected.json()).error,/选择会话/);
 const first=catalog.workspaces.flatMap(w=>w.tasks)[0];if(first){const state=await(await fetch(base+'/api/state?threadId='+first.id,{headers})).json();assert.equal(state.threadId,first.id);assert.equal(state.connected,false)}
 }finally{child.kill('SIGTERM');await once(child,'exit')}
});
