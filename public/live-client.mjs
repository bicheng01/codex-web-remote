import {applyStateFrame} from './state-sync.mjs';
export class LiveClient{
  constructor({token,onState,onAuthError}){this.token=token;this.onState=onState;this.onAuthError=onAuthError;this.pending=new Map();this.ready=false;this.closed=false;this.thread=null;this.connect()}
  connect(){if(this.closed)return;const ws=this.socket=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/api/live');
    const timeout=setTimeout(()=>ws.close(),8000);
    ws.onopen=()=>ws.send(JSON.stringify({type:'auth',token:this.token}));
    ws.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==='ready'){clearTimeout(timeout);this.ready=true;this.subscribe(this.thread);return}
      if(m.type==='snapshot'||m.type==='delta'){if(m.threadId!==this.thread)return;this.state=applyStateFrame(this.state,m);this.lastStateAt=Date.now();this.onState(this.state)}
      if(m.type==='result'){const p=this.pending.get(m.requestId);if(p){clearTimeout(p.timer);this.pending.delete(m.requestId);m.error?p.reject(Error(m.error)):p.resolve(m.result)}}
    }catch{this.state=null;this.subscribe(this.thread)}};
    ws.onclose=e=>{clearTimeout(timeout);this.ready=false;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('连接中断，请确认指令状态后重试'))}this.pending.clear();if(e.code===4401){this.closed=true;this.onAuthError();return}if(!this.closed)this.retry=setTimeout(()=>this.connect(),1500)};
    ws.onerror=()=>{};
  }
  subscribe(thread){this.thread=thread;this.state=null;this.lastStateAt=0;if(this.ready)this.socket.send(JSON.stringify({type:'subscribe',threadId:thread}))}
  command(action,data){if(!this.ready)return null;return new Promise((resolve,reject)=>{const requestId=crypto.randomUUID(),timer=setTimeout(()=>{this.pending.delete(requestId);reject(Error('指令响应超时，请确认 Desktop 状态后重试'))},12000);this.pending.set(requestId,{resolve,reject,timer});this.socket.send(JSON.stringify({type:'command',requestId,action,...data}))})}
  close(){this.closed=true;clearTimeout(this.retry);this.socket.close()}
}
