const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','bull-gems-auto-miner.user.js'),'utf8');
const mines=JSON.parse(JSON.stringify(vm.runInNewContext('('+source.match(/const MINES = (\[[\s\S]*?\]);/)[1]+')')));
const requirements={'Void Rift':250,'Frozen Depths':120,'Ember Mine':60,'Crystal Cavern':25,'Greenstone Quarry':0};
const classify=source.slice(source.indexOf('  function deploymentStatus('),source.indexOf('  async function attemptMine('));
const ctx=vm.createContext({});
vm.runInContext(classify,ctx);
test('PWR deficit is distinct from energy deficit',()=>{
  assert.equal(ctx.deploymentStatus('Mining power req.\n25 / 2 PWR\nNeed 14 more energy',false).kind,'blocked');
  assert.equal(ctx.deploymentStatus('Mining power req.\n25 / 30 PWR\nNeed 3 more energy',false).kind,'energy');
});
test('qualified enabled deployment is ready',()=>assert.equal(ctx.deploymentStatus('Mining power req.\n25 / 30 PWR',true).kind,'ready'));
for (const [power,name] of [[0,'Greenstone Quarry'],[10,'Greenstone Quarry'],[24,'Greenstone Quarry'],[25,'Crystal Cavern'],[60,'Ember Mine'],[120,'Frozen Depths'],[250,'Void Rift']]){
  test('highest PWR-qualified mine at '+power+' is '+name,()=>assert.equal(ctx.choosePowerMine(mines,power,requirements).name,name));
}
test('unavailable/locked mines cannot be selected even with enough PWR',()=>{
  assert.equal(ctx.choosePowerMine(mines.filter(m=>m.level<=5),250,requirements).name,'Crystal Cavern');
});
test('unknown higher mine requirement never silently downgrades',()=>{
  assert.throws(()=>ctx.choosePowerMine(mines,250,{}),/PWR/);
});
test('unknown account PWR fails closed',()=>assert.throws(()=>ctx.choosePowerMine(mines,NaN,requirements),/PWR/));
const runSource=source.slice(source.indexOf('  async function run()'),source.indexOf('  function setEnabled('));
async function simulate(result,power=25,level=5){
  const calls=[],errors=[];
  const c=vm.createContext({Date,Math,console,enabled:true,recovering:false,busy:false,collecting:false,generation:1,
    waitingEnergy:false,next:0,intervalMinutes:10,state:{mines:{},shop:null,next:0},persist(){},onMining:()=>true,
    active:()=>true,interval:()=>600000,loadMineCatalogue:async()=>true,unlockedMines:()=>mines.filter(m=>m.level<=level),
    miningPower:()=>power,powerRequirements:()=>requirements,choosePowerMine:ctx.choosePowerMine,
    findButton:()=>[],usable:()=>true,document:{body:{innerText:''}},message(){},sleep:async()=>{},
    recover:r=>errors.push(r),attemptMine:async(id,name)=>{calls.push(name);return result;}});
  vm.runInContext(runSource,c);await c.run();return {calls,errors,c};
}
test('Crystal energy shortage waits there and never deploys Greenstone',async()=>{
  const before=Date.now();
  const r=await simulate({kind:'energy',minutes:7});
  assert.deepEqual(r.calls,['Crystal Cavern']);assert.equal(r.c.state.targetMine,'Crystal Cavern');
  assert.equal(r.c.state.waitReason,'energy');assert.equal(r.c.state.energyWait.mine,'Crystal Cavern');
  assert.ok(r.c.next>=before+420000&&r.c.next<=Date.now()+420000);
});
test('Ember energy shortage never downgrades to Crystal or Greenstone',async()=>{
  const r=await simulate({kind:'energy',minutes:12},60,8);
  assert.deepEqual(r.calls,['Ember Mine']);assert.equal(r.c.state.energyWait.mine,'Ember Mine');
});
test('Crystal PWR unavailable selects Greenstone without opening Crystal',async()=>{
  const r=await simulate({kind:'success'},10);
  assert.deepEqual(r.calls,['Greenstone Quarry']);assert.equal(r.c.state.targetMine,'Greenstone Quarry');
});
test('success still schedules seconds and the next shop phase',async()=>{
  const before=Date.now(),r=await simulate({kind:'success'});
  assert.ok(r.c.next>=before+4000&&r.c.next<=Date.now()+6000);
  assert.equal(r.c.state.phase,'shop');assert.equal(r.c.state.waitReason,'success');
});
test('unexpected live condition change does not cause another deployment in the same round',async()=>{
  const r=await simulate({kind:'blocked',requiredPower:26});
  assert.deepEqual(r.calls,['Crystal Cavern']);assert.equal(r.c.state.waitReason,'conditions');
});
test('page failure never pre-saves default ten minute interval',async()=>{
  const r=await simulate({kind:'error',reason:'timeout'});
  assert.ok(r.c.state.next<=Date.now());assert.deepEqual(r.errors,['timeout']);
});
test('action boundary preserves energy wait without touching DOM',async()=>{
  const c=vm.createContext({Date,state:{energyWait:{mine:'Crystal Cavern',until:Date.now()+420000}}});
  vm.runInContext(source.slice(source.indexOf('  async function attemptMine('),source.indexOf('  async function run()')),c);
  assert.equal((await c.attemptMine(1,'Crystal Cavern')).kind,'cooldown');
});
for(const [energy,expected] of [[10,false],[19,false],[20,true],[25,true]]){
  test('Crystal energy threshold at '+energy+' is '+expected,()=>{
    const c=vm.createContext({state:{targetMine:'Crystal Cavern',energyWait:{mine:'Crystal Cavern'}},
      document:{querySelector:()=>({innerText:'Available energy\n'+energy})},cardFor:()=>({innerText:'Energy cost\n20'})});
    vm.runInContext(source.slice(source.indexOf('  function targetEnergyReady('),source.indexOf('  async function attemptMine(')),c);
    assert.equal(c.targetEnergyReady(),expected);
  });
}
const restoreCtx=vm.createContext({Date});
vm.runInContext(source.slice(source.indexOf('  function restoredDeploymentTime('),source.indexOf('  function setEnabled(')),restoreCtx);
for(const reason of [undefined,'checking','recovery','ready']){
  test('refresh discards provisional '+reason+' wait',()=>assert.equal(restoreCtx.restoredDeploymentTime({next:610000,waitReason:reason},10000),10000));
}
for(const reason of ['manual','energy','conditions','cooldown']){
  test('refresh preserves confirmed '+reason+' wait',()=>assert.equal(restoreCtx.restoredDeploymentTime({next:610000,waitReason:reason},10000),610000));
}
test('success recovery is capped at six seconds',()=>assert.equal(restoreCtx.restoredDeploymentTime({next:610000,waitReason:'success'},10000),16000));
