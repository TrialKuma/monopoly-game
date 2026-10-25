'use strict';
// Real game modal lifecycle, production event handlers and the full presentation
// adapter. Only the inert DOM, rendering sink and browser services are supplied.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {context} = require('../tools/simulation-context.cjs');
const source = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
const presentation = fs.readFileSync(path.join(__dirname, '../presentation.js'), 'utf8');
const checks = [];
const filter = process.argv.find(arg=>arg.startsWith('--filter='))?.slice(9);
const value = (c, code) => JSON.parse(c.run(`JSON.stringify(${code})`));
const flush = async () => {for (let i=0;i<8;i++) await Promise.resolve();};
const financialState = c => value(c, '({cash:state.players.map(p=>p.cash),bank:state.bankPool,properties:state.board.map(t=>t.lot?({index:t.index,owner:t.lot.ownerId,level:t.lot.level,price:t.lot.price}):null)})');
async function test(name, work) {if(filter&&!name.includes(filter))return;await work();checks.push(name);}

function setup(map) {
  const c=context(source,137), events=[], snapshots=[], windowListeners=new Map();
  // Native async functions use the VM's Promise intrinsic. Keep explicitly
  // constructed promises in that same realm, as they are in a real browser;
  // a host Promise introduces an artificial thenable-assimilation microtask.
  c.run('Promise=(async()=>{})().constructor');
  // The simulation context intentionally discards DOM events. Enable a small,
  // stateful DOM for this suite and register the production action bindings.
  function decorate(node) {
    if(node.uiReady)return node;
    node.uiReady=true;node.listeners=new Map();node.attributes={};
    const classes=new Set();
    node.classList={contains:key=>classes.has(key),add:(...keys)=>keys.forEach(key=>classes.add(key)),remove:(...keys)=>keys.forEach(key=>classes.delete(key)),toggle:(key,force)=>{const on=force??!classes.has(key);if(on)classes.add(key);else classes.delete(key);return on;}};
    node.addEventListener=(type,fn)=>{if(!node.listeners.has(type))node.listeners.set(type,[]);node.listeners.get(type).push(fn);};
    node.dispatch=(type,event)=>{for(const fn of node.listeners.get(type)||[])fn(event);};
    node.setAttribute=(key,v)=>{node.attributes[key]=String(v);};node.removeAttribute=key=>{delete node.attributes[key];};
    node.insertAdjacentHTML=(_position,html)=>{node.innerHTML+=html;};node.focus=()=>{};
    node.appendChild=child=>{if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(n=>n!==child);child.parentElement=node;node.children.push(child);return child;};
    const query=node.querySelector.bind(node);node.querySelector=selector=>decorate(query(selector));
    return node;
  }
  const get=c.document.getElementById,query=c.document.querySelector,create=c.document.createElement;
  c.document.getElementById=id=>decorate(get(id));
  c.document.querySelector=selector=>decorate(query(selector));
  c.document.createElement=tag=>decorate(create(tag));
  decorate(c.document.body);
  for(const [,id] of source.matchAll(/getElementById\(["']([^"']+)["']\)/g))c.document.getElementById(id);
  c.addEventListener=(type,fn)=>{if(!windowListeners.has(type))windowListeners.set(type,[]);windowListeners.get(type).push(fn);};
  c.CityScene={update:data=>snapshots.push(JSON.parse(JSON.stringify(data)))};
  c.capture=cfg=>events.push(cfg);
  c.run(presentation);
  c.run(`initializeGame('${map}');
    state.board.forEach(t=>{if(t.lot){t.lot.ownerId=null;t.lot.level=0;}});
    var buyer=state.players[0],seller=state.players[1];buyer.cash=5000;seller.cash=700;state.bankPool=93;
    var ordinary=state.board.find(t=>t.lot&&!t.isLargeSecondary&&!t.lot.isLarge);
    var large=state.board.find(t=>t.lot&&!t.isLargeSecondary&&t.lot.isLarge);
    var secondary=state.board.find(t=>t.isLargeSecondary&&t.largePrimaryIndex===large.index);
    var owned=state.board.find(t=>t.lot&&!t.isLargeSecondary&&t!==ordinary&&t!==large);
    ordinary.lot.ownerId=seller.id;ordinary.lot.level=2;ordinary.lot.price=201;
    large.lot.ownerId=seller.id;large.lot.level=3;large.lot.price=201;
    owned.lot.ownerId=buyer.id;owned.lot.level=1;
    showModal=realShowModal;showContinueModal=async cfg=>capture(cfg);
    render=()=>{renderModal();window.GamePresentation.syncCityScene();};`);
  c.document.getElementById('start-screen').classList.add('hidden');
  const overlay=c.document.getElementById('event-overlay'),actions=c.document.getElementById('event-actions'),dock=c.document.getElementById('board-choice-dock');
  c.document.body.appendChild(overlay);
  const bindingStart=source.indexOf('eventActionsEl.addEventListener("click"');
  const bindingEnd=source.indexOf('soundToggleBtn?',bindingStart);
  assert(bindingStart>=0&&bindingEnd>bindingStart,'production modal action bindings found');
  c.run(source.slice(bindingStart,bindingEnd));
  const click=action=>actions.dispatch('click',{target:{closest:selector=>selector==='button[data-action]'?{dataset:{action}}:null}});
  const change=index=>actions.dispatch('change',{target:{value:String(index),matches:selector=>selector==='[data-city-target]'}});
  const mapClick=index=>{for(const listener of windowListeners.get('city:select')||[])listener({detail:{index}});};
  const begin=()=>c.run('resolveStartTakeover(buyer,state.sessionId)');
  const chosenAction=()=>actions.innerHTML.match(/data-action="(seize_\d+)"/)[1];
  return {c,events,snapshots,overlay,actions,dock,click,change,mapClick,begin,chosenAction,latest:()=>snapshots.at(-1)};
}

