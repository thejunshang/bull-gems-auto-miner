# Bull Gems Auto Miner

用于 [Bull Gems Mining](https://gem.bullshot.io/mining) 的 Tampermonkey 浏览器脚本。当前版本：**2.4.0**。

支持滚动等待矿场加载、Crystal Cavern 优先部署（条件不足时回退 Greenstone Quarry）、逐个领取奖励，以及异常刷新恢复。运行在已登录的浏览器页面中，无需服务器、Node.js 或私钥。

## 安装

1. 从官方商店安装 Tampermonkey：[Chrome](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)、[Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)、[Firefox](https://addons.mozilla.org/zh-CN/firefox/addon/tampermonkey/)。也可从 [Tampermonkey 官网](https://www.tampermonkey.net/)选择浏览器下载。
2. 打开[脚本安装链接](https://raw.githubusercontent.com/thejunshang/bull-gems-auto-miner/main/bull-gems-auto-miner.user.js)，在 Tampermonkey 中确认安装。
3. 如果链接只显示代码，复制全部内容，在 Tampermonkey → 添加新脚本中替换默认代码，按 Ctrl+S 保存。
4. 打开或刷新 [Mining 页面](https://gem.bullshot.io/mining)，登录后点击右下角的“开始（立即执行一次）”。

若扩展提示“请启用允许用户脚本”，按浏览器扩展详情页或 Tampermonkey 提示完成设置。详细步骤见[安装与更新](docs/INSTALL.md)。

## 工作流程

脚本启用时，在 `https://gem.bullshot.io/` 站内其他路径会自动跳转到 Mining；站内无刷新跳转也会在约 1 秒内检查并返回。其他网站不受影响。该导航行为独立于面板的开始/停止；要浏览站内其他页面或处理独立登录页面，请先在 Tampermonkey 中禁用脚本。

1. 优先处理部署：等待初始化，滚动查找 Crystal Cavern 及其 Deploy，最多查找 60 秒。
2. 点击 Deploy，等待对应矿场的部署弹窗。
3. 优先检查 Crystal Cavern；能量、矿力或明确条件不足时关闭弹窗，改为尝试 Greenstone Quarry，同时让 Crystal 进入 **30 分钟冷却**。冷却期间只部署 Greenstone，不反复切换；冷却到期后再检查 Crystal。冷却截止时间保存在本地，刷新后保留。部署成功后停顿 4～6 秒继续当前可用流程。
4. 两个矿场都不能部署时，按 Greenstone Quarry 的 `Need N more energy`，**把 N 当作分钟数**安排下次尝试，并关闭弹窗。矿力不足不会被换算为分钟。它并非网站提供的精确恢复倒计时。
5. 部署间隙及能量等待期间检测 Collect Rewards，逐个点击。每次等待领取按钮数量减少，再停顿 2.5～5.5 秒后继续。
6. 出现 No Active Mining Operations 时，识别并点击 Deploy Machinery Below，然后重新尝试部署。
7. 部署或领取超时、找不到目标等已捕获异常会触发刷新，并恢复开启状态。重复异常时刷新延迟从 10 秒逐步增加，最多 60 秒。

## 面板操作

| 操作 | 效果 |
| --- | --- |
| 开始 | 立即尝试部署，再按流程循环 |
| 停止 | 停止后续点击，取消待执行的自动刷新；已经发出的请求无法撤销 |
| 更新等待时间 | 输入 0.1～1440 分钟，从当前时刻重新安排下一次部署尝试 |
| 刷新页面 | 若此前开启，会恢复运行并立即尝试；此前停止则保持停止 |

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
```

当前发布前已完成语法检查。曾在登录页面验证部署、领取、能量不足与连续部署操作；最新版完整自动循环、滚动加载、自动跳转和异常刷新尚未完成端到端验证。
