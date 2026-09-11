// Pure Node DOM/clock tests. No browser, application state injection, or real audio.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../drama.js'),'utf8');
class Clock {
 constructor(){this.now=0;this.serial=0;this.timers=new Map();this.micro=[];}
 set(fn,delay=0){const id=++this.serial;this.timers.set(id,{at:this.now+Number(delay),fn});return id;}
 clear(id){this.timers.delete(id);}
 async flush(){while(this.micro.length)this.micro.shift()();await Promise.resolve();}
 async advance(ms){const end=this.now+ms;for(;;){const entries=[...this.timers].sort((a,b)=>a[1].at-b[1].at||a[0]-b[0]);if(!entries.length||entries[0][1].at>end)break;const[id,t]=entries[0];this.timers.delete(id);this.now=t.at;t.fn();await this.flush();}this.now=end;await this.flush();}
}
function harness({reduced=false,cardTop=110}={}){
 const clock=new Clock();let randomCalls=0,scrollCalls=0;
 class Node {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.parent=null;this._text='';this._html='';this.className='';this.dataset={};this.attributes={};this.hidden=false;this.listeners={};const values={};this.style={setProperty:(k,v)=>values[k]=String(v),getPropertyValue:k=>values[k]||''};this.classList={contains:c=>this.className.split(/\s+/).includes(c),add:(...cs)=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...cs])].join(' ')},remove:(...cs)=>{this.className=this.className.split(/\s+/).filter(c=>!cs.includes(c)).join(' ')},toggle:(c,yes)=>{const on=yes??!this.classList.contains(c);this.classList[on?'add':'remove'](c);return on;}};}
  get parentElement(){return this.parent;} get childNodes(){return this.children;} get isConnected(){return this===body||!!this.parent?.isConnected;}get clientHeight(){return 600;}
  set textContent(v){this._text=String(v);this.replaceChildren();}get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
  set innerHTML(v){this._html=String(v);this.replaceChildren();}get innerHTML(){return this._html;}
  appendChild(n){n.remove();n.parent=this;this.children.push(n);return n;}append(...nodes){nodes.forEach(n=>this.appendChild(n));}prepend(n){n.remove();n.parent=this;this.children.unshift(n);}replaceChildren(...nodes){this.children.forEach(n=>n.parent=null);this.children=[];nodes.forEach(n=>this.appendChild(n));}remove(){if(this.parent){this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null;}}
  setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k]??null;}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}click(){(this.listeners.click||[]).forEach(fn=>fn({target:this}));}
  matches(s){if(s.startsWith('#'))return this.id===s.slice(1);if(s.startsWith('.'))return this.classList.contains(s.slice(1));const a=s.match(/^\[([^=\]]+)(?:=['"]?([^'"\]]+)['"]?)?\]$/);if(a)return a[2]===undefined?this.getAttribute(a[1])!=null:this.getAttribute(a[1])===a[2];return this.tagName===s.toUpperCase();}
  querySelectorAll(s){const out=[];for(const c of this.children){if(s.split(',').some(x=>c.matches(x.trim())))out.push(c);out.push(...c.querySelectorAll(s));}return out;}querySelector(s){return this.querySelectorAll(s)[0]||null;}closest(s){return this.matches(s)?this:this.parent?.closest(s)||null;}
  getBoundingClientRect(){const card=this.classList.contains('drama-card');const r=card?{left:190,top:cardTop,width:510,height:410}:this.id==='board-stage'||this.id==='drama-layer'?{left:0,top:0,width:900,height:600}:{left:950,top:200,width:170,height:90};return{...r,right:r.left+r.width,bottom:r.top+r.height,x:r.left,y:r.top};}
  scrollIntoView(options){scrollCalls++;this.scrollOptions=options;}
  animate(frames,options){let resolve,reject;const animation={finished:new Promise((a,b)=>{resolve=a;reject=b;}),cancel:()=>{clock.clear(timer);reject(new Error('cancel'));}};const timer=clock.set(resolve,(options.duration||0)+(options.delay||0));return animation;}
 }
 const body=new Node('body'),stage=new Node(),score=new Node();stage.id='board-stage';score.id='scoreboard';body.append(stage,score);
 for(const id of ['human','ai']){const anchor=new Node();anchor.setAttribute('data-player-anchor',id);score.append(anchor);}
 const document={body,createElement:tag=>new Node(tag),getElementById:id=>body.id===id?body:body.querySelector('#'+id),querySelectorAll:s=>body.querySelectorAll(s),querySelector:s=>body.querySelector(s),addEventListener(){}};
 const math=Object.create(Math);math.random=()=>{randomCalls++;throw Error('Visuals consumed the game RNG');};
 const c={document,Math:math,performance:{now:()=>clock.now},setTimeout:(fn,ms)=>clock.set(fn,ms),clearTimeout:id=>clock.clear(id),queueMicrotask:fn=>clock.micro.push(fn),console,innerHeight:800,matchMedia:()=>({matches:reduced}),CityScene:{effect(){}}};c.window=c;vm.createContext(c);vm.runInContext(source,c);
 return {api:c.GameDrama,body,clock,randomCalls:()=>randomCalls,scrollCalls:()=>scrollCalls,q:s=>body.querySelector(s),all:s=>body.querySelectorAll(s),async skip(){this.q('.drama-skip')?.click();await clock.flush();},async reset(){c.GameDrama.reset();await clock.flush();}};
}
const actor={id:'human',name:'玩家',color:'#318d88'},rival={id:'ai',name:'AI 对手',color:'#d67c59'};
const kinds={renovation:'build',district:'build',shield:'card',express:'card',swap:'card',bank:'bank',bonus:'income'};
(async()=>{
 let count=0;
 for(const [chanceKind,type] of Object.entries(kinds)){
  const h=harness();let done=false;
  const e={type,chanceKind,actor,rival,to:actor,amount:0,outcomeLabel:'真实结算结果',title:'城市奇遇',message:'城市局面已经发生改变。'};
  const p=h.api.play(e).then(()=>done=true);
  assert(h.q('#drama-layer').classList.contains('is-chance'));
  assert.equal(h.q('.drama-chance-outcome').textContent,e.outcomeLabel);
  assert.deepEqual(h.all('.drama-speech').map(n=>n.dataset.speaker),['human','ai']);
  assert.equal(h.q('.drama-amount'),null);
  assert.equal(h.q('.drama-expected-amount'),null);
  await h.clock.advance(1000);h.q('.drama-pause').click();await h.clock.advance(9000);assert(!done);
  h.q('.drama-pause').click();await h.clock.advance(4199);assert(!done);await h.clock.advance(1);await p;
  assert.equal(h.clock.timers.size,0);assert.equal(h.randomCalls(),0);count++;
 }
 {
  const h=harness();h.api.play({type:'bank',chanceKind:'bank',actor,rival,from:{id:'city',name:'城市赞助'},to:{id:'bank',name:'公共金库'},amount:600,outcomeLabel:'金库加码'});
  assert.match(h.q('.drama-amount-line').textContent,/金库增加/);assert.equal(h.q('.drama-currency').textContent,'+¥');
  assert.deepEqual(h.all('.drama-speech').map(n=>n.dataset.speaker),['human','ai']);
  await h.clock.advance(1000);assert.equal(h.all('.drama-cash-float').length,0);await h.reset();count++;
 }
 {
  const h=harness();h.api.play({type:'income',chanceKind:'bonus',actor,rival,beneficiaries:[actor,rival,actor],from:{id:'city',name:'夜市'},amount:180,outcomeLabel:'双方分红'});
  assert.match(h.q('.drama-amount-line').textContent,/每人到账/);assert.equal(h.all('.drama-to').length,2);
  await h.clock.advance(700);assert.deepEqual(h.all('.drama-cash-float').map(n=>n.textContent),['+¥180','+¥180']);await h.reset();assert.equal(h.clock.timers.size,0);count++;
 }
 {
  const h=harness({reduced:true});h.api.play({type:'income',chanceKind:'bonus',actor,rival,beneficiaries:[actor,rival],amount:180,outcomeLabel:'双方分红'});
  assert.equal(h.q('.drama-amount').textContent,'180');assert(h.q('.drama-chance-outcome'));await h.reset();count++;
 }
 console.log('PASS',count,'chance presentation / ledger / actor / timing / cleanup checks');
})().catch(e=>{console.error(e);process.exitCode=1});
