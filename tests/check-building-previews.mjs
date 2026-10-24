// Verify UI images against the installed authored pack or historical AI model.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const candidate=process.argv.includes('--candidate');
const selected=process.argv.find(a=>a.startsWith('--map='))?.slice(6);
const maps=selected?[selected]:['classic','compact','expansion','harbor','alpine'];
const registry=JSON.parse(fs.readFileSync(path.join(root,'art/full-ai-city/approved-assets.json'),'utf8'));
const source=fs.readFileSync(path.join(root,'game.js'),'utf8');
const helpers=source.slice(source.indexOf('function createRegionalBuildingSprite('),source.indexOf('// ─── 地块 Tooltip'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const names=['villa','shop','hotel','tower','skyscraper','finance','onsen'].flatMap(f=>[1,2,3].map(l=>`${f}_${l}`));
const special={bank:'vault_bank',construction:'builders_guild',card_draw:'card_pavilion',chance:'chance_wheel',teleport:'teleport_gate',rush:'rush_station',junction:'junction_hub'};
let checked=0;
for(const map of maps){
  const directory=`${candidate?'art/full-ai-city/packed/previews':'assets/buildings/regions'}/${map}`;
  const manifest=JSON.parse(fs.readFileSync(path.join(root,directory,'manifest.json'),'utf8'));
  const authored=!candidate&&manifest.sourceType==='authored_blender_reference_rebuild';
  const packBytes=authored?fs.readFileSync(path.join(root,`assets/models/regions/${map}.glb`)):null;
  const packManifest=authored?JSON.parse(fs.readFileSync(path.join(root,`assets/models/regions/${map}-manifest.json`))):null;
  assert.equal(manifest.region,map);
  assert.deepEqual(manifest.assets.map(r=>r.asset).sort(),[...names,'civic_hall',...Object.values(special)].sort());
  const ui={state:{currentMapId:map},selectedMapId:map,location:{search:candidate?'?artStage=candidate':''},URLSearchParams};
  vm.createContext(ui);vm.runInContext(helpers,ui);
  const rendered=[...names.map(name=>{const level=Number(name.at(-1));return [name,ui.createBuildingSvg(name.slice(0,-2),level,'#fff',false)];}),['civic_hall',ui.createStartSvg()],...Object.entries(special).map(([type,asset])=>[asset,ui.createSpecialSvg(type)])];
  for(const row of manifest.assets){
    if(authored){
      assert.equal(row.sourceType,'authored_blender_reference_rebuild');
      assert.equal(row.modelPackSha256,hash(packBytes),'preview belongs to the exact installed regional GLB');
      assert.equal(row.rootName,`${map}_${row.asset}`,'preview names the actual packed root');
      assert.equal(row.sourceModelSha256,packManifest.assets.find(asset=>asset.name===row.rootName)?.source.sourceSha256,'preview uses the final individual model');
      const receiptBytes=fs.readFileSync(path.join(root,row.renderBinding.path)),receipt=JSON.parse(receiptBytes);
      assert.equal(hash(receiptBytes),row.renderBinding.sha256,'actual exported-model render receipt');
      assert.equal(receipt.sourceModelSha256,row.sourceModelSha256);assert.equal(receipt.pngSha256,row.sha256);assert.equal(receipt.view,'iso');
    }else{
      const approved=registry.assets[`${map}/${row.asset}`];
      assert.equal(row.modelSha256,approved.candidate.sha256);
      assert.equal(row.sourceRenderSha256,approved.reviewImages.at(-1).sha256);
    }
    const png=fs.readFileSync(path.join(root,row.path));
    assert.equal(hash(png),row.sha256);assert.equal(row.sha256,row.sourceRenderSha256);
    assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    const html=rendered.find(([asset])=>asset===row.asset)[1];
    assert(html.includes(`src="${directory}/${row.asset}.png?`),`${map}/${row.asset}: actual region and level`);
    assert(html.includes('loading="lazy"'),'hidden board thumbnails do not eagerly download');
    checked++;
  }
}
console.log(`PASS ${checked} model-bound UI previews and region/level/public-building routing`);
