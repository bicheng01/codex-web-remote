import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';

test('Pairing, live Desktop state, replay rejection, origin protection, and revocation', {timeout:25000,skip:!process.env.THREAD_ID}, async()=>{
  const port=43128,base=`http://127.0.0.1:${port}`;
  const p=spawn(process.execPath,['server.mjs'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,THREAD_ID:process.env.THREAD_ID,PORT:String(port),LAN_IP:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
  let logs='';p.stderr.on('data',()=>{});
  try{
    const admin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timeout')),5000);p.stdout.on('data',b=>{logs+=b;const m=logs.match(/#admin=([\w-]+)/);if(m){clearTimeout(timer);resolve(m[1])}});p.once('error',reject)});
    const headers={Authorization:`Bearer ${admin}`};
    assert.equal((await fetch(base+'/api/state')).status,401);
    assert.equal((await fetch(base+'/api/catalog')).status,401);
    assert.equal((await fetch(base+'/api/state',{headers:{...headers,Origin:'https://untrusted.invalid'}})).status,403);
    assert.equal((await fetch(base+'/api/admin/pairing',{headers:{...headers,'X-Forwarded-For':'203.0.113.10'}})).status,401);
    const panel=await (await fetch(base+'/api/admin/pairing',{headers})).json();assert.ok(panel.qr.startsWith('data:image/png'));
    const code=new URL(panel.link).hash.slice(6);
    const pair=()=>fetch(base+'/api/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});
    const first=await pair();assert.equal(first.status,200);const paired=await first.json();assert.ok(paired.catalog.workspaces.length>0);const session=paired.session;assert.equal((await pair()).status,401);
    const mobile={Authorization:`Bearer ${session}`};assert.equal((await fetch(base+'/api/admin/pairing',{headers:mobile})).status,401);
    const catalog=await(await fetch(base+'/api/catalog',{headers:mobile})).json();
    assert.ok(catalog.workspaces.length>0);assert.ok(catalog.taskCount>0);
    assert.ok(catalog.workspaces.some(p=>p.tasks.some(t=>t.id===process.env.THREAD_ID)));
    assert.equal((await fetch(base+'/api/state?threadId=unknown',{headers:mobile})).status,400);
    let state;
    for(let i=0;i<30;i++){state=await(await fetch(base+'/api/state',{headers:mobile})).json();if(state.connected&&state.threadId&&state.items.length>0)break;await new Promise(r=>setTimeout(r,100))}
    assert.equal(state.connected,true);assert.equal(state.threadId,process.env.THREAD_ID);assert.ok(state.items.length>0);
    const stream=await fetch(base+'/api/events',{headers:mobile,signal:AbortSignal.timeout(10000)});const reader=stream.body.getReader();const frame=await reader.read();assert.match(new TextDecoder().decode(frame.value),/^data: /);
    assert.equal((await fetch(base+'/api/interrupt',{method:'POST',headers:{...mobile,'Content-Type':'application/json'},body:JSON.stringify({turnId:'stale-id'})})).status,400);
    assert.equal((await fetch(base+'/api/admin/stop',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'})).status,200);
    let end;do{end=await reader.read()}while(!end.done);assert.equal(end.done,true);
    assert.equal((await fetch(base+'/api/state',{headers:mobile})).status,401);
    const after=await(await fetch(base+'/api/state',{headers})).json();assert.equal(after.connected,true);
  }finally{p.kill('SIGTERM');await once(p,'exit');}
});
