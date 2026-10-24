import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {root,json,local,receipt} from './ai-city-fixture.mjs';

const repair=json('art/full-ai-city/reports/local-repairs/alpine/hotel_3/ab8842a43a0d54b8/repair.json');
// Exercise actual Windows-generated CRLF evidence and tool bytes, not a
// normalized temporary fixture that would hide the checkout corruption.
const paths=[
  'art/full-ai-city/approved-assets.json',
  'art/full-ai-city/reports/local-repairs/alpine/hotel_3/ab8842a43a0d54b8/repair.json',
  repair.processingTool.path,
  repair.sourcePreservation.path,
  repair.reviewImages[0].path,
  'assets/models/regions/classic-manifest.json',
];
for(const row of [repair.processingTool,repair.sourcePreservation,repair.reviewImages[0]])receipt(row);
const {assets}=json('art/full-ai-city/approved-assets.json');
const first=Object.values(assets).find(entry=>entry.status==='approved');
assert(first);paths.push(first.candidate.path);
for(const value of paths){
  const p=local(value),bytes=fs.readFileSync(p),gitPath=path.relative(root,p).replaceAll('\\','/');
  function hash(args){
    const result=spawnSync('git',['hash-object',...args,'--stdin'],{cwd:root,input:bytes,maxBuffer:1024*1024});
    assert.equal(result.status,0,result.stderr?.toString());return result.stdout.toString().trim();
  }
  assert.equal(hash(['--path='+gitPath]),hash(['--no-filters']),`Git must retain exact reviewed bytes: ${value}`);
}
// The same policy must cover packages that do not exist until full release.
for(const p of ['assets/models/regions-far/compact-manifest.json','assets/models/harbor/alpine_windmill-manifest.json','art/regions/runtime-release.json']){
  const result=spawnSync('git',['check-attr','text','--',p],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert(result.stdout.trim().endsWith(': text: unset'),p);
}
console.log(`PASS ${paths.length} actual provenance files retain exact Git bytes, including CRLF; future near/far/hero manifests protected`);
