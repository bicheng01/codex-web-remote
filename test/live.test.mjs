import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {EventEmitter,once} from 'node:events';
import WebSocket from 'ws';
import {attachLive} from '../live.mjs';
import {stateFrame,applyStateFrame} from '../public/state-sync.mjs';

test('State deltas update changed messages and preserve ordering/removal',()=>{
  const before={threadId:'t',items:[{id:'a',text:'old'},{id:'b',text:'same'}]},after={threadId:'t',items:[{id:'b',text:'same'},{id:'a',text:'new'},{id:'c',text:'added'}]};
  const frame=stateFrame(before,after);assert.deepEqual(frame.changed.map(i=>i.id),['a','c']);assert.deepEqual(applyStateFrame(before,frame),after);
  const removed={threadId:'t',items:[after.items[0]]};assert.deepEqual(applyStateFrame(after,stateFrame(after,removed)),removed);
  assert.deepEqual(applyStateFrame(null,stateFrame(null,before)),before);
});

test('Live transport authenticates before data, pushes deltas, runs guarded commands and revokes', {timeout:10000},async()=>{
  const server=http.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const host='127.0.0.1:'+server.address().port;
  const d=new EventEmitter();let state={threadId:'t',connected:true,items:[{id:'a',text:'before'}]},allowed=true,commands=0;
  d.view=()=>state;d.revision=1;
  const live=attachLive(server,{allowedHosts:new Set([host]),authorize:(_req,t)=>allowed&&t==='secret',getDesktop:async()=>d,getHistory:async()=>null,command:async m=>{assert.equal(m.action,'message');commands++;return {ok:true}}});
  const ws=new WebSocket('ws://'+host+'/api/live',{origin:'http://'+host});
  const next=()=>once(ws,'message').then(([b])=>JSON.parse(b));
  try{
    await once(ws,'open');let seen=0;const count=()=>seen++;ws.on('message',count);await new Promise(r=>setTimeout(r,50));assert.equal(seen,0);ws.off('message',count);
    let receive=next();ws.send(JSON.stringify({type:'auth',token:'secret'}));assert.equal((await receive).type,'ready');
    receive=next();ws.send(JSON.stringify({type:'subscribe',threadId:'t'}));const snapshot=await receive;assert.equal(snapshot.type,'snapshot');assert.equal(snapshot.state.items[0].text,'before');
    receive=next();state={...state,items:[{id:'a',text:'after'}]};d.revision++;const start=performance.now();d.emit('change');const delta=await receive;assert.equal(delta.type,'delta');assert.equal(delta.changed[0].text,'after');assert.ok(performance.now()-start<1000);
    receive=next();ws.send(JSON.stringify({type:'command',requestId:'r',action:'message',threadId:'t',text:'hello'}));assert.equal((await receive).result.ok,true);assert.equal(commands,1);
    const close=once(ws,'close');allowed=false;live.revoke();assert.equal((await close)[0],4401);
    const bad=new WebSocket('ws://'+host+'/api/live',{origin:'https://untrusted.invalid'});bad.on('error',()=>{});
    const response=await once(bad,'unexpected-response');assert.equal(response[1].statusCode,403);response[1].resume();bad.terminate();
  }finally{ws.terminate();live.close();await new Promise(r=>server.close(r))}
});
