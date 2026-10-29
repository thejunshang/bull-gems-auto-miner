const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','bull-gems-auto-miner.user.js'),'utf8');
const helpers=source.slice(source.indexOf('  function readSidebarAccount('),source.indexOf('  async function loadMineCatalogue('));
const c=vm.createContext({});vm.runInContext(helpers,c);
test('reads real sidebar values separately from default main-page values',()=>{
  const side=c.readSidebarAccount('LVL 5\n0 / 1118 XP\nGEMS\n2,033.1\nENERGY\n91\nMULTIPLIER\n1.9x\nPOWER\n10 PWR');
  assert.equal(side.level,5);assert.equal(side.power,10);assert.equal(side.energy,91);assert.equal(side.balance,2033.1);
  assert.equal(c.accountMatches({power:0,energy:0},side,'mining'),false);
  assert.equal(c.accountMatches({power:10,energy:91},side,'mining'),true);
  assert.equal(c.accountMatches({level:1,power:0,balance:2033.1},side,'shop'),false);
  assert.equal(c.accountMatches({level:5,power:10,balance:2033.1},side,'shop'),true);
});
test('missing account fields are not interpreted as zero',()=>{
  assert.equal(c.accountMatches({power:0,energy:0},c.readSidebarAccount(''),'mining'),false);
});
test('dialog placeholder energy cannot schedule a false ten-minute wait',()=>{
  const text='Energy cost\n10 / 0\nMining power req.\n0 / 10 PWR';
  assert.equal(c.dialogAccountMatches(text,{energy:91,power:10}),false);
  assert.equal(c.dialogAccountMatches(text,{energy:0,power:10}),true);
});
test('unloaded Crystal lock cannot downgrade a level-five account with sufficient PWR',()=>{
  const x=vm.createContext({MINES:[{name:'Crystal Cavern',level:4},{name:'Greenstone Quarry',level:1}],
    sidebarAccount:()=>({level:5,power:25,energy:30}),miningAccount:()=>({power:25,energy:30}),
    unlockedMines:()=>[{name:'Greenstone Quarry'}]});
  vm.runInContext(helpers,x);
  x.sidebarAccount=()=>({level:5,power:25,energy:30});x.miningAccount=()=>({power:25,energy:30});
  assert.equal(x.miningDataReady(),false);
  x.unlockedMines=()=>[{name:'Crystal Cavern'},{name:'Greenstone Quarry'}];assert.equal(x.miningDataReady(),true);
});
test('known owned equipment cannot become purchasable during hydration',()=>{
  const button={textContent:'Purchase'};
  const x=vm.createContext({state:{ownedEquipment:['Iron Drill']},cardFor:()=>({innerText:'placeholder',querySelectorAll:()=>[button]}),
    visible:()=>true,usable:()=>true,parseEquipment:()=>({name:'Iron Drill',owned:false,canPurchase:true})});
  vm.runInContext(source.slice(source.indexOf('  function equipmentItem('),source.indexOf('  function shopDiagnostics(')),x);
  const item=x.equipmentItem('Iron Drill');assert.equal(item.owned,true);assert.equal(item.canPurchase,false);
});
