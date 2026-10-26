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
    var large=state.board.find(t=>t.lot&&!t.isLargeSecondary&&t.lot.isLarge&&t.lot.effectId!=='hot_spring_rest');
    var secondary=state.board.find(t=>t.isLargeSecondary&&t.largePrimaryIndex===large.index);
    var owned=state.board.find(t=>t.lot&&!t.isLargeSecondary&&t!==ordinary&&t!==large);
    ordinary.lot.ownerId=seller.id;ordinary.lot.level=2;ordinary.lot.price=201;
    large.lot.ownerId=seller.id;large.lot.level=3;large.lot.price=201;
    owned.lot.ownerId=buyer.id;owned.lot.level=1;
    state.currentPlayerIndex=0;state.firstPlayerIndex=0;state.busy=false;state.phase='await_roll';
    showModal=realShowModal;showContinueModal=async cfg=>capture(cfg);
    render=()=>{renderModal();window.GamePresentation.update();};`);
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
  const begin=()=>c.run('useInventoryCard(buyer,municipalItem.instanceId)');
  const prepare=async(cardId='buyProperty',target='ordinary')=>{
    c.run(`buyer.position=${target}.index;state.busy=false;state.phase='await_roll';
      var municipalItem=grantInventoryCard(buyer.id,'${cardId}',{type:'municipal'});`);
    await c.run(`resolveLanding(buyer,${target},state.sessionId)`);
    assert(c.run('buyer.propertySettlement'),'real rent settlement records this visit');
    assert.equal(c.run(`municipalCardBlock(buyer,CARD_POOL.find(card=>card.id==='${cardId}'))`),'下回合可使用');
    c.run('endTurn();endTurn()');
    assert.equal(c.run('currentPlayer().id'),'human');
    assert.equal(c.run('state.phase'),'await_roll');
    events.length=0;
  };
  return {c,events,snapshots,overlay,actions,dock,click,change,mapClick,begin,prepare,
    quote:()=>c.document.getElementById('event-property-preview').innerHTML,latest:()=>snapshots.at(-1)};
}

(async()=>{
  for(const map of ['classic','compact','expansion','harbor','alpine']) {
    for(const cardId of ['buyProperty','sellProperty']) {
      const buying=cardId==='buyProperty',offerAction=buying?'municipalBuy':'municipalSell';
      await test(`${map}: ${cardId} quotes only the settled current property without a remote selector`,async()=>{
        const h=setup(map),{c}=h;await h.prepare(cardId);
        const before=financialState(c),pending=h.begin(),target=c.run('ordinary.index');
        assert.equal(c.run('state.modal.visible'),true);
        assert.deepEqual(value(c,'state.modal.propertyOffer'),{tileIndex:target,action:offerAction});
        assert.equal(c.run('state.modal.boardTargets'),null);
        assert.equal(h.latest().targetSelection,false);
        assert.equal(h.overlay.parentElement,c.document.body);
        assert(!h.overlay.classList.contains('board-choice'));
        assert(!c.document.body.classList.contains('browsing-property'));
        assert(!h.actions.innerHTML.includes('data-city-target'));
        assert(!h.actions.innerHTML.includes('seize_'));
        assert(h.actions.innerHTML.indexOf('data-action="cancel"')<h.actions.innerHTML.indexOf('data-action="confirm"'),'confirmation stays after cancellation');
        assert(h.quote().includes(buying?'买入价':'原主获补偿'));
        const cost=c.run('getPropertyCost(ordinary.lot)');
        assert(h.quote().includes(`¥${cost.toLocaleString('zh-CN')}`));
        const quote=h.quote();
        h.mapClick(c.run('large.index'));h.change(c.run('large.index'));
        assert.deepEqual(value(c,'state.modal.propertyOffer'),{tileIndex:target,action:offerAction},'browsing another parcel cannot change the card target');
        assert.equal(h.quote(),quote,'the settled property remains the quoted purchase');
        assert.deepEqual(financialState(c),before,'preview cannot charge money or transfer property');
        h.click('cancel');const result=await pending;
        assert.equal(result.cancelled,true);assert.deepEqual(financialState(c),before);
        assert.equal(c.run('buyer.cards.length'),1);assert.equal(c.run('buyer.cardUsedThisTurn'),false);
        assert.equal(c.run('state.modal.visible'),false);assert.equal(h.quote(),'');
        assert.equal(c.run('state.phase'),'await_roll');assert.equal(c.run('state.cardUsePending'),false);
        assert.equal(h.events.length,0);
      });

      await test(`${map}: home cancellation preserves the unresolved ${cardId} quote and card`,async()=>{
        const h=setup(map),{c}=h;await h.prepare(cardId,'secondary');
        c.run('state.ticketPaid=true');const before=financialState(c);let resolved=false;
        const pending=h.begin();pending.then(()=>{resolved=true;});
        const original=c.run('state.modal'),offer=value(c,'state.modal.propertyOffer'),quote=h.quote();
        assert.equal(offer.tileIndex,c.run('large.index'),'a secondary square quotes its shared primary property');
        const returning=c.run('returnToStartScreen()');
        assert.equal(c.run('homeConfirmationPending'),true);assert.equal(c.run('state.modal.label'),'返回首页');
        assert.equal(c.run('state.modal.boardContext'),null);
        assert.equal(h.latest().targetSelection,false);assert.equal(h.quote(),'');
        const homeModal=c.run('state.modal');
        await c.run('returnToStartScreen()');assert.equal(c.run('state.modal'),homeModal,'repeat home click preserves its resolver');
        assert.equal(resolved,false);assert.deepEqual(financialState(c),before);
        h.click('cancel');await returning;await flush();
        assert.equal(c.run('homeConfirmationPending'),false);assert.equal(c.run('state.modal'),original);
        assert.deepEqual(value(c,'state.modal.propertyOffer'),offer);assert.equal(h.quote(),quote);
        assert.equal(resolved,false,'canceling home does not resolve the original card confirmation');
        assert.equal(c.run('buyer.cards.length'),1);assert.equal(h.latest().targetSelection,false);
        h.click('cancel');const result=await pending;
        assert.equal(result.cancelled,true);assert.equal(resolved,true);
        assert.deepEqual(financialState(c),before);assert.equal(h.events.length,0);
      });

      await test(`${map}: ${cardId} confirmation from a secondary square settles once and retains the building`,async()=>{
        const h=setup(map),{c}=h;await h.prepare(cardId,'secondary');
        const before=financialState(c),cost=c.run('getPropertyCost(large.lot)'),pending=h.begin();
        const main=c.run('large.index'),secondary=c.run('secondary.index');
        assert.deepEqual(value(c,'state.modal.propertyOffer'),{tileIndex:main,action:offerAction});
        assert.equal(c.run('state.modal.title'),`${buying?'买下':'卖出'} ${c.run('large.name')}？`);
        assert.deepEqual(financialState(c),before);
        h.click('confirm');const result=await pending;
        assert.equal(result.ok,true);assert.equal(result.cardId,cardId);
        const after=financialState(c);
        assert.deepEqual(after.cash,[before.cash[0]-(buying?cost:0),before.cash[1]+cost]);
        assert.equal(after.bank,before.bank,'municipal cards do not charge a bank premium');
        for(const property of after.properties){
          if(!property)continue;
          if([main,secondary].includes(property.index))assert.deepEqual(property,{...before.properties[property.index],owner:buying?'human':null});
          else assert.deepEqual(property,before.properties[property.index]);
        }
        assert.equal(c.run('large.lot===secondary.lot'),true);assert.equal(c.run('large.lot.level'),3);
        assert.equal(c.run('Boolean(large.lot.municipalResale)'),!buying);
        assert.equal(c.run('buyer.cards.length'),0);assert.equal(c.run('buyer.cardUsedThisTurn'),true);
        assert.equal(h.events.length,1);assert.deepEqual(Array.from(h.events[0].drama.tiles),[main]);
        assert.equal(h.events[0].drama.type,buying?'buy':'notice');
        assert.equal(c.run('state.modal.visible'),false);assert.equal(h.latest().targetSelection,false);
        const once=financialState(c);h.click('confirm');await flush();
        assert.deepEqual(financialState(c),once,'a stale confirmation cannot spend or compensate twice');
      });

      await test(`${map}: invalidated ownership rejects a pending ${cardId} without consuming it`,async()=>{
        const h=setup(map),{c}=h;await h.prepare(cardId);
        const pending=h.begin();c.run('ordinary.lot.ownerId=null');const changed=financialState(c);
        h.click('confirm');const result=await pending;
        assert.equal(result.ok,false);assert.deepEqual(financialState(c),changed);
        assert.equal(c.run('buyer.cards.length'),1);assert.equal(c.run('buyer.cardUsedThisTurn'),false);
        assert.equal(c.run('state.modal.visible'),false);assert.equal(c.run('state.cardUsePending'),false);
        assert.equal(c.run('state.phase'),'await_roll');assert.equal(h.events.length,0);
      });

      for(const restart of ['direct','home']) {
        await test(`${map}: ${restart} restart cancels an unresolved ${cardId} without touching the new match`,async()=>{
          const h=setup(map),{c}=h;await h.prepare(cardId);c.run('state.ticketPaid=true');
          const oldSession=c.run('state.sessionId'),oldBuyer=c.run('buyer'),oldSeller=c.run('seller');
          const oldCash=[oldBuyer.cash,oldSeller.cash],oldLot=c.run('ordinary.lot'),pending=h.begin();
          if(restart==='direct')c.run(`initializeGame('${map}')`);
          else{const returning=c.run('returnToStartScreen()');h.click('home');await returning;}
          const fresh=financialState(c);const result=await pending;await flush();
          assert.notEqual(c.run('state.sessionId'),oldSession);assert.equal(result.ok,false);
          assert.deepEqual(financialState(c),fresh,'old asynchronous confirmation cannot alter the replacement match');
          assert.deepEqual([oldBuyer.cash,oldSeller.cash],oldCash);
          assert.equal(oldLot.ownerId,'ai');assert.equal(oldBuyer.cards.length,1);
          assert.equal(c.run('state.cardUsePending'),false);assert.equal(c.run('state.modal.visible'),false);
          assert.equal(h.events.length,0);
        });
      }
    }

    await test(`${map}: home cancellation preserves an ordinary landing purchase and its resolver`,async()=>{
      const h=setup(map),{c}=h;
      c.run('state.ticketPaid=true;state.currentPlayerIndex=0;ordinary.lot.ownerId=null;buyer.position=ordinary.index');
      const before=financialState(c);let resolved=false;
      const purchase=c.run('resolveLanding(buyer,ordinary,state.sessionId)');purchase.then(()=>{resolved=true;});
      const original=c.run('state.modal'),tile=c.run('ordinary.index');
      assert.equal(original.label,'购买提示');assert.equal(h.latest().selectedTile,tile);
      assert.deepEqual(value(c,'state.modal.propertyOffer'),{tileIndex:tile,action:'buy'});
      const returning=c.run('returnToStartScreen()');
      assert.equal(c.run('state.modal.boardContext'),null);
      assert.equal(h.latest().targetSelection,false,'ordinary purchase never becomes a board-wide property choice');
      assert.equal(resolved,false);
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
  }
  assert(checks.length>0,`no municipal UI tests matched ${filter}`);
  console.log('PASS',checks.length,filter?`municipal card UI checks matching "${filter}"`:'municipal card quote, current-property targeting, confirmation, cancellation, home/resume and restart checks across five maps');
})().catch(error=>{console.error(error);process.exitCode=1;});
