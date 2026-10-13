import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const run=promisify(execFile),script=fileURLToPath(new URL('./catalog.py',import.meta.url));
export async function readCatalog(threadId){const {stdout}=await run(process.env.PYTHON??'python3',[script,...(threadId?[threadId]:[])],{maxBuffer:12*1024*1024,timeout:10000});return JSON.parse(stdout)}
