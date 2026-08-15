# 「用量」面板设计（DSH Desktop × dsh 插件）

> 版本：2026-08-15 ｜ 状态：设计稿 ｜ 依据：dsh 0.1.0-rc.6 会话事件流实测 + 参考 `@pinkbanana/dsh-balance`（credentials+webServer 路由模式）与 `dsh-usage-chart`（RoundFold 折叠 + 价格解析接缝）

## 0. 一句话定位

在 dsh web GUI 的**设置按钮上方**新增一个「用量」入口，点开面板查看：**供应商 API 余额 · token 用量与命中率 · 成本单价与折线图 · codex 式 token 热力图 · cc-switch 式历史 token 计算**。数据全部在 host（bundle）侧解析，凭据不出本机。

与市面插件的差异：

| 参考 | 它做到了什么 | 本设计补什么 |
|---|---|---|
| `@pinkbanana/dsh-balance` | Settings 页余额 | 多供应商余额 + 用量/命中率/成本一体 |
| `dsh-usage-chart` | 输入框下指标 + 成本面板 | 独立「用量」入口 + 热力图 + 历史列表 + 折线图 |
| 其余 balance 插件 | 单一读余额 | 不再做单点功能，做统一面板 |

## 1. 入口：sidebar.footer.action「用量」按钮

沿用 dsh 官方插槽机制（同 dshd-client 的市场按钮）。

- 插槽：`sidebar.footer.action`，`slots.inject('sidebar.footer.action', …, { id: 'dshd-usage', order: 70 })`
- **order 语义：order 越小越靠上**（市场按钮 order 80、设置按钮更大）。`order: 70` → 「用量」在「插件市场」之上、设置之上。
- 按钮形态：图标（用量/柱状 glyph）+ 「用量」文案，宽/窄 rail 两态（复用 dshd-client `FooterEntry` 的实现模式）。
- 交互：点击打开**页内模态面板**（同市场面板：遮罩 + 居中卡片），`Escape` 关闭。

## 2. 形态：独立插件 `@dshd/dsh-usage`

做成**独立 hybrid 插件**（host + client），不并入 dshd-client。

```text
plugins/dsh-usage/
├─ package.json        # @dshd/dsh-usage；dsh.bundle（host）+ dsh.client（web 注入）
├─ src/index.ts        # host：路由注册、凭据解析、sessions 读取、余额 adapter、折叠、定价
├─ src/usage/fold.ts   # RoundFold：事件流 → token 四桶 / 命中率 / 耗时 / TTFT / TPS
├─ src/usage/billing.ts# 供应商余额 adapter（deepseek / openrouter / openai…）
├─ src/usage/pricing.ts# 刊例价表 + 用户覆盖 pricing.json + 成本分拆
├─ src/usage/history.ts# 会话日志 → 时间序列（折线图/热力图/历史列表数据）
└─ src/client/         # React：入口按钮、面板、折线图、热力图、历史表、余额卡
```

**为什么不并入 dshd-client**：dshd-client 是纯 client 壳插件；用量需要 host 侧（读 sessions/credentials/路由），并入等于给壳插件加 host，且失去对纯 dsh web 用户的价值。独立包可被任意 dsh 使用，DSH Desktop 通过 `PluginManager` bundle 激活默认安装。

## 3. 数据源与核心模型（host 侧）

### 3.1 依赖注入

```ts
export const inject = ['webServer', 'sessions', 'credentials']
```

- `webServer`：注册本机路由（同源，client fetch，无 CORS）
- `sessions`：**会话日志读取** —— 用量数据的唯一权威来源
- `credentials`：`credentialRef()` 解析各供应商 API key，**key 不进入浏览器**

### 3.2 会话事件流 → token 四桶（实测语义）

事件来源：`assistant/chunk`（`chunk.type === 'usage'`）与 `assistant/message`；同一 `(turn, step)` 重复样本**替换**而非累加。每个样本携带：

