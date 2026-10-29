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
