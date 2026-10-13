import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {permissionModes,permissionMode} from '../public/permission-modes.mjs';

test('Send shows pending immediately, acknowledges receipt, and reconciles Desktop echo',async()=>{
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'outside-only'}),w=dom.window;
  try{
    w.permissionModes=permissionModes;w.permissionMode=permissionMode;w.setIcon=()=>{};w.renderMarkdown=(element,text)=>{element.textContent=text};
    const state={threadId:'thread',connected:true,title:'Test',items:[]};
    w.fetch=async()=>({ok:true,json:async()=>state});
    w.eval(source.replace(/^import .*;\n/gm,'').replace(/main\(\);\s*$/,'')+'\nwindow.remoteTest={openTask,render,setTransport:value=>transport=value};');
    let resolve,reject,calls=0;
    w.remoteTest.setTransport({subscribe(){},command(){calls++;return new Promise((yes,no)=>{resolve=yes;reject=no})}});
    await w.remoteTest.openTask('thread','Test');
    const prompt=w.document.getElementById('prompt'),box=w.document.getElementById('messages');
    prompt.value='Hello';const submitted=w.document.getElementById('composer').onsubmit({preventDefault(){}});
    assert.match(box.textContent,/Hello/);assert.match(box.textContent,/正在提交/);
    assert.equal(w.document.getElementById('send').disabled,true);
    resolve({});await submitted;
    assert.match(box.textContent,/已接收/);assert.equal(prompt.value,'');
    w.remoteTest.render({...state,items:[{id:'desktop-message',type:'userMessage',text:'Hello'}]});
    assert.equal(box.querySelectorAll('.user-message').length,1);
    assert.doesNotMatch(box.textContent,/等待回复/);
    prompt.value='Second';const failed=w.document.getElementById('composer').onsubmit({preventDefault(){}});
    reject(Error('timeout'));await failed;
    assert.match(box.textContent,/提交未确认/);assert.equal(prompt.value,'Second');assert.equal(calls,2);
  }finally{w.close()}
});
