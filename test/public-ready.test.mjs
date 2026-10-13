import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyPublicPage,waitPublicPage} from '../public-ready.mjs';
const html='<title>Codex 远程控制</title><link href="/assets/style-123456789abc.css"><script src="/assets/app-123456789abc.js"></script>';
const good=async url=>new Response(new URL(url).pathname==='/'?html:'body{}',{headers:{'Content-Type':new URL(url).pathname==='/'?'text/html':new URL(url).pathname.endsWith('.js')?'text/javascript':'text/css'}});
test('Public readiness waits for both app and stylesheet, not only HTML',async()=>{
 const fetched=[];await verifyPublicPage('https://example.test',{fetchPage:async url=>{fetched.push(new URL(url).pathname);return good(url)}});assert.equal(fetched.length,3);
 await assert.rejects(verifyPublicPage('https://example.test',{fetchPage:async url=>new URL(url).pathname.endsWith('.js')?new Response('unavailable',{status:503}):good(url)}),/503/);
 await assert.rejects(verifyPublicPage('https://example.test',{fetchPage:async()=>new Response('error',{headers:{'Content-Type':'text/html'}})}),/页面不正确/);
});
test('Public readiness recovers after an initial unreachable origin and stops on timeout',async()=>{
 let failed=false;await waitPublicPage('https://example.test',{timeoutMs:2000,fetchPage:async url=>{if(!failed){failed=true;throw Error('DNS not ready')}return good(url)}});assert.equal(failed,true);
 await assert.rejects(waitPublicPage('https://example.test',{timeoutMs:10,fetchPage:async()=>{throw Error('unreachable')}}),/未能就绪/);
});
