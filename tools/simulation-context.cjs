// Minimal, inert DOM for executing the real async game rules in Node.
// No browser, external dependencies, real timers, audio, or source-specific path.
'use strict';
const vm = require('node:vm');
// Rules read the start screen's "hidden" class before AI card use, so classes must be remembered.
class ClassList {
  constructor() { this.names=new Set(); }
  add(...names){names.forEach(n=>this.names.add(n))} remove(...names){names.forEach(n=>this.names.delete(n))} contains(name){return this.names.has(name)}
  toggle(name,force){const on=force===undefined?!this.names.has(name):Boolean(force);if(on)this.names.add(name);else this.names.delete(name);return on}
}
class Node {
  constructor() { this.dataset={};this.children=[];this.style={setProperty(){}};this.textContent='';this.innerHTML='';this.hidden=false;this.classList=new ClassList(); }
  addEventListener(){} removeEventListener(){} setAttribute(){} appendChild(n){this.children.push(n);return n} append(...n){this.children.push(...n)} replaceChildren(...n){this.children=n} querySelector(){return new Node()} querySelectorAll(){return[]} getBoundingClientRect(){return{left:0,top:0,x:0,y:0,width:1000,height:800,bottom:800,right:1000}} closest(){return null}
}
function mulberry32(seed) { let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}; }
function context(source, seed=1) {
  const nodes=new Map(),storage=new Map();let id=0;
  const getNode=key=>{if(!nodes.has(key))nodes.set(key,new Node());return nodes.get(key)};
  const c={console,Math:Object.create(Math),performance:{now:()=>0},Date,Promise,Set,Map,Object,JSON,Number,String,Array,Boolean,
    document:{getElementById:getNode,createElement:()=>new Node(),querySelectorAll:()=>[],querySelector:()=>new Node(),addEventListener(){},body:new Node(),documentElement:new Node()},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},setTimeout:()=>++id,clearTimeout(){},requestAnimationFrame:()=>++id,cancelAnimationFrame(){},addEventListener(){},innerWidth:1280,innerHeight:900,matchMedia:()=>({matches:false,addEventListener(){}}),queueMicrotask};
  c.Math.random=mulberry32(seed);c.window=c;c.globalThis=c;vm.createContext(c);
  const quiet=source.replace(/warmSoundCache\(\);\s*ensureBgmEngine\(\);\s*ensureFallbackBgmAudio\(\);\s*showStartScreen\(\);\s*$/,'');
  vm.runInContext(quiet,c,{filename:'game.js'});c.run=code=>vm.runInContext(code,c);
  c.realShowModal = c.showModal; // Tests can opt back into the real asynchronous choice lifecycle.
  c.realPlayOpeningCoinToss = c.playOpeningCoinToss;
  c.run(`render=()=>{};playSound=()=>{};applyMapLayout=()=>{};renderStartMapOptions=()=>{};updateModeEyebrow=()=>{};updateSoundToggleButton=()=>{};updateMusicToggleButton=()=>{};sleep=()=>Promise.resolve();playOpeningCoinToss=async()=>true;startAiTurnWithDelay=async()=>{};showModal=async cfg=>{throw Error('Unexpected human modal: '+cfg.title)};showContinueModal=async()=>{};`);
  return c;
}
module.exports={context,mulberry32};
