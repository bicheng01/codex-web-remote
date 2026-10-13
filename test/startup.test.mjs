import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {setIcon} from '../public/icons.mjs';
import {permissionModes,permissionMode} from '../public/permission-modes.mjs';

test('Phone bootstrap pairs, displays projects and opens a conversation with actual toolbar icons',async()=>{
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:'https://remote.example/#pair=fixture',runScripts:'outside-only'}),w=dom.window;
 const previousDocument=globalThis.document;globalThis.document=w.document;
 try{
  w.permissionModes=permissionModes;w.permissionMode=permissionMode;w.setIcon=setIcon;w.renderMarkdown=(element,text)=>{element.textContent=text};
  w.LiveClient=class{subscribe(){}command(){return null}};
  const calls=[];
  w.fetch=async(url,options)=>{calls.push(url);let data;
   if(url==='/api/pair'){assert.equal(JSON.parse(options.body).code,'fixture');data={session:'fixture-session',catalog:{currentThreadId:'thread',taskCount:1,workspaces:[{id:'project',name:'Project',kind:'本地',path:'/project',tasks:[{id:'thread',title:'Task',status:'idle',updatedAt:Date.now()}]}]}}}
   else if(url==='/api/catalog')data={currentThreadId:'thread',taskCount:1,workspaces:[{id:'project',name:'Project',kind:'本地',path:'/project',tasks:[{id:'thread',title:'Task',status:'idle',updatedAt:Date.now()}]}]};
   else if(url==='/api/models')data={models:[{model:'gpt-6.1-sol',label:'GPT-6.1-Sol'}]};
   else if(url.startsWith('/api/state'))data={threadId:'thread',title:'Task',connected:true,model:'gpt-6.1-sol',approvalPolicy:'on-request',sandboxMode:'workspace-write',networkAccess:false,items:[]};
   else throw Error('Unexpected URL: '+url);
   return{ok:true,json:async()=>data};
  };
  w.eval(source.replace(/^import .*;\n/gm,'').replace(/main\(\);\s*$/,'')+'\nwindow.startup={main,openTask};');
  await w.startup.main();
  assert.ok(calls.includes('/api/pair'));assert.ok(!calls.includes('/api/catalog'));
  assert.equal(w.document.getElementById('home').hidden,false);
  assert.equal(w.document.getElementById('connection').textContent,'已连接到当前桌面设备');
  assert.ok(w.document.querySelector('#permission-open svg'));
  assert.ok(w.document.querySelector('.model-trigger .chevron svg'));
  await w.startup.openTask('thread','Task');
  assert.equal(w.document.getElementById('error').hidden,true);
  assert.equal(w.document.getElementById('prompt').disabled,false);
  w.document.getElementById('permission-open').click();
  assert.equal(w.document.getElementById('permissions-dialog').hidden,false);
  assert.match(w.document.querySelector('.permission-note').textContent,/请求批准/);
 }finally{w.close();globalThis.document=previousDocument}
});
