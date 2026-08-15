# @dshd/dsh-usage — 用量面板

> DeepSeek Harness 用量插件（独立仓库 / npm 包）。配合 [DSH Desktop](https://github.com/Ackow/dsh-desktop) 使用。

dsh 插件（host + client hybrid）：在侧栏**设置按钮上方**注入「用量」按钮，点开模态面板查看
**供应商 API 余额 · token 用量与命中率 · 成本折线图 · GitHub 样式热力图 · 历史明细**。
面板为单页卡片流（每模块独立卡片、内容列居中展开）；成本为**估算值**，统一以 **USD** 显示。

样式贴合 dsh 原生：使用 `--dsw-alias-*` 主题 token（运行时由 dsh theme 注入，带回退色），
面板/按钮/胶囊均镜像 dsh 原生组件形态。

## 结构

```
package.json        # @dshd/dsh-usage；dsh.bundle（host）+ dsh.client（web）
cordis.patch.yml    # bundle 层：insert dshd-usage host 插件
host.js             # host：/dsh-usage/balance|sessions|session|pricing|history 路由（同源，无 CORS）
client.js           # client：侧栏「用量」按钮（order 70）+ 单页卡片面板 + 会话下拉/分页/CSV
public/usage.svg    # 「用量」按钮图标源文件（运行时内嵌 path）
docs/usage-panel-design.md  # 设计文档
```

## 安装

```bash
dsh plugin --profile web add @dshd/dsh-usage
dsh --profile web        # 重启生效
```

## 开发安装（本地目录）

```bash
# 复制到 profile 的 node_modules 并注册 bundle
mkdir -p ~/.dsh/profiles/web/node_modules/@dshd/dsh-usage
cp package.json host.js client.js cordis.patch.yml ~/.dsh/profiles/web/node_modules/@dshd/dsh-usage/
# 在 ~/.dsh/profiles/web/package.json 加：
#   "dependencies": { "@dshd/dsh-usage": "0.1.0" }
#   "dsh.profile.bundles": [..., "@dshd/dsh-usage"]
```

修改 host.js / client.js 后重新 `cp`，重启 dsh web 生效（`dsh plugin list` 不会显示本地目录安装，属正常）。

## 发布 npm

```bash
npm login
npm version patch            # bump 版本
npm publish                  # 发布到公共 npm（需 npm 账号）
```

发布后 DSH Desktop 的插件市场可通过 `dsh plugin add @dshd/dsh-usage` 安装（PluginManager 自动做 bundle/client 激活）。GitHub 仓库请打 `dsh-plugin` / `deepseek-harness` topic 以便进入插件市场发现层。

## 撤销

```bash
# 1) 从 package.json 的 dependencies + dsh.profile.bundles 移除 @dshd/dsh-usage
# 2) 删除目录
rm -rf ~/.dsh/profiles/web/node_modules/@dshd/dsh-usage
# 3) 重启 dsh web
```

## 数据通道（host → client）

| 路由 | 说明 | 状态 |
|---|---|---|
| `/dsh-usage/balance` | DeepSeek 余额（凭据 host 解析，key 不进浏览器） | ✅ 真实 |
| `/dsh-usage/sessions` | 会话枚举（标题 / id / 事件数 / 最后活动 / 用量轮次），合并**内存活跃 + 磁盘持久化**（`session-persistence-jsonl` 服务，zstd 日志解码），按最后活动降序 | ✅ 真实 |
| `/dsh-usage/session` | 用量折叠（token 四桶 / 命中率 / 成本 / 逐轮）：`?sessionId=X` 单会话（内存→持久化回退）；无参 = 全部汇总 | ✅ 真实 |
| `/dsh-usage/pricing` | 价格表 + 汇率（cnyPerUsd）+ 估算标记 | ✅ 内置刊例价快照 |
| `/dsh-usage/history` | 历史明细：`?sessionId=X` 单会话；无参 = 全部汇总 | ✅ 真实 |

命中率 = `cacheRead / (uncachedInput + cacheRead + cacheWrite)`（输入侧缓存命中率，DeepSeek 口径）。
成本 = 未命中输入×miss价 + 命中×hit价 + 输出×out价（host 以 CNY 估算，client 按 cnyPerUsd 换算统一显示 USD）。
面板「用量与命中率」标题行有会话下拉（**显示会话标题**，hover 看 id）：全部会话 / 各会话，折线图·热力图·历史跟随同一选择。
折线图按天聚合（最近 14 天，cc-switch 风格），悬浮显示每日明细；历史明细分页（每页 15 行，限高内部滚动）。

## 待办（v2）

- 供应商 adapter 扩展（OpenRouter / OpenAI 等公开余额端点）
- 价格表在线同步（官方价目页）与用户覆盖 pricing.json
- 峰谷时段计价（deepseek-billing 已有实现，可移植）
- 全部汇总的持久化会话扫描上限（现为 50 个）改为分页/后台渐进

设计文档见 `docs/usage-panel-design.md`。
