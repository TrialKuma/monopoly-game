import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {root,json,verifyApproval} from './ai-city-fixture.mjs';

// Model a clean checkout without removing any live worker files. Every
// ignored file is unavailable; immutable reviewed evidence must suffice.
const result=spawnSync('git',['ls-files','--others','--ignored','--exclude-standard','-z','art/full-ai-city'],{cwd:root,maxBuffer:32*1024*1024});
assert.equal(result.status,0,result.stderr.toString());
const ignored=new Set(result.stdout.toString().split('\0').filter(Boolean).map(p=>path.resolve(root,p).toLowerCase()));
const nativeRead=fs.readFileSync,nativeExists=fs.existsSync;
const excluded=p=>typeof p==='string'&&ignored.has(path.resolve(p).toLowerCase());
let checked=0;
try{
  fs.existsSync=p=>excluded(p)?false:nativeExists(p);
  fs.readFileSync=(p,...args)=>{assert(!excluded(p),`approval depends on excluded scratch file: ${p}`);return nativeRead(p,...args);};
  for(const registry of ['approved-assets.json','approved-far-assets.json']){
    for(const entry of Object.values(json('art/full-ai-city/'+registry).assets)){
      if(entry.status==='approved'){verifyApproval(entry);checked++;}
    }
  }
}finally{fs.readFileSync=nativeRead;fs.existsSync=nativeExists;}
assert(checked>0);
console.log(`PASS ${checked} approved models validate without any of ${ignored.size} ignored scratch/archive files`);
