# Bull Gems Auto Miner

用于 [Bull Gems Mining](https://gem.bullshot.io/mining) 的 Tampermonkey 浏览器脚本。当前版本：**3.1.0**。

固定流程：**优先领取 → 检查商店并购买装备 → 部署当前允许的最高级矿区 → 按结果安排下一轮**。所有操作串行执行。运行在已登录的浏览器页面中，无需服务器、Node.js 或私钥。

**v3.0 开启运行后会自动花费 GEMS 购买矿力装备：在等级和余额满足时优先购买 +PWR 最大的未拥有商品，然后继续买其他买得起的装备。最低保留余额为 0；不购买能量包，不充值、不兑换、不签钱包交易。升级前请先停止旧版，确认接受这一规则后再开始。**

## 安装

1. 从官方商店安装 Tampermonkey：[Chrome](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)、[Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)、[Firefox](https://addons.mozilla.org/zh-CN/firefox/addon/tampermonkey/)。也可从 [Tampermonkey 官网](https://www.tampermonkey.net/)选择浏览器下载。
2. 打开[脚本安装链接](https://raw.githubusercontent.com/thejunshang/bull-gems-auto-miner/main/bull-gems-auto-miner.user.js)，在 Tampermonkey 中确认安装。
3. 如果链接只显示代码，复制全部内容，在 Tampermonkey → 添加新脚本中替换默认代码，按 Ctrl+S 保存。
4. 打开或刷新 [Mining 页面](https://gem.bullshot.io/mining)，登录后点击右下角的“开始（立即执行一次）”。

若扩展提示“请启用允许用户脚本”，按浏览器扩展详情页或 Tampermonkey 提示完成设置。详细步骤见[安装与更新](docs/INSTALL.md)。

## 工作流程

脚本仅匹配 `https://gem.bullshot.io/*`。通常自动返回 Mining；只有保存了计划中的商店任务且自动运行开启时，才允许停留 `/trade`。商店检查完成后返回 Mining。需要手动浏览其他页面或处理独立登录页面，请先在 Tampermonkey 中禁用脚本。

1. **领取优先**：Mining 页面有 Collect Rewards 时逐个领取，等待该任务卡片移除/切换，再停顿 2.5～5.5 秒。Active positions 中尚在挖矿的任务不阻塞后续操作。
2. **先检查商店**：每个部署轮次开始前都检查商店，无需先发现 PWR 不足或等待升级计时到期。有新奖励领取成功时也会请求一次商店检查。跳过已拥有、等级不足、余额不足商品，按单件 +PWR 从高到低逐个买。
3. **再部署高级矿区**：商店返回后只进入一次部署步骤，不立即重复进商店。滚动加载列表，仅选择实际显示 Unlocked/Running 且不在冷却的矿区，按 Void → Frozen → Ember → Crystal → Greenstone 的顺序检查。矿力不足按该矿区时长冷却，期间回退低级矿区。

   v3.0.1 额外保存回退目标及截止时间，并在滚动/点击前再次检查冷却。回退期间只加载低级目标，不每隔几秒扫描高级矿区。4～6 秒仅是成功部署后的操作间隔，不能解除高级矿区冷却。
4. **确认购买**：每一笔先保存记录，再点击，并确认余额扣除、Owned 和 PWR 增长；未确认前不会重复下单。
5. **保留矿区冷却**：提前买到装备也不取消尚未到期的矿区冷却；到期后按新 PWR 判断。频繁检查商店不会把已有冷却反复重置。部署成功后停顿4～6秒，再从领取/商店阶段开始下一轮，实际部署间隔还包含商店往返耗时。
6. **能量不足**：高级矿区按其时长冷却，回退低级矿区；最低可用矿区缺 N 点能量时按约定等待 N 分钟。能量不足不会触发购物。该换算不等于网站精确恢复倒计时。
7. **异常恢复**：已捕获的超时/结构异常会自动刷新，重复异常退避 10～60 秒。状态跨刷新保存。领取、购买、部署和导航不会并发执行。

| 矿区 | 解锁等级 | 部署矿力 | 每次能量 | 条件不足后矿区冷却 |
| --- | ---: | ---: | ---: | --- |
| Greenstone Quarry | 1 | 0 PWR | 10 | 10 分钟 |
| Crystal Cavern | 4 | 25 PWR | 20 | 30 分钟 |
| Ember Mine | 8 | 60 PWR | 35 | 90 分钟 |
| Frozen Depths | 14 | 120 PWR | 50 | 4 小时 |
| Void Rift | 20 | 250 PWR | 75 | 8 小时 |

“高级优先”和“+PWR 最大优先”是执行策略，不保证收益最高或每 PWR 成本最低。商店仅允许六种已识别装备，详见[运行说明](docs/OPERATIONS.md)。

## 面板操作

| 操作 | 效果 |
| --- | --- |
| 开始 | 立即进入串行调度：领取 → 检查商店 → 部署 |
| 停止 | 停止后续点击，取消待执行的自动刷新；已经发出的请求无法撤销 |
| 更新等待时间 | 输入 0.1～1440 分钟，从当前时刻重新安排下一次部署尝试 |
| 刷新页面 | 恢复开启状态、部署等待、矿区冷却、商店任务和待确认购买；此前停止则保持停止 |

“等待时间”不是固定部署频率。部署成功会改为 4～6 秒后再试；能量不足时会按 N 分钟重新安排。输入框保留的是手动设置的默认值，当前实际等待时间以面板倒计时为准。

## 注意事项

- **只在一个 Mining 标签页启用一份脚本**，避免多个页面同时部署或重复领取。
- 连续部署会持续消耗账户能量：Greenstone Quarry 当前消耗 10 点、持续 10 分钟；Crystal Cavern 消耗 20 点、持续 30 分钟，需要 25 PWR 和等级 4。两者共享能量；Crystal 优先并不代表单位能量收益一定更高。首次使用先观察一轮。
- 浏览器关闭、电脑休眠、标签页冻结时不能保证运行；后台定时器可能延迟。
- 脚本匹配 `https://gem.bullshot.io/*`，自动返回 Mining。升级时可能需要在扩展中确认扩大的站内匹配范围；不匹配其他域名。
- 页面文案、DOM、弹窗或登录状态变化可能导致持续刷新。可点击停止或在 Tampermonkey 中禁用脚本。
- 自动刷新不能恢复过期登录、钱包签名、验证码、网络故障或网站不可用；这些情况仍需处理后恢复。
- 脚本不读取私钥、不代替钱包签名、不调用挖矿接口，也不保证收益或平台允许自动化。使用前自行确认网站规则。

详见[运行与故障排查](docs/OPERATIONS.md)、[验证记录](docs/VALIDATION.md)和[版本记录](CHANGELOG.md)。

## 本地检查

仅开发检查需要 Node.js，安装和运行脚本不需要：

```sh
node --check bull-gems-auto-miner.user.js
node --test tests/navigation.test.cjs
node --test tests/deployment.test.cjs
node --test tests/shop.test.cjs tests/scheduler.test.cjs
```

当前发布前已完成语法检查与自动化隔离测试。曾实测部署、领取及两次单件装备购买；v3.0 完整自动购物/挖矿循环和长时间恢复尚未完成浏览器端到端验证，详见验证记录。
