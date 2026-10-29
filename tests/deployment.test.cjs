const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'bull-gems-auto-miner.user.js'), 'utf8');
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
async function simulate(results, retryAt = 0) {
  const calls = [], errors = [];
  const context = vm.createContext({enabled:true,recovering:false,busy:false,collecting:false,
    generation:1,waitingEnergy:false,next:0,intervalMinutes:10,onMining:()=>true,
    crystalRetryAt:retryAt,CRYSTAL_RETRY_KEY:'bull-gems-crystal-retry-at',localStorage:{setItem(){},removeItem(){}},
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
  assert.ok(r.context.crystalRetryAt >= before+1800000 && r.context.crystalRetryAt <= Date.now()+1800000);
});
test('Greenstone success does not recheck Crystal during cooldown', async () => {
  const retryAt = Date.now()+1800000;
  const r = await simulate([{kind:'success'}], retryAt);
  assert.deepEqual(r.calls, ['Greenstone Quarry']);
  assert.equal(r.context.crystalRetryAt, retryAt);
});
test('expired Crystal cooldown restores priority', async () => {
  const r = await simulate([{kind:'success'}], Date.now()-1);
  assert.deepEqual(r.calls, ['Crystal Cavern']);
  assert.equal(r.context.crystalRetryAt, 0);
});
