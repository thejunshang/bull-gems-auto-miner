const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','bull-gems-auto-miner.user.js'),'utf8');
const equipment=JSON.parse(JSON.stringify(vm.runInNewContext('('+source.match(/const EQUIPMENT = (\[[^\n]+\]);/)[1]+')')));
const ctx=vm.createContext({EQUIPMENT:equipment});
vm.runInContext(source.slice(source.indexOf('  function parseShopAccount('),source.indexOf('  function shopAccount(')),ctx);
vm.runInContext(source.slice(source.indexOf('  function purchaseConfirmed('),source.indexOf('  async function confirmPurchase(')),ctx);
const item=(name,gain,price,level=1,owned=false,canPurchase=true)=>({name,gain,price,level,owned,canPurchase});
test('reads current shop account labels',()=>{
  const a=ctx.parseShopAccount('GEMS Balance\n1,873.40\nMiner Level\nLvl 5\nMining Power\n10 PWR');
  assert.equal(a.balance,1873.4); assert.equal(a.level,5);assert.equal(a.power,10);
});
test('missing balance prevents purchases',()=>assert.equal(ctx.parseShopAccount('Mining Power\n10 PWR'),null));
test('owned equipped item is never selected',()=>{
  const parsed=ctx.parseEquipment('Iron Pickaxe','+2 PWR\nOwned\nIron Pickaxe\nPrice\n100\nEquipped',false);
  assert.equal(parsed.owned,true);assert.equal(ctx.chooseEquipment([parsed],{balance:999,level:5}),null);
});
test('highest affordable PWR wins, not cheapest price per PWR',()=>{
  const c=ctx.chooseEquipment([item('Iron Pickaxe',2,100),item('Iron Drill',6,350),item('Copper Turbo Drill',15,1000,6)],{balance:1500,level:6});
  assert.equal(c.name,'Copper Turbo Drill');
});
test('level restriction excludes high-PWR tool',()=>{
  assert.equal(ctx.chooseEquipment([item('Iron Drill',6,350),item('Copper Turbo Drill',15,1000,6)],{balance:2000,level:5}).name,'Iron Drill');
});
test('insufficient funds falls back to affordable equipment',()=>{
  assert.equal(ctx.chooseEquipment([item('Iron Pickaxe',2,100),item('Iron Drill',6,350)],{balance:100,level:5}).name,'Iron Pickaxe');
});
test('energy pack and unrecognized equipment are excluded',()=>{
  assert.equal(ctx.chooseEquipment([item('Energy Pack',999,1),item('Mystery',999,1)],{balance:1000,level:99}),null);
});
test('zero, invalid or unaffordable prices never purchase',()=>{
  for(const price of [0,-1,NaN,Infinity,1001])assert.equal(ctx.chooseEquipment([item('Iron Drill',6,price)],{balance:1000,level:5}),null);
});
test('single purchase is confirmed only by owned, debit and PWR increase together',()=>{
  const p={beforeBalance:2223.4,beforePower:4,price:350,gain:6};
  assert.equal(ctx.purchaseConfirmed(p,{owned:true},{balance:1873.4,power:10}),true);
  assert.equal(ctx.purchaseConfirmed(p,{owned:false},{balance:1873.4,power:10}),false);
  assert.equal(ctx.purchaseConfirmed(p,{owned:true},{balance:2223.4,power:10}),false);
  assert.equal(ctx.purchaseConfirmed(p,{owned:true},{balance:1873.4,power:4}),false);
});
test('shop preserves selected mine and energy wait after PWR purchase',()=>{
  const until=Date.now()+420000;
  const c=vm.createContext({Date,state:{shop:{mine:'Crystal Cavern'},next:until,waitReason:'energy',targetMine:'Crystal Cavern',energyWait:{mine:'Crystal Cavern',until}},
    persist(){},message(){},MINING_URL:'mining',location:{assign(){}}});
  vm.runInContext(source.slice(source.indexOf('  function finishShop('),source.indexOf('  async function runShop(')),c);
  c.finishShop({power:25});
  assert.equal(c.state.phase,'deploy');assert.equal(c.state.next,until);
  assert.equal(c.state.targetMine,'Crystal Cavern');assert.equal(c.state.energyWait.until,until);
  assert.equal(c.state.lastShopPower,25);
});