```ts
interface TokenUsage {
  inputTokens: number        // 未命中缓存输入
  outputTokens: number
  cacheReadTokens?: number   // 命中缓存读取
  cacheWriteTokens?: number  // 缓存写入
}
```

### 3.3 派生量（统一在 host 计算，client 只渲染）

| 量 | 公式 | 说明 |
|---|---|---|
| billedInput | `uncachedInput + cacheRead + cacheWrite` | 计费输入（三个不相交桶） |
| **命中率** | `cacheRead / billedInput × 100` | 无输入时 null |
| 成本分拆 | `(uncachedInput+cacheWrite)×P_miss + cacheRead×P_hit + output×P_out` | 三价分拆；DeepSeek 暂不对 cacheWrite 计费 |
| 耗时 | `turn/end − turn/start` | 端点缺失为 null |
| TTFT | `turn/start → 首个 usage 样本` | 首 token 延迟 |
| 吞吐 | `outputTokens / 输出时长` | tokens/s |
| 模型 | `request/context → request/header → 跨轮携带回退` | 模型归因 |

## 4. 功能拆解（面板五区）

面板 = 一个模态，顶部「用量」标题 + 刷新，主体分 Tab：

### Tab 1 · 余额（供应商）

- 卡片列出各已配置供应商：**余额 / 充值余额 / 赠送余额**（DeepSeek 口径），OpenRouter 的 credits（total/used/limit）、OpenAI 的 usage/subscription 各自适配。
- 每次查询带 30s 缓存 + 手动刷新；`allowRemote: false` 仅允许 loopback 访问路由。
- 未配置 key → 提示「未配置 API 密钥，请在模型/凭据设置中保存」，并给出入口。

### Tab 2 · 用量与命中率（统计汇总）

- **本会话 / 今日 / 本周 / 全部** 四档汇总：token 四桶、billedInput、命中率、成本、总耗时。
- 每会话明细：模型、四桶、命中率、TTFT、TPS、耗时、成本。
- 顶部横条：输入(未命中) / 命中 / 输出 三色占比 + 命中率百分比。

### Tab 3 · 折线图（cc-switch 式 token 计算）

- 时间序列折线：X=时间（按小时/天聚合），Y=token 量，三条线（输入未命中 / 命中 / 输出）；右侧次轴成本（USD/CNY 可切）。
- 可切「成本折线」视图：Y=单价×token 的成本曲线。
- 数据源：会话日志按时间聚合（`usage/history.ts`）。

### Tab 4 · 热力图（codex 式）

两种模式：
- **时间模式（默认）**：GitHub contribution 网格——行=24h 时段，列=最近 14 天，格=该时段 token 强度（颜色深浅），点格显示精确值。
- **会话模式**：行=会话，列=该会话轮次/请求序，格=每轮 token 强度。

### Tab 5 · 历史记录（cc-switch 式 token 计算明细）

- 表：时间 / 会话 / 模型 / 输入(未命中) / 命中 / 输出 / 单价 / 成本 / 命中率 / 耗时。
- 支持按模型/会话过滤、排序、导出 CSV。

## 5. 架构与安全边界

```
dsh web (client.jsx) ──fetch──▶ /dsh-usage/* 本机路由（webServer）◀── host 侧
                                       │
                    ┌──────────────────┼───────────────────┐
              余额 adapter         sessions 折叠         pricing 解析
        (credentials 解析 key)   (RoundFold)         (内置价表+覆盖文件)
```

- **凭据边界**：key 只在 host 解析（`credentials.resolve`），路由响应**不含 key**；`allowRemote=false` 拒绝非 loopback 请求；余额/汇率 baseUrl 强制 HTTPS（仅 loopback 放行 HTTP）。
- **纯计算进 host**：命中率/成本/折叠均为纯函数，测试喂合成事件流即可断言（复用 `dsh-usage-chart` RoundFold 的思路，字段语义对齐 token-meter）。
- **价格接缝**：`pricing.json`（默认 `$DSH_HOME/data/dsh-usage/pricing.json`）覆盖内置刊例价；成本显示币种 USD/CNY 可切，CNY 汇率可配或实时拉取。

