import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyPatches,viewState,Desktop} from '../desktop.mjs';
test('Desktop incremental patches preserve array order and remove fields',()=>{
  const state={items:[{text:'a'},{text:'b'}],old:true};
  applyPatches(state,[{op:'add',path:['items',1],value:{text:'c'}},{op:'replace',path:['items',0,'text'],value:'A'},{op:'remove',path:['items',2]},{op:'remove',path:['old']}]);
  assert.deepEqual(state,{items:[{text:'A'},{text:'c'}]});
  assert.throws(()=>applyPatches(state,[{op:'add',path:['__proto__','polluted'],value:true}]));
});
test('Browser projection includes only display fields and identifies current turn',()=>{
  const result=viewState({id:'thread',title:'Test',latestThreadSettings:{model:'test-model',developerInstructions:'private'},turns:[{turnId:'active',status:'inProgress',params:{secret:'private'},items:[{type:'userMessage',id:'u',content:[{type:'text',text:'hi'}]},{type:'agentMessage',id:'a',text:'hello'}]}]},true);
  assert.equal(result.activeTurnId,'active');assert.equal(result.items[1].text,'hello');assert.ok(!JSON.stringify(result).includes('private'));
});
test('Idle input uses Desktop owner and inherits thread settings; active input steers',async()=>{
  const d=new Desktop({threadId:'thread',socketPath:'/unused'});d.connected=true;d.owner='desktop-owner';d.state={id:'thread',cwd:'/workspace',turns:[]};
  let call;d.rpc=async(...args)=>{call=args;return{result:{ok:true}}};await d.message('hello');
  assert.equal(call[0],'thread-follower-start-turn');assert.equal(call[1].turnStart.request.threadId,'thread');assert.equal(call[2].targetClientId,'desktop-owner');assert.equal(call[1].turnStart.context.inheritThreadSettings,true);
  d.state.turns=[{turnId:'active',status:'inProgress',items:[]}];await d.message('continue');assert.equal(call[0],'thread-follower-steer-turn');assert.equal(call[1].input[0].text,'continue');
});
test('Stop rejects stale turn ID before sending; current ID uses guarded Desktop interrupt',async()=>{
  const d=new Desktop({threadId:'thread',socketPath:'/unused'});d.state={turns:[{turnId:'current',status:'inProgress',items:[]}]};d.owner='owner';let call;
  d.rpc=async(...args)=>{call=args;return{result:{ok:true}}};await assert.rejects(d.interrupt('stale'));assert.equal(call,undefined);await d.interrupt('current');assert.equal(call[1].expectedTurnId,'current');assert.equal(call[1].mode,'user-stop');
});
test('Model change updates next-turn settings with a concurrency guard and never interrupts',async()=>{
 const d=new Desktop({threadId:'thread',socketPath:'/unused'});d.connected=true;d.owner='owner';d.state={turns:[{turnId:'active',status:'inProgress',items:[]}]};const calls=[];
 d.rpc=async(method,params,target)=>{calls.push({method,params,target});return method==='thread-follower-read-model-settings'?{result:{settings:{model:'old',reasoningEffort:'high',modelProvider:'openai'}}}:{result:{applied:true}}};
 assert.deepEqual(await d.setModel('new','medium'),{model:'new',reasoningEffort:'medium',appliesTo:'next-turn'});
 assert.equal(calls.length,2);assert.equal(calls[1].method,'thread-follower-update-thread-settings');assert.deepEqual(calls[1].params.threadSettings,{model:'new',effort:'medium'});assert.equal(calls[1].params.activeTurnId,null);assert.deepEqual(calls[1].params.condition,{ifModelEquals:'old',ifEffortEquals:'high'});assert.equal(d.view().activeTurnId,'active');
 d.rpc=async method=>method==='thread-follower-read-model-settings'?{result:{settings:{model:'old',reasoningEffort:'high'}}}:{result:{applied:false}};
 await assert.rejects(d.setModel('new','low'),/改变/);
});
