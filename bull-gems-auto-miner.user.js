// ==UserScript==
// @name         Bull Gems 自动部署与领取
// @namespace    local.bull-gems
// @homepageURL  https://github.com/thejunshang/bull-gems-auto-miner
// @supportURL   https://github.com/thejunshang/bull-gems-auto-miner/issues
// @downloadURL  https://raw.githubusercontent.com/thejunshang/bull-gems-auto-miner/main/bull-gems-auto-miner.user.js
// @updateURL    https://raw.githubusercontent.com/thejunshang/bull-gems-auto-miner/main/bull-gems-auto-miner.user.js
// @version      3.1.0
// @description  优先领取、检查商店购买矿力装备、部署允许的最高级矿区，串行操作与异常恢复。
// @match        https://gem.bullshot.io/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  'use strict';
  const MINING_URL = 'https://gem.bullshot.io/mining';
  const SHOP_URL = 'https://gem.bullshot.io/trade';
  const KEY = 'bull-gems-auto-deploy-enabled-v1';
  const STATE_KEY = 'bull-gems-upgrade-state-v3';
  const MINES = [
    {name:'Void Rift',minutes:480,level:20},
    {name:'Frozen Depths',minutes:240,level:14},
    {name:'Ember Mine',minutes:90,level:8},
    {name:'Crystal Cavern',minutes:30,level:4},
    {name:'Greenstone Quarry',minutes:10,level:1}
  ];
  const EQUIPMENT = ['Iron Pickaxe','Iron Drill','Copper Turbo Drill','Ruby Laser','Cryo Plasma Drill','Void Annihilator'];
  let state = {mines:{},shop:null,next:0,fallback:null,phase:'shop',shopRequested:false};
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
    if (saved && typeof saved === 'object' && saved.mines && typeof saved.mines === 'object') state = {...state,...saved};
    if (state.shop && !MINES.some(m => m.name === state.shop.mine)) state.shop = null;
    if (!['shop','deploy'].includes(state.phase)) state.phase = 'shop';
  } catch (_) {}
  const persist = () => { localStorage.setItem(STATE_KEY, JSON.stringify(state)); };
  const onShop = () => location.pathname.replace(/\/$/, '') === '/trade';
  const onMining = () => location.pathname.replace(/\/$/, '') === '/mining';
  function shopAuthorized() {
    try { return Boolean(state.shop) && localStorage.getItem(KEY) === 'true'; } catch (_) { return false; }
  }
  function redirectToMining() {
    if (shopAuthorized()) {
      if (onShop()) return false;
      location.replace(SHOP_URL); return true;
    }
    if (onMining()) return false;
    location.replace(MINING_URL);
    return true;
  }
  // Scope stays on Bull Gems; never redirect unrelated browsing tabs.
  if (redirectToMining()) return;
  let intervalMinutes = 10;
  // Carry forward a v2 Crystal cooldown without visiting the shop prematurely.
  try {
    const savedRetry = Number(localStorage.getItem('bull-gems-crystal-retry-at'));
    if (!state.mines['Crystal Cavern'] && Number.isFinite(savedRetry) && savedRetry > Date.now()) {
      state.mines['Crystal Cavern'] = {retryAt:savedRetry,shopAt:0,power:0}; persist();
    }
  } catch (_) {}
  try { intervalMinutes = Number(localStorage.getItem('bull-gems-wait-minutes')) || 10; } catch (_) {}
  if (intervalMinutes < 0.1 || intervalMinutes > 1440) intervalMinutes = 10;
  const interval = () => intervalMinutes * 60 * 1000;
  if (window.__bullGemsAutoDeploy) return;
  window.__bullGemsAutoDeploy = true;
  let enabled = false, busy = false, next = Number(state.next) || 0, generation = 0, waitingEnergy = false;
  let collecting = false;
  let recovering = false;
  let recoveryTimer;
  const collectAttempts = new WeakMap();
  let lastCollect = 0;
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#101710;color:#fff;border:1px solid #baff31;border-radius:12px;padding:14px;font:14px/1.6 sans-serif;box-shadow:0 3px 20px #0008;width:250px';
  const title = document.createElement('strong');
  title.textContent = 'Bull Gems 自动挖矿与升级 v3.1';
  const status = document.createElement('div');
  const countdown = document.createElement('div');
  const settings = document.createElement('div');
  const label = document.createElement('label');
  label.textContent = '等待时间（分钟）：';
  const input = document.createElement('input');
  input.type = 'number'; input.min = '0.1'; input.max = '1440'; input.step = '0.1';
  input.value = String(intervalMinutes);
  input.style.cssText = 'width:65px;color:#111;background:white;margin:6px';
  const apply = document.createElement('button');
  apply.textContent = '更新等待时间';
  label.append(input); settings.append(label, apply);
  const toggle = document.createElement('button');
  toggle.style.cssText = 'margin-top:8px;background:#baff31;color:#111;border:0;border-radius:6px;padding:8px 14px;cursor:pointer';
  panel.append(title, status, countdown, settings, toggle);
  document.body.append(panel);
  const message = text => { status.textContent = text; console.info('[Auto Deploy]', text); };
  const visible = el => el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
  const usable = el => !el.disabled && el.getAttribute('aria-disabled') !== 'true' && !el.closest('[inert]');
  const findButton = label => [...document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]')]
    .filter(el => !panel.contains(el) && visible(el) && (el.innerText || el.value || el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase() === label);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const active = id => enabled && generation === id && (onMining() || onShop());
  function recover(reason) {
    if (!enabled || recovering) return;
    recovering = true;
    // Back off repeated page failures without turning off automatic operation.
    let delay = 10000;
    try {
      const previous = JSON.parse(sessionStorage.getItem('bull-gems-recovery') || '{}');
      const count = Date.now() - previous.at < 300000 ? (previous.count || 0) + 1 : 1;
      delay = Math.min(60000, 10000 * count);
      sessionStorage.setItem('bull-gems-recovery', JSON.stringify({at:Date.now(),count}));
      localStorage.setItem(KEY, 'true');
      state.waitReason = 'recovery';
      state.next = 0;
      persist();
    } catch (_) {}
    const id = generation;
    message(`${reason}；${delay / 1000}秒后自动刷新并继续`);
    recoveryTimer = setTimeout(() => {
      if (active(id)) location.reload();
      else recovering = false;
    }, delay);
  }
  let currentMine = 'Crystal Cavern';
  const deployDialog = () => [...document.querySelectorAll('[role="dialog"]')].find(el => visible(el) &&
    [...el.querySelectorAll('h2')].some(h => h.textContent.trim() === `Deploy to ${currentMine}`));
  const closeDeployDialog = () => deployDialog()?.querySelector('button[aria-label="Close"]')?.click();
  const mineDeploy = () => findButton('deploy').filter(usable).filter(button => {
    for (let node = button.parentElement; node && node !== document.body; node = node.parentElement) {
      const headings = [...node.querySelectorAll('h2')];
      if (headings.length) return headings.length === 1 && headings[0].textContent.trim() === currentMine;
    }
    return false;
  });
  function cardFor(name, headingTag) {
    const heading = [...document.querySelectorAll(headingTag)].find(el => visible(el) &&
      el.textContent.trim() === name && !el.closest('[role="dialog"]'));
    for (let node = heading?.parentElement; node && node !== document.body; node = node.parentElement) {
      if (node.querySelector('button') && node.querySelectorAll(headingTag).length === 1) return node;
    }
    return null;
  }
  function unlockedMines() {
    return MINES.filter(mine => {
      const card = cardFor(mine.name, 'h2');
      if (!card) return false;
      const labels = [...card.querySelectorAll('span,div')].map(el => el.textContent.trim().toLowerCase());
      return !labels.includes('locked') && (labels.includes('unlocked') || labels.includes('running'));
    });
  }
  async function loadMineCatalogue(id) {
    const deadline = Date.now() + 60000;
    let scan = 0;
    message('滚动加载矿区列表并检查解锁状态…');
    while (active(id) && onMining() && Date.now() < deadline) {
      const fallback = state.fallback?.until > Date.now() ? state.fallback : null;
      // During fallback, never rescan/scroll through higher mine sections every few seconds.
      const loaded = fallback ? cardFor(fallback.mine,'h2') : MINES.every(m => cardFor(m.name,'h2'));
      if (document.readyState !== 'loading' && loaded) return true;
      const root = document.scrollingElement || document.documentElement;
      const max = Math.max(0, root.scrollHeight - innerHeight);
      scan = scan >= max ? 0 : Math.min(max, scan + Math.max(400,innerHeight * 0.7));
      window.scrollTo({top:scan,behavior:'smooth'});
      await sleep(1200);
    }
    return false;
  }
  function dueUpgrade(mines, now = Date.now()) {
    return MINES.find(m => mines[m.name]?.shopAt > 0 && mines[m.name].shopAt <= now);
  }
  function startShop(mine = null) {
    const target = mine || MINES.find(m => state.mines[m.name]?.power > 0) || MINES[MINES.length-1];
    state.shop = {mine:target.name,startedAt:Date.now(),pending:null};
    state.phase = 'shop';
    state.shopRequested = false;
    state.next = next;
    persist();
    busy = true;
    message('领取处理完成，先检查商店装备，再进行部署');
    location.assign(SHOP_URL);
  }
  async function waitForMine(id) {
    const deadline = Date.now() + 60000;
    let lastJump = 0, scanTop = 0;
    message(`等待页面初始化，并滚动加载 ${currentMine}…`);
    while (active(id) && Date.now() < deadline) {
      if (document.readyState === 'loading') { await sleep(500); continue; }
      const heading = [...document.querySelectorAll('h2')].find(el =>
        visible(el) && el.textContent.trim() === currentMine && !el.closest('[role="dialog"]'));
      if (heading) {
        heading.scrollIntoView({behavior:'smooth', block:'center'});
        await sleep(1200);
        if (!active(id)) return [];
        const buttons = mineDeploy();
        if (buttons.length === 1) {
          buttons[0].scrollIntoView({behavior:'smooth', block:'center'});
          await sleep(800);
          if (!active(id)) return [];
          const current = mineDeploy();
          if (current.length === 1) return current;
        }
      } else {
        const jump = [...document.querySelectorAll('button')].find(el =>
          visible(el) && usable(el) && el.getAttribute('aria-label') === `Jump to ${currentMine}`);
        if (jump && Date.now() - lastJump > 10000) {
          jump.click(); lastJump = Date.now();
        } else {
          // Walk the page to trigger lazy-loaded sections instead of reloading immediately.
          const root = document.scrollingElement || document.documentElement;
          const maxTop = Math.max(0, root.scrollHeight - innerHeight);
          scanTop = scanTop >= maxTop ? 0 : Math.min(maxTop, scanTop + Math.max(400, innerHeight * 0.7));
          window.scrollTo({top:scanTop, behavior:'smooth'});
        }
        await sleep(1200);
      }
    }
    return [];
  }
  async function collectRewards() {
    if (!enabled || recovering || busy || collecting || !active(generation) || Date.now() - lastCollect < 3000) return;
    if (document.querySelector('[role="dialog"]')) return;
    const button = [...findButton('collect rewards'), ...findButton('collect')]
      .find(el => usable(el) && Date.now() - (collectAttempts.get(el) || 0) >= 60000);
    if (!button) return;
    collecting = true;
    const id = generation;
    try {
      if (!active(id)) return;
      collectAttempts.set(button, Date.now());
      lastCollect = Date.now();
      let rewardRow = button.parentElement;
      while (rewardRow && rewardRow !== document.body && !(rewardRow.querySelectorAll('h3').length === 1 && rewardRow.contains(button))) rewardRow = rewardRow.parentElement;
      if (!rewardRow || rewardRow === document.body) { recover('无法识别领取任务卡片'); return; }
      const taskKey = row => (row.innerText.match(/Started:\s*([\s\S]*?)Energy:/i)?.[1] || '').trim();
      const beforeKey = taskKey(rewardRow);
      button.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(600 + Math.random() * 600);
      if (!active(id) || !visible(button) || !usable(button)) return;
      button.click();
      message('已点击 Collect Rewards，等待领取结果…');
      // Keep the sequence locked until this task card is removed or replaced.
      // A disabled/loading button alone does not confirm completion.
      const deadline = Date.now() + 30000;
      let completed = false;
      while (active(id) && Date.now() < deadline) {
        if (!rewardRow.isConnected || (beforeKey && taskKey(rewardRow) && taskKey(rewardRow) !== beforeKey)) { completed = true; break; }
        await sleep(400);
      }
      if (!active(id)) return;
      if (!completed) {
        recover('30秒内未确认领取完成');
        return;
      }
      collectAttempts.delete(button);
      state.phase = 'shop';
      state.shopRequested = true;
      persist();
      const pause = 2500 + Math.random() * 3000;
      message(`已确认任务从卡片移除，停顿${(pause / 1000).toFixed(1)}秒后领取下一个`);
      await sleep(pause);
    } catch (error) {
      console.error('[Auto Collect]', error);
      if (active(id)) {
        recover('领取出现错误');
      }
    } finally { collecting = false; }
  }
  apply.addEventListener('click', () => {
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < 0.1 || value > 1440) { message('请输入0.1到1440分钟'); return; }
    intervalMinutes = value;
    try { localStorage.setItem('bull-gems-wait-minutes', String(value)); } catch (_) {}
    if (enabled) next = Date.now() + interval();
    state.next = next;
    state.waitReason = 'manual';
    try { persist(); } catch (_) {}
    message(`等待时间已更新为${value}分钟，从现在重新计时`);
  });
  function deploymentStatus(text, enabledButton) {
    const energy = text.match(/Need\s+(\d+(?:\.\d+)?)\s+more\s+energy/i);
    const power = text.match(/Mining power req\.\s*([\d.]+)\s*\/\s*([\d.]+)\s*PWR/i);
    if (power && Number(power[1]) > Number(power[2])) return {kind:'blocked', reason:'矿力不足', requiredPower:Number(power[1])};
    if (energy) return {kind:'energy', minutes:Number(energy[1])};
    if (/need|require|insufficient|locked/i.test(text.split('Possible rewards').pop()) && !enabledButton) return {kind:'blocked', reason:'部署条件不足'};
    return {kind:enabledButton ? 'ready' : 'pending'};
  }
  function blockedUntil(name, now = Date.now()) {
    let until = Number(state.mines[name]?.retryAt) || 0;
    const fallback = state.fallback;
    const index = MINES.findIndex(m => m.name === name);
    const fallbackIndex = MINES.findIndex(m => m.name === fallback?.mine);
    if (index >= 0 && fallbackIndex >= 0 && index < fallbackIndex && fallback.until > now) until = Math.max(until,fallback.until);
    return until;
  }
  function selectMines(unlocked, now = Date.now()) {
    return unlocked.filter(m => blockedUntil(m.name,now) <= now);
  }
  async function attemptMine(id, mine) {
    // Enforce the cooldown at the action boundary too, before any scroll or click.
    const until = blockedUntil(mine);
    if (until > Date.now()) return {kind:'cooldown',until};
    currentMine = mine;
    if (!deployDialog()) {
      if ([...document.querySelectorAll('[role="dialog"]')].some(visible)) return {kind:'error', reason:'存在其他弹窗，请关闭后重试'};
      const buttons = await waitForMine(id);
      if (!active(id)) return {kind:'cancelled'};
      if (buttons.length !== 1) return {kind:'error', reason:`未找到唯一的 ${mine} Deploy`};
      buttons[0].click();
      message(`已点击 ${mine} Deploy，等待弹窗…`);
    }
    const deadline = Date.now() + 15000;
    while (active(id) && Date.now() < deadline) {
      const dialog = deployDialog();
      if (!dialog) { await sleep(300); continue; }
      const miners = findButton('deploy miner').filter(el => usable(el) && dialog.contains(el));
      const result = deploymentStatus(dialog.innerText, miners.length === 1);
      if (result.kind === 'energy' || result.kind === 'blocked') {
        closeDeployDialog();
        const closeDeadline = Date.now() + 5000;
        while (active(id) && deployDialog() && Date.now() < closeDeadline) await sleep(200);
        if (deployDialog()) return {kind:'error', reason:`${mine} 弹窗无法关闭`};
        return result;
      }
      if (result.kind === 'ready') {
        if (!active(id)) return {kind:'cancelled'};
        miners[0].click();
        message(`已点击 ${mine} Deploy miner，确认部署结果…`);
        const confirmDeadline = Date.now() + 30000;
        while (active(id) && deployDialog() && Date.now() < confirmDeadline) await sleep(400);
        if (!active(id)) return {kind:'cancelled'};
        return deployDialog() ? {kind:'error', reason:`${mine} 部署弹窗30秒内未关闭`} : {kind:'success'};
      }
      await sleep(300);
    }
    return active(id) ? {kind:'error', reason:`${mine} 未显示可识别的部署状态`} : {kind:'cancelled'};
  }
  async function run() {
    if (!enabled || recovering || busy || collecting || !onMining()) return;
    busy = true;
    const id = generation;
    // Do not pre-save a default wait before the result of a deployment is known.
    next = Date.now();
    state.waitReason = 'checking';
    try {
      const empty = findButton('deploy machinery below').filter(usable);
      if (empty.length === 1 && document.body.innerText.includes('No Active Mining Operations')) {
        empty[0].click(); await sleep(1200);
        if (!active(id)) return;
      }
      if (!await loadMineCatalogue(id)) { if (active(id)) recover('矿区列表加载超时'); return; }
      if (!active(id)) return;
      const unlocked = unlockedMines();
      if (!unlocked.length) { recover('没有找到可识别的已解锁矿区'); return; }
      const mines = selectMines(unlocked);
      if (!mines.length) {
        next = Math.min(...unlocked.map(m => blockedUntil(m.name)));
        state.waitReason = 'cooldown';
        message('矿区冷却中，等待下一次检查'); return;
      }
      for (const mine of mines) {
        const result = await attemptMine(id, mine.name);
        if (!active(id) || result.kind === 'cancelled') return;
        if (result.kind === 'cooldown') continue;
        if (result.kind === 'error') { recover(result.reason); return; }
        if (result.kind === 'success') {
          delete state.mines[mine.name];
          waitingEnergy = false;
          next = Date.now() + 4000 + Math.random() * 2000;
          state.waitReason = 'success';
          message(`${mine.name} 部署成功，4～6秒后仅继续检查允许部署的矿区；高级矿区等待时间不变`);
          return;
        }
        const powerShortage = result.kind === 'blocked' && result.requiredPower > 0;
        if (mine !== unlocked[unlocked.length - 1] || powerShortage) {
          const at = Date.now() + mine.minutes * 60000;
          state.mines[mine.name] = {retryAt:at,shopAt:powerShortage ? at : 0,power:result.requiredPower || 0};
          const lower = unlocked[unlocked.indexOf(mine)+1];
          if (lower) state.fallback = {mine:lower.name,until:at,source:mine.name};
          persist();
          message(`${mine.name} ${result.reason || '能量不足'}，${mine.minutes}分钟后再检查该矿区；期间尝试低级矿区，商店按每轮优先检查`);
          await sleep(800);
          if (!active(id)) return;
          continue;
        }
        waitingEnergy = result.kind === 'energy';
        if (waitingEnergy && result.minutes > 0) {
          next = Date.now() + result.minutes * 60000;
          state.waitReason = 'energy';
        } else {
          next = Date.now() + interval();
          state.waitReason = 'conditions';
        }
        message(waitingEnergy ? `${mine.name} 还缺${result.minutes}点能量，按${result.minutes}分钟等待` : `${mine.name} 条件不足，${intervalMinutes}分钟后重新检查`);
      }
    } catch (error) {
      console.error('[Auto Deploy]', error);
      if (active(id)) recover('部署出现错误');
    } finally {
      state.phase = 'shop'; // A new deployment round must check the shop first.
      state.next = next;
      try { persist(); } catch (error) { console.error('[Auto Deploy] 无法保存调度状态', error); }
      busy = false;
    }
  }
  function parseShopAccount(text) {
    const balance = text.match(/GEMS Balance\s*([\d,]+(?:\.\d+)?)/i);
    const level = text.match(/Miner Level\s*Lvl\s*(\d+)/i);
    const power = text.match(/Mining Power\s*([\d,]+(?:\.\d+)?)\s*PWR/i);
    if (!balance || !level || !power) return null;
    return {balance:Number(balance[1].replace(/,/g,'')),level:Number(level[1]),power:Number(power[1].replace(/,/g,''))};
  }
  function parseEquipment(name, text, canPurchase) {
    if (!EQUIPMENT.includes(name)) return null;
    const price = text.match(/Price\s*([\d,]+(?:\.\d+)?)/i);
    const gain = text.match(/\+\s*(\d+(?:\.\d+)?)\s*PWR/i);
    const level = text.match(/(?:Req\.\s*)?Lvl\s*(\d+)/i);
    if (!price || !gain) return null;
    return {name,price:Number(price[1].replace(/,/g,'')),gain:Number(gain[1]),level:level ? Number(level[1]) : 1,
      owned:/\bOwned\b|\bEquipped\b/i.test(text),canPurchase};
  }
  function chooseEquipment(items, account) {
    return items.filter(item => item && EQUIPMENT.includes(item.name) && !item.owned && item.canPurchase &&
      Number.isFinite(item.price) && item.price > 0 && item.price <= account.balance &&
      Number.isFinite(item.gain) && item.gain > 0 && item.level <= account.level)
      .sort((a,b) => b.gain-a.gain || a.price-b.price)[0] || null;
  }
  function shopAccount() { return parseShopAccount(document.querySelector('main')?.innerText || ''); }
  function equipmentItem(name) {
    const card = cardFor(name,'h3');
    if (!card) return null;
    const buttons = [...card.querySelectorAll('button')].filter(el => visible(el) && usable(el) && el.textContent.trim().toLowerCase() === 'purchase');
    const item = parseEquipment(name,card.innerText,buttons.length === 1);
    return item ? {...item,button:buttons[0]} : null;
  }
  async function waitForShop(id) {
    const deadline = Date.now()+60000;
    let scan = 0;
    while (active(id) && onShop() && Date.now()<deadline) {
      const later = findButton('later').filter(usable);
      if (later.length === 1) { later[0].click(); await sleep(800); continue; }
      if (shopAccount() && EQUIPMENT.every(name => equipmentItem(name))) return true;
      scan += Math.max(400,innerHeight*0.7);
      const root = document.scrollingElement || document.documentElement;
      if (scan > root.scrollHeight) scan = 0;
      window.scrollTo({top:scan,behavior:'smooth'});
      await sleep(1200);
    }
    return false;
  }
  function purchaseConfirmed(pending, item, account) {
    return Boolean(item?.owned && account && account.power >= pending.beforePower+pending.gain &&
      account.balance <= pending.beforeBalance-pending.price+0.01);
  }
  async function confirmPurchase(id) {
    const pending = state.shop.pending;
    const deadline = Date.now()+30000;
    while (active(id) && onShop() && Date.now()<deadline) {
      const item = equipmentItem(pending.name), account = shopAccount();
      if (purchaseConfirmed(pending,item,account)) {
        state.shop.pending = null;
        persist();
        message(`${pending.name} 购买已确认，当前 ${account.power} PWR`);
        await sleep(2500+Math.random()*3000);
        return true;
      }
      await sleep(500);
    }
    if (active(id)) recover('购买结果未确认，刷新后先核对同一笔购买，不重复点击');
    return false;
  }
  function finishShop(account) {
    const target = state.shop.mine;
    for (const mine of MINES) {
      const blocked = state.mines[mine.name];
      if (!blocked?.shopAt) continue;
      if (account.power >= blocked.power && blocked.retryAt <= Date.now()) delete state.mines[mine.name];
      else if (account.power < blocked.power && blocked.shopAt <= Date.now()) {
        blocked.shopAt = blocked.retryAt = Date.now()+mine.minutes*60000;
      }
    }
    const stillBlocked = state.mines[target];
    const lower = MINES[MINES.findIndex(m => m.name === target)+1];
    if (stillBlocked && lower) state.fallback = {mine:lower.name,until:stillBlocked.retryAt,source:target};
    else if (state.fallback?.source === target) state.fallback = null;
    state.shop = null;
    state.phase = 'deploy'; // Persist across navigation; do not reopen the shop before deployment.
    state.shopRequested = false;
    // A reward-triggered shop visit must not cancel an already-confirmed energy/manual wait.
    persist();
    message('商店检查完成，返回 Mining 进入部署步骤');
    location.assign(MINING_URL);
  }
  async function runShop() {
    if (!enabled || busy || collecting || recovering || !onShop() || !state.shop) return;
    busy = true;
    const id = generation;
    try {
      if (!await waitForShop(id)) { if (active(id)) recover('商店加载超时'); return; }
      if (!active(id)) return;
      if (state.shop.pending && !await confirmPurchase(id)) return;
      while (active(id) && onShop()) {
        if ([...document.querySelectorAll('[role="dialog"]')].some(visible)) { recover('商店出现未识别弹窗'); return; }
        const account = shopAccount();
        if (!account) { recover('无法识别商店余额或矿力'); return; }
        const candidate = chooseEquipment(EQUIPMENT.map(equipmentItem),account);
        if (!candidate) { finishShop(account); return; }
        message(`准备购买 ${candidate.name}：${candidate.price} GEMS，+${candidate.gain} PWR`);
        candidate.button.scrollIntoView({behavior:'smooth',block:'center'});
        await sleep(1000+Math.random()*1000);
        if (!active(id)) return;
        const liveAccount = shopAccount(), liveItem = equipmentItem(candidate.name);
        const bestNow = liveAccount && chooseEquipment(EQUIPMENT.map(equipmentItem),liveAccount);
        if (!liveItem || !bestNow || bestNow.name !== candidate.name || liveItem.price !== candidate.price || liveItem.gain !== candidate.gain) continue;
        state.shop.pending = {name:liveItem.name,price:liveItem.price,gain:liveItem.gain,beforeBalance:liveAccount.balance,beforePower:liveAccount.power,at:Date.now()};
        persist(); // Never submit a purchase unless the recovery journal is saved first.
        if (!active(id) || !usable(liveItem.button)) {
          state.shop.pending = null; persist(); return;
        }
        liveItem.button.click();
        message(`已点击购买 ${liveItem.name}，等待余额、Owned 和 PWR 变化…`);
        if (!await confirmPurchase(id)) return;
      }
    } catch (error) {
      console.error('[Auto Shop]',error);
      if (active(id)) recover('商店操作出现错误');
    } finally { busy = false; }
  }
  function restoredDeploymentTime(saved, now = Date.now()) {
    const at = Number(saved.next);
    if (!Number.isFinite(at) || at <= now) return now;
    if (['manual','energy','conditions','cooldown'].includes(saved.waitReason)) return at;
    if (saved.waitReason === 'success') return Math.min(at,now+6000);
    // Old v3 timers and interrupted operations are not evidence of energy shortage.
    return now;
  }
  function setEnabled(value, restoring = false) {
    enabled = value;
    generation++;
    clearTimeout(recoveryTimer);
    recovering = false;
    waitingEnergy = false;
    try { localStorage.setItem(KEY, String(value)); } catch (_) { /* Storage may be unavailable. */ }
    toggle.textContent = value ? '停止自动部署' : '开始（立即执行一次）';
    message(value ? '自动部署已开启' : '已停止');
    next = value ? (restoring ? restoredDeploymentTime(state) : Date.now()) : 0;
    if (value && !restoring) {
      state.phase = 'shop';
      state.shopRequested = true;
      state.next = next;
      try { persist(); } catch (_) {}
    }
  }
  toggle.addEventListener('click', () => setEnabled(!enabled));
  async function closeRewardObstruction() {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(visible);
    if (!dialogs.length) return false;
    const dialog = dialogs.find(el => MINES.some(m => [...el.querySelectorAll('h2')].some(h => h.textContent.trim() === `Deploy to ${m.name}`)));
    if (!dialog) { recover('领取被未识别弹窗遮挡'); return true; }
    busy = true;
    try {
      dialog.querySelector('button[aria-label="Close"]')?.click();
      await sleep(800);
    } finally { busy = false; }
    return true;
  }
  setInterval(() => {
    try {
      if (redirectToMining()) return;
      if (!enabled) { countdown.textContent = `已停止；默认等待：${intervalMinutes}分钟`; return; }
      if (recovering) { countdown.textContent = '等待自动刷新恢复（停止可取消）'; return; }
      if (onShop()) { if (!busy) void runShop(); return; }
      const remaining = Math.max(0,Math.ceil((next-Date.now())/1000));
      const pending = Object.entries(state.mines).filter(([,v]) => v.shopAt > Date.now()).sort((a,b)=>a[1].shopAt-b[1].shopAt)[0];
      countdown.textContent = collecting ? '正在逐个领取…' : busy ? '正在处理页面…' : `下次部署检查：${Math.floor(remaining/60)}分${remaining%60}秒`;
      if (pending) countdown.textContent += `；${pending[0]} 冷却：${Math.ceil((pending[1].shopAt-Date.now())/60000)}分钟后到期`;
      const fallback = state.fallback;
      if (fallback?.until > Date.now()) countdown.textContent += `；回退 ${fallback.mine}，${fallback.source} 还需等待${Math.ceil((fallback.until-Date.now())/60000)}分钟`;
      if (busy || collecting) return;
      // Claim one ready reward before any shop visit or deployment; drilling positions do not block.
      if (findButton('collect rewards').some(usable) || findButton('collect').some(usable)) {
        if ([...document.querySelectorAll('[role="dialog"]')].some(visible)) void closeRewardObstruction();
        else void collectRewards();
        return;
      }
      if (state.phase !== 'deploy') {
        if (state.shopRequested || Date.now() >= next) startShop();
        return;
      }
      if (Date.now() >= next) void run();
    } catch (error) {
      console.error('[Auto Scheduler]',error);
      recover('调度状态出现错误');
    }
  }, 1000);
  let saved = false;
  try { saved = localStorage.getItem(KEY) === 'true'; } catch (_) { /* Default to stopped. */ }
  setEnabled(saved,true);
})();
