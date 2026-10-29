const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'bull-gems-auto-miner.user.js'), 'utf8');
const mines = JSON.parse(JSON.stringify(vm.runInNewContext('(' + source.match(/const MINES = (\[[\s\S]*?\]);/)[1] + ')')));
const classify = source.slice(source.indexOf('  function deploymentStatus('), source.indexOf('  async function attemptMine('));
const ctx = vm.createContext({});
vm.runInContext(classify, ctx);
test('Crystal power deficit takes priority over energy deficit', () => {
  assert.equal(ctx.deploymentStatus('Mining power req.\n25 / 2 PWR\nNeed 14 more energy', false).kind, 'blocked');
});
test('energy deficit becomes minutes only when power requirement is met', () => {
  const result = ctx.deploymentStatus('Mining power req.\n25 / 30 PWR\nNeed 3 more energy', false);
  assert.equal(result.kind, 'energy'); assert.equal(result.minutes, 3);
});
test('enabled miner is ready with sufficient power', () => {
  assert.equal(ctx.deploymentStatus('Mining power req.\n25 / 30 PWR', true).kind, 'ready');
});
test('loading button is pending instead of a confirmed restriction', () => {
  assert.equal(ctx.deploymentStatus('Mining power req.\n25 / 30 PWR\nDeploying…', false).kind, 'pending');
});
test('explicit unmet requirement is blocked', () => {
  assert.equal(ctx.deploymentStatus('Possible rewards\nNeed 23 more PWR', false).kind, 'blocked');
});

const runSource = source.slice(source.indexOf('  async function run()'), source.indexOf('  function setEnabled('));
async function simulate(results, retryAt = 0, level = 5) {
  const calls = [], errors = [];
  const context = vm.createContext({enabled:true,recovering:false,busy:false,collecting:false,
    generation:1,waitingEnergy:false,next:0,intervalMinutes:10,onMining:()=>true,
    state:{mines:retryAt ? {'Crystal Cavern':{retryAt,shopAt:0,power:0}} : {},shop:null,next:0},persist(){},
    loadMineCatalogue:async()=>true,unlockedMines:()=>mines.filter(m=>m.level<=level),
    findButton:()=>[],usable:()=>true,document:{body:{innerText:''}},
    active:()=>true,interval:()=>600000,Date,Math,console,message:()=>{},sleep:async()=>{},
    recover:r=>errors.push(r),attemptMine:async(id,mine)=>{calls.push(mine); return results[calls.length-1];}});
  vm.runInContext(runSource, context);
  await context.run();
  return {calls,errors,context};
}
test('Crystal success does not consume Greenstone energy', async () => {
  const r = await simulate([{kind:'success'}]);
  assert.deepEqual(r.calls, ['Crystal Cavern']); assert.equal(r.context.busy, false);
});
test('Crystal restriction falls back to Greenstone', async () => {
  const r = await simulate([{kind:'blocked'},{kind:'success'}]);
  assert.deepEqual(r.calls, ['Crystal Cavern','Greenstone Quarry']); assert.deepEqual(r.errors, []);
});
test('Crystal energy deficit also falls back', async () => {
  const r = await simulate([{kind:'energy',minutes:12},{kind:'success'}]);
  assert.equal(r.calls.length, 2); assert.equal(r.context.waitingEnergy, false);
});
test('both energy deficits wait using Greenstone deficit', async () => {
  const before = Date.now();
  const r = await simulate([{kind:'energy',minutes:12},{kind:'energy',minutes:2}]);
  assert.equal(r.context.waitingEnergy, true);
  assert.ok(r.context.next >= before+120000 && r.context.next <= Date.now()+120000);
});
test('unknown page failure recovers instead of silently switching mines', async () => {
  const r = await simulate([{kind:'error',reason:'unexpected dialog'}]);
  assert.equal(r.calls.length, 1); assert.deepEqual(r.errors, ['unexpected dialog']);
});
test('Crystal fallback starts a 30 minute cooldown', async () => {
  const before = Date.now();
  const r = await simulate([{kind:'blocked'},{kind:'success'}]);
  assert.ok(r.context.state.mines['Crystal Cavern'].retryAt >= before+1800000 && r.context.state.mines['Crystal Cavern'].retryAt <= Date.now()+1800000);
});
test('Greenstone success does not recheck Crystal during cooldown', async () => {
  const retryAt = Date.now()+1800000;
  const r = await simulate([{kind:'success'}], retryAt);
  assert.deepEqual(r.calls, ['Greenstone Quarry']);
  assert.equal(r.context.state.mines['Crystal Cavern'].retryAt, retryAt);
});
test('expired Crystal cooldown restores priority', async () => {
  const r = await simulate([{kind:'success'}], Date.now()-1);
  assert.deepEqual(r.calls, ['Crystal Cavern']);
  assert.equal(r.context.state.mines['Crystal Cavern'], undefined);
});
test('PWR shortage schedules shop after the mine duration',async()=>{
  const r=await simulate([{kind:'blocked',requiredPower:25,reason:'矿力不足'},{kind:'success'}]);
  const job=r.context.state.mines['Crystal Cavern'];
  assert.equal(job.shopAt,job.retryAt); assert.equal(job.power,25);
  assert.ok(job.shopAt>Date.now()+1799000);
});
for (const mine of mines.filter(m=>m.level>1)) {
  test(`${mine.name} PWR shortage uses ${mine.minutes} minute upgrade delay`,async()=>{
    const before=Date.now();
    const r=await simulate([{kind:'blocked',requiredPower:999,reason:'矿力不足'},{kind:'success'}],0,mine.level);
    assert.equal(r.calls[0],mine.name);
    assert.ok(r.context.state.mines[mine.name].shopAt>=before+mine.minutes*60000);
  });
}