(async()=>{
  for(const map of ['classic','compact','expansion','harbor','alpine']) {
    for(const stage of ['target','quote']) {
      await test(`${map}: home cancellation restores the unresolved municipal ${stage} and chosen parcel`,async()=>{
        const h=setup(map),{c}=h;c.run('state.ticketPaid=true');
        const before=financialState(c);let resolved=false;
        const pending=h.begin();pending.then(()=>{resolved=true;});
        h.mapClick(c.run('secondary.index'));
        if(stage==='quote'){h.click(h.chosenAction());await flush();}
        const original=c.run('state.modal'),indices=value(c,'state.modal.boardTargets'),target=c.run('large.index');
        const frameStart=h.snapshots.length;
        const returning=c.run('returnToStartScreen()');
        assert.equal(c.run('homeConfirmationPending'),true);
        assert.equal(c.run('state.modal.label'),'返回首页');
        assert.deepEqual(value(c,'state.modal.boardContext'),{indices,selectedTarget:target});
        assert.deepEqual(h.latest().targetSelection,{kind:'property',indices,suspended:true});
        assert.equal(h.latest().selectedTile,target,'home confirmation keeps the chosen property, not the active pawn tile');
        assert.equal(c.run('previewMunicipalTarget(ordinary.index)'),false,'home confirmation cannot change the suspended municipal choice');
        const homeModal=c.run('state.modal');
        await c.run('returnToStartScreen()');assert.equal(c.run('state.modal'),homeModal,'repeat home click cannot replace its resolver');
        assert.equal(resolved,false);assert.deepEqual(financialState(c),before);
        h.click('cancel');await returning;await flush();
        assert.equal(c.run('homeConfirmationPending'),false);
        assert.equal(c.run('state.modal'),original,'restore the exact original unresolved modal');
        assert.equal(c.run('state.modal.selectedTarget'),target);
        assert.equal(h.latest().selectedTile,target);
        assert.deepEqual(h.latest().targetSelection,{kind:'property',indices});
        assert.equal(h.overlay.parentElement,h.dock);
        assert.equal(resolved,false,'canceling home must not resolve the original gameplay choice');
        assert(h.snapshots.slice(frameStart).every(frame=>frame.targetSelection?.kind==='property'&&frame.selectedTile===target),'home open/cancel never emits an empty target frame or switches to the pawn');
        if(stage==='target'){
          h.change(c.run('ordinary.index'));h.click(h.chosenAction());await flush();
          assert.equal(c.run('state.modal.title'),`${c.run('municipalTargetLabel(ordinary)')} · Lv.2`,'resumed picker still opens the chosen quote');
        }
        h.click('skip');await pending;assert.equal(resolved,true);
        assert.deepEqual(financialState(c),before);assert.equal(h.events.length,0);
      });
    }
    await test(`${map}: home cancellation preserves a normal landing purchase and its resolver`,async()=>{
      const h=setup(map),{c}=h;
      c.run('state.ticketPaid=true;state.currentPlayerIndex=0;ordinary.lot.ownerId=null;buyer.position=ordinary.index');
      const before=financialState(c);let resolved=false;
      const purchase=c.run('resolveLanding(buyer,ordinary,state.sessionId)');purchase.then(()=>{resolved=true;});
      const original=c.run('state.modal'),tile=c.run('ordinary.index');
      assert.equal(original.label,'购买提示');assert.equal(h.latest().selectedTile,tile);
      const returning=c.run('returnToStartScreen()');
      assert.equal(c.run('state.modal.boardContext'),null);
      assert.equal(h.latest().targetSelection,false,'ordinary purchase does not become a board-wide property choice');
      assert.equal(h.latest().selectedTile,tile);assert.equal(resolved,false);
      h.click('cancel');await returning;await flush();
      assert.equal(c.run('state.modal'),original);assert.equal(h.latest().selectedTile,tile);
      assert.equal(h.latest().targetSelection,false);assert.equal(resolved,false);
      assert.deepEqual(financialState(c),before);
      h.click('buy');await purchase;
      assert.equal(c.run('ordinary.lot.ownerId'),'human');assert.equal(c.run('ordinary.lot.level'),2);
      assert.equal(c.run('buyer.cash'),before.cash[0]-201);assert.equal(c.run('seller.cash'),before.cash[1]);
      assert.equal(c.run('state.bankPool'),before.bank);
      assert.equal(h.events.length,1);assert.equal(h.events[0].drama.type,'buy');
      assert.equal(h.events[0].drama.amount,201);
    });
    await test(`${map}: real map/dropdown previews filter targets and normalize a double-lot secondary`,async()=>{
      const h=setup(map),{c}=h,before=financialState(c),pending=h.begin();
      const targets=value(c,'[ordinary.index,large.index].sort((a,b)=>a-b)');
      assert.deepEqual(value(c,'state.modal.boardTargets'),targets);
      assert.equal(c.run('state.modal.selectedTarget'),targets[0]);
      assert.deepEqual(h.latest().targetSelection,{kind:'property',indices:targets});
      assert.equal(h.overlay.parentElement,h.dock);
      assert(h.overlay.classList.contains('board-choice'));
      assert(c.document.body.classList.contains('browsing-property'));
      assert.equal((h.actions.innerHTML.match(/<option /g)||[]).length,2,'double lot appears once');
      const normalLabel=c.run('municipalTargetLabel(ordinary)'),largeLabel=c.run('municipalTargetLabel(large)');
      assert(h.actions.innerHTML.includes(normalLabel));assert(h.actions.innerHTML.includes(largeLabel));
      assert(largeLabel.includes(`第 ${c.run('large.index+1')}、${c.run('secondary.index+1')} 格`));
      assert(h.actions.innerHTML.indexOf('data-action="skip"')<h.actions.innerHTML.indexOf('class="modal-btn primary"'),'confirmation follows cancellation');
      for(const invalid of [-1,9999,0,c.run('owned.index'),c.run('state.board.find(t=>t.lot&&!t.lot.ownerId).index')]){
        const selected=c.run('state.modal.selectedTarget'),snapshots=h.snapshots.length;
        c.badIndex=invalid;assert.equal(c.run('previewMunicipalTarget(badIndex)'),false);
        h.mapClick(invalid);
        assert.equal(c.run('state.modal.selectedTarget'),selected);
        assert.equal(h.snapshots.length,snapshots,'invalid map click never changes preview');
      }
      h.mapClick(c.run('secondary.index'));
      assert.equal(c.run('state.modal.selectedTarget'),c.run('large.index'));
      assert.equal(h.latest().selectedTile,c.run('large.index'));
      assert.equal(h.chosenAction(),`seize_${c.run('large.index')}`);
      assert(h.actions.innerHTML.includes(`value="${c.run('large.index')}" selected`));
      assert.equal(c.run('state.modal.visible'),true,'preview does not submit the choice');
      assert.deepEqual(financialState(c),before,'preview cannot transfer ownership or charge money');
      h.change(c.run('ordinary.index'));
      assert.equal(c.run('state.modal.selectedTarget'),c.run('ordinary.index'));
      assert.equal(h.latest().selectedTile,c.run('ordinary.index'));
      assert.equal(h.chosenAction(),`seize_${c.run('ordinary.index')}`);
      assert.deepEqual(financialState(c),before);
      h.click('skip');await pending;
      assert.equal(c.run('state.modal.visible'),false);
      assert.equal(h.overlay.parentElement,c.document.body);
      assert(!h.overlay.classList.contains('board-choice'));assert(!c.document.body.classList.contains('browsing-property'));
      assert.equal(h.latest().targetSelection,false);
      assert.equal(c.run('previewMunicipalTarget(large.index)'),false,'closed dialog cannot accept a stale preview');
    });

    for(const stage of ['target','quote'])for(const action of ['skip','cancel']) {
      await test(`${map}: ${action} from real ${stage} modal leaves all assets/cash intact`,async()=>{
        const h=setup(map),{c}=h,before=financialState(c),pending=h.begin();
        h.mapClick(c.run('secondary.index'));
        if(stage==='quote'){
          const frameStart=h.snapshots.length;
          h.click(h.chosenAction());await flush();
          assert(h.snapshots.slice(frameStart).every(frame=>frame.targetSelection?.kind==='property'),`picker-to-quote never emits a closed target view that resets the browsing camera: ${JSON.stringify(h.snapshots.slice(frameStart).map(frame=>({phase:frame.phase,targetSelection:frame.targetSelection,selected:frame.selectedTile})))}`);
          assert.equal(c.run('state.modal.title'),`${c.run('municipalTargetLabel(large)')} · Lv.3`);
          assert.deepEqual(value(c,'state.modal.boardTargets'),[c.run('large.index')]);
          assert.deepEqual(h.latest().targetSelection,{kind:'property',indices:[c.run('large.index')]});
          assert.equal(c.run('previewMunicipalTarget(ordinary.index)'),false,'quote cannot silently switch to another legal first-stage target');
          assert.equal(h.latest().selectedTile,c.run('large.index'));
          assert(h.actions.innerHTML.includes('data-action="acquire"'));
          assert(!h.actions.innerHTML.includes('data-city-target'));
        }
        if(action==='skip')h.click(action);else c.run('hideModal(true,"cancel")');
        await pending;
        assert.deepEqual(financialState(c),before);assert.equal(h.events.length,0);
        assert.equal(c.run('state.modal.visible'),false);assert.equal(h.latest().targetSelection,false);
        assert.equal(h.overlay.parentElement,c.document.body);
      });
    }

    await test(`${map}: invalidated ownership closes a deferred target submission cleanly`,async()=>{
      const h=setup(map),{c}=h,pending=h.begin();
      h.mapClick(c.run('secondary.index'));c.run('large.lot.ownerId=null');
      const changedExternally=financialState(c);
      h.click(h.chosenAction());await pending;await flush();
      assert.deepEqual(financialState(c),changedExternally);
      assert.equal(h.events.length,0);assert.equal(c.run('state.modal.visible'),false);
      assert.equal(h.latest().targetSelection,false);
      assert.equal(h.overlay.parentElement,c.document.body);
      assert(!h.overlay.classList.contains('visible'));
      assert(!c.document.body.classList.contains('browsing-property'));
    });

    await test(`${map}: secondary preview then real confirmation purchases once and retains L3`,async()=>{
      const h=setup(map),{c}=h,before=financialState(c),pending=h.begin();
      h.mapClick(c.run('secondary.index'));h.click(h.chosenAction());await flush();
      assert.match(c.run('state.modal.title'),/^第 \d+、\d+ 格 · /);
      assert.equal(c.run("state.modal.buttons.find(button=>button.id==='acquire').label"),'接手房产 · 支付 ¥252');
      assert.match(h.actions.innerHTML,/data-action="acquire"[^>]*>接手房产 · 支付 ¥252<\/button>/,'the confirmation button visibly quotes the actual purchase cost');
      assert.deepEqual(financialState(c),before,'quote is a preview, not a purchase');
      h.click('acquire');await pending;
      const after=financialState(c),main=c.run('large.index'),secondary=c.run('secondary.index');
      assert.deepEqual(after.cash,[4748,901]);assert.equal(after.bank,144);
      assert.equal(after.cash.reduce((a,b)=>a+b,after.bank),before.cash.reduce((a,b)=>a+b,before.bank));
      for(const property of after.properties){
        if(!property)continue;
        if([main,secondary].includes(property.index))assert.deepEqual(property,{...before.properties[property.index],owner:'human'});
        else assert.deepEqual(property,before.properties[property.index]);
      }
      assert.equal(c.run('large.lot===secondary.lot'),true);assert.equal(c.run('large.lot.level'),3);
      assert.equal(h.events.length,1);assert.equal(h.events[0].drama.purchasePrice,252);
      assert.equal(h.events[0].drama.refund,201);assert.equal(h.events[0].drama.premium,51);
      assert.deepEqual(Array.from(h.events[0].drama.tiles),[main]);
      assert.equal(h.latest().targetSelection,false);assert.equal(h.overlay.parentElement,c.document.body);
    });
  }
  assert(checks.length>0,`no municipal UI tests matched ${filter}`);
  console.log('PASS',checks.length,filter?`municipal UI checks matching "${filter}" across five maps`:'real municipal UI, home/resume, secondary preview, cancellation and purchase checks across five maps');
})().catch(error=>{console.error(error);process.exitCode=1;});
