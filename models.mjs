import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
let cached=null,pending=null;
export function modelChoice(models,id,effort){
 const model=models.find(m=>m.model===id);if(!model)throw Error('此模型不在当前可用模型列表中');
 return{model:id,effort:model.reasoningEfforts.includes(effort)?effort:model.defaultReasoningEffort};
}
export async function listModels(){
 if(cached&&Date.now()-cached.time<300000)return cached.models;
 if(pending)return pending;
 pending=readModels().then(({models,provider})=>{cached={time:Date.now(),models,provider};return models}).finally(()=>{pending=null});return pending;
}
export async function catalogProvider(){await listModels();return cached.provider}
function readModels(){return new Promise((resolve,reject)=>{
 const child=spawn(process.env.CODEX_CLI_PATH??'codex',['app-server','--stdio'],{stdio:['pipe','pipe','ignore']});
 let done=false,id=0,models=[],cursor=null,provider='openai';
 const lines=createInterface({input:child.stdout});
 const timer=setTimeout(()=>finish(Error('读取可用模型超时，请稍后重试')),20000);
 function finish(error){if(done)return;done=true;clearTimeout(timer);lines.close();child.stdin.end();child.kill('SIGTERM');error?reject(error):resolve({models,provider})}
 function send(method,params,request=true){child.stdin.write(JSON.stringify({jsonrpc:'2.0',...(request?{id:++id}:{}),method,params})+'\n')}
 child.once('spawn',()=>send('initialize',{clientInfo:{name:'web-remote-model-catalog',version:'0.3.0'}}));
 child.once('error',e=>finish(Error('无法读取 Codex 模型列表：'+e.message)));child.once('exit',()=>{if(!done)finish(Error('模型列表连接已关闭'))});child.stdin.on('error',e=>finish(e));
 lines.on('line',line=>{try{const reply=JSON.parse(line);if(reply.id!==id)return;if(reply.error)return finish(Error(reply.error.message));
  if(id===1){send('initialized',{},false);send('config/read',{includeLayers:false});return}
  if(id===2){provider=reply.result.config?.model_provider??'openai';send('model/list',{includeHidden:false,cursor,limit:100});return}
  for(const m of reply.result.data??[])if(!m.hidden&&typeof m.model==='string'&&!models.some(x=>x.model===m.model))models.push({model:m.model,label:m.displayName??m.model,defaultReasoningEffort:m.defaultReasoningEffort,reasoningEfforts:(m.supportedReasoningEfforts??[]).map(x=>x.reasoningEffort)});
  cursor=reply.result.nextCursor;if(cursor)send('model/list',{includeHidden:false,cursor,limit:100});else if(models.length)finish();else finish(Error('没有可用模型'));
 }catch(e){finish(e)}});
})}
