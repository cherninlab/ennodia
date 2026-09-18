import {expect,it} from 'bun:test';
import {EnnodiaCore} from './core';
import {harnessAdapters,type HarnessRunInput} from './harnesses';

it('passes native subagent control through Core and the Codex command without weakening sandbox', async () => {
 const codex=harnessAdapters.find(a=>a.id==='codex')!;
 let received:HarnessRunInput|undefined;
 const adapter={...codex,buildCommand:(_path:string,input:HarnessRunInput)=>{
  received=input;return {command:process.execPath,args:['-e',"console.log('done')"]};
 }};
 const core=new EnnodiaCore({findHarnessAdapter:()=>adapter,discoverHarnesses:async()=>[{...adapter,available:true,runnable:true,commandPath:process.execPath,notes:[]}]});
 try {
  const run=await core.startRun({prompt:'inspect',harnessId:'codex',compare:false,nativeSubagents:'disabled'});
  await core.waitForRun(run.id,2000);
  expect(received?.nativeSubagents).toBe('disabled');
  expect(core.getTask(run.taskIds[0]!)?.nativeSubagents).toBe('disabled');
  for(const nativeSessionId of [undefined,'owned-session']){
   const args=codex.buildCommand!('codex',{prompt:'inspect',nativeSubagents:'disabled',nativeSessionId}).args;
   expect(args.filter(a=>a==='--disable')).toHaveLength(2);
   expect(args).toContain('multi_agent');expect(args).toContain('multi_agent_v2');
   expect(args[args.indexOf('--sandbox')+1]).toBe('read-only');
   if(nativeSessionId)expect(args.indexOf('--disable')).toBeLessThan(args.indexOf('resume'));
  }
  expect(codex.buildCommand!('codex',{prompt:'inspect'}).args).not.toContain('--disable');
 } finally {await core.shutdown();}
});

it('rejects unsupported native subagent control before any worker starts', async()=>{
 const adapter={...harnessAdapters.find(a=>a.id==='claude-code')!,buildCommand:()=>{throw new Error('must not spawn')}};
 const core=new EnnodiaCore({findHarnessAdapter:()=>adapter,discoverHarnesses:async()=>[{...adapter,available:true,runnable:true,commandPath:process.execPath,notes:[]}]});
 try {
  await expect(core.startRun({prompt:'inspect',harnessId:adapter.id,compare:false,nativeSubagents:'disabled'})).rejects.toThrow('does not support nativeSubagents');
  expect(core.listTasks()).toHaveLength(0);
 } finally {await core.shutdown();}
});

it('requires explicit write access again on continuation and records the effective sandbox', async () => {
 const codex=harnessAdapters.find(a=>a.id==='codex')!;
 const inputs:HarnessRunInput[]=[];
 const adapter={...codex,extractSessionId:()=> 'owned',buildCommand:(_path:string,input:HarnessRunInput)=>{
  inputs.push(input); return {command:process.execPath,args:['-e',"console.log('done')"]};
 }};
 const core=new EnnodiaCore({findHarnessAdapter:()=>adapter,discoverHarnesses:async()=>[{...adapter,available:true,runnable:true,commandPath:process.execPath,notes:[]}]});
 try {
  let previous:string|undefined;
  for (const scope of ['workspace-write', undefined, 'read-only'] as const) {
   const run=await core.startRun({prompt:'bounded work',harnessId:'codex',compare:false,persistSession:true,continueTaskId:previous,nativeSandbox:scope});
   await core.waitForRun(run.id,2000);
   const task=core.getTask(run.taskIds[0]!)!;
   expect(task.nativeSandbox).toBe(scope??'read-only');
   const input=inputs.at(-1)!;
   expect(input.prompt).toContain(`Configured native sandbox: ${scope??'read-only'}.`);
   const args=codex.buildCommand!('codex',input).args;
   expect(args[args.indexOf('--sandbox')+1]).toBe(scope??'read-only');
   expect(args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
   if(previous) expect(args.indexOf('--sandbox')).toBeLessThan(args.indexOf('resume'));
   previous=task.id;
  }
 } finally {await core.shutdown();}
});

it('rejects unsupported sandbox and write-enabled pragmatic recipes before spawn', async()=>{
 const codex=harnessAdapters.find(a=>a.id==='codex')!;
 const adapter={...codex,buildCommand:()=>{throw new Error('must not spawn')}};
 const core=new EnnodiaCore({findHarnessAdapter:()=>adapter,discoverHarnesses:async()=>[{...adapter,available:true,runnable:true,commandPath:process.execPath,notes:[]}]});
 try {
  await expect(core.startRun({prompt:'inspect',harnessId:'codex',model:'test',compare:false,nativeSandbox:'workspace-write',pragmatic:{recipe:'investigate',acceptanceCriteria:'cited findings'}})).rejects.toThrow('Pragmatic recipes');
  adapter.supportsNativeSandbox=false;
  await expect(core.startRun({prompt:'inspect',harnessId:'codex',compare:false,nativeSandbox:'read-only'})).rejects.toThrow('does not support nativeSandbox');
  expect(core.listTasks()).toHaveLength(0);
 } finally {await core.shutdown();}
});
