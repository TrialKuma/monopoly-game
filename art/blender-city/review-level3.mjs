import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const regions={classic:'法式街区',compact:'京都町屋',expansion:'纽约都会',harbor:'地中海岸',alpine:'阿尔卑斯'};
const families={villa:'住宅',shop:'商铺',hotel:'旅馆',tower:'公馆',skyscraper:'大酒店',finance:'商会',onsen:'温泉'};
const record=(map,asset)=>JSON.parse(fs.readFileSync(path.join(here,'models',map,asset,'model.json')));
const ortho=([w,h,d])=>Math.max(h*1.30,Math.hypot(w,d)*1.18);
const sections=Object.entries(regions).map(([map,label])=>{
  const cards=Object.entries(families).map(([family,name])=>{
    const records=[2,3].map(level=>record(map,`${family}_${level}`)),sizes=records.map(row=>row.size),maximum=Math.max(...sizes.map(ortho));
    return `<article><h3>${name}</h3><div class="pair">${[2,3].map((level,i)=>`<a href="../../art-review.html?map=${map}&family=${family}&level=${level}"><div class="image"><img style="width:${100*ortho(sizes[i])/maximum}%" src="renders/${map}/${family}_${level}.png?v=${records[i].sha256.slice(0,12)}" alt="${label}${name}${level}级"></div><b>${level} 级</b></a>`).join('')}</div></article>`;
  }).join('');
  return `<section id="${map}"><h2>${label}</h2><div class="grid">${cards}</div></section>`;
}).join('');
fs.writeFileSync(path.join(here,'level3-review.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>二级 → 三级建筑对照</title><style>
*{box-sizing:border-box}body{margin:0;background:#ece8df;color:#273e3c;font:16px/1.6 system-ui,sans-serif}header,main{max-width:1560px;margin:auto;padding:24px}header{padding-bottom:0}h1{margin:0;font-size:28px}p{margin:8px 0}nav{display:flex;gap:20px;flex-wrap:wrap}a{color:inherit}h2{margin:28px 0 12px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}article{background:#faf8f2;border:1px solid #d4d9d0;border-radius:16px;overflow:hidden}h3{font-size:16px;margin:12px 16px 0}.pair{display:grid;grid-template-columns:1fr 1fr}.pair a{text-decoration:none;text-align:center;padding-bottom:12px}.image{height:200px;display:flex;align-items:center;justify-content:center}.image img{display:block;max-height:200px;object-fit:contain}@media(max-width:480px){header,main{padding:16px}.grid{grid-template-columns:1fr}.image{height:180px}}
</style><header><h1>二级 → 三级</h1><p>同一组按相同尺度对照，点击建筑可旋转查看。</p><nav>${Object.entries(regions).map(([id,label])=>`<a href="#${id}">${label}</a>`).join('')}<a href="../../index.html">进入游戏</a></nav></header><main>${sections}</main></html>`);
console.log('Wrote level3-review.html: 35 level-two/three pairs at a common scale.');
