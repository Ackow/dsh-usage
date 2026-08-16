/**
 * dshd-usage — dsh client 半区（web）。
 *
 * 在 dsh 侧栏设置按钮上方注入「用量」按钮（sidebar.footer.action, order 70），
 * 点开页内模态面板：余额 / 预算 / 折线图 / 热力图（GitHub 样式）/ 用量 / 历史。
 * 数据经同源 HTTP 路由 `/dsh-usage/*`（host 半区注册）fetch，成本为估算值
 * （标注「估算」），货币统一 CNY（¥）。
 *
 * Bundle contract: `window.__ModuleLoader__.load({ id, factory })`。
 * NOTE：react/jsx-runtime 的 jsx(type, props, key) 第三参是 key 不是 children；
 * 本文件统一用 el(type, props, children)，children 放 props.children。
 */
window.__ModuleLoader__.load({
  id: '@dshd/dsh-usage',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    var reactJsxRuntime = require('react/jsx-runtime')
    var jsx = reactJsxRuntime.jsx
    var React = require('react')
    var useState = React.useState
    var useEffect = React.useEffect
    var createRoot = require('react-dom/client').createRoot

    // Services this plugin waits for before activating.
    var inject = ['slots']

    var LOG = function (msg) {
      try { console.log('[dshd-usage] ' + msg) } catch (e) { /* noop */ }
    }

    function el(type, props, children) {
      if (children === undefined) return jsx(type, props)
      var p = {}
      for (var k in props) if (Object.prototype.hasOwnProperty.call(props, k)) p[k] = props[k]
      p.children = children
      return jsx(type, p)
    }

    // ------------------------------------------------------------- fetch

    function fetchJson(path) {
      return fetch(path).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status)
        return r.json()
      }).catch(function (e) {
        LOG('fetch ' + path + ' failed: ' + e)
        return null
      })
    }

    function postJson(path, body) {
      return fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status)
        return r.json()
      }).catch(function (e) {
        LOG('post ' + path + ' failed: ' + e)
        return null
      })
    }

    // 会话数据路由 URL：指定会话（?sessionId=）或全部（无参）。
    function sessionUrl(path, sessionId) {
      return sessionId ? path + '?sessionId=' + encodeURIComponent(sessionId) : path
    }

    // ------------------------------------------------------------- store

    var usageState = { open: false }
    var usageListeners = new Set()
    function getOpen() { return usageState.open }
    function subscribe(fn) { usageListeners.add(fn); return function () { usageListeners.delete(fn) } }
    function setOpen(v) {
      if (usageState.open === v) return
      usageState.open = v
      usageListeners.forEach(function (fn) { fn() })
    }

    // ------------------------------------------------------------- style

    var MUTED = { color: 'var(--dsw-alias-label-tertiary, #6b7684)' }
    var MUTED2 = { color: 'var(--dsw-alias-label-tertiary, #6b7684)', fontSize: '12px' }
    var BTN = {
      minHeight: '28px', padding: '0 12px',
      border: '1px solid var(--dsw-alias-border-default, #d8dde3)',
      borderRadius: '8px', background: 'transparent',
      color: 'var(--dsw-alias-label-primary, #1f2329)',
      cursor: 'pointer', font: 'inherit', fontSize: '12px',
    }
    var PILL = {
      display: 'inline-block', padding: '1px 8px', borderRadius: '999px',
      border: '1px solid var(--dsw-alias-border-default, #e5e7eb)',
      color: 'var(--dsw-alias-label-secondary, #4b5563)', fontSize: '11px',
      marginRight: '4px', marginTop: '4px',
    }
    var OK = '#1f9d55'
    var WARN = '#b45409'
    var ACCENT = 'var(--dsw-alias-accent-strong, #4d6bfe)'
    var INK = 'var(--dsw-alias-label-primary, #1f2329)'

    // 「用量」按钮图标（源文件 public/usage.svg；运行时内嵌 path）。
    var USAGE_PATHS = [
      'M742.686 64.239h262.609v893.833h-262.61V64.239zM382.525 511.148h262.617v446.924H382.525V511.148zM21.898 326.857h262.61v631.216H21.897V326.857z',
    ]
    // 警告（Material warning, 24 viewBox）。
    var ALERT_PATHS = [
      'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
    ]
    // 关闭（Material close, 24 viewBox）。
    var CLOSE_PATHS = [
      'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
    ]
    // 设置（Material settings, 24 viewBox）。
    var SETTINGS_PATHS = [
      'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
    ]

    // 通用 SVG 图标（fill 模式）。
    function Glyph(props) {
      var size = props.size || 14
      var vb = props.viewBox || '0 0 1024 1024'
      var color = props.color || 'currentColor'
      return el('svg', { viewBox: vb, width: size, height: size, fill: color, 'aria-hidden': 'true' },
        props.paths.map(function (d, i) { return el('path', { key: 'p' + i, d: d }) }))
    }

    function UsageGlyph(props) {
      return el(Glyph, { paths: USAGE_PATHS, viewBox: '0 0 1031 1024', size: props.size || 16 })
    }

    // ------------------------------------------------------------- fmt

    function fmtTokens(n) {
      n = Number(n) || 0
      if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
      if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
      if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
      return String(Math.round(n))
    }
    // 成本统一以 CNY（¥）显示（host 算的就是 CNY；货币统一，不再换算 USD）。
    function fmtMoney(cny) {
      var v = Number(cny) || 0
      return '¥' + v.toFixed(4)
    }

    // ------------------------------------------------------------- entry

    var footerLastClick = 0
    function fireFooter(ev) {
      if (ev) { try { ev.preventDefault(); ev.stopPropagation() } catch (e) { /* noop */ } }
      var now = Date.now()
      if (now - footerLastClick < 400) return
      footerLastClick = now
      setOpen(!getOpen())
    }
    function bindNativeClick(node, fn) {
      if (!node || node.__dshdUsageBound) return
      node.__dshdUsageBound = true
      node.addEventListener('click', fn)
    }
    function UsageEntry(props) {
      var [hover, setHover] = useState(false)
      var wide = !props || props.wide !== false
      var label = '用量'
      return el('button', {
        ref: function (n) { bindNativeClick(n, fireFooter) },
        onClick: fireFooter,
        onMouseEnter: function () { setHover(true) },
        onMouseLeave: function () { setHover(false) },
        type: 'button',
        className: 'dshd-usage-entry',
        title: label,
        'aria-label': label,
        style: {
          boxSizing: 'border-box', cursor: 'pointer', flex: '0 0 auto',
          width: wide ? 'calc(100% + 8px)' : '36px',
          height: wide ? '34px' : '36px',
          margin: wide ? '4px -4px' : '8px 0 10px',
          padding: wide ? '6px 2px 6px 10px' : '0',
          alignItems: 'center', justifyContent: wide ? 'flex-start' : 'center',
          gap: wide ? '8px' : '0', border: 'none',
          borderRadius: wide ? '12px' : '50%',
          color: 'var(--dsw-alias-label-primary, #222)',
          background: hover ? 'var(--dsw-alias-interactive-bg-hover, rgb(0 0 0 / 5%))' : 'transparent',
          font: 'inherit', textAlign: 'left', display: 'flex', overflow: 'hidden',
        },
      }, [
        el(UsageGlyph, { key: 'g', size: wide ? 14 : 18 }),
        wide ? el('span', { key: 'l', style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: '0 1 auto', minWidth: '0' } }, label) : null,
      ])
    }

    // ------------------------------------------------------------- sections

    // Card: bordered, rounded, padded wrapper per module (dsh 原生 Block 形态)。
    function Card(props) {
      return el('div', {
        style: {
          border: '1px solid var(--dsw-alias-border-default, #e5e7eb)',
          borderRadius: '14px',
          background: 'var(--dsw-alias-bg-layer-3, #fbfbfc)',
          padding: '12px 14px',
          display: 'flex', flexDirection: 'column', gap: '10px',
          width: '100%', boxSizing: 'border-box',
          boxShadow: '0 1px 3px rgba(0,0,0,.04)',
          transition: 'box-shadow .2s ease, border-color .2s ease',
        },
        onMouseEnter: function (e) { try { e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,.07)'; e.currentTarget.style.borderColor = 'var(--dsw-alias-border-strong, #c9cdd6)' } catch (err) { /* noop */ } },
        onMouseLeave: function (e) { try { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.04)'; e.currentTarget.style.borderColor = 'var(--dsw-alias-border-default, #e5e7eb)' } catch (err) { /* noop */ } },
      }, [
        props.title ? el('div', { key: 't', style: { display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '13px', color: INK } }, [
          el('span', { key: 'bar', style: { width: '3px', height: '12px', borderRadius: '2px', background: 'var(--dsw-alias-accent-strong, #4d6bfe)', flex: '0 0 auto' } }),
          el('span', { key: 'txt' }, props.title),
        ]) : null,
        props.children,
      ])
    }

    // 余额
    function BalanceTab(props) {
      var [data, setData] = useState(null)
      var [provider, setProvider] = useState('deepseek')
      var [loading, setLoading] = useState(false)
      function load() {
        setLoading(true)
        fetchJson('/dsh-usage/balance?provider=' + encodeURIComponent(provider)).then(function (d) { setData(d); setLoading(false) })
      }
      useEffect(function () { load() }, [provider])
      // 自动刷新：props.refreshTick 变化时重新拉取
      useEffect(function () { if (props.refreshTick > 0) load() }, [props.refreshTick])
      var providers = props.providers || []
      var providerName = { deepseek: 'DeepSeek', openrouter: 'OpenRouter' }[data && data.provider ? data.provider : provider] || provider
      var customLabel = {}
      providers.forEach(function (p) { customLabel[p.id] = p.label || p.id })
      if (customLabel[provider]) providerName = customLabel[provider]
      return el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, [
        el('div', { key: 'hd', style: { display: 'flex', alignItems: 'center', gap: '8px', width: '100%' } }, [
          el('span', { key: 't', style: { fontWeight: 600, fontSize: '13px', color: INK, flex: '1 1 auto' } }, '供应商余额'),
          el('select', {
            key: 'pr', value: provider, style: SELECT,
            onChange: function (e) { setProvider(e.target.value) },
          }, [
            el('option', { key: 'ds', value: 'deepseek' }, 'DeepSeek'),
            el('option', { key: 'or', value: 'openrouter' }, 'OpenRouter'),
          ].concat(providers.map(function (p) {
            return el('option', { key: p.id, value: p.id }, (p.label || p.id) + (p.type ? ' · ' + p.type : ''))
          }))),
          el('button', { key: 'r', type: 'button', style: BTN, onClick: load, disabled: loading }, loading ? '加载中…' : '刷新'),
        ]),
        data === null ? el('div', { key: 'e', style: MUTED }, '余额数据加载中…')
          : !data.ok ? el('div', { key: 'e', style: { display: 'flex', alignItems: 'center', gap: '6px', color: WARN } }, [
              el(Glyph, { key: 'i', paths: ALERT_PATHS, viewBox: '0 0 24 24', size: 13, color: WARN }),
              el('span', { key: 'm' }, data.message || '无法读取余额（未配置 API Key？）'),
            ])
          : el('div', { key: 'cards', style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
              (data.infos || []).map(function (info) {
                var symbol = info.currency === 'CNY' ? '¥' : info.currency === 'USD' ? '$' : ''
                return el('div', { key: info.currency, style: { border: '1px solid var(--dsw-alias-border-default, #e5e7eb)', borderRadius: '12px', padding: '10px 12px', background: 'var(--dsw-alias-bg-layer-2, #ffffff)' } }, [
                  el('div', { key: 'c', style: { display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '12px', color: 'var(--dsw-alias-label-secondary, #4b5563)' } },
                    providerName + ' · ' + info.currency),
                  el('div', { key: 't', style: { fontSize: '22px', fontWeight: 800, margin: '4px 0', letterSpacing: '0.5px', background: 'linear-gradient(135deg, var(--dsw-alias-accent-strong, #4d6bfe), var(--dsw-alias-accent-weak, #7b96ff))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } },
                    symbol + (info.totalBalance == null ? '—' : info.totalBalance)),
                  el('div', { key: 'm', style: MUTED2 }, '充值 ' + symbol + (info.toppedUpBalance ?? '—') + ' · 赠金 ' + symbol + (info.grantedBalance ?? '—')),
                ])
              })),
      ])
    }

    // 用量与命中率
    var SELECT = {
      border: '1px solid var(--dsw-alias-border-default, #d8dde3)',
      borderRadius: '8px', padding: '4px 8px', maxWidth: '180px',
      background: 'transparent', color: 'inherit', font: 'inherit', fontSize: '12px',
    }

    // 预算卡片：额度 / 已用 / 进度条 / 预警（需求：预算管理）
    function BudgetCard(props) {
      var [data, setData] = useState(null)
      function load() {
        fetchJson('/dsh-usage/budget').then(function (d) { setData(d) })
      }
      useEffect(function () { load() }, [])
      useEffect(function () { if (props.refreshTick > 0) load() }, [props.refreshTick])
      if (!data) return el('div', { key: 'e', style: MUTED }, '预算状态加载中…')
      if (!data.enabled) {
        return el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
          el('span', { key: 't', style: MUTED2 }, '预算未启用'),
          el('span', { key: 'sp', style: { flex: '1 1 auto' } }),
          el('button', { key: 'go', type: 'button', style: BTN, onClick: function () { if (props.onOpenSettings) props.onOpenSettings() } }, '去设置'),
        ])
      }
      var pct = Math.min(100, data.pct || 0)
      var barColor = data.warn ? '#d64541' : data.alert ? '#b45409' : '#1f9d55'
      var periodLabel = { daily: '今日', monthly: '本月', cumulative: '累计' }[data.period] || data.period
      return el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, [
        el('div', { key: 'hd', style: { display: 'flex', alignItems: 'center', gap: '8px', width: '100%' } }, [
          el('span', { key: 't', style: { fontWeight: 600, fontSize: '13px', color: INK, flex: '1 1 auto' } }, '预算（' + periodLabel + '）'),
          el('span', { key: 'p', style: { fontWeight: 700, fontSize: '13px', color: barColor } }, pct.toFixed(0) + '%'),
          el('button', { key: 'r', type: 'button', style: BTN, onClick: load }, '刷新'),
        ]),
        el('div', { key: 'bar', style: { height: '8px', borderRadius: '4px', background: 'var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.08))', overflow: 'hidden', width: '100%' } },
          el('div', { key: 'fill', style: { height: '100%', width: pct + '%', borderRadius: '4px', background: barColor, transition: 'width .4s ease' } })),
        el('div', { key: 'nums', style: { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #4b5563)' } }, [
          el('span', { key: 'spent' }, '已用 ¥' + (data.spentCny != null ? Number(data.spentCny).toFixed(2) : '—')),
          el('span', { key: 'limit' }, '额度 ¥' + (data.limitCny != null ? Number(data.limitCny).toFixed(2) : '—')),
          el('span', { key: 'left' }, '剩余 ¥' + (data.remainingCny != null ? Number(data.remainingCny).toFixed(2) : '—')),
          el('span', { key: 'sp', style: { flex: '1 1 auto' } }),
          data.warn ? el('span', { key: 'w', style: { color: '#d64541', fontWeight: 600 } }, '⚠ 已超支') : (data.alert ? el('span', { key: 'w', style: { color: '#b45409', fontWeight: 600 } }, '⚠ 接近上限') : null),
        ]),
      ])
    }

    // ------------------------------------------------------------- 设置弹窗
    // 顶部标题栏「设置」按钮打开的可视化配置弹窗：单价 / 预算 / 第三方供应商 /
    // 刷新间隔。全部表单化（无 JSON 文本编辑），货币统一 CNY（¥）。
    function SettingsModal(props) {
      var [cfg, setCfg] = useState(null)
      var [saving, setSaving] = useState(false)
      var [msg, setMsg] = useState('')
      // 编辑状态
      var [budgetEnabled, setBudgetEnabled] = useState(false)
      var [budgetLimit, setBudgetLimit] = useState('')
      var [budgetPeriod, setBudgetPeriod] = useState('monthly')
      var [refresh, setRefresh] = useState('300')
      // 单价：{ model: {cacheHit, cacheMiss, output} }
      var [pricing, setPricing] = useState(null)
      // 供应商：[{id,label,type,baseUrl,apiKeyEnv,balancePath,balanceField,currency,unit}]
      var [providers, setProviders] = useState([])

      function load() {
        fetchJson('/dsh-usage/config').then(function (d) {
          if (!d) return
          setCfg(d)
          var b = d.budget || {}
          setBudgetEnabled(b.enabled === true)
          setBudgetLimit(b.limitCny ? String(b.limitCny) : '')
          setBudgetPeriod(b.period || 'monthly')
          setRefresh(String(d.refreshSeconds != null ? d.refreshSeconds : 300))
          // pricing: 转成可编辑数组 [{model, cacheHit, cacheMiss, output}]
          var list = []
          var p = d.pricing || {}
          for (var m in p) {
            if (Object.prototype.hasOwnProperty.call(p, m)) {
              var e = p[m] || {}
              list.push({ model: m, cacheHit: e.cacheHit != null ? String(e.cacheHit) : '', cacheMiss: e.cacheMiss != null ? String(e.cacheMiss) : '', output: e.output != null ? String(e.output) : '' })
            }
          }
          setPricing(list)
          setProviders((d.providers || []).map(function (x) {
            return {
              id: x.id || '', label: x.label || '', type: x.type || 'generic',
              baseUrl: x.baseUrl || '', apiKeyEnv: x.apiKeyEnv || '',
              balancePath: x.balancePath || '', balanceField: x.balanceField || '',
              currency: x.currency || 'CNY', unit: x.unit ? String(x.unit) : '1',
            }
          }))
        })
      }
      useEffect(function () { load() }, [])

      function setPricingRow(idx, field, val) {
        setPricing(function (list) {
          var next = (list || []).map(function (r) { return Object.assign({}, r) })
          if (!next[idx]) next[idx] = { model: '', cacheHit: '', cacheMiss: '', output: '' }
          next[idx][field] = val
          return next
        })
      }
      function addPricingRow() {
        setPricing(function (list) { return (list || []).concat([{ model: '', cacheHit: '', cacheMiss: '', output: '' }]) })
      }
      function removePricingRow(idx) {
        setPricing(function (list) { return (list || []).filter(function (_, i) { return i !== idx }) })
      }
      function setProviderRow(idx, field, val) {
        setProviders(function (list) {
          var next = list.map(function (r) { return Object.assign({}, r) })
          if (!next[idx]) next[idx] = { id: '', label: '', type: 'generic', baseUrl: '', apiKeyEnv: '', balancePath: '', balanceField: '', currency: 'CNY', unit: '1' }
          next[idx][field] = val
          return next
        })
      }
      function addProviderRow() {
        setProviders(function (list) {
          return list.concat([{ id: '', label: '', type: 'generic', baseUrl: '', apiKeyEnv: '', balancePath: '', balanceField: '', currency: 'CNY', unit: '1' }])
        })
      }
      function removeProviderRow(idx) {
        setProviders(function (list) { return list.filter(function (_, i) { return i !== idx }) })
      }

      function save() {
        setSaving(true); setMsg('')
        var body = {}
        // 单价 → { model: {cacheHit, cacheMiss, output} }
        var pOut = {}
        var pBad = false
        ;(pricing || []).forEach(function (r) {
          var m = (r.model || '').trim()
          if (!m) return
          var hit = Number(r.cacheHit), miss = Number(r.cacheMiss), out = Number(r.output)
          if (!(hit >= 0) || !(miss >= 0) || !(out >= 0)) { pBad = true; return }
          pOut[m] = { cacheHit: hit, cacheMiss: miss, output: out }
        })
        if (pBad) { setMsg('单价必须是 ≥0 的数字'); setSaving(false); return }
        body.pricing = pOut
        // 供应商
        var provOut = []
        var provBad = false
        ;(providers || []).forEach(function (r) {
          var id = (r.id || '').trim()
          if (!id) return
          if (!r.baseUrl && r.type !== 'generic') { provBad = true; return }
          provOut.push({
            id: id, label: (r.label || '').trim(), type: r.type || 'generic',
            baseUrl: (r.baseUrl || '').trim(), apiKeyEnv: (r.apiKeyEnv || '').trim(),
            balancePath: (r.balancePath || '').trim(), balanceField: (r.balanceField || '').trim(),
            currency: r.currency || 'CNY', unit: Number(r.unit) > 0 ? Number(r.unit) : 1,
          })
        })
        if (provBad) { setMsg('供应商 baseUrl 不能为空'); setSaving(false); return }
        body.providers = provOut
        body.budget = {
          enabled: budgetEnabled,
          limitCny: Number(budgetLimit) > 0 ? Number(budgetLimit) : 0,
          period: budgetPeriod,
        }
        var refreshN = Number(refresh)
        if (refreshN >= 0) body.refreshSeconds = refreshN
        postJson('/dsh-usage/config', body).then(function (r) {
          setSaving(false)
          if (r && r.ok) { setMsg('已保存并生效 ✓'); if (props.onSaved) props.onSaved() }
          else setMsg('保存失败：' + ((r && r.message) || '未知错误'))
        })
      }

      var INPUT = {
        border: '1px solid var(--dsw-alias-border-default, #d8dde3)',
        borderRadius: '8px', padding: '4px 8px', background: 'transparent',
        color: 'inherit', font: 'inherit', fontSize: '12px', boxSizing: 'border-box',
      }
      var LBL = { flex: '0 0 90px', fontSize: '12px', color: 'var(--dsw-alias-label-secondary, #4b5563)' }
      var SMALL = Object.assign({}, INPUT, { width: '76px' })

      return el('div', { style: { position: 'fixed', inset: '0', zIndex: '1300', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, [
        el('div', { key: 'mask', onClick: props.onClose,
          style: { position: 'absolute', inset: '0', background: 'var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.24))', backdropFilter: 'var(--dsw-mask-blur, blur(2px))' } }),
        el('div', { key: 'box', style: {
          position: 'relative', width: '600px', maxWidth: 'calc(100vw - 48px)',
          maxHeight: 'min(80vh, 640px)', display: 'flex', flexDirection: 'column',
          borderRadius: '20px', background: 'var(--dsw-alias-bg-layer-2, #ffffff)',
          boxShadow: 'var(--dsw-shadow-lv3, 0 8px 40px rgba(0,0,0,0.25))',
          color: INK, font: 'inherit', fontSize: '13px', lineHeight: '20px', overflow: 'hidden',
        } }, [
          el('header', { key: 'h', style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', borderBottom: '1px solid var(--dsw-alias-border-default, #e8e8e8)' } }, [
            el(Glyph, { paths: SETTINGS_PATHS, viewBox: '0 0 24 24', size: 16 }),
            el('span', { key: 't', style: { fontWeight: 600, fontSize: '14px', flex: '1 1 auto' } }, '用量设置'),
            el('span', { key: 'msg', style: { fontSize: '11px', color: msg.indexOf('失败') >= 0 ? '#d64541' : '#1f9d55' } }, msg),
            el('button', { key: 'x', type: 'button', onClick: props.onClose, style: Object.assign({}, BTN, { minWidth: '28px', padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }) },
              el(Glyph, { paths: CLOSE_PATHS, viewBox: '0 0 24 24', size: 14 })),
          ]),
          el('div', { key: 'body', style: { flex: '1 1 auto', minHeight: '0', overflowY: 'auto', padding: '16px 20px' } }, [
            !cfg ? el('div', { key: 'e', style: MUTED }, '配置加载中…')
              : el('div', { key: 'form', style: { display: 'flex', flexDirection: 'column', gap: '16px' } }, [
                  // 预算
                  el('div', { key: 'sec-budget', style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, [
                    el('div', { key: 't', style: { fontWeight: 600, fontSize: '12px', color: INK } }, '预算（成本统一 ¥ CNY）'),
                    el('div', { key: 'row', style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } }, [
                      el('label', { key: 'on', style: { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' } }, [
                        el('input', { key: 'c', type: 'checkbox', checked: budgetEnabled, onChange: function (e) { setBudgetEnabled(e.target.checked) } }),
                        '启用',
                      ]),
                      el('input', { key: 'lim', type: 'number', step: '1', min: '0', placeholder: '额度 ¥/周期', value: budgetLimit, onChange: function (e) { setBudgetLimit(e.target.value) }, style: Object.assign({}, INPUT, { width: '120px' }) }),
                      el('select', { key: 'pd', value: budgetPeriod, style: SELECT, onChange: function (e) { setBudgetPeriod(e.target.value) } }, [
                        el('option', { key: 'd', value: 'daily' }, '每日'),
                        el('option', { key: 'm', value: 'monthly' }, '每月'),
                        el('option', { key: 'c', value: 'cumulative' }, '累计'),
                      ]),
                      el('span', { key: 'sp', style: { flex: '1 1 auto' } }),
                      el('span', { key: 'h', style: { fontSize: '11px', color: 'var(--dsw-alias-label-tertiary, #6b7684)' } }, '自动刷新(秒)'),
                      el('input', { key: 'rf', type: 'number', step: '30', min: '0', value: refresh, onChange: function (e) { setRefresh(e.target.value) }, style: Object.assign({}, INPUT, { width: '70px' }) }),
                    ]),
                  ]),
                  // 单价（可视化行编辑）
                  el('div', { key: 'sec-price', style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, [
                    el('div', { key: 't', style: { fontWeight: 600, fontSize: '12px', color: INK } }, '单价（¥ / 百万 tokens）'),
                    el('div', { key: 'head', style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--dsw-alias-label-tertiary, #6b7684)' } }, [
                      el('span', { key: 'm', style: { width: '150px', flex: '0 0 auto' } }, '模型'),
                      el('span', { key: 'h', style: { width: '76px', flex: '0 0 auto', textAlign: 'right' } }, '命中'),
                      el('span', { key: 'x', style: { width: '76px', flex: '0 0 auto', textAlign: 'right' } }, '未命中'),
                      el('span', { key: 'o', style: { width: '76px', flex: '0 0 auto', textAlign: 'right' } }, '输出'),
                      el('span', { key: 'sp', style: { flex: '1 1 auto' } }),
                      el('span', { key: 'd', style: { width: '24px' } }, ''),
                    ]),
                    (pricing || []).map(function (r, i) {
                      return el('div', { key: 'r' + i, style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
                        el('input', { key: 'm', value: r.model, placeholder: 'deepseek-v4-flash', onChange: function (e) { setPricingRow(i, 'model', e.target.value) }, style: Object.assign({}, INPUT, { width: '150px', flex: '0 0 auto' }) }),
                        el('input', { key: 'h', type: 'number', step: '0.01', min: '0', value: r.cacheHit, onChange: function (e) { setPricingRow(i, 'cacheHit', e.target.value) }, style: Object.assign({}, SMALL, { textAlign: 'right' }) }),
                        el('input', { key: 'x', type: 'number', step: '0.01', min: '0', value: r.cacheMiss, onChange: function (e) { setPricingRow(i, 'cacheMiss', e.target.value) }, style: Object.assign({}, SMALL, { textAlign: 'right' }) }),
                        el('input', { key: 'o', type: 'number', step: '0.01', min: '0', value: r.output, onChange: function (e) { setPricingRow(i, 'output', e.target.value) }, style: Object.assign({}, SMALL, { textAlign: 'right' }) }),
                        el('span', { key: 'sp', style: { flex: '1 1 auto' } }),
                        el('button', { key: 'rm', type: 'button', onClick: function () { removePricingRow(i) }, style: Object.assign({}, BTN, { color: '#b45409', minWidth: '24px', padding: '0 6px' }) }, '×'),
                      ])
                    }),
                    el('button', { key: 'add', type: 'button', onClick: addPricingRow, style: BTN }, '+ 添加模型'),
                    el('div', { key: 'h', style: { fontSize: '11px', color: 'var(--dsw-alias-label-tertiary, #6b7684)' } }, '留空模型名的行会被忽略；内置价格会被覆盖。'),
                  ]),
                  // 第三方供应商（可视化行编辑）
                  el('div', { key: 'sec-prov', style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, [
                    el('div', { key: 't', style: { fontWeight: 600, fontSize: '12px', color: INK } }, '第三方供应商（余额检测）'),
                    (providers || []).map(function (r, i) {
                      return el('div', { key: 'p' + i, style: { display: 'flex', flexDirection: 'column', gap: '4px', border: '1px solid var(--dsw-alias-border-default, #e5e7eb)', borderRadius: '10px', padding: '8px 10px' } }, [
                        el('div', { key: 'row1', style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
                          el('input', { key: 'id', value: r.id, placeholder: 'id（如 myapi）', onChange: function (e) { setProviderRow(i, 'id', e.target.value) }, style: Object.assign({}, INPUT, { width: '120px' }) }),
                          el('input', { key: 'lb', value: r.label, placeholder: '显示名', onChange: function (e) { setProviderRow(i, 'label', e.target.value) }, style: Object.assign({}, INPUT, { width: '110px' }) }),
                          el('select', { key: 'ty', value: r.type, style: SELECT, onChange: function (e) { setProviderRow(i, 'type', e.target.value) } }, [
                            el('option', { key: 'g', value: 'generic' }, '通用'),
                            el('option', { key: 'n', value: 'newapi' }, 'New API'),
                            el('option', { key: 's', value: 'sub2api' }, 'Sub2API'),
                          ]),
                          el('span', { key: 'sp', style: { flex: '1 1 auto' } }),
                          el('button', { key: 'rm', type: 'button', onClick: function () { removeProviderRow(i) }, style: Object.assign({}, BTN, { color: '#b45409', minWidth: '24px', padding: '0 6px' }) }, '×'),
                        ]),
                        el('div', { key: 'row2', style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } }, [
                          el('input', { key: 'bu', value: r.baseUrl, placeholder: 'baseUrl（如 https://api.xxx.com）', onChange: function (e) { setProviderRow(i, 'baseUrl', e.target.value) }, style: Object.assign({}, INPUT, { width: '200px', flex: '1 1 auto' }) }),
                          el('input', { key: 'ke', value: r.apiKeyEnv, placeholder: 'Key 环境变量', onChange: function (e) { setProviderRow(i, 'apiKeyEnv', e.target.value) }, style: Object.assign({}, INPUT, { width: '130px' }) }),
                          el('select', { key: 'cu', value: r.currency, style: SELECT, onChange: function (e) { setProviderRow(i, 'currency', e.target.value) } }, [
                            el('option', { key: 'cny', value: 'CNY' }, '¥ CNY'),
                            el('option', { key: 'usd', value: 'USD' }, '$ USD'),
                          ]),
                        ]),
                        el('div', { key: 'row3', style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } }, [
                          el('input', { key: 'bp', value: r.balancePath, placeholder: '余额路径（如 /user/balance）', onChange: function (e) { setProviderRow(i, 'balancePath', e.target.value) }, style: Object.assign({}, INPUT, { width: '150px' }) }),
                          el('input', { key: 'bf', value: r.balanceField, placeholder: '余额字段（如 balanceInfos.0.totalBalance）', onChange: function (e) { setProviderRow(i, 'balanceField', e.target.value) }, style: Object.assign({}, INPUT, { width: '190px', flex: '1 1 auto' }) }),
                          el('input', { key: 'un', value: r.unit, placeholder: '单位换算', onChange: function (e) { setProviderRow(i, 'unit', e.target.value) }, style: Object.assign({}, INPUT, { width: '70px' }) }),
                        ]),
                      ])
                    }),
                    el('button', { key: 'add', type: 'button', onClick: addProviderRow, style: BTN }, '+ 添加供应商'),
                  ]),
                ]),
          ]),
          el('footer', { key: 'f', style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', padding: '10px 16px', borderTop: '1px solid var(--dsw-alias-border-default, #e8e8e8)' } }, [
            el('button', { key: 'cancel', type: 'button', onClick: props.onClose, style: BTN }, '取消'),
            el('button', { key: 'save', type: 'button', onClick: save, disabled: saving, style: Object.assign({}, BTN, { color: '#fff', background: 'var(--dsw-alias-accent-strong, #4d6bfe)', borderColor: 'transparent' }) }, saving ? '保存中…' : '保存'),
          ]),
        ]),
      ])
    }

    function UsageTab(props) {
      var [data, setData] = useState(null)
      var [page, setPage] = useState(1)
      function load() {
        fetchJson(sessionUrl('/dsh-usage/session', props.sessionId)).then(function (d) { setData(d) })
      }
      useEffect(function () { load() }, [props.sessionId])
      useEffect(function () { if (props.refreshTick > 0) load() }, [props.refreshTick])
      useEffect(function () { setPage(1) }, [props.sessionId])
      var d = data && !data.noSession ? data : null
      var rounds = (d && d.rounds) || []
      // 倒序：最新在前
      var descRounds = rounds.slice().reverse()
      var pages = Math.max(1, Math.ceil(descRounds.length / USAGE_PAGE))
      var cur = Math.min(page, pages)
      var pageRounds = descRounds.slice((cur - 1) * USAGE_PAGE, cur * USAGE_PAGE)
      return el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, [
        el('div', { key: 'hd', style: { display: 'flex', alignItems: 'center', gap: '8px', width: '100%' } }, [
          el('span', { key: 't', style: { fontWeight: 600, fontSize: '13px', color: INK, flex: '1 1 auto' } }, '用量与命中率'),
          el('select', {
            key: 'sel', value: props.sessionId || '', style: SELECT,
            onChange: function (e) {
              var v = e.target.value
              props.onSessionChange(v ? v : null)
            },
          }, [
            el('option', { key: 'all', value: '' }, '全部会话'),
          ].concat((props.sessionList || []).map(function (s) {
            return el('option', { key: s.id, value: s.id, title: s.id }, s.title || s.id)
          }))),
        ]),
        !d ? el('div', { key: 'e', style: MUTED }, '暂无会话用量数据。' + ((data && data.message) || ''))
          : [
              el('div', { key: 'sum', style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', width: '100%' } }, [
                el('div', { key: 'b', style: MUTED2 }, '计费输入 ' + fmtTokens(d.billedInput) + ' tokens'),
                el('div', { key: 'h', style: { fontWeight: 700, color: INK, fontSize: '14px' } }, '命中率 ' + (d.hitRate == null ? '—' : d.hitRate + '%')),
                el('div', { key: 'c', style: MUTED2 }, '成本（估算）' + fmtMoney(d.costCny)),
                el('div', { key: 'sp', style: { flex: '1 1 auto' } }),
                el('button', { key: 'r', type: 'button', style: BTN, onClick: load }, '重新统计'),
              ]),
              el('div', { key: 'rows', style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                pageRounds.map(function (r, i) {
                  return el('div', { key: i, style: { display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px' } }, [
                    el('span', { key: 'm', style: { flex: '1 1 auto', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.model || '?'),
                    el('span', { key: 'u', style: MUTED2 }, '入 ' + fmtTokens(r.uncachedInput)),
                    el('span', { key: 'c', style: MUTED2 }, '命中 ' + fmtTokens(r.cacheRead)),
                    el('span', { key: 'o', style: MUTED2 }, '出 ' + fmtTokens(r.output)),
                    el('span', { key: 'co', style: { color: ACCENT } }, fmtMoney(r.costCny)),
                  ])
                })),
              pages > 1 ? el('div', { key: 'pg', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' } }, [
                el('button', { key: 'prev', type: 'button', style: PAGE_BTN, disabled: cur <= 1, onClick: function () { setPage(cur - 1) } }, '上一页'),
                el('span', { key: 'info', style: MUTED2 }, '第 ' + cur + ' / ' + pages + ' 页 · 共 ' + descRounds.length + ' 轮'),
                el('button', { key: 'next', type: 'button', style: PAGE_BTN, disabled: cur >= pages, onClick: function () { setPage(cur + 1) } }, '下一页'),
              ]) : null,
            ],
      ])
    }

    // 折线图（仅显示当天：按小时聚合，平滑曲线；Token / 成本双视图）
    function ChartTab(props) {
      var [data, setData] = useState(null)
      var [view, setView] = useState('token')   // token | cost
      var [hover, setHover] = useState(-1)
      function load() {
        fetchJson(sessionUrl('/dsh-usage/session', props.sessionId)).then(function (d) { setData(d) })
      }
      useEffect(function () { load() }, [props.sessionId])
      useEffect(function () { if (props.refreshTick > 0) load() }, [props.refreshTick])
      useEffect(function () { setHover(-1) }, [props.sessionId, view])
      var d = data && !data.noSession ? data : null
      var rounds = (d && d.rounds) || []
      var W = 620, H = 200, PAD = 28, N = 24

      // 仅聚合当天数据，按小时（0–23）分桶
      var hours = []
      var now = new Date()
      var todayKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0')
      for (var h = 0; h < N; h++) {
        hours.push({ hour: h, label: String(h).padStart(2, '0') + ':00', uncachedInput: 0, cacheRead: 0, output: 0, costCny: 0 })
      }
      rounds.forEach(function (r) {
        if (!r.time) return
        var dt = new Date(r.time)
        var k = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0')
        if (k !== todayKey) return
        var cell = hours[dt.getHours()]
        if (!cell) return
        cell.uncachedInput += r.uncachedInput || 0
        cell.cacheRead += r.cacheRead || 0
        cell.output += r.output || 0
        cell.costCny += r.costCny || 0
      })

      var max = 1
      if (view === 'cost') {
        hours.forEach(function (x) { max = Math.max(max, x.costCny) })
      } else {
        hours.forEach(function (x) { max = Math.max(max, x.uncachedInput, x.cacheRead, x.output) })
      }
      function xAt(i) { return PAD + (i / (N - 1)) * (W - PAD * 2) }
      function yAt(v) { return H - PAD - (v / max) * (H - PAD * 2) }
      // 平滑曲线：Catmull-Rom 样条转三次贝塞尔
      function smoothLine(points) {
        if (points.length < 2) return ''
        var d = 'M ' + points[0][0].toFixed(1) + ' ' + points[0][1].toFixed(1)
        for (var i = 0; i < points.length - 1; i++) {
          var p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)]
          var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6
          var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6
          d += ' C ' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1)
        }
        return d
      }
      // 折线样式：颜色 + 线型（实线 / 虚线 / 点线），颜色同时用于图例与悬浮提示。
      // 注意 ACCENT 是 CSS 变量，图例/提示里的"同色"文本无法直接用 CSS 变量做
      // stroke 外的渲染（fill 可用），这里统一用常量 + 变量双轨：
      //   lineStyle(key) -> {color, dash, solidColor}   solidColor = 纯色兜底
      var LINE_STYLES = {
        uncachedInput: { color: WARN, dash: null, label: '输入(未命中)' },
        cacheRead: { color: OK, dash: '5 3', label: '命中' },
        output: { color: ACCENT, dash: '2 3', label: '输出' },
        costCny: { color: ACCENT, dash: null, label: '成本(估算)' },
      }
      function lineStyle(key) {
        var s = LINE_STYLES[key] || { color: INK, dash: null, label: key }
        return { color: s.color, dash: s.dash, label: s.label }
      }
      function line(key) {
        var st = lineStyle(key)
        var pts = hours.map(function (x, i) { return [xAt(i), yAt(x[key])] })
        var props = { key: key, d: smoothLine(pts), fill: 'none', stroke: st.color, strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }
        if (st.dash) props.strokeDasharray = st.dash
        return el('path', props)
      }
      function onMove(e) {
        var rect = e.currentTarget.getBoundingClientRect()
        if (rect.width <= 0) return
        var vx = (e.clientX - rect.left) / rect.width * W
        var idx = Math.round((vx - PAD) / (W - PAD * 2) * (N - 1))
        if (idx < 0) idx = 0
        if (idx > N - 1) idx = N - 1
        setHover(idx)
      }
      var cell = hover >= 0 ? hours[hover] : null
      var yAxisLabel = view === 'cost' ? 'CNY' : 'tokens'

      return el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, [
        el('div', { key: 'lg', style: { display: 'flex', gap: '10px', fontSize: '11px', alignItems: 'center', color: 'var(--dsw-alias-label-secondary, #4b5563)' } }, [
          el('span', { key: 'today', style: { fontWeight: 600, color: 'var(--dsw-alias-label-primary, #1f2329)' } }, '仅今天'),
          // 图例：每条线用「对应颜色 + 对应线型」的小线段标识，文字说明含义
          view === 'token' ? el('span', { key: 'legi', style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } }, [
            el('svg', { key: 'si', width: '14', height: '8', viewBox: '0 0 14 8' }, el('line', { x1: '0', y1: '4', x2: '14', y2: '4', stroke: lineStyle('uncachedInput').color, strokeWidth: '2' })),
            el('span', { key: 'ti' }, '输入(未命中)'),
          ]) : null,
          view === 'token' ? el('span', { key: 'legc', style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } }, [
            el('svg', { key: 'sc', width: '14', height: '8', viewBox: '0 0 14 8' }, el('line', { x1: '0', y1: '4', x2: '14', y2: '4', stroke: lineStyle('cacheRead').color, strokeWidth: '2', strokeDasharray: lineStyle('cacheRead').dash })),
            el('span', { key: 'tc' }, '命中'),
          ]) : null,
          view === 'token' ? el('span', { key: 'lego', style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } }, [
            el('svg', { key: 'so', width: '14', height: '8', viewBox: '0 0 14 8' }, el('line', { x1: '0', y1: '4', x2: '14', y2: '4', stroke: lineStyle('output').color, strokeWidth: '2', strokeDasharray: lineStyle('output').dash })),
            el('span', { key: 'to' }, '输出'),
          ]) : null,
          view === 'cost' ? el('span', { key: 'legco', style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } }, [
            el('svg', { key: 'sco', width: '14', height: '8', viewBox: '0 0 14 8' }, el('line', { x1: '0', y1: '4', x2: '14', y2: '4', stroke: lineStyle('costCny').color, strokeWidth: '2' })),
            el('span', { key: 'tco' }, '成本(估算)'),
          ]) : null,
          el('span', { key: 'sp', style: { flex: '1 1 auto' } }),
          el('button', { key: 'tv', type: 'button', onClick: function () { setView('token') }, style: Object.assign({}, BTN, { padding: '0 10px', minHeight: '24px', fontSize: '11px' }, view === 'token' ? { borderColor: ACCENT, color: ACCENT } : {}) }, 'Token'),
          el('button', { key: 'cv', type: 'button', onClick: function () { setView('cost') }, style: Object.assign({}, BTN, { padding: '0 10px', minHeight: '24px', fontSize: '11px' }, view === 'cost' ? { borderColor: ACCENT, color: ACCENT } : {}) }, '成本'),
        ]),
        el('div', {
          key: 'chart', style: { position: 'relative', width: '100%' },
          onMouseMove: onMove, onMouseLeave: function () { setHover(-1) },
        }, [
          el('svg', { key: 'svg', width: '100%', height: H, viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none' }, [
            el('line', { key: 'ax', x1: PAD, y1: H - PAD, x2: W - PAD, y2: H - PAD, stroke: 'var(--dsw-alias-border-default, #e5e7eb)' }),
            el('line', { key: 'ay', x1: PAD, y1: PAD, x2: PAD, y2: H - PAD, stroke: 'var(--dsw-alias-border-default, #e5e7eb)' }),
            view === 'token' ? line('uncachedInput') : null,
            view === 'token' ? line('cacheRead') : null,
            view === 'token' ? line('output') : null,
            view === 'cost' ? line('costCny') : null,
            hover >= 0 ? el('line', { key: 'vl', x1: xAt(hover), y1: PAD, x2: xAt(hover), y2: H - PAD, stroke: 'var(--dsw-alias-border-strong, #b0b7c3)', strokeDasharray: '3 3' }) : null,
            hover >= 0 && view === 'token' ? [
              el('circle', { key: 'i', cx: xAt(hover), cy: yAt(hours[hover].uncachedInput), r: 3, fill: '#b45409' }),
              el('circle', { key: 'c', cx: xAt(hover), cy: yAt(hours[hover].cacheRead), r: 3, fill: OK }),
              el('circle', { key: 'o', cx: xAt(hover), cy: yAt(hours[hover].output), r: 3, fill: ACCENT }),
            ] : null,
            hover >= 0 && view === 'cost' ? el('circle', { key: 'co', cx: xAt(hover), cy: yAt(hours[hover].costCny), r: 3, fill: ACCENT }) : null,
            hours.map(function (x, i) {
              if (i % 3 !== 0 && i !== 0 && i !== N - 1) return null
              return el('text', { key: 'dl' + i, x: xAt(i), y: H - PAD + 14, fontSize: 9, fill: 'var(--dsw-alias-label-tertiary, #6b7684)', textAnchor: 'middle' }, x.label)
            }),
            el('text', { key: 'mx', x: W - PAD, y: H - PAD + 14, fontSize: 10, fill: MUTED.color, textAnchor: 'end' }, yAxisLabel),
            rounds.length === 0 ? el('text', { key: 'em', x: W / 2, y: H / 2, fontSize: 12, fill: MUTED.color, textAnchor: 'middle' }, '暂无足够的轮次数据') : null,
          ]),
          cell ? el('div', {
            key: 'tip',
            style: {
              position: 'absolute', top: '4px', left: (xAt(hover) / W * 100) + '%',
              transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: '2',
              background: 'var(--dsw-alias-bg-layer-2, #fff)', border: '1px solid var(--dsw-alias-border-default, #e5e7eb)',
              borderRadius: '8px', padding: '6px 10px', fontSize: '11px', lineHeight: '16px',
              boxShadow: 'var(--dsw-shadow-lv3, 0 4px 16px rgba(0,0,0,.18))', whiteSpace: 'nowrap',
            },
          }, view === 'token'
            ? [
                el('div', { key: 'dt', style: { fontWeight: 600 } }, cell.label),
                // 每行文字颜色 = 对应折线颜色（线型与图例一致，便于对照）
                el('div', { key: 'i', style: { color: lineStyle('uncachedInput').color } }, '输入(未命中) ' + fmtTokens(cell.uncachedInput)),
                el('div', { key: 'c', style: { color: lineStyle('cacheRead').color } }, '命中 ' + fmtTokens(cell.cacheRead)),
                el('div', { key: 'o', style: { color: lineStyle('output').color } }, '输出 ' + fmtTokens(cell.output)),
                el('div', { key: 'co', style: { color: lineStyle('costCny').color } }, '成本(估算) ' + fmtMoney(cell.costCny)),
              ]
            : [
                el('div', { key: 'dt', style: { fontWeight: 600 } }, cell.label),
                el('div', { key: 'co', style: { color: lineStyle('costCny').color } }, '成本(估算) ' + fmtMoney(cell.costCny)),
              ]) : null,
        ]),
      ])
    }

    // 热力图（时间 / 会话 两模式，GitHub 贡献绿阶）
    function HeatTab(props) {
      var [data, setData] = useState(null)
      var [mode, setMode] = useState('time')   // time | session
      function load() {
        fetchJson(sessionUrl('/dsh-usage/session', props.sessionId)).then(function (d) { setData(d) })
      }
      useEffect(function () { load() }, [props.sessionId])
      useEffect(function () { if (props.refreshTick > 0) load() }, [props.refreshTick])
      var d = data && !data.noSession ? data : null
      var rounds = (d && d.rounds) || []

      // 标题映射：sessionList → title
      var titleMap = {}
      ;(props.sessionList || []).forEach(function (s) { titleMap[s.id] = s.title })
      function sessionLabel(sid) {
        var t = titleMap[sid]
        if (t) return t.length > 18 ? t.slice(0, 18) + '…' : t
        return (sid || '当前会话')
      }

      var max = 1
      var DOW = ['日', '一', '二', '三', '四', '五', '六']
      function shade(v) {
        if (v === 0) return 'var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.06))'
        var t = v / max
        if (t < 0.25) return 'rgb(155, 233, 168)'
        if (t < 0.5) return 'rgb(64, 196, 99)'
        if (t < 0.75) return 'rgb(25, 146, 63)'
        return 'rgb(0, 109, 40)'
      }

      // ---- 时间模式：最近 13 周 × 星期（GitHub 风格：每列 = 一周，
      // 列内固定从周日排到周六，头部不足一周的空位补齐，日期与星期标签对齐）----
      var cells = []
      if (mode === 'time') {
        var byDay = {}
        rounds.forEach(function (r) {
          if (!r.time) return
          var dt = new Date(r.time)
          var key = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0')
          byDay[key] = (byDay[key] || 0) + (r.uncachedInput || 0) + (r.cacheRead || 0) + (r.output || 0)
        })
        Object.keys(byDay).forEach(function (k) { if (byDay[k] > max) max = byDay[k] })
        var DAYS = 13 * 7
        var today = new Date(); today.setHours(0, 0, 0, 0)
        // 91 天前的日期及其星期；把它对齐到最近的周日作为网格起点，
        // 前面补 lead 个空白格，使每一列都从周日开始、与左侧星期标签对齐。
        var start = new Date(today.getTime() - (DAYS - 1) * 86400000)
        var lead = start.getDay()   // 0=周日 … 6=周六
        var gridStart = new Date(start.getTime() - lead * 86400000)
        var total = DAYS + lead
        for (var i = 0; i < total; i++) {
          var day = new Date(gridStart.getTime() + i * 86400000)
          var key = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0')
          var blank = i < lead   // 头部补齐的空位：不是 13 周内的真实日期
          cells.push({
            key: key,
            week: Math.floor(i / 7),
            dow: day.getDay(),
            blank: blank,
            v: blank ? 0 : (byDay[key] || 0),
            title: blank ? '' : (key + ' · ' + fmtTokens(byDay[key] || 0) + ' tokens'),
          })
        }
      } else {
        // ---- 会话模式：行 = 会话，列 = 该会话的轮次 ----
        var bySession = {}
        rounds.forEach(function (r) {
          var sid = r.sessionId || '当前会话'
          if (!bySession[sid]) bySession[sid] = { cells: [] }
          var s = bySession[sid]
          var idx = r.turn != null ? r.turn : s.cells.length
          while (s.cells.length <= idx) s.cells.push(0)
          s.cells[idx] += (r.uncachedInput || 0) + (r.cacheRead || 0) + (r.output || 0)
        })
        var sessionRows = Object.keys(bySession).map(function (sid) {
          var c = bySession[sid].cells
          c.forEach(function (v) { if (v > max) max = v })
          return { sid: sid, label: sessionLabel(sid), cells: c }
        })
      }

      var body = mode === 'time'
        ? (function () {
            // 列数 = 实际出现的 week 组数（头部补位可能让网格多出一列）
            var weekMax = 0
            cells.forEach(function (c) { if (c.week > weekMax) weekMax = c.week })
            var weeks = []
            for (var w = 0; w <= weekMax; w++) weeks.push(cells.filter(function (c) { return c.week === w }))
            return el('div', { key: 'grid', style: { display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: '3px', padding: '6px 0', width: '100%' } }, [
              el('div', { key: 'lbl', style: { flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: '3px', marginRight: '6px', fontSize: '10px', color: 'var(--dsw-alias-label-tertiary, #6b7684)' } },
                DOW.map(function (x, i) { return el('span', { key: i, style: { height: '18px', lineHeight: '18px' } }, x) })),
              weeks.map(function (wk, w) {
                return el('div', { key: w, style: { width: '18px', flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: '3px' } },
                  wk.map(function (c) {
                    // blank = 头部对齐补位（不是真实日期）：渲染为透明占位，
                    // 保证列内固定周日→周六的顺序，与左侧星期标签一一对应。
                    return el('div', { key: c.key, title: c.title, style: { width: '18px', height: '18px', borderRadius: '3px', background: c.blank ? 'transparent' : shade(c.v) } })
                  }))
              }),
            ])
          })()
        : el('div', { key: 'sgrid', style: { display: 'flex', flexDirection: 'column', gap: '3px', padding: '6px 0', width: '100%', overflowX: 'auto' } },
            sessionRows.map(function (sr, ri) {
              return el('div', { key: ri, style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
                el('div', { key: 'l', style: { flex: '0 0 130px', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #4b5563)', textAlign: 'right' } }, sr.label),
                el('div', { key: 'row', style: { display: 'flex', gap: '3px' } },
                  sr.cells.map(function (v, ci) {
                    return el('div', { key: ci, title: sr.label + ' · 轮次' + ci + ' · ' + fmtTokens(v) + ' tokens', style: { width: '18px', height: '18px', borderRadius: '3px', background: shade(v) } })
                  })),
              ])
            }))

      return el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, [
        el('div', { key: 'hd', style: { display: 'flex', alignItems: 'center', gap: '8px', width: '100%' } }, [
          el('span', { key: 't', style: { fontWeight: 600, fontSize: '12px', color: 'var(--dsw-alias-label-secondary, #4b5563)' } }, mode === 'time' ? '最近 13 周每日' : '各会话每轮'),
          el('span', { key: 'sp', style: { flex: '1 1 auto' } }),
          el('button', { key: 'tm', type: 'button', onClick: function () { setMode('time') }, style: Object.assign({}, PAGE_BTN, mode === 'time' ? { borderColor: ACCENT, color: ACCENT } : {}) }, '时间'),
          el('button', { key: 'sm', type: 'button', onClick: function () { setMode('session') }, style: Object.assign({}, PAGE_BTN, mode === 'session' ? { borderColor: ACCENT, color: ACCENT } : {}) }, '会话'),
        ]),
        body,
        el('div', { key: 'leg', style: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--dsw-alias-label-tertiary, #6b7684)' } }, [
          el('span', { key: 'lm' }, '少'),
          el('div', { key: 'l0', style: { width: '12px', height: '12px', borderRadius: '2px', background: shade(0) } }),
          el('div', { key: 'l1', style: { width: '12px', height: '12px', borderRadius: '2px', background: shade(max * 0.2) } }),
          el('div', { key: 'l2', style: { width: '12px', height: '12px', borderRadius: '2px', background: shade(max * 0.5) } }),
          el('div', { key: 'l3', style: { width: '12px', height: '12px', borderRadius: '2px', background: shade(max * 0.8) } }),
          el('div', { key: 'l4', style: { width: '12px', height: '12px', borderRadius: '2px', background: shade(max) } }),
          el('span', { key: 'rm' }, '多'),
        ]),
      ])
    }

    // 历史明细 / 用量逐轮列表：每页条数
    var HISTORY_PAGE = 15
    var USAGE_PAGE = 10
    var PAGE_BTN = Object.assign({}, BTN, { padding: '0 8px', minHeight: '24px', fontSize: '11px' })
    function csvEscape(v) {
      var s = String(v == null ? '' : v)
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    function downloadCsv(rows) {
      if (!rows || !rows.length) return
      var head = ['时间', '会话', '模型', '输入', '命中', '输出', '成本CNY(估算)']
      var lines = [head.join(',')].concat(rows.map(function (r) {
        var d = r.time ? new Date(r.time) : null
        var t = d ? String(d.getFullYear()) + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : ''
        return [t, r.sessionId || '', r.model || '', r.uncachedInput || 0, r.cacheRead || 0, r.output || 0, fmtMoney(r.costCny || 0)].map(csvEscape).join(',')
      }))
      try {
        var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
        var a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = 'dsh-usage-' + Date.now() + '.csv'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(function () { try { URL.revokeObjectURL(a.href) } catch (e) { /* noop */ } }, 1000)
      } catch (e) { LOG('csv export failed: ' + e) }
    }
    function HistoryTab(props) {
      var [data, setData] = useState(null)
      var [page, setPage] = useState(1)
      function load() {
        fetchJson(sessionUrl('/dsh-usage/history', props.sessionId)).then(function (d) { setData(d) })
      }
      useEffect(function () { load() }, [props.sessionId])
      useEffect(function () { if (props.refreshTick > 0) load() }, [props.refreshTick])
      useEffect(function () { setPage(1) }, [props.sessionId])
      var rows = (data && data.rows) || []
      // 倒序：最新在前
      var descRows = rows.slice().reverse()
      var pages = Math.max(1, Math.ceil(descRows.length / HISTORY_PAGE))
      var cur = Math.min(page, pages)
      var pageRows = descRows.slice((cur - 1) * HISTORY_PAGE, cur * HISTORY_PAGE)
      function timeOf(t) {
        if (!t) return '—'
        var d = new Date(t)
        return String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
      }
      return el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, [
        el('div', { key: 'hd', style: { display: 'flex', alignItems: 'center', gap: '8px', width: '100%' } }, [
          el('span', { key: 't', style: { fontWeight: 600, fontSize: '13px', color: INK, flex: '1 1 auto' } }, '历史明细'),
          el('span', { key: 'n', style: MUTED2 }, descRows.length + ' 轮' + ((data && data.note) ? ' · ' + data.note : '')),
          el('button', { key: 'csv', type: 'button', style: BTN, disabled: !descRows.length, onClick: function () { downloadCsv(rows) } }, '导出 CSV'),
          el('button', { key: 'r', type: 'button', style: BTN, onClick: load }, '刷新'),
        ]),
        descRows.length === 0 ? el('div', { key: 'e', style: MUTED }, '暂无历史数据。')
          : [
              el('div', { key: 'tbl', style: { maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--dsw-alias-border-default, #e5e7eb)', borderRadius: '8px' } },
                el('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' } }, [
                  el('thead', { key: 'h' }, el('tr', { key: 'r' },
                    ['时间', '模型', '输入', '命中', '输出', '成本(估算)'].map(function (h) {
                      return el('th', {
                        key: h,
                        style: { position: 'sticky', top: '0', zIndex: '1', textAlign: 'left', padding: '6px 8px', color: 'var(--dsw-alias-label-secondary, #4b5563)', background: 'var(--dsw-alias-bg-layer-2, #fff)', borderBottom: '1px solid var(--dsw-alias-border-default, #e5e7eb)' },
                      }, h)
                    }))),
                  el('tbody', { key: 'b' }, pageRows.map(function (r, i) {
                    return el('tr', { key: i }, [
                      el('td', { key: 't', style: { padding: '3px 8px' } }, timeOf(r.time)),
                      el('td', { key: 'm', style: { padding: '3px 8px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.model || '?'),
                      el('td', { key: 'u', style: { padding: '3px 8px' } }, fmtTokens(r.uncachedInput)),
                      el('td', { key: 'c', style: { padding: '3px 8px' } }, fmtTokens(r.cacheRead)),
                      el('td', { key: 'o', style: { padding: '3px 8px' } }, fmtTokens(r.output)),
                      el('td', { key: 'co', style: { padding: '3px 8px' } }, fmtMoney(r.costCny)),
                    ])
                  })),
                ])),
              pages > 1 ? el('div', { key: 'pg', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' } }, [
                el('button', { key: 'prev', type: 'button', style: PAGE_BTN, disabled: cur <= 1, onClick: function () { setPage(cur - 1) } }, '上一页'),
                el('span', { key: 'info', style: MUTED2 }, '第 ' + cur + ' / ' + pages + ' 页 · 共 ' + descRows.length + ' 行'),
                el('button', { key: 'next', type: 'button', style: PAGE_BTN, disabled: cur >= pages, onClick: function () { setPage(cur + 1) } }, '下一页'),
              ]) : null,
            ],
      ])
    }

    // ------------------------------------------------------------- panel

    function UsagePanel(props) {
      var [sessionId, setSessionId] = useState(null)   // null = 全部会话
      var [sessionList, setSessionList] = useState([])
      var [providers, setProviders] = useState([])
      var [refreshSeconds, setRefreshSeconds] = useState(300)
      var [refreshTick, setRefreshTick] = useState(0)
      var [settingsOpen, setSettingsOpen] = useState(false)

      // 加载配置（第三方供应商列表 + 自动刷新间隔）
      function loadConfig() {
        fetchJson('/dsh-usage/config').then(function (d) {
          if (!d) return
          setProviders(d.providers || [])
          if (typeof d.refreshSeconds === 'number' && d.refreshSeconds >= 0) setRefreshSeconds(d.refreshSeconds)
        })
      }
      useEffect(function () { loadConfig() }, [])
      // 自动刷新：按 refreshSeconds 定时触发 tick（0 = 关闭）
      useEffect(function () {
        if (!(refreshSeconds > 0)) return
        var t = setInterval(function () { setRefreshTick(function (n) { return n + 1 }) }, refreshSeconds * 1000)
        return function () { clearInterval(t) }
      }, [refreshSeconds])

      useEffect(function () {
        fetchJson('/dsh-usage/sessions').then(function (d) {
          if (d && d.ok) setSessionList(d.sessions || [])
        })
      }, [refreshTick])

      var tabProps = { sessionId: sessionId, sessionList: sessionList, onSessionChange: setSessionId, refreshTick: refreshTick }
      var refreshProps = { providers: providers, refreshTick: refreshTick }

      return el('div', {
        style: {
          position: 'relative', zIndex: '1', width: '720px',
          height: 'min(640px, calc(100vh - 48px))', maxWidth: 'calc(100vw - 48px)',
          boxSizing: 'border-box', overflow: 'hidden', display: 'flex', flexDirection: 'column',
          borderRadius: '24px', background: 'var(--dsw-alias-bg-layer-2, #ffffff)',
          boxShadow: 'var(--dsw-shadow-lv3, 0 8px 40px rgba(0,0,0,0.25))',
          color: INK, font: 'inherit', fontSize: '13px', lineHeight: '20px',
        },
        role: 'dialog', 'aria-modal': 'true', 'aria-label': '用量',
      }, [
        el('header', { key: 'h', style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', borderBottom: '1px solid var(--dsw-alias-border-default, #e8e8e8)' } }, [
          el(UsageGlyph, { key: 'g', size: 18 }),
          el('div', { key: 't', style: { flex: '1 1 auto', minWidth: '0' } }, [
            el('div', { key: 't1', style: { fontWeight: 600, fontSize: '14px' } }, '用量'),
            el('div', { key: 't2', style: MUTED2 }, '成本为估算值 · CNY' + (refreshSeconds > 0 ? ' · 自动刷新 ' + refreshSeconds + 's' : '')),
          ]),
          el('button', { key: 'set', type: 'button', title: '设置', onClick: function () { setSettingsOpen(true) }, style: Object.assign({}, BTN, { minWidth: '28px', padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }) },
            el(Glyph, { paths: SETTINGS_PATHS, viewBox: '0 0 24 24', size: 15 })),
          el('button', { key: 'x', type: 'button', onClick: props.onClose, style: Object.assign({}, BTN, { minWidth: '28px', padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }) },
            el(Glyph, { paths: CLOSE_PATHS, viewBox: '0 0 24 24', size: 14 })),
        ]),
        // 单页卡片流：内容列居中（margin auto）并撑满合理宽度
        // 顺序：余额 → 预算 → 曲线 → 热力图 → 用量 → 历史
        el('div', { key: 'body', style: { flex: '1 1 auto', minHeight: '0', overflowY: 'auto', padding: '16px 20px' } }, [
          el('div', { key: 'col', style: { width: '100%', maxWidth: '640px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '14px' } }, [
            el(Card, { key: 'bal' }, el(BalanceTab, { key: 'b', ...refreshProps })),
            el(Card, { key: 'budget', title: '预算' }, el(BudgetCard, { key: 'bd', ...refreshProps, onOpenSettings: function () { setSettingsOpen(true) } })),
            el(Card, { key: 'chart', title: 'token 折线图（仅当天）' }, el(ChartTab, { key: 'c', ...tabProps })),
            el(Card, { key: 'heat', title: 'token 热力图（最近 13 周）' }, el(HeatTab, { key: 'h', ...tabProps })),
            el(Card, { key: 'use' }, el(UsageTab, { key: 'u', ...tabProps })),
            el(Card, { key: 'hist' }, el(HistoryTab, { key: 'r', ...tabProps })),
          ]),
        ]),
        settingsOpen ? el(SettingsModal, { key: 'modal', onClose: function () { setSettingsOpen(false) }, onSaved: function () { loadConfig() } }) : null,
      ])
    }

    var PanelBoundary = (function (React) {
      function PB(props) {
        React.Component.call(this, props)
        this.state = { err: null }
      }
      PB.prototype = Object.create(React.Component.prototype)
      PB.prototype.constructor = PB
      PB.getDerivedStateFromError = function (err) { return { err: err } }
      PB.prototype.componentDidCatch = function (err) {
        try { console.log('[dshd-usage] panel error: ' + ((err && err.stack) || err)) } catch (e) { /* noop */ }
      }
      PB.prototype.render = function () {
        if (this.state.err) {
          return el('div', {
            style: { position: 'absolute', inset: '0', zIndex: '1200', background: 'var(--dsw-alias-bg-base, #fff)',
                     color: '#b45409', padding: '24px', font: 'inherit', fontSize: '13px', whiteSpace: 'pre-wrap' },
          }, '用量面板错误：\n' + String((this.state.err && this.state.err.stack) || this.state.err))
        }
        return this.props.children
      }
      return PB
    })(React)

    function UsageOverlay() {
      var [open, setOpenState] = useState(getOpen())
      useEffect(function () {
        return subscribe(function () { setOpenState(getOpen()) })
      }, [])
      useEffect(function () {
        if (!open) return
        function onKey(e) { if (e.key === 'Escape') setOpen(false) }
        document.addEventListener('keydown', onKey)
        return function () { document.removeEventListener('keydown', onKey) }
      }, [open])
      if (!open) return null
      return el('div', { style: { position: 'fixed', inset: '0', zIndex: '1210', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, [
        el('div', { key: 'mask', onClick: function () { setOpen(false) },
          style: { position: 'absolute', inset: '0', background: 'var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.24))', backdropFilter: 'var(--dsw-mask-blur, blur(2px))' } }),
        el(PanelBoundary, { key: 'b' }, el(UsagePanel, { onClose: function () { setOpen(false) } })),
      ])
    }

    var overlayRoot = null
    function ensureOverlay() {
      try {
        if (overlayRoot) return
        var host = document.createElement('div')
        host.id = 'dshd-usage-overlay'
        document.body.appendChild(host)
        overlayRoot = createRoot(host)
        overlayRoot.render(el(UsageOverlay, {}))
      } catch (e) { LOG('overlay mount failed ' + e) }
    }

    // sidebar.footer.action hosts multiple full-width entries (「用量」+「插件市场」):
    // the default flex row squishes them side by side and they overlap. Stack them
    // vertically so each keeps its own full-width row — matching the native
    // single-action look (a lone entry renders as one full-width row anyway).
    function ensureStyles() {
      try {
        if (document.getElementById('dshd-usage-styles')) return
        var st = document.createElement('style')
        st.id = 'dshd-usage-styles'
        st.textContent = '[class*="footerActions"]{flex-direction:column}' +
          '#dshd-usage-overlay table tbody tr:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}'
        document.head.appendChild(st)
      } catch (e) { /* best effort */ }
    }

    // ------------------------------------------------------------- apply

    function apply(ctx) {
      var slots = ctx.slots
      LOG('apply: slots=' + (!!slots))
      ensureOverlay()
      ensureStyles()

      ctx.effect(function () {
        slots.inject('sidebar.footer.action', function () {
          LOG('footer.action declared, registering')
          return slots.register({
            name: 'sidebar.footer.action',
            id: 'dshd-usage',
            order: 70,
          }, UsageEntry)
        })
      }, 'dshd-usage: footer entry')
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  }
})