## 6. 配置（z.object，可入 dsh 设置面板）

```ts
{
  balance: {
    deepseek: { apiKeyRef: 'DEEPSEEK_API_KEY', baseUrl: 'https://api.deepseek.com', cacheMs: 30000 },
    openrouter: { apiKeyRef: 'OPENROUTER_API_KEY' },
    openai: { apiKeyRef: 'OPENAI_API_KEY' },
    // 其他供应商按 adapter 扩展
  },
  pricingFile?: string,      // 价格覆盖文件
  currency: 'usd' | 'cny',
  cnyPerUsd?: number,
  allowRemote: false,        // 余额查询是否允许非本机访问
}
```

## 7. 里程碑与验收

| 里程碑 | 内容 | 验收 |
|---|---|---|
| **M0 数据链路** | `sessions` 事件流实测：确认本机 dsh 日志里 `assistant/chunk` usage 字段形态、cacheRead/Write 是否填充 | 读真实会话日志，四桶字段可解析 |
| **M1 核心计算** | RoundFold + 命中率 + 成本分拆 + 价格接缝（纯函数 + 单测） | 合成事件流断言四桶/命中率/成本 |
| **M2 路由 + 余额** | webServer 注册 `/dsh-usage/balance|usage|pricing|meta`；DeepSeek 余额 adapter | `curl 127.0.0.1:<port>/dsh-usage/balance` 返回余额，无 key 返回明确错误 |
| **M3 入口 + 面板 UI** | sidebar.footer.action「用量」按钮 + 模态面板（余额/用量/折线/热力图/历史五 tab） | 真机打开面板，各 tab 有数据 |
| **M4 多供应商 + 导出** | OpenRouter/OpenAI 余额 adapter；历史 CSV 导出 | 各供应商卡片正确显示 |
| **M5 DSH Desktop 集成** | 加入默认安装清单，经 PluginManager bundle 激活；settings 页暴露配置 | 全新 profile 安装后「用量」按钮即出现 |

## 8. 风险与取舍

1. **依赖 dsh 会话事件流形态**：当前按 rc.6 实测。dsh 版本升级若改 usage 字段，需 M0 留校验与回退（无法解析的轮次标 `unknown`）。
2. **命中率语义**：指**输入侧缓存命中率**（DeepSeek 口径），非整体 token 占比——UI 需明确标注「输入缓存命中率」避免误读。
3. **多供应商余额端点差异大**：DeepSeek 有公开 `/user/balance`；OpenRouter/OpenAI 需各自验证鉴权方式（尤其 OpenAI 需账号级 key）。M2 先做 DeepSeek，M4 扩展并逐家验证。
4. **价格表维护**：模型价目变动频繁，内置刊例价加 `verifiedAt` 时效标注，优先读用户覆盖文件。
5. **与 dshd-client 按钮共存**：同一插槽两个按钮，order 70（用量）< 80（市场）——验证窄 rail 折叠态不冲突。

## 9. 参考

- `@pinkbanana/dsh-balance`（crazywoola/dsh-balance）：`inject: ['webServer','credentials']` + `credentialRef` + loopback 路由 + 缓存——余额查询模式直接沿用。
- `dsh-usage-chart`（Max-Samson）：RoundFold 折叠语义（token 四桶/耗时/TTFT/TPS/模型归因/成本）、价格解析接缝、命中率/成本公式——计算层对齐复用。
- 本仓库 `plugins/dshdesktop-client/client.js`：sidebar.footer.action 注入 + 页内模态面板 + bridge 调用模式——入口与 UI 沿用。
- 本仓库 `src/Marketplace/PluginManager.cs`：bundle 激活路径，M5 集成落点。
