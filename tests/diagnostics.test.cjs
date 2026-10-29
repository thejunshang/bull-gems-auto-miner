const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','bull-gems-auto-miner.user.js'),'utf8');
const logger=source.slice(source.indexOf('  const VERSION ='),source.indexOf('  let state ='));
function makeLogger(store=new Map(),broken=false){
  const c=vm.createContext({Date,Math,console:{info(){}},location:{pathname:'/trade'},localStorage:{
    getItem:k=>store.get(k),setItem:(k,v)=>{if(broken)throw Error('quota');store.set(k,v);}}});
  vm.runInContext(logger,c);return c;
}
test('diagnostic history survives a new document and records version, route and time',()=>{
  const store=new Map(),first=makeLogger(store);
  first.logEvent('shop.loading',{missing:['Iron Drill']});
  const second=makeLogger(store);second.logEvent('page.start');
  const events=JSON.parse(store.get('bull-gems-diagnostics-v1'));
  assert.equal(events.length,2);assert.equal(events[0].event,'shop.loading');
  assert.equal(events[0].path,'/trade');assert.equal(events[0].version,'3.2.3');
  assert.ok(Number.isFinite(Date.parse(events[0].at)));
});
test('history is bounded to the last three hundred events',()=>{
  const store=new Map(),c=makeLogger(store);
  for(let i=0;i<310;i++)c.logEvent('tick',{i});
  const events=JSON.parse(store.get('bull-gems-diagnostics-v1'));
  assert.equal(events.length,300);assert.equal(events[0].data.i,10);
});
test('logger excludes credential fields and masks full wallet addresses in messages',()=>{
  const store=new Map(),c=makeLogger(store);
  c.logEvent('test',{token:'sensitive',wallet:'sensitive',nested:{cookie:'sensitive'},
    error:'0x1234567890123456789012345678901234567890 token=abc Bearer abc.def.ghi'});
  const data=JSON.parse(store.get('bull-gems-diagnostics-v1'))[0].data;
  assert.equal(data.token,undefined);assert.equal(data.wallet,undefined);assert.equal(data.nested.cookie,undefined);
  assert.ok(!data.error.includes('1234567890'));assert.ok(!data.error.includes('abc'));
});
test('logging storage failures do not interrupt an operation',()=>{
  const c=makeLogger(new Map(),true);
  assert.doesNotThrow(()=>c.logEvent('shop.loading'));
});
function recovery(pending=null){
  const calls=[];
  const c=vm.createContext({Date,state:{shop:{mine:'Crystal Cavern',pending},next:9999999999999,
    targetMine:'Crystal Cavern',energyWait:{mine:'Crystal Cavern',until:9999999999999}},
    logEvent(){},shopDiagnostics:()=>({missing:['Iron Drill']}),recover:r=>calls.push('recover'),
    persist(){calls.push('persist');},message(){},navigate:u=>calls.push(u),MINING_URL:'mining'});
  vm.runInContext(source.slice(source.indexOf('  function deferShop('),source.indexOf('  async function waitForShop(')),c);
  c.deferShop('empty catalogue');return {c,calls};
}
test('empty shop returns to Mining and sets a five minute retry without losing energy wait',()=>{
  const before=Date.now(),r=recovery();
  assert.deepEqual(r.calls,['persist','mining']);
  assert.equal(r.c.state.shop,null);assert.equal(r.c.state.phase,'deploy');
  assert.ok(r.c.state.shopRetryAt>=before+300000&&r.c.state.shopRetryAt<=Date.now()+300000);
  assert.equal(r.c.state.energyWait.mine,'Crystal Cavern');assert.equal(r.c.state.next,9999999999999);
});
test('uncertain purchase is preserved separately while mining can continue',()=>{
  const pending={name:'Iron Drill',price:350},r=recovery(pending);
  assert.deepEqual(r.calls,['persist','mining']);assert.equal(r.c.state.shop,null);
  assert.equal(r.c.state.purchaseReview,pending);assert.equal(r.c.state.phase,'deploy');
});
test('shop backoff skips navigation across subsequent deployment rounds, then retries when due',()=>{
  const calls=[];
  const c=vm.createContext({Date,state:{shopRetryAt:Date.now()+300000,phase:'shop',shopRequested:true},
    logEvent(){},persist(){},message(){},busy:false,next:0,MINES:[{name:'Greenstone Quarry'}],
    SHOP_URL:'shop',navigate:u=>calls.push(u)});
  vm.runInContext(source.slice(source.indexOf('  function startShop('),source.indexOf('  async function waitForMine(')),c);
  c.startShop();assert.deepEqual(calls,[]);assert.equal(c.state.phase,'deploy');
  c.state.phase='shop';c.startShop();assert.deepEqual(calls,[]);
  c.state.shopRetryAt=Date.now()-1;c.startShop();assert.deepEqual(calls,['shop']);
});
test('new shop jobs restore suspended purchases before considering any new item',()=>{
  const pending={name:'Iron Drill',price:350};
  const c=vm.createContext({Date,state:{purchaseReview:pending},logEvent(){},persist(){},message(){},busy:false,next:0,
    MINES:[{name:'Greenstone Quarry'}],SHOP_URL:'shop',navigate(){}});
  vm.runInContext(source.slice(source.indexOf('  function startShop('),source.indexOf('  async function waitForMine(')),c);
  c.startShop();assert.equal(c.state.shop.pending,pending);
  c.startShop();assert.equal(c.state.shop.pending,pending);
});
