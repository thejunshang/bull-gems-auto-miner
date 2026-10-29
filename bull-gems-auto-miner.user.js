// ==UserScript==
// @name         Bull Gems 自动部署与领取
// @namespace    local.bull-gems
// @homepageURL  https://github.com/thejunshang/bull-gems-auto-miner
// @supportURL   https://github.com/thejunshang/bull-gems-auto-miner/issues
// @downloadURL  https://raw.githubusercontent.com/thejunshang/bull-gems-auto-miner/main/bull-gems-auto-miner.user.js
// @updateURL    https://raw.githubusercontent.com/thejunshang/bull-gems-auto-miner/main/bull-gems-auto-miner.user.js
// @version      2.3.0
// @description  滚动等待矿场加载，连续部署至能量不足，逐个领取奖励，异常刷新恢复。
// @match        https://gem.bullshot.io/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  'use strict';
  const MINING_URL = 'https://gem.bullshot.io/mining';
  const onMining = () => location.pathname.replace(/\/$/, '') === '/mining';
  function redirectToMining() {
    if (onMining()) return false;
    location.replace(MINING_URL);
    return true;
  }
  // Scope stays on Bull Gems; never redirect unrelated browsing tabs.
  if (redirectToMining()) return;
  let intervalMinutes = 10;
  try { intervalMinutes = Number(localStorage.getItem('bull-gems-wait-minutes')) || 10; } catch (_) {}
  if (intervalMinutes < 0.1 || intervalMinutes > 1440) intervalMinutes = 10;
  const interval = () => intervalMinutes * 60 * 1000;
  const KEY = 'bull-gems-auto-deploy-enabled-v1';
  if (window.__bullGemsAutoDeploy) return;
  window.__bullGemsAutoDeploy = true;
  let enabled = false, busy = false, next = 0, generation = 0, waitingEnergy = false;
  let collecting = false;
  let recovering = false;
  let recoveryTimer;
  const collectAttempts = new WeakMap();
  let lastCollect = 0;
  let lastEmptyNavigation = 0;
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#101710;color:#fff;border:1px solid #baff31;border-radius:12px;padding:14px;font:14px/1.6 sans-serif;box-shadow:0 3px 20px #0008;width:250px';
  const title = document.createElement('strong');
  title.textContent = 'Bull Gems 自动部署 v2.3';
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
  const inView = el => {
    const rect = el.getBoundingClientRect();
    let left = Math.max(0, rect.left), right = Math.min(innerWidth, rect.right);
    let top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
      if (/(hidden|clip|auto|scroll)/.test(style.overflowX)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
      if (/(hidden|clip|auto|scroll)/.test(style.overflowY)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
    }
    return right - left > 10 && bottom - top > 10;
  };
  const findButton = label => [...document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]')]
    .filter(el => !panel.contains(el) && visible(el) && (el.innerText || el.value || el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase() === label);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const active = id => enabled && generation === id && location.pathname.replace(/\/$/, '') === '/mining';
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
  async function resumeFromEmpty() {
    if (!active(generation) || recovering || busy || collecting || Date.now() - lastEmptyNavigation < 60000) return false;
    const candidates = [...document.querySelectorAll('button,[role="button"],a')].filter(el =>
      !panel.contains(el) && visible(el) && usable(el) &&
      /^deploy machinery below(?:\s*[↓↧➜→])?$/i.test((el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()));
    if (candidates.length !== 1 || !document.body.innerText.includes('No Active Mining Operations')) return false;
    const id = generation;
    lastEmptyNavigation = Date.now();
    collecting = true;
    try {
      candidates[0].click();
      message('当前没有挖矿任务，已点击 Deploy Machinery Below，准备重新部署…');
      await sleep(1200);
      if (active(id)) next = Date.now();
    } catch (error) { console.error('[Auto Deploy Navigation]', error); recover('返回矿场失败'); }
    finally { collecting = false; }
    return true;
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
      const rewardButtons = () => [...findButton('collect rewards'), ...findButton('collect')];
      const countBefore = rewardButtons().length;
      button.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(600 + Math.random() * 600);
      if (!active(id) || !visible(button) || !usable(button)) return;
      button.click();
      message('已点击 Collect Rewards，等待领取结果…');
      // Keep the sequence locked until the page removes a reward button.
      // A disabled/loading button alone does not confirm completion.
      const deadline = Date.now() + 30000;
      let completed = false;
      while (active(id) && Date.now() < deadline) {
        if (rewardButtons().length < countBefore) { completed = true; break; }
        await sleep(400);
      }
      if (!active(id)) return;
      if (!completed) {
        recover('30秒内未确认领取完成');
        return;
      }
      const pause = 2500 + Math.random() * 3000;
      message(`页面领取数量已减少，停顿${(pause / 1000).toFixed(1)}秒后领取下一个`);
      await sleep(pause);
    } catch (error) {
      console.error('[Auto Collect]', error);
      if (active(id)) {
        recover('领取出现错误');
      }
    } finally { collecting = false; }
  }
  const energyButton = () => [...(deployDialog()?.querySelectorAll('button') || [])].find(el => /need\s+.*energy/i.test(el.textContent || ''));
  apply.addEventListener('click', () => {
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < 0.1 || value > 1440) { message('请输入0.1到1440分钟'); return; }
    intervalMinutes = value;
    try { localStorage.setItem('bull-gems-wait-minutes', String(value)); } catch (_) {}
    if (enabled) next = Date.now() + interval();
    message(`等待时间已更新为${value}分钟，从现在重新计时`);
  });
  function deploymentStatus(text, enabledButton) {
    const energy = text.match(/Need\s+(\d+(?:\.\d+)?)\s+more\s+energy/i);
    const power = text.match(/Mining power req\.\s*([\d.]+)\s*\/\s*([\d.]+)\s*PWR/i);
    if (power && Number(power[1]) > Number(power[2])) return {kind:'blocked', reason:'矿力不足'};
    if (energy) return {kind:'energy', minutes:Number(energy[1])};
    if (/need|require|insufficient|locked/i.test(text.split('Possible rewards').pop()) && !enabledButton) return {kind:'blocked', reason:'部署条件不足'};
    return {kind:enabledButton ? 'ready' : 'pending'};
  }
  async function attemptMine(id, mine) {
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
    next = Date.now() + interval();
    try {
      for (const mine of ['Crystal Cavern', 'Greenstone Quarry']) {
        const result = await attemptMine(id, mine);
        if (!active(id) || result.kind === 'cancelled') return;
        if (result.kind === 'error') { recover(result.reason); return; }
        if (result.kind === 'success') {
          waitingEnergy = false;
          next = Date.now() + 4000 + Math.random() * 2000;
          message(`${mine} 部署成功，停顿4～6秒后继续优先检查 Crystal Cavern`);
          return;
        }
        if (mine === 'Crystal Cavern') {
          message('Crystal Cavern 条件不足，改为尝试 Greenstone Quarry');
          await sleep(800);
          if (!active(id)) return;
          continue;
        }
        waitingEnergy = result.kind === 'energy';
        if (waitingEnergy && result.minutes > 0) next = Date.now() + result.minutes * 60000;
        message(waitingEnergy ? `两个矿场均不可部署，Greenstone Quarry 还缺${result.minutes}点能量，按${result.minutes}分钟等待` : `两个矿场均不满足条件，${intervalMinutes}分钟后重新检查`);
      }
    } catch (error) {
      console.error('[Auto Deploy]', error);
      if (active(id)) recover('部署出现错误');
    } finally { busy = false; }
  }
  function setEnabled(value) {
    enabled = value;
    generation++;
    clearTimeout(recoveryTimer);
    recovering = false;
    waitingEnergy = false;
    try { localStorage.setItem(KEY, String(value)); } catch (_) { /* Storage may be unavailable. */ }
    toggle.textContent = value ? '停止自动部署' : '开始（立即执行一次）';
    message(value ? '自动部署已开启' : '已停止');
    next = value ? Date.now() : 0;
    if (value) void run();
  }
  toggle.addEventListener('click', () => setEnabled(!enabled));
  let wasMiningPage = location.pathname.replace(/\/$/, '') === '/mining';
  setInterval(() => {
    // Also handle client-side navigation without requiring a full page load.
    if (redirectToMining()) return;
    const onMiningPage = location.pathname.replace(/\/$/, '') === '/mining';
    if (enabled && onMiningPage && !wasMiningPage) next = Date.now();
    wasMiningPage = onMiningPage;
    if (!enabled) { countdown.textContent = `执行间隔：${intervalMinutes}分钟`; return; }
    if (!onMiningPage) { countdown.textContent = '等待进入 Mining 页面'; return; }
    if (recovering) { countdown.textContent = '等待自动刷新恢复（点击停止可取消）'; return; }
    const deployDue = Date.now() >= next || (waitingEnergy && findButton('deploy miner').filter(usable).length === 1);
    if (!busy && !collecting) {
      if (deployDue) void run();
      else {
        void resumeFromEmpty();
        if (!collecting) void collectRewards();
      }
    }
    const remaining = Math.max(0, Math.ceil((next - Date.now()) / 1000));
    countdown.textContent = collecting ? '正在领取奖励…' : busy ? '正在执行…' : `下一轮：${Math.floor(remaining / 60)}分${String(remaining % 60).padStart(2, '0')}秒`;
  }, 1000);
  let saved = false;
  try { saved = localStorage.getItem(KEY) === 'true'; } catch (_) { /* Default to stopped. */ }
  setEnabled(saved);
})();
