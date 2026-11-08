import { afterAll, afterEach, describe, expect, it, spyOn } from 'bun:test';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverHarnesses, harnessAdapters } from './harnesses';

const adapter=harnessAdapters.find(candidate=>candidate.id==='claude-code')!;
const originalCandidates=adapter.commandCandidates;
const originalPlatform=Object.getOwnPropertyDescriptor(process,'platform')!;
const originalPath=process.env.PATH;
const originalWhich=Bun.which;
let directory:string|undefined;
let which:ReturnType<typeof spyOn>|undefined;
afterEach(()=>{
  which?.mockRestore();which=undefined;
  adapter.commandCandidates=originalCandidates;
  Object.defineProperty(process,'platform',originalPlatform);
  if(originalPath===undefined)delete process.env.PATH;else process.env.PATH=originalPath;
  if(directory)rmSync(directory,{recursive:true,force:true});directory=undefined;
});

afterAll(async()=>{ await discoverHarnesses({refresh:true}); });

function setup(){
  directory=mkdtempSync(join(tmpdir(),'ennodia-native-discovery-'));
  const preferred=join(directory,'preferred');mkdirSync(preferred);
  const nativeRoots=['/opt/homebrew/bin','/usr/local/bin',join(homedir(),'.local','bin')];
  const roots=nativeRoots.map((_,index)=>join(directory!,`native-${index}`));roots.forEach(root=>mkdirSync(root));
  Object.defineProperty(process,'platform',{value:'darwin',configurable:true});
  process.env.PATH=preferred;
  which=spyOn(Bun,'which').mockImplementation((command,options)=>{
    let path=options?.PATH??process.env.PATH??'';
    nativeRoots.forEach((root,index)=>{path=path.split(':').map(entry=>entry===root?roots[index]!:entry).join(':');});
    return originalWhich(command,{...options,PATH:path});
  });
  return {preferred,roots};
}
function binary(root:string,name:string,version:string){
  const path=join(root,name);writeFileSync(path,`#!/bin/sh\nprintf '%s\\n' '${version}'\n`);chmodSync(path,0o700);return path;
}
async function detected(){return (await discoverHarnesses({refresh:true})).find(item=>item.id===adapter.id)!;}

describe('native macOS harness discovery',()=>{
  it('discovers and invokes native CLI versions with a restricted GUI PATH',async()=>{
    const {roots}=setup();adapter.commandCandidates=['ennodia-native-probe'];
    for(const root of roots){
      const path=binary(root,'ennodia-native-probe','native-fixture-1');
      const result=await detected();
      expect(result.available).toBe(true);expect(result.runnable).toBe(true);
      expect(result.commandPath).toBe(path);expect(result.version).toBe('native-fixture-1');
      rmSync(path);
    }
  });
  it('keeps existing PATH candidates ahead of native-root fallbacks',async()=>{
    const {preferred,roots}=setup();
    adapter.commandCandidates=['ennodia-native-first','ennodia-path-second'];
    binary(roots[0]!,'ennodia-native-first','fallback');
    const path=binary(preferred,'ennodia-path-second','preferred');
    expect((await detected()).commandPath).toBe(path);
  });
  it('preserves an explicit command and never replaces a missing explicit path by basename',async()=>{
    const {preferred,roots}=setup();const path=binary(preferred,'ennodia-explicit','explicit');
    binary(roots[0]!,'ennodia-explicit','fallback');adapter.commandCandidates=[path];
    expect((await detected()).commandPath).toBe(path);
    adapter.commandCandidates=[join(directory!,'missing','ennodia-explicit')];
    expect((await detected()).runnable).toBe(false);
  });
  it('does not revive a route with no command candidates',async()=>{
    const {roots}=setup();binary(roots[0]!,'claude','unrequested');adapter.commandCandidates=[];
    const result=await detected();expect(result.available).toBe(false);expect(result.runnable).toBe(false);
  });
});
