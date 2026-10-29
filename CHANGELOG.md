# 版本记录

## 2.4.0

- Crystal 条件不足后回退 Greenstone，30 分钟内不再检查 Crystal，避免两个矿场来回切换。
- 冷却截止时间存入 localStorage，刷新后继续计时；面板显示剩余冷却时间。
- 新增冷却启动、冷却期间只运行 Greenstone、到期恢复 Crystal 优先的测试。

## 2.3.0

- 优先部署 Crystal Cavern；能量、矿力或明确条件不足时回退 Greenstone Quarry。
- 共用标题定位、滚动加载、弹窗确认和连续部署流程。
- 两者不能部署时，按 Greenstone Quarry 缺少能量数安排等待；矿力不足不触发故障刷新。
- 新增状态分类和矿场优先级测试。Crystal 成功部署尚因当前账户矿力不足而无法实测。

## 2.2.0

- 匹配 Bull Gems 整站路径，非 Mining 页面自动跳转到 Mining。
- 每秒检查站内无刷新导航，离开 Mining 后自动返回；不影响其他网站。
- 补充 Chrome、Edge、Firefox 的 Tampermonkey 官方商店链接。
- 说明自动跳转与挖矿停止状态相互独立，浏览站内其他功能时需禁用脚本。

## 2.1.0

- 刷新后等待初始化，并滚动触发矿场加载。
- 查找 Greenstone Quarry 和 Deploy 最多等待 60 秒，再决定是否刷新恢复。
- 首次仓库发布整理安装链接、中文文档与验证边界；脚本显示名称改为“Bull Gems 自动部署与领取”。

## 2.0.0

- 能量充足时连续部署，成功后停顿 4～6 秒继续。

## 1.9.0

- 部署或领取失败、超时后自动刷新并恢复运行。
- 重复异常采用最多 60 秒刷新退避，手动停止可取消刷新。

## 1.8.0

- 按 Greenstone Quarry 标题限定 Deploy，按对应 dialog 限定部署弹窗。
- 能量不足时记录等待时间并关闭弹窗。
- 等待部署弹窗关闭再继续操作。

## 早期版本

- 开始/停止、可调整等待分钟数、本地保存状态。
- 将 Need N more energy 中 N 按约定视为分钟。
- 逐个领取 Collect Rewards，等待页面变化后继续。
- 无任务时点击 Deploy Machinery Below 返回部署流程。
