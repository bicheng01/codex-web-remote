import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {appServerView,AppServerDesktop} from '../app-server-desktop.mjs';

const thread={id:'thread',name:'Linux task',cwd:'/workspace',model:'gpt-test',reasoningEffort:'high',turns:[{id:'turn',status:'completed',durationMs:10,items:[{id:'u',type:'userMessage',content:[{type:'text',text:'hello'}]},{id:'a',type:'agentMessage',text:'world'}]}]};

test('app-server projection matches the browser Desktop view contract',()=>{
 const view=appServerView(thread);assert.equal(view.connected,true);assert.equal(view.backend,'app-server-fallback');assert.equal(view.threadId,'thread');assert.equal(view.title,'Linux task');assert.equal(view.items[0].text,'hello');assert.equal(view.items[1].text,'world');assert.equal(view.status,'idle');
});

test('app-server fallback stays read-only until the first command',async()=>{
 class Fake extends EventEmitter{constructor(){super();this.calls=[]}async connect(){}async request(method,params){this.calls.push({method,params});if(method==='thread/read')return{thread};if(method==='thread/resume')return{thread};if(method==='turn/start')return{turn:{id:'new'}}}}
 const connection=new Fake(),d=new AppServerDesktop({threadId:'thread',connection});await d.connect();assert.deepEqual(connection.calls.map(x=>x.method),['thread/read']);await d.message('new message');assert.deepEqual(connection.calls.map(x=>x.method),['thread/read','thread/resume','turn/start','thread/read']);
});

test('app-server model and permission updates use thread/settings/update',async()=>{
 class Fake extends EventEmitter{constructor(){super();this.calls=[]}async connect(){}async request(method,params){this.calls.push({method,params});return{thread}}}
 const connection=new Fake(),d=new AppServerDesktop({threadId:'thread',connection});await d.connect();await d.setModel('new','medium');await d.setPermissions({approvalPolicy:'never',sandboxMode:'danger-full-access',networkAccess:true,approvalsReviewer:'user'});
 const updates=connection.calls.filter(x=>x.method==='thread/settings/update');assert.deepEqual(updates[0].params,{threadId:'thread',model:'new',effort:'medium'});assert.equal(updates[1].params.sandboxPolicy.type,'dangerFullAccess');assert.equal(updates[1].params.approvalPolicy,'never');
 assert.equal(d.view().model,'new');assert.equal(d.view().reasoningEffort,'medium');assert.equal(d.view().approvalPolicy,'never');assert.equal(d.view().sandboxMode,'danger-full-access');
});
