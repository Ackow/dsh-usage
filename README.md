# dsh-usage

![dsh-usage](assets/social-preview.png)

<p align="center">
  <strong>简体中文</strong> | <a href="README.en.md">English</a>
</p>

<p align="center">
  <strong>把 DeepSeek Harness 的 token 账单摊开在侧栏。余额、命中率、成本曲线、热力图，一个「用量」按钮全看完。</strong><br>
  成本是估算的，命中的是真实缓存。
</p>
`dsh-usage` 在 dsh web 侧栏**设置按钮上方**注入「用量」按钮，点开是一个单页模态面板。所有 token 用量从 dsh 会话日志（内存活跃 + 磁盘持久化，zstd 解码）解析；成本按请求时刻套用官方峰谷价目估算；凭据只在 host 侧解析，不出本机。

## 面板五块

### 供应商余额

![供应商余额：DeepSeek / OpenRouter 切换，刷新即查](assets/balance.png)

支持 **DeepSeek**（`DEEPSEEK_API_KEY`）与 **OpenRouter**（`OPENROUTER_API_KEY`），凭据经 dsh credentials 服务解析，key 不进浏览器。

### 用量与命中率

![用量与命中率：计费输入 / 命中率 / 成本，会话下拉切换全部或单个](assets/usage-hitrate.png)

标题行可切换**全部会话 / 单个会话**（下拉显示会话标题）。命中率为**输入侧缓存命中率**。

### 折线图

![token / 成本双视图折线图：仅当天按小时聚合，平滑曲线，悬浮看每小时明细](assets/chart.png)

仅显示**当天**、按小时聚合的平滑曲线，**Token / 成本**双视图，悬浮显示该小时三桶 token 与成本估算。

### 热力图

![时间 / 会话双模式热力图，GitHub 贡献绿阶](assets/heatmap.png)

**时间模式** = 最近 13 周每日；**会话模式** = 每个会话每轮。GitHub 官方 4 档绿阶。

### 历史明细

![历史明细：分页 + CSV 导出，含会话 / 模型 / 成本](assets/history.png)

全量明细分页（每页 15 行、限高内部滚动、悬浮高亮），一键导出 CSV（带 BOM，Excel 直接打开）。

> 🚧 **更多查询内容开发中**：会话过滤、排序、时间区间筛选等查询能力陆续补充中，敬请期待。

## 数据口径

- **用量来源**：`assistant/chunk`(usage) 与 `assistant/message` 事件；同一 `(turn, step)` 替换不累加
- **命中率** = `cacheRead / (uncachedInput + cacheRead + cacheWrite)`（输入侧缓存命中率）
- **成本** = 未命中输入×miss + 命中×hit + 输出×out；按请求时刻套用官方峰谷价（DeepSeek 2026-08-17 起高峰 9:00–12:00、14:00–18:00），并**定期在线同步官方价格页**（失败回退内置价目）
- **成本为估算值**，非精确计费金额，统一以 USD 显示

## 安装

```sh
dsh plugin --profile web add @dshd/dsh-usage
# 重启 dsh web 后，侧栏设置按钮上方出现「用量」按钮
```

## 开发

```sh
# 本地目录安装（跳过 npm）
mkdir -p ~/.dsh/profiles/web/node_modules/@dshd/dsh-usage
cp package.json host.js client.js cordis.patch.yml ~/.dsh/profiles/web/node_modules/@dshd/dsh-usage/
# 在 ~/.dsh/profiles/web/package.json 的 dependencies 与 dsh.profile.bundles 加入 @dshd/dsh-usage
# 修改后重新 cp，重启 dsh web 生效（dsh plugin list 不会显示本地目录安装，属正常）
```

## 配置

| 项 | 说明 | 默认 |
|---|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek 余额凭据（credentials 服务或环境变量） | — |
| `OPENROUTER_API_KEY` | OpenRouter 余额凭据 | — |
| `cnyPerUsd` | USD 换算汇率 | `6.76` |
| `pricing` | 单价覆盖（可带 `schedules` 峰谷段） | 内置官方刊例价 |

## License

[MIT](LICENSE)。`@dshd/dsh-usage` 与 DeepSeek 及任何供应商无关联；不保存凭据、不上传数据，全部计算在本机完成。成本为按官方刊例价与请求时刻计算的**估算值**，可能因价格变动、峰谷时段或计费口径差异与真实账单不一致。
