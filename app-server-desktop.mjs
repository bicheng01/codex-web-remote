import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {EventEmitter} from 'node:events';

function textOf(content) {
  if (typeof content === 'string') return content;
  return (content ?? []).filter(x=>['text','input_text','output_text'].includes(x?.type)).map(x=>x.text??'').join('\n');
}

export function appServerView(thread, connected=true, error=null) {
  const items=[];
  for (const turn of thread?.turns ?? []) for (const item of turn.items ?? []) {
    let text='';
    if (['userMessage','steeringUserMessage'].includes(item.type)) text=textOf(item.content);
    else if (item.type==='agentMessage') text=item.text??textOf(item.content);
    else if (item.type==='commandExecution') text=item.command??'';
    else if (item.type==='fileChange') text=(item.changes??[]).map(x=>x.path).join('\n');
    else if (item.type==='reasoning') text=(item.summary??[]).map(x=>typeof x==='string'?x:x.text??'').join('\n');
    else if (item.type==='mcpToolCall') text=[item.server,item.tool].filter(Boolean).join(' / ');
    if (text) items.push({id:item.id,type:item.type,text:text.slice(0,60000),status:item.status??null,
      turnId:turn.id,turnStatus:turn.status,turnDurationMs:turn.durationMs??null});
  }
  const turns=thread?.turns??[],active=[...turns].reverse().find(t=>t.status==='inProgress');
  const sandbox=thread?.sandboxPolicy;
  return {connected,error,backend:'app-server-fallback',title:thread?.name??thread?.title??'当前会话',threadId:thread?.id??null,cwd:thread?.cwd??null,
    model:thread?.model??null,approvalsReviewer:thread?.approvalsReviewer??null,approvalPolicy:thread?.approvalPolicy??null,
    sandboxMode:({dangerFullAccess:'danger-full-access',workspaceWrite:'workspace-write',readOnly:'read-only'})[sandbox?.type]??null,
    networkAccess:typeof sandbox?.networkAccess==='boolean'?sandbox.networkAccess:null,
    activeTurnId:active?.id??null,lastTurnStatus:turns.at(-1)?.status??null,
    activeTurnStartedAtMs:active?.startedAt??null,reasoningEffort:thread?.reasoningEffort??null,
    status:active?'active':'idle',items:items.slice(-150)};
}

export class AppServerConnection extends EventEmitter {
  constructor({command=process.env.CODEX_CLI_PATH??'codex',args=['app-server','--stdio']}={}) {
    super();this.command=command;this.args=args;this.nextId=1;this.pending=new Map();this.ready=false;
  }
  async connect() {
    if(this.ready)return;if(this.connecting)return this.connecting;
    this.connecting=this.open();try{await this.connecting}finally{this.connecting=null}
  }
  async open() {
    const child=this.child=spawn(this.command,this.args,{stdio:['pipe','pipe','pipe'],env:process.env});
    child.stderr.on('data',b=>this.emit('diagnostic',b.toString()));
    child.on('exit',(code,signal)=>this.disconnect(Error(`Codex app-server 已退出 (${code??signal})`)));
    createInterface({input:child.stdout}).on('line',line=>{try{this.receive(JSON.parse(line))}catch(e){this.emit('diagnostic',e.message)}});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});
    await this.request('initialize',{clientInfo:{name:'codex-web-remote',title:'Codex Web Remote',version:'0.5.4'},capabilities:{experimentalApi:true}});
    this.notify('initialized',{});this.ready=true;
  }
  request(method,params={}) {
    const id=this.nextId++;
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error(`Codex app-server 请求超时：${method}`))},10000);
      this.pending.set(id,{resolve,reject,timer});try{this.write({id,method,params})}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e)}});
  }
  notify(method,params={}) {this.write({method,params})}
  write(value) {if(!this.child?.stdin?.writable)throw Error('Codex app-server 未连接');this.child.stdin.write(JSON.stringify(value)+'\n')}
  receive(message) {
    if(Object.hasOwn(message,'id')&&(Object.hasOwn(message,'result')||Object.hasOwn(message,'error'))){const p=this.pending.get(message.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(message.id);message.error?p.reject(Error(message.error.message??JSON.stringify(message.error))):p.resolve(message.result);return}
    if(Object.hasOwn(message,'id')&&message.method){this.write({id:message.id,error:{code:-32601,message:'Approval UI is unavailable in app-server fallback'}});return}
    this.emit('notification',message);
  }
  disconnect(error) {this.ready=false;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error)}this.pending.clear();this.emit('disconnect',error)}
  close() {const child=this.child;this.child=null;this.ready=false;child?.kill('SIGTERM')}
}

