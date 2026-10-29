const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','bull-gems-auto-miner.user.js'),'utf8');
const start=source.indexOf('  setInterval(() => {');
const tickSource=source.slice(start,source.indexOf('  }, 1000);',start)+12);
function scheduler(overrides={}){
  const calls=[];
  const c=vm.createContext({Date,Math,console,logEvent(){},diagnosticState(){return {};},lastHeartbeat:Date.now(),enabled:true,busy:false,collecting:false,recovering:false,next:0,intervalMinutes:10,
    navigationStarted:0,state:{mines:{}},countdown:{textContent:''},redirectToMining:()=>false,onShop:()=>false,
    findButton:()=>[],usable:()=>true,visible:()=>true,document:{querySelectorAll:()=>[]},targetEnergyReady:()=>false,dueUpgrade:()=>({name:'Crystal Cavern'}),
    startShop:()=>calls.push('shop'),collectRewards:()=>calls.push('claim'),run:()=>calls.push('deploy'),runShop:()=>calls.push('shopRun'),
    closeRewardObstruction:()=>calls.push('close'),recover:()=>calls.push('recover'),
    setInterval:f=>{c.tick=f;},...overrides});
  vm.runInContext(tickSource,c);c.tick();return {calls,c};
}
test('ready reward takes priority over due shop visit and deployment',()=>{
  assert.deepEqual(scheduler({findButton:label=>label==='collect rewards'?[{}]:[]}).calls,['claim']);
});
test('each new round checks shop before deployment without an upgrade timer',()=>assert.deepEqual(scheduler({dueUpgrade:()=>null}).calls,['shop']));
test('drilling positions without ready reward do not block deployment',()=>{
  assert.deepEqual(scheduler({state:{mines:{},phase:'deploy'},dueUpgrade:()=>null}).calls,['deploy']);
});
test('busy purchase or deployment prevents any simultaneous action',()=>assert.deepEqual(scheduler({busy:true}).calls,[]));
test('ongoing claim prevents shop and deployment',()=>assert.deepEqual(scheduler({collecting:true}).calls,[]));
test('recovery blocks new clicks',()=>assert.deepEqual(scheduler({recovering:true}).calls,[]));
test('stopped state never buys or deploys',()=>assert.deepEqual(scheduler({enabled:false}).calls,[]));
test('pending navigation blocks both shop actions and new route requests',()=>{
  const r=scheduler({navigationStarted:Date.now(),onShop:()=>true,redirectToMining:()=>{throw Error('must not restart navigation');}});
  assert.deepEqual(r.calls,[]);
});
test('stalled navigation reloads only after sixty seconds',()=>{
  let reloads=0;
  const r=scheduler({navigationStarted:Date.now()-61000,location:{reload(){reloads++;}}});
  r.c.tick();
  assert.equal(reloads,1);assert.deepEqual(r.calls,[]);
});
test('shop route runs only the shop executor',()=>assert.deepEqual(scheduler({onShop:()=>true}).calls,['shopRun']));
test('returning from shop proceeds to deployment instead of reopening shop',()=>{
  assert.deepEqual(scheduler({state:JSON.parse(JSON.stringify({mines:{},phase:'deploy',shopRequested:false}))}).calls,['deploy']);
});
test('a new reward forces another shop check before deployment',()=>{
  assert.deepEqual(scheduler({state:{mines:{},phase:'shop',shopRequested:true},next:Date.now()+600000}).calls,['shop']);
});
test('waiting round does not visit shop repeatedly before its next time',()=>{
  assert.deepEqual(scheduler({state:{mines:{},phase:'shop',shopRequested:false},next:Date.now()+600000}).calls,[]);
});
test('target energy reaching cost wakes the waiting round without selecting a lower mine',()=>{
  const r=scheduler({state:{mines:{},phase:'shop',targetMine:'Crystal Cavern',energyWait:{mine:'Crystal Cavern'}},
    next:Date.now()+300000,targetEnergyReady:()=>true,persist(){}});
  assert.deepEqual(r.calls,['shop']);assert.equal(r.c.state.targetMine,'Crystal Cavern');
  assert.equal(r.c.state.energyWait,null);
});
test('shop completion preserves energy wait but advances the persistent phase',()=>{
  const c=vm.createContext({MINES:[{name:'Greenstone Quarry',minutes:10}],Date,
    state:{mines:{},shop:{mine:'Greenstone Quarry'},next:Date.now()+300000,waitReason:'energy'},
    persist(){},message(){},logEvent(){},diagnosticState(){return {};},navigate(){},MINING_URL:'mining'});
  const before=c.state.next;
  vm.runInContext(source.slice(source.indexOf('  function finishShop('),source.indexOf('  async function runShop(')),c);
  c.finishShop({power:10});
  assert.equal(c.state.phase,'deploy');assert.equal(c.state.shop,null);
  assert.equal(c.state.next,before);assert.equal(c.state.waitReason,'energy');
});

const shopSource=source.slice(source.indexOf('  async function runShop()'),source.indexOf('  function setEnabled('));
async function shopRun(overrides={}){
  const calls=[];
  const button={scrollIntoView(){},click(){calls.push('click');}};
  const item={name:'Iron Drill',price:350,gain:6,owned:false,canPurchase:true,button};
  let confirmed=false;
  const c=vm.createContext({console,Math,Date,logEvent(){},enabled:true,busy:false,collecting:false,recovering:false,generation:1,
    onShop:()=>true,state:{shop:{mine:'Crystal Cavern',pending:null}},active:()=>true,EQUIPMENT:['Iron Drill'],
    waitForShop:async()=>true,document:{querySelectorAll:()=>[]},visible:()=>true,
    shopAccount:()=>({balance:1000,power:4,level:5}),equipmentItem:()=>item,
    chooseEquipment:()=>confirmed?null:item,message:()=>{},sleep:async()=>{},usable:()=>true,
    persist:()=>calls.push('persist'),recover:()=>calls.push('recover'),finishShop:()=>calls.push('return'),
    confirmPurchase:async()=>{calls.push('confirm');confirmed=true;return true;},...overrides});
  vm.runInContext(shopSource,c);await c.runShop();return calls;
}
test('purchase journal is saved before click and result confirmed before return',async()=>{
  assert.deepEqual(await shopRun(),['persist','click','confirm','return']);
});
test('unconfirmed prior purchase blocks any new purchase',async()=>{
  assert.deepEqual(await shopRun({state:{shop:{mine:'Crystal Cavern',pending:{name:'Iron Drill'}}},confirmPurchase:async()=>false}),[]);
});
test('failed journal persistence prevents purchase submission',async()=>{
  assert.deepEqual(await shopRun({persist:()=>{throw Error('storage unavailable');},console:{error() {}}}),['recover']);
});
test('empty shop pauses 3-5 seconds before returning',async()=>{
  const pauses=[];
  const calls=await shopRun({chooseEquipment:()=>null,sleep:async ms=>pauses.push(ms)});
  assert.deepEqual(calls,['return']);
  assert.equal(pauses.length,1);assert.ok(pauses[0]>=3000&&pauses[0]<=5000);
});
test('stop during empty shop pause cancels return navigation',async()=>{
  let running=true;
  const calls=await shopRun({chooseEquipment:()=>null,active:()=>running,sleep:async()=>{running=false;}});
  assert.deepEqual(calls,[]);
});
