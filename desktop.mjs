import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

const versions = { 'thread-owner-discovery': 1, 'thread-stream-following-changed': 1,
  'thread-follower-read-model-settings': 1, 'thread-follower-update-thread-settings': 2, 'thread-follower-start-turn': 2,
  'thread-follower-steer-turn': 1, 'thread-follower-interrupt-turn': 4 };

export function applyPatches(state, patches) {
  for (const {op, path, value} of patches) {
    if (!Array.isArray(path) || path.some(k => ['__proto__','constructor','prototype'].includes(String(k)))) throw Error('Invalid patch path');
    if (!path.length) { state = op === 'remove' ? null : value; continue; }
    let parent = state;
    for (const key of path.slice(0,-1)) { parent = parent?.[key]; if (parent == null) throw Error('Missing patch parent'); }
    const key = path.at(-1);
    if (op === 'remove') { if (Array.isArray(parent)) parent.splice(Number(key),1); else delete parent[key]; }
    else if (op === 'add' && Array.isArray(parent)) parent.splice(Number(key),0,value);
    else if (op === 'add' || op === 'replace') parent[key] = value;
    else throw Error('Unknown patch operation');
  }
  return state;
}

// Only display message/tool fields. Never send Desktop settings or developer prompts to the browser.
export function viewState(state, connected, error = null) {
  const items = new Map(), turns = new Map();
  function visit(v) {
    if (!v || typeof v !== 'object') return;
    if (v.turnId && v.status && Array.isArray(v.items)) turns.set(v.turnId,v);
    if (v.id && ['userMessage','steeringUserMessage','agentMessage','reasoning','commandExecution','fileChange','mcpToolCall'].includes(v.type)) {
      let text = '';
      if (['userMessage','steeringUserMessage'].includes(v.type)) text = typeof v.content === 'string' ? v.content : (v.content ?? []).filter(x=>x.type==='text').map(x=>x.text).join('\n');
      else if (v.type === 'agentMessage') text = v.text ?? '';
      else if (v.type === 'commandExecution') text = v.command ?? '';
      else if (v.type === 'fileChange') text = (v.changes ?? []).map(x=>x.path).join('\n');
      else if (v.type === 'reasoning') text = (v.summary ?? []).map(x=>typeof x==='string'?x:x.text??'').join('\n');
      else text = [v.server,v.tool].filter(Boolean).join(' / ');
      if (text) items.set(v.id,{id:v.id,type:v.type,text:text.slice(0,60000),status:v.status??null});
      return;
    }
    for (const [k,x] of Object.entries(v)) if (!['params','latestThreadSettings','latestCollaborationMode','currentPermissions','requests'].includes(k)) {
      if (Array.isArray(x)) x.forEach(visit); else visit(x);
    }
  }
  if (state) { visit(state.turnHistory); visit(state.turns); }
  for (const turn of turns.values()) for (const item of turn.items) {
    const visible=items.get(item.id);if(visible)Object.assign(visible,{turnId:turn.turnId,turnStatus:turn.status,turnDurationMs:turn.durationMs??null});
  }
  const active = [...turns.values()].reverse().find(t=>t.status==='inProgress');
  return {connected,error,title:state?.title??'当前会话',threadId:state?.id??null,cwd:state?.cwd??null,
    model:state?.latestModel??state?.latestThreadSettings?.model??null,
    approvalsReviewer: typeof state?.latestThreadSettings?.approvalsReviewer==='string' ? state.latestThreadSettings.approvalsReviewer : null,
    approvalPolicy: typeof state?.latestThreadSettings?.approvalPolicy==='string' ? state.latestThreadSettings.approvalPolicy : null,
    sandboxMode: ({dangerFullAccess:'danger-full-access',workspaceWrite:'workspace-write',readOnly:'read-only'})[state?.latestThreadSettings?.sandboxPolicy?.type]??null,
    networkAccess: typeof state?.latestThreadSettings?.sandboxPolicy?.networkAccess==='boolean' ? state.latestThreadSettings.sandboxPolicy.networkAccess : null,
    activeTurnId:active?.turnId??null,lastTurnStatus:[...turns.values()].at(-1)?.status??null,
    activeTurnStartedAtMs:active?.turnStartedAtMs??null,reasoningEffort:state?.latestReasoningEffort??null,
    status:active?'active':'idle',items:[...items.values()].slice(-150)};
}