export class AppServerDesktop extends EventEmitter {
  constructor({threadId,connection}) {super();this.threadId=threadId;this.connection=connection;this.connected=false;this.thread=null;this.settings={};this.loaded=false;this.onNotification=m=>this.notification(m)}
  async connect() {await this.connection.connect();const result=await this.connection.request('thread/read',{threadId:this.threadId,includeTurns:true});this.thread=result.thread;this.settings={model:this.thread.model,reasoningEffort:this.thread.reasoningEffort,approvalPolicy:this.thread.approvalPolicy,approvalsReviewer:this.thread.approvalsReviewer,sandboxPolicy:this.thread.sandboxPolicy};this.connected=true;this.connection.on('notification',this.onNotification);this.emit('change')}
  async refresh() {const result=await this.connection.request('thread/read',{threadId:this.threadId,includeTurns:true});this.thread=result.thread;this.emit('change');return this.thread}
  async ensureLoaded() {if(this.loaded)return;const result=await this.connection.request('thread/resume',{threadId:this.threadId,excludeTurns:false});this.thread=result.thread;this.loaded=true;this.emit('change')}
  notification(message) {if(message.params?.threadId!==this.threadId)return;if(['turn/started','turn/completed','item/started','item/completed','item/agentMessage/delta','thread/settings/updated'].includes(message.method))this.refresh().catch(e=>{this.lastError=e.message;this.emit('change')})}
  view() {return appServerView({...this.thread,...this.settings},this.connected,this.lastError)}
  async setModel(model,effort) {await this.ensureLoaded();await this.connection.request('thread/settings/update',{threadId:this.threadId,model,effort});this.settings={...this.settings,model,reasoningEffort:effort};await this.refresh();return{model,reasoningEffort:effort,appliesTo:'next-turn'}}
  async setPermissions({approvalPolicy,sandboxMode,networkAccess,approvalsReviewer}) {
    const allowedApproval=['untrusted','on-request','never'],allowedSandbox=['read-only','workspace-write','danger-full-access'];
    if(!allowedApproval.includes(approvalPolicy)||!allowedSandbox.includes(sandboxMode))throw Error('不支持的权限设置');
    if(approvalsReviewer!==undefined&&!['user','guardian_subagent'].includes(approvalsReviewer))throw Error('不支持的审批方式');
    if(typeof networkAccess!=='boolean')throw Error('请选择网络访问权限');
    await this.ensureLoaded();const current=this.thread?.sandboxPolicy??{};
    const sandboxPolicy=sandboxMode==='danger-full-access'?{type:'dangerFullAccess'}:sandboxMode==='read-only'?{type:'readOnly',networkAccess}:{type:'workspaceWrite',writableRoots:current.writableRoots??(this.thread?.cwd?[this.thread.cwd]:[]),networkAccess,excludeTmpdirEnvVar:Boolean(current.excludeTmpdirEnvVar),excludeSlashTmp:Boolean(current.excludeSlashTmp)};
    await this.connection.request('thread/settings/update',{threadId:this.threadId,approvalPolicy,sandboxPolicy,...(approvalsReviewer?{approvalsReviewer}:{})});this.settings={...this.settings,approvalPolicy,sandboxPolicy,approvalsReviewer:approvalsReviewer??this.settings.approvalsReviewer};await this.refresh();
    return{approvalPolicy,sandboxMode,networkAccess,approvalsReviewer:approvalsReviewer??null,appliesTo:'next-turn'};
  }
  async message(text) {await this.ensureLoaded();const input=[{type:'text',text,text_elements:[]}],active=this.view().activeTurnId;const result=active?await this.connection.request('turn/steer',{threadId:this.threadId,expectedTurnId:active,input}):await this.connection.request('turn/start',{threadId:this.threadId,input,turnTrigger:'codex-web-remote'});await this.refresh();return result}
  async interrupt(expectedTurnId) {if(!expectedTurnId||expectedTurnId!==this.view().activeTurnId)throw Error('任务已改变，请刷新后再停止');const result=await this.connection.request('turn/interrupt',{threadId:this.threadId,turnId:expectedTurnId});await this.refresh();return result}
  close() {this.connected=false;this.connection.off('notification',this.onNotification)}
}
