# 安装、更新与卸载

## 部署方式

这是浏览器用户脚本，不需要部署服务器或 GitHub Pages。GitHub 用于保存和分发代码，实际操作发生在你已登录的 Mining 页面。

## 首次安装

1. 使用桌面 Chrome 或支持 Tampermonkey 的浏览器，从官方扩展商店安装扩展：
   - [Chrome Web Store](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)
   - [Firefox Add-ons](https://addons.mozilla.org/zh-CN/firefox/addon/tampermonkey/)
   - [Tampermonkey 官网（选择浏览器）](https://www.tampermonkey.net/)
2. 打开仓库根目录的 `bull-gems-auto-miner.user.js`，使用 Raw 链接触发 Tampermonkey 安装，或复制全部代码手动安装。
3. 手动方式：Tampermonkey → 添加新脚本 → Ctrl+A 全选默认代码 → 粘贴 → Ctrl+S 保存。
4. 确认脚本已启用。如果浏览器提示需要“允许用户脚本”，进入扩展详情页按提示开启。具体名称依浏览器版本而异，以扩展的帮助提示为准。
5. 打开 `https://gem.bullshot.io/mining` 并自行登录。
6. 首次安装默认为停止。右下角出现版本面板后点击“开始”。页面可能自动滚动，这是加载与定位矿场的过程。

v2.2 起匹配整个 `https://gem.bullshot.io/` 站点。打开站内其他路径会自动跳转到 Mining，即使面板处于停止状态也如此；停止仅取消挖矿操作。要访问站内其他功能或独立登录页面，请先在 Tampermonkey 中禁用脚本，完成后再启用。脚本不会把其他网站标签页跳转到 Mining。

安装链接：https://raw.githubusercontent.com/thejunshang/bull-gems-auto-miner/main/bull-gems-auto-miner.user.js

## 从旧版本升级

1. 在原有面板中点击停止。
2. 打开 Tampermonkey 管理面板，找到已有 Bull Gems 脚本。
3. 用仓库最新代码替换原脚本全部内容并保存，不要额外保留一份启用的旧脚本。
4. 刷新 Mining 页面，核对右下角面板版本，再点击开始。

升级到 v2.2 时若扩展提示匹配范围变化，请检查并确认站内访问范围。

脚本包含 downloadURL/updateURL 元数据。后续发版提高 `@version` 后，可通过 Tampermonkey 的更新检查安装；自动更新频率取决于扩展设置。手动替换仍可使用。

旧版与新版保留相同 namespace，沿用同一组本地设置。名称已改为“Bull Gems 自动部署与领取”，不再表示固定每 10 分钟只部署一次。

## F12 临时运行

可把代码粘贴到当前 Mining 页面的 Console 执行。浏览器可能要求你先确认允许粘贴，只在已审阅代码后按其提示操作。

F12 注入会随刷新消失，**不适合依赖自动刷新恢复的长期运行**。请优先使用 Tampermonkey。不要与已运行的 Tampermonkey 脚本同时使用。

## 停止与卸载

点击面板“停止”会保存停止状态；随后可在 Tampermonkey 管理面板禁用或删除脚本。删除脚本不会撤销已部署任务或已发出的领取请求。

脚本设置保存在该网站的 localStorage；删除用户脚本不一定删除设置。若清理网站数据，会连同登录等网站数据一起清除，请谨慎操作。
