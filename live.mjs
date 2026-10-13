import {WebSocketServer,WebSocket} from 'ws';
import {stateFrame} from './public/state-sync.mjs';

export function attachLive(server,{allowedHosts,authorize,getDesktop,getHistory,command}){
  const wss=new WebSocketServer({noServer:true,maxPayload:96*1024,perMessageDeflate:false});
  server.on('upgrade',(req,socket,head)=>{
    if(req.url!=='/api/live'||!allowedHosts.has(req.headers.host)||!req.headers.origin||!['http://'+req.headers.host,'https://'+req.headers.host].includes(req.headers.origin)){
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;
    }
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  wss.on('connection',(ws,req)=>{
    let credential=null,thread=null,desktop=null,previous=null,epoch=0,timer=null,alive=true,processing=false;
    const send=data=>{if(ws.readyState!==WebSocket.OPEN)return;if(ws.bufferedAmount>1024*1024){ws.close(1013,'Slow connection');return}ws.send(JSON.stringify(data))};
    const valid=()=>credential&&authorize(req,credential);
    const authTimer=setTimeout(()=>ws.close(4401,'Authentication required'),5000);
    const flush=()=>{timer=null;if(!valid())return ws.close(4401,'Session expired');if(!desktop)return;const next={...desktop.view(),revision:desktop.revision};send({...stateFrame(previous,next),threadId:thread});previous=next};
    const changed=()=>{if(!timer)timer=setTimeout(flush,80)};
    function detach(){if(desktop)desktop.off('change',changed);desktop=null;clearTimeout(timer);timer=null;previous=null}
    ws.on('pong',()=>alive=true);
    ws.on('message',async bytes=>{
      try{
        const m=JSON.parse(bytes.toString());
        if(!credential){if(m.type!=='auth'||typeof m.token!=='string'||!authorize(req,m.token))return ws.close(4401,'Invalid session');credential=m.token;clearTimeout(authTimer);send({type:'ready'});return}
        if(!valid())return ws.close(4401,'Session expired');
        if(m.type==='subscribe'){
          if(m.threadId===null){++epoch;thread=null;detach();return}
          if(typeof m.threadId!=='string')throw Error('Invalid thread');detach();thread=m.threadId;const current=++epoch;
          const d=await getDesktop(thread);if(current!==epoch||ws.readyState!==WebSocket.OPEN||!valid())return;
          if(d){desktop=d;desktop.on('change',changed);flush()}else {const state=await getHistory(thread);if(current===epoch&&valid())send({type:'snapshot',threadId:thread,state})}
        }else if(m.type==='command'){
          if(processing)throw Error('请等待上一条指令完成');
          if(typeof m.requestId!=='string'||m.requestId.length>100)throw Error('Invalid request');
          processing=true;try{const result=await command(m);if(valid())send({type:'result',requestId:m.requestId,result})}catch(e){send({type:'result',requestId:m.requestId,error:e.message})}finally{processing=false}
        }
      }catch(e){send({type:'error',error:e.message})}
    });
    ws.on('close',()=>{++epoch;clearTimeout(authTimer);detach()});ws.on('error',()=>{});
    const heartbeat=setInterval(()=>{if(!alive||credential&&!valid()){ws.close(4401,'Connection expired');clearInterval(heartbeat);return}alive=false;ws.ping()},15000);
    ws.once('close',()=>clearInterval(heartbeat));
    ws.revoke=()=>{if(credential&&!valid())ws.close(4401,'Session revoked')};
  });
  return {revoke(){for(const ws of wss.clients)ws.revoke?.()},close(){for(const ws of wss.clients)ws.terminate();wss.close()}};
}