export class Desktop extends EventEmitter {
  constructor({threadId, socketPath}) { super(); this.threadId=threadId; this.socketPath=socketPath; this.pending=new Map(); this.connected=false; this.closed=false; }
  async connect() {
    this.buffer=Buffer.alloc(0); this.clientId='initializing-client'; this.state=null; this.revision=null;
    const s=this.socket=net.createConnection(this.socketPath);
    s.on('data',b=>{try { this.buffer=Buffer.concat([this.buffer,b]); while(this.buffer.length>=4) {
      const n=this.buffer.readUInt32LE(); if(n>64*1024*1024) throw Error('IPC frame too large');
      if(this.buffer.length<4+n) break;
      const m=JSON.parse(this.buffer.subarray(4,4+n)); this.buffer=this.buffer.subarray(4+n); this.receive(m);
    }} catch(e) { this.lastError=e.message; s.destroy(); }});
    s.on('error',e=>{this.lastError=e.message});
    s.on('close',()=>{this.connected=false; this.state=null; for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Desktop 连接已断开'));}this.pending.clear();this.emit('change');if(!this.closed)this.retry=setTimeout(()=>this.connect().catch(()=>{}),3000)});
    await new Promise((resolve,reject)=>{s.once('connect',resolve);s.once('error',reject)});
    try {
      const init=await this.rpc('initialize',{clientType:'cli'}); this.clientId=init.result.clientId;
      const owner=await this.rpc('thread-owner-discovery',{hostId:'local',conversationId:this.threadId}); this.owner=owner.handledByClientId;
      const settings=await this.rpc('thread-follower-read-model-settings',{conversationId:this.threadId},{targetClientId:this.owner});
      this.modelSettings=settings.result.settings; this.connected=true; this.lastError=null;
      this.follow(true); this.emit('change');
    } catch(e) { this.lastError=e.message; s.destroy(); throw e; }
  }
  send(m) { if(!this.socket?.writable)throw Error('Desktop 未连接');const b=Buffer.from(JSON.stringify(m)),h=Buffer.alloc(4);h.writeUInt32LE(b.length);this.socket.write(Buffer.concat([h,b])); }
  rpc(method,params,extra={}) { return new Promise((resolve,reject)=>{const requestId=randomUUID(),timer=setTimeout(()=>{this.pending.delete(requestId);reject(Error('Desktop 请求超时；请检查会话状态后再操作'))},10000);this.pending.set(requestId,{resolve,reject,timer});try{this.send({type:'request',requestId,sourceClientId:this.clientId,method,version:versions[method]??0,params,...extra});}catch(e){clearTimeout(timer);this.pending.delete(requestId);reject(e)}}); }
  follow(following) { this.send({type:'broadcast',method:'thread-stream-following-changed',version:1,sourceClientId:this.clientId,targetClientIds:[this.owner],params:{hostId:'local',conversationId:this.threadId,following}}); }
  receive(m) {
    if(m.type==='response') { const p=this.pending.get(m.requestId);if(p){clearTimeout(p.timer);this.pending.delete(m.requestId);m.resultType==='error'?p.reject(Error(m.error)):p.resolve(m)}return; }
    if(m.type==='client-discovery-request') { this.send({type:'client-discovery-response',requestId:m.requestId,response:{canHandle:false}});return; }
    if(m.type==='request') { this.send({type:'response',requestId:m.requestId,resultType:'error',error:'no-handler-for-request'});return; }
    if(m.type!=='broadcast'||m.method!=='thread-stream-state-changed'||m.params?.conversationId!==this.threadId||m.sourceClientId!==this.owner)return;
    const c=m.params.change;
    if(c.type==='snapshot') {this.state=c.conversationState;this.revision=c.revision;}
    else if(c.type==='patches') {try{if(c.baseRevision!==this.revision)throw Error('IPC revision mismatch');this.state=applyPatches(this.state,c.patches);this.revision=c.revision;}catch(e){this.lastError=e.message;this.follow(false);this.follow(true);return;}}
    else {this.lastError='当前 Desktop 状态协议需要适配';this.emit('change');return;}
    this.lastError=null; this.emit('change');
  }
  view() { return viewState(this.state,this.connected,this.lastError); }
  async setModel(model,effort,provider=null) {
    if(!this.connected||!this.state)throw Error('等待 Desktop 会话连接');
    const previous=(await this.rpc('thread-follower-read-model-settings',{conversationId:this.threadId},{targetClientId:this.owner})).result.settings;
    if(provider&&previous.modelProvider&&previous.modelProvider!==provider)throw Error('会话与模型列表的提供方不同，请在 Desktop 中选择模型');
    const changed=await this.rpc('thread-follower-update-thread-settings',{conversationId:this.threadId,threadSettings:{model,effort},activeTurnId:null,condition:{ifModelEquals:previous.model,ifEffortEquals:previous.reasoningEffort}},{targetClientId:this.owner});
    if(!changed.result.applied)throw Error('会话模型已在 Desktop 改变，请刷新后重试');
    this.modelSettings={...previous,model,reasoningEffort:effort};
    return{model,reasoningEffort:effort,appliesTo:'next-turn'};
  }
  async setPermissions({approvalPolicy,sandboxMode,networkAccess,approvalsReviewer}) {
    if(!this.connected||!this.state)throw Error('等待 Desktop 会话连接');
    const allowedApproval=['untrusted','on-request','never'];
    const allowedSandbox=['read-only','workspace-write','danger-full-access'];
    if(!allowedApproval.includes(approvalPolicy)||!allowedSandbox.includes(sandboxMode))throw Error('不支持的权限设置');
    if(approvalsReviewer!==undefined&&!['user','guardian_subagent'].includes(approvalsReviewer))throw Error('不支持的审批方式');
    if(typeof networkAccess!=='boolean')throw Error('请选择网络访问权限');
    const previous=(await this.rpc('thread-follower-read-model-settings',{conversationId:this.threadId},{targetClientId:this.owner})).result.settings;
    const current=previous.sandboxPolicy??{type:'workspaceWrite',writableRoots:[],networkAccess:false,excludeTmpdirEnvVar:false,excludeSlashTmp:false};
    const sandboxPolicy=sandboxMode==='danger-full-access'?{type:'dangerFullAccess'}:sandboxMode==='read-only'?{type:'readOnly',networkAccess}:{type:'workspaceWrite',writableRoots:Array.isArray(current.writableRoots)?current.writableRoots:(this.state.cwd?[this.state.cwd]:[]),networkAccess,excludeTmpdirEnvVar:Boolean(current.excludeTmpdirEnvVar),excludeSlashTmp:Boolean(current.excludeSlashTmp)};
    const changed=await this.rpc('thread-follower-update-thread-settings',{conversationId:this.threadId,threadSettings:{approvalPolicy,sandboxPolicy,...(approvalsReviewer?{approvalsReviewer}:{})},activeTurnId:null},{targetClientId:this.owner});
    if(!changed.result.applied)throw Error('会话权限已在 Desktop 改变，请刷新后重试');
    this.modelSettings={...previous,approvalPolicy,sandboxPolicy,approvalsReviewer:approvalsReviewer??previous.approvalsReviewer};
    return{approvalPolicy,sandboxMode,networkAccess,approvalsReviewer:approvalsReviewer??previous.approvalsReviewer,appliesTo:'next-turn'};
  }
  async message(text) {
    if(!this.connected||!this.state)throw Error('等待 Desktop 会话连接');
    const input=[{type:'text',text,text_elements:[]}],id=randomUUID(),active=this.view().activeTurnId;
    if(active) {const restoreMessage={id,text,cwd:this.state.cwd,createdAt:Date.now(),context:{prompt:text,addedFiles:[],fileAttachments:[],imageAttachments:[],workspaceRoots:[this.state.cwd]}};
      return (await this.rpc('thread-follower-steer-turn',{conversationId:this.threadId,input,restoreMessage,clientUserMessageId:id},{targetClientId:this.owner})).result;
    }
    return (await this.rpc('thread-follower-start-turn',{conversationId:this.threadId,turnStart:{request:{threadId:this.threadId,input,clientUserMessageId:id},context:{inheritThreadSettings:true}}},{targetClientId:this.owner})).result;
  }
  async interrupt(expectedTurnId) { if(!expectedTurnId||expectedTurnId!==this.view().activeTurnId)throw Error('任务已改变，请刷新后再停止');return (await this.rpc('thread-follower-interrupt-turn',{conversationId:this.threadId,mode:'user-stop',expectedTurnId},{targetClientId:this.owner})).result; }
  close() {this.closed=true;clearTimeout(this.retry);if(this.connected)try{this.follow(false)}catch{}this.socket?.destroy();}
}
