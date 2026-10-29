const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'bull-gems-auto-miner.user.js'), 'utf8');
// Exercise the actual startup navigation before the script initializes the DOM.
const startup = source.slice(0, source.indexOf('  let intervalMinutes')) + '\n})();';

for (const pathname of ['/', '/quests', '/swap', '/mining-extra']) {
  test(`${pathname} redirects to Mining`, () => {
    const destinations = [];
    vm.runInNewContext(startup, { location: { pathname, replace: url => destinations.push(url) } });
    assert.deepEqual(destinations, ['https://gem.bullshot.io/mining']);
  });
}
for (const pathname of ['/mining', '/mining/']) {
  test(`${pathname} stays in place`, () => {
    const destinations = [];
    vm.runInNewContext(startup, { location: { pathname, replace: url => destinations.push(url) } });
    assert.deepEqual(destinations, []);
  });
}
test('userscript matches only the Bull Gems HTTPS origin', () => {
  assert.deepEqual([...source.matchAll(/^\/\/ @match\s+(.+)$/gm)].map(m => m[1].trim()), ['https://gem.bullshot.io/*']);
});
for (const pathname of ['/trade','/mining']) {
  test(`active scheduled shop visit permits /trade from ${pathname}`,()=>{
    const destinations=[];
    const storage={getItem:key=>key==='bull-gems-auto-deploy-enabled-v1' ? 'true' : key==='bull-gems-upgrade-state-v3' ? JSON.stringify({mines:{},shop:{mine:'Crystal Cavern'}}) : null};
    vm.runInNewContext(startup,{localStorage:storage,location:{pathname,replace:url=>destinations.push(url)}});
    assert.deepEqual(destinations,pathname==='/trade' ? [] : ['https://gem.bullshot.io/trade']);
  });
}
test('stopped automation never uses a stale shop intent to purchase',()=>{
  const destinations=[];
  vm.runInNewContext(startup,{localStorage:{getItem:key=>key==='bull-gems-upgrade-state-v3' ? JSON.stringify({mines:{},shop:{mine:'Crystal Cavern'}}) : 'false'},location:{pathname:'/trade',replace:url=>destinations.push(url)}});
  assert.deepEqual(destinations,['https://gem.bullshot.io/mining']);
});
test('new strategy discards old fallback deadlines without deleting pending purchase',()=>{
  let written;
  const pending={name:'Iron Drill',price:350};
  const storage={getItem:key=>key==='bull-gems-auto-deploy-enabled-v1'?'true':key==='bull-gems-upgrade-state-v3'?JSON.stringify({mines:{'Crystal Cavern':{retryAt:9999999999999}},fallback:{mine:'Greenstone Quarry'},shop:{mine:'Crystal Cavern',pending}}):null,
    setItem:(key,value)=>{if(key==='bull-gems-upgrade-state-v3')written=JSON.parse(value);}};
  vm.runInNewContext(startup,{localStorage:storage,location:{pathname:'/trade',replace(){}}});
  assert.equal(written.strategy,'power-first');assert.deepEqual(written.mines,{});
  assert.equal(written.fallback,null);assert.deepEqual(written.shop.pending,pending);
});
