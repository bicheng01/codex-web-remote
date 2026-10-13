import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {modelChoice} from '../models.mjs';
import {permissionModes,permissionMode} from '../public/permission-modes.mjs';
test('Model validation rejects unknown models and preserves only supported reasoning effort',()=>{
 const models=[{model:'available',defaultReasoningEffort:'low',reasoningEfforts:['low','high']}];
 assert.deepEqual(modelChoice(models,'available','high'),{model:'available',effort:'high'});
 assert.deepEqual(modelChoice(models,'available','ultra'),{model:'available',effort:'low'});
 assert.throws(()=>modelChoice(models,'invalid','low'));
});
test('Mobile picker retains its options during state updates and switches the selected conversation',async()=>{
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8'),source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'outside-only'}),w=dom.window;
 try{
  w.permissionModes=permissionModes;w.permissionMode=permissionMode;w.setIcon=()=>{};w.renderMarkdown=(e,text)=>{e.textContent=text};const state={threadId:'thread',title:'Test',connected:true,model:'one',activeTurnId:'active',items:[]};
  w.fetch=async url=>({ok:true,json:async()=>url==='/api/models'?{models:[{model:'one',label:'One'},{model:'two',label:'Two'}]}:state});
  w.eval(source.replace(/^import .*;\n/gm,'').replace(/main\(\);\s*$/,'')+'\nwindow.testRemote={openTask,render,loadModels,setTransport:v=>transport=v};');
  let call;w.testRemote.setTransport({subscribe(){},command:async(action,args)=>{call={action,...args};return{model:args.model,reasoningEffort:'low'}}});
  await w.testRemote.openTask('thread','Test');await w.testRemote.loadModels();
  const menu=w.document.getElementById('model-menu'),trigger=w.document.getElementById('model-open');
  assert.equal(menu.children.length,2);assert.equal(menu.querySelector('[aria-selected="true"]').dataset.model,'one');assert.equal(trigger.disabled,false);
  const first=menu.children[0];w.testRemote.render({...state,items:[{id:'a',type:'agentMessage',text:'update'}]});assert.equal(menu.children.length,2);assert.equal(menu.children[0],first);
  await menu.onclick({target:menu.querySelector('[data-model="two"]')});assert.deepEqual(JSON.parse(JSON.stringify(call)),{action:'model',threadId:'thread',model:'two'});assert.equal(menu.querySelector('[aria-selected="true"]').dataset.model,'two');assert.equal(w.document.getElementById('prompt').placeholder,'与codex协作');
 }finally{w.close()}
});
