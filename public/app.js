import {permissionModes,permissionMode} from './permission-modes.mjs';
import {renderMarkdown} from './markdown.mjs';
import {setIcon} from './icons.mjs';
import {LiveClient} from './live-client.mjs';
const $=id=>document.getElementById(id);
const fragment=new URLSearchParams(location.hash.slice(1));
const admin=location.pathname==='/admin'?(fragment.get('admin')??sessionStorage.getItem('codexRemoteAdmin')):null;
if(admin)sessionStorage.setItem('codexRemoteAdmin',admin);
let session=admin??sessionStorage.getItem('codexRemoteSession'),state={},pairLink=null,busy=false,selectedThread=null,selectionEpoch=0,homeData=null,initialized=false;
const expanded=new Set(),showAll=new Set(),drafts=new Map();
let transport=null;
const messageNodes=new Map();
const submissions=new Map();
let modelList=null,modelLoading=null;
setIcon($('permission-open'),'shield');setIcon(document.querySelector('.model-trigger .chevron'),'chevron');
function renderModel(s){
 const choices=modelList??[],button=$('model-open'),menu=$('model-menu'),signature=JSON.stringify([choices,s.model]);
 $('model-label').textContent=(choices.find(m=>m.model===s.model)?.label??s.model??'Desktop 模型').replace(/\s*\([^)]*\)\s*$/,'');
 button.disabled=!s.connected||busy||!choices.length;
 button.title=[s.model,s.reasoningEffort,'应用于下一轮'].filter(Boolean).join(' · ');
 if(menu.dataset.choices!==signature){
  menu.dataset.choices=signature;menu.replaceChildren();
  for(const m of choices){
   const selected=m.model===s.model,option=node('button','picker-option');
   option.type='button';option.role='option';option.setAttribute('aria-selected',String(selected));option.dataset.model=m.model;
   const name=node('span','picker-name',m.label),check=node('span','picker-check');
   setIcon(check,'check');check.hidden=!selected;option.append(name,check);menu.append(option);
  }
 }
 if(!menu.hidden)menu.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest'});
}
function renderPermissions(s,opening=false){
 $('permission-open').disabled=!s.connected||busy;
 const current=permissionMode(s),label=permissionModes[current]?.label??'自定义';
 $('permission-open').title='权限：'+label;
 if(!$('permissions-dialog').hidden&&!opening)return;
 $('permission-mode').value=current;$('permission-custom').hidden=current!=='custom';$('permission-custom').disabled=current!=='custom';
 document.querySelector('.permission-note').textContent=`当前：${label}。变更应用于下一轮，当前任务不变。`;
 syncPermissionWarning();
}
function syncPermissionWarning(){
 const mode=$('permission-mode').value,current=permissionMode(state),needsConfirmation=(mode==='full-access'&&current!=='full-access')||(mode==='guardian'&&['default','custom'].includes(current));
 for(const option of $('permission-options').children)option.setAttribute('aria-checked',String(option.dataset.mode===mode));
 $('permission-description').textContent=permissionModes[mode]?.description??'保留 Desktop 当前的自定义权限设置。';
 $('permission-warning').hidden=!needsConfirmation;$('permission-ack').checked=false;$('permission-save').disabled=needsConfirmation;
}
async function loadModels(){if(modelList||modelLoading)return;modelLoading=api('/api/models').then(result=>{modelList=result.models;renderModel(state)}).catch(e=>error('读取模型列表失败：'+e.message)).finally(()=>{modelLoading=null});return modelLoading}
$('model-open').onclick=()=>{const menu=$('model-menu'),open=menu.hidden;menu.hidden=!open;$('model-open').setAttribute('aria-expanded',String(open));if(open){const selected=menu.querySelector('[aria-selected="true"]');selected?.focus()}};
$('model-menu').onclick=async e=>{const option=e.target.closest('[data-model]');if(!option)return;const id=selectedThread,model=option.dataset.model;$('model-menu').hidden=true;$('model-open').setAttribute('aria-expanded','false');if(!id||!model||busy||model===state.model)return;busy=true;renderModel(state);error(null);try{const result=await(transport?.command('model',{threadId:id,model})??api('/api/model',{threadId:id,model}));if(selectedThread===id)state={...state,model:result.model,reasoningEffort:result.reasoningEffort}}catch(e){error(e.message)}finally{busy=false;render(state)}};
for(const [mode,config] of Object.entries(permissionModes)){const option=node('button','permission-option'+(mode==='full-access'?' permission-full':''));option.type='button';option.role='radio';option.dataset.mode=mode;option.setAttribute('aria-checked','false');const icon=node('span','permission-option-icon'),text=node('span','permission-option-text'),check=node('span','permission-option-check');setIcon(icon,mode==='default'?'hand':mode==='guardian'?'shieldCheck':'shieldAlert');setIcon(check,'check');text.append(node('strong',null,config.label),node('span',null,config.description));option.append(icon,text,check);option.onclick=()=>{$('permission-mode').value=mode;syncPermissionWarning()};$('permission-options').append(option)}
$('permission-open').onclick=()=>{$('permissions-dialog').hidden=false;renderPermissions(state,true)};$('permission-close').onclick=()=>{$('permissions-dialog').hidden=true};$('permissions-dialog').onclick=e=>{if(e.target===$('permissions-dialog'))$('permissions-dialog').hidden=true};$('permission-mode').onchange=syncPermissionWarning;$('permission-ack').onchange=()=>{$('permission-save').disabled=!$('permission-ack').checked};
$('permission-save').onclick=async()=>{
 if(busy||$('permission-save').disabled)return;
 const id=selectedThread,mode=$('permission-mode').value;
 if(!id)return;
 if(mode==='custom'||mode===permissionMode(state)){$('permissions-dialog').hidden=true;return}
 const settings=permissionModes[mode]?.settings;if(!settings)return;
 busy=true;$('permission-save').disabled=true;renderModel(state);error(null);
 try{
  const result=await(transport?.command('permissions',{threadId:id,...settings})??api('/api/permissions',{threadId:id,...settings}));
  if(selectedThread===id)state={...state,approvalPolicy:result.approvalPolicy,sandboxMode:result.sandboxMode,networkAccess:result.networkAccess,approvalsReviewer:result.approvalsReviewer};
  $('permissions-dialog').hidden=true;
 }catch(e){error(e.message)}finally{busy=false;$('permission-save').disabled=false;render(state)}
};
document.addEventListener('click',e=>{if(!e.target.closest('.model-picker')){$('model-menu').hidden=true;$('model-open').setAttribute('aria-expanded','false')}});document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('model-menu').hidden=true;$('model-open').setAttribute('aria-expanded','false');$('permissions-dialog').hidden=true}});
history.replaceState(null,'',location.pathname);
function error(text){$('error').textContent=text??'';$('error').hidden=!text}
async function api(url,data){const r=await fetch(url,{method:data===undefined?'GET':'POST',headers:{...(session?{Authorization:`Bearer ${session}`} : {}),...(data!==undefined?{'Content-Type':'application/json'}:{})},body:data===undefined?undefined:JSON.stringify(data)});const b=await r.json();if(!r.ok){if(r.status===401&&!admin){session=null;sessionStorage.removeItem('codexRemoteSession');$('send').disabled=true;$('interrupt').disabled=true;}throw Error(b.error??`HTTP ${r.status}`);}return b}
const role={userMessage:'你',steeringUserMessage:'你 · 补充要求',agentMessage:'Codex',reasoning:'思考进度',commandExecution:'执行命令',fileChange:'文件修改',mcpToolCall:'工具调用'};
let rendered='';
function render(s){state=s;$('connection').textContent=s.connected?'Desktop 已连接':s.readOnly?'历史会话':'Desktop 未连接';$('title').textContent=s.title;$('title').title=s.title??'';$('metadata').textContent=s.cwd??'';renderModel(s);renderPermissions(s);$('task-status').textContent=s.readOnly?'只读历史会话':s.activeTurnId?'任务正在运行':'等待新的指令';$('activity').textContent=s.activeTurnId?'运行中':'';$('send').disabled=!s.connected||busy;$('interrupt').disabled=!s.activeTurnId||busy;$('interrupt').hidden=!s.activeTurnId;$('prompt').disabled=!s.connected;$('send').setAttribute('aria-busy',String(busy));$('hint').textContent=busy?'正在提交指令…':s.readOnly?'在电脑端打开此任务后可继续控制':s.activeTurnId?'发送消息将补充当前任务':'消息将在电脑上执行';if(s.error)error(s.error);
  const submission=submissions.get(selectedThread);if(submission&&(s.items??[]).some(item=>!submission.seen.has(item.id)&&['userMessage','steeringUserMessage'].includes(item.type)&&item.text===submission.text))submissions.delete(selectedThread);
  const pending=submissions.get(selectedThread),items=[...(s.items??[])];if(pending)items.push({id:pending.id,type:'userMessage',text:pending.text,deliveryStatus:pending.status});
  const signature=JSON.stringify(items);if(signature===rendered)return;rendered=signature;
  const box=$('messages'),atBottom=box.scrollHeight-box.scrollTop-box.clientHeight<80,scrollTop=box.scrollTop,openGroups=new Set([...box.querySelectorAll('details[open]')].map(d=>d.dataset.key)),nextNodes=[],used=new Set();
  for(let i=0;i<items.length;i++){
    const item=items[i];
    if(!['userMessage','steeringUserMessage','agentMessage'].includes(item.type)){
      const group=[];while(i<items.length&&!['userMessage','steeringUserMessage','agentMessage'].includes(items[i].type))group.push(items[i++]);i--;
      const key='group:'+group[0].id,signature=JSON.stringify(group),cached=messageNodes.get(key);used.add(key);if(cached?.signature===signature){nextNodes.push(cached.node);continue}
      const details=node('details','work-record'),summary=node('summary',null,(group[0].turnDurationMs!=null?'已工作 '+duration(group[0].turnDurationMs)+' · ':'')+'执行记录 '+group.length+' 项');details.dataset.key=group[0].id;details.open=openGroups.has(group[0].id);details.append(summary);
      for(const tool of group){const row=node('div','tool-entry');row.append(node('div','tool-label',role[tool.type]+(tool.status==='completed'?' · 已完成':tool.status==='inProgress'?' · 运行中':'')),node('pre','tool-content',tool.text));details.append(row)}messageNodes.set(key,{signature,node:details});nextNodes.push(details);continue;
    }
    const key='message:'+item.id,signature=JSON.stringify(item),cached=messageNodes.get(key);used.add(key);if(cached?.signature===signature){nextNodes.push(cached.node);continue}
    const user=item.type!=='agentMessage',article=node('article','message '+(user?'user-message':'assistant-message')),content=node('div','content');
    if(user)content.textContent=item.text.includes('## My request:\n')?item.text.split('## My request:\n').at(-1).replace(/<image\b[^>]*>[\s\S]*?<\/image>/g,'').trim():item.text;else renderMarkdown(content,item.text);
    article.append(content);if(item.deliveryStatus){article.append(node('div','message-actions',item.deliveryStatus));messageNodes.set(key,{signature,node:article});nextNodes.push(article);continue}const actions=node('div','message-actions'),copy=node('button','icon-button');setIcon(copy,'copy');copy.type='button';copy.title='复制消息';copy.setAttribute('aria-label','复制消息');copy.onclick=async()=>{try{await navigator.clipboard.writeText(user?content.textContent:item.text);setIcon(copy,'check');setTimeout(()=>setIcon(copy,'copy'),1200)}catch{error('复制失败，请选择文字手动复制')}};actions.append(copy);
    if(user){const reuse=node('button','icon-button');setIcon(reuse,'edit');reuse.type='button';reuse.title='引用并修改消息';reuse.setAttribute('aria-label','引用并修改消息');reuse.onclick=()=>{$('prompt').value=content.textContent;$('prompt').focus()};actions.append(reuse)}article.append(actions);messageNodes.set(key,{signature,node:article});nextNodes.push(article);
  }
  for(const key of messageNodes.keys())if(!used.has(key))messageNodes.delete(key);
  for(let i=0;i<nextNodes.length;i++)if(box.children[i]!==nextNodes[i])box.insertBefore(nextNodes[i],box.children[i]??null);
  while(box.children.length>nextNodes.length)box.lastElementChild.remove();
  if(!box.children.length)box.append(node('p','empty','等待会话内容'));if(atBottom)box.scrollTop=box.scrollHeight;else box.scrollTop=scrollTop;updateJump();
}
async function pollState(){while(session){if(selectedThread&&!document.hidden&&!(transport?.ready&&transport.state?.threadId===selectedThread&&transport.state.connected)){const id=selectedThread,epoch=selectionEpoch;try{const q=new URLSearchParams({threadId:id});if(state.connected&&state.revision!=null)q.set('revision',state.revision);const next=await api('/api/state?'+q);if(epoch===selectionEpoch&&!next.unchanged&&!(transport?.ready&&transport.state?.connected))render(next)}catch(e){if(epoch===selectionEpoch)error(e.message)}}await new Promise(r=>setTimeout(r,1000))}}
async function refreshPanel(){try{const p=await api('/api/admin/pairing');pairLink=p.link;$('network-help').textContent=p.networkMode==='public'?'公网 HTTPS 连接支持手机流量或其他 Wi-Fi。配对后，二维码立即失效。':'局域网连接：手机必须连接电脑同一网络，手机流量无法访问。配对后，二维码立即失效。';$('qr').hidden=!p.qr;if(p.qr)$('qr').src=p.qr;$('pair-title').textContent=p.view.title;$('pair-status').textContent=!p.enabled?'远程控制已停止':p.devices?`已配对 ${p.devices} 台设备`:'等待手机连接';$('pair-expiry').textContent=p.link?`二维码在 ${new Date(p.expires).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})} 失效`:'刷新二维码可连接新设备';$('copy').disabled=!p.link;$('revoke').disabled=!p.enabled;}catch(e){error(e.message)}}
$('refresh').onclick=async()=>{try{await api('/api/admin/refresh',{});error(null);await refreshPanel()}catch(e){error(e.message)}};
$('revoke').onclick=async()=>{try{await api('/api/admin/stop',{});await refreshPanel()}catch(e){error(e.message)}};
$('copy').onclick=async()=>{try{if(navigator.clipboard)await navigator.clipboard.writeText(pairLink);else throw Error('请在电脑端打开配对页面复制链接');$('pair-note').textContent='链接已复制，请在手机浏览器中打开。'}catch(e){error(e.message)}};
$('composer').onsubmit=async e=>{e.preventDefault();const text=$('prompt').value.trim();if(!text||busy)return;const id=selectedThread??state.threadId,pending={id:'remote:'+crypto.randomUUID(),text,seen:new Set((state.items??[]).map(item=>item.id)),status:'正在提交到 Desktop…'};submissions.set(id,pending);busy=true;render(state);$('messages').scrollTop=$('messages').scrollHeight;error(null);try{await (transport?.command('message',{text,threadId:id})??api('/api/message',{text,threadId:id}));pending.status='Desktop 已接收，等待回复';drafts.delete(id);if(selectedThread===id&&$('prompt').value.trim()===text)$('prompt').value=''}catch(e){pending.status='提交未确认，请检查 Desktop 后重试';error(e.message)}finally{busy=false;render(state)}};
$('interrupt').onclick=async()=>{if(!state.activeTurnId)return;busy=true;render(state);error(null);try{await (transport?.command('interrupt',{turnId:state.activeTurnId,threadId:selectedThread??state.threadId})??api('/api/interrupt',{turnId:state.activeTurnId,threadId:selectedThread??state.threadId}))}catch(e){error(e.message)}finally{busy=false;render(state)}};
function node(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function duration(ms){const seconds=Math.floor(ms/1000);return Math.floor(seconds/60)+'分 '+seconds%60+'秒'}
function updateJump(){const box=$('messages');$('jump-bottom').hidden=box.scrollHeight-box.scrollTop-box.clientHeight<100}
$('messages').onscroll=updateJump;
$('jump-bottom').onclick=()=>{$('messages').scrollTo({top:$('messages').scrollHeight,behavior:'smooth'})};
$('thread-info').onclick=()=>{const open=$('task-info').hidden;$('task-info').hidden=!open;$('thread-info').setAttribute('aria-expanded',String(open))};
$('timeline-toggle').onclick=()=>{const hidden=$('messages').classList.toggle('records-hidden');$('timeline-toggle').setAttribute('aria-pressed',String(hidden));$('timeline-toggle').setAttribute('aria-label',hidden?'展开执行记录':'折叠执行记录');setIcon($('timeline-toggle'),hidden?'panelOpen':'panelClose')};
// Adapted from ZCode WebRemoteControlMobileShell: mobile back returns to the home surface.
function chatMode(on){document.body.classList.toggle('chat-mode',on);$('back').hidden=!on;document.querySelector('.chat-heading').hidden=!on;$('home').hidden=on;$('controller').hidden=!on;$('task-info').hidden=true;$('thread-info').setAttribute('aria-expanded','false')}
for(const [id,icon] of Object.entries({back:'back',theme:'palette','thread-info':'more','timeline-toggle':'panelClose','jump-bottom':'down',send:'up',interrupt:'stop'}))setIcon($(id),icon);
setIcon(document.querySelector('.task-folder'),'folder');
function returnHome(){transport?.subscribe(null);if(selectedThread)drafts.set(selectedThread,$('prompt').value);selectedThread=null;selectionEpoch++;chatMode(false);loadHome()}
function relative(ms){const m=Math.floor(Math.max(0,Date.now()-ms)/60000);return m<1?'刚刚':m<60?m+'分钟前':m<1440?Math.floor(m/60)+'小时前':Math.floor(m/1440)+'天前'}
function drawHome(){if(!homeData)return;const box=$('workspaces');box.replaceChildren();const q=$('search').value.trim().toLowerCase();let shown=0;
  for(const p of homeData.workspaces){const tasks=p.tasks.filter(t=>(!$('running').checked||t.status==='active')&&(!q||p.name.toLowerCase().includes(q)||t.title.toLowerCase().includes(q)));if((q||$('running').checked||$('hide-empty').checked)&&!tasks.length)continue;shown++;
    const card=node('article','workspace'),head=node('button','workspace-head');head.setAttribute('aria-expanded',expanded.has(p.id));const icon=node('span','folder'),info=node('div','workspace-info'),name=node('div','workspace-name',p.name);name.append(node('span','local-badge',p.kind));const path=node('p','workspace-path',p.path||'未归入项目的聊天');path.title=p.path;setIcon(icon,'folder');const latest=Math.max(...p.tasks.map(t=>t.updatedAt),0);info.append(name,path,node('p','workspace-updated',latest?'更新于 '+relative(latest):'暂无任务'));head.append(icon,info,node('span','task-count',tasks.length+' 个任务'),node('span','chevron',expanded.has(p.id)?'⌄':'›'));head.onclick=()=>{expanded.has(p.id)?expanded.delete(p.id):expanded.add(p.id);drawHome()};card.append(head);
    if(expanded.has(p.id)||q){const list=node('div','task-list');for(const t of (showAll.has(p.id)||q?tasks:tasks.slice(0,5))){const row=node('button','task-row'+(t.id===homeData.currentThreadId?' current':''));const left=node('div','task-info');left.append(node('div','task-title',t.title),node('div','task-time',relative(t.updatedAt)));const label=t.status==='active'?'◌ 运行中':t.status==='idle'?'已连接':'历史会话';row.append(left,node('span','task-status '+t.status,label));row.onclick=()=>openTask(t.id,t.title);list.append(row)}if(tasks.length>5&&!showAll.has(p.id)&&!q){const more=node('button','back-button','显示全部 '+tasks.length+' 个任务');more.onclick=()=>{showAll.add(p.id);drawHome()};list.append(more)}if(!tasks.length)list.append(node('p','empty','此工作区暂无任务'));card.append(list)}box.append(card)
  }$('counts').textContent=homeData.workspaces.length+' 个工作区 · '+homeData.taskCount+' 个任务';if(!shown)box.append(node('p','empty','没有符合筛选条件的任务'));
}
async function loadHome(initialData){try{homeData=Array.isArray(initialData?.workspaces)?initialData:await api('/api/catalog');if(!initialized){const p=homeData.workspaces.find(p=>p.tasks.some(t=>t.id===homeData.currentThreadId));if(p)expanded.add(p.id);initialized=true}drawHome();$('connection').textContent='已连接到当前桌面设备';error(null)}catch(e){error(e.message)}}
async function openTask(id,title){if(selectedThread)drafts.set(selectedThread,$('prompt').value);selectedThread=id;const epoch=++selectionEpoch;state={};rendered='';messageNodes.clear();transport?.subscribe(id);chatMode(true);if(!history.state?.remoteChat)history.pushState({remoteChat:true,id,title},'');$('title').textContent=title;renderModel({});$('activity').textContent='';$('messages').replaceChildren(node('p','empty','正在读取任务…'));$('send').disabled=true;$('interrupt').disabled=true;$('interrupt').hidden=true;$('prompt').disabled=true;$('prompt').value=drafts.get(id)??'';error(null);loadModels();try{const next=await api('/api/state?threadId='+encodeURIComponent(id));if(epoch===selectionEpoch&&!(transport?.ready&&transport.state?.threadId===id))render(next)}catch(e){if(epoch===selectionEpoch)error(e.message)}}
$('back').onclick=()=>{if(history.state?.remoteChat)history.back();else returnHome()};
window.addEventListener('popstate',()=>{if(history.state?.remoteChat&&history.state.id)openTask(history.state.id,history.state.title);else returnHome()});
$('reload').onclick=loadHome;$('collapse').onclick=()=>{expanded.clear();drawHome()};$('filters').onclick=()=>{$('filterbar').hidden=!$('filterbar').hidden};for(const id of ['search','running','hide-empty'])$(id).oninput=drawHome;
$('theme').onclick=()=>{document.body.classList.toggle('light');localStorage.setItem('codexRemoteTheme',document.body.classList.contains('light')?'light':'dark')};if(localStorage.getItem('codexRemoteTheme')==='light')document.body.classList.add('light');
async function main(){try{let initialCatalog=null;if(admin){$('pairing').hidden=false;await refreshPanel();setInterval(refreshPanel,2500)}else if(fragment.has('pair')){$('connection').textContent='正在验证二维码…';const p=await api('/api/pair',{code:fragment.get('pair')});initialCatalog=p.catalog;session=p.session;sessionStorage.setItem('codexRemoteSession',session)}if(!session){$('connection').textContent='等待扫码';error('请扫描电脑端显示的二维码');return}transport=new LiveClient({token:session,onState:s=>{if(s.threadId===selectedThread)render(s)},onAuthError:()=>{session=null;sessionStorage.removeItem('codexRemoteSession');error('连接已失效，请重新扫码');$('send').disabled=true;$('interrupt').disabled=true}});$('home').hidden=false;$('connection').textContent='正在加载工作区…';await loadHome(initialCatalog);pollState();setInterval(()=>{if(session&&!selectedThread)loadHome()},6000)}catch(e){error(e.message);$('connection').textContent='配对失败'}}
main();
