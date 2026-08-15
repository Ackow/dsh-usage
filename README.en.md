# dsh-usage

![dsh-usage](assets/social-preview.png)

<p align="center">
  <a href="README.md">简体中文</a> | <strong>English</strong>
</p>

<p align="center">
  <strong>Spread the DeepSeek Harness token bill across your sidebar. Balance, hit rate, cost curves, heatmaps — all behind one "Usage" button.</strong><br>
  Costs are estimated, cache hits are real.
</p>
`dsh-usage` injects a **「用量」button above the Settings seat** in the dsh web sidebar. The panel is a single-page modal. All token usage is parsed from dsh session logs (in-memory + persisted zstd on disk); cost is estimated per request time using the official peak/off-peak pricing; credentials are resolved host-side only, never leaving the machine.

## Panel sections

### Provider balance
![Provider balance: DeepSeek / OpenRouter switch, refresh on demand](assets/balance.png)

**DeepSeek** (`DEEPSEEK_API_KEY`) and **OpenRouter** (`OPENROUTER_API_KEY`) balances via the dsh credentials service. Keys never reach the browser.

### Usage & hit rate
![Usage & hit rate: billed input / hit rate / cost, per-session selector](assets/usage-hitrate.png)

Switch **all sessions / one session** from the title row. Hit rate is the **input-side cache hit rate**.

### Chart
![Token / cost dual-view line chart, today only aggregated by hour, smooth curve, hover for details](assets/chart.png)

Shows only **today**, aggregated by hour as a smooth curve, **Token / Cost** dual view; hover reveals that hour's buckets and cost estimate.

### Heatmap
![Time / session dual-mode heatmap in GitHub contribution greens](assets/heatmap.png)

**Time mode** = last 13 weeks by day; **session mode** = each session by turn. GitHub's 4-level green scale.

### History
![History: paginated + CSV export with session / model / cost](assets/history.png)

Full detail paginated (15 rows/page, height-capped scroll), one-click CSV export (BOM included, opens directly in Excel).

> 🚧 **More query features in development**: session filtering, sorting, time-range filters, and more are on the way.

## Data semantics

- **Usage source**: `assistant/chunk`(usage) and `assistant/message` events; same `(turn, step)` replaces rather than accumulates
- **Hit rate** = `cacheRead / (uncachedInput + cacheRead + cacheWrite)` (input-side cache hit rate)
- **Cost** = uncachedInput×miss + cacheRead×hit + output×out; applies official peak/off-peak pricing by request time (DeepSeek, peak 09:00–12:00 / 14:00–18:00 since 2026-08-17), with periodic online sync of the official price page (falls back to built-in)
- **Cost is an estimate**, not the exact bill, shown in USD

## Install

```sh
dsh plugin --profile web add @dshd/dsh-usage
# restart dsh web — the "Usage" button appears above Settings
```

## Config

| Key | Description | Default |
|---|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek balance credential (credentials service or env) | — |
| `OPENROUTER_API_KEY` | OpenRouter balance credential | — |
| `cnyPerUsd` | USD conversion rate | `6.76` |
| `pricing` | per-model price override (may carry `schedules`) | built-in official list |

## License

[MIT](LICENSE). Not affiliated with DeepSeek or any provider; no credentials stored, nothing uploaded — all computation happens locally. Costs are **estimates** computed from the official list price and request time; they may differ from the real bill due to price changes, peak windows, or billing semantics.
