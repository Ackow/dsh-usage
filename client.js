/**
 * dshd-usage — dsh client 半区（web）。
 *
 * 在 dsh 侧栏设置按钮上方注入「用量」按钮（sidebar.footer.action, order 70），
 * 点开页内模态面板：余额 / 用量与命中率 / 折线图 / 热力图（GitHub 样式）/ 历史。
 * 数据经同源 HTTP 路由 `/dsh-usage/*`（host 半区注册）fetch，成本为估算值
 * （标注「估算」），支持 USD / CNY 切换。
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
    // 成本统一以 USD 显示（host 算的是 CNY，按 cnyPerUsd 换算）。
    function fmtMoney(cny, cnyPerUsd) {
      var v = Number(cny) || 0
      return '$' + (v / (cnyPerUsd || 6.76)).toFixed(4)
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
          borderRadius: '12px',
          background: 'var(--dsw-alias-bg-layer-3, #fbfbfc)',
          padding: '12px 14px',
          display: 'flex', flexDirection: 'column', gap: '10px',
          width: '100%', boxSizing: 'border-box',
        },
      }, [
        props.title ? el('div', { key: 't', style: { fontWeight: 600, fontSize: '13px', color: INK } }, props.title) : null,
        props.children,
      ])
    }

    // 余额
    function BalanceTab() {
      var [data, setData] = useState(null)
      var [provider, setProvider] = useState('deepseek')
      var [loading, setLoading] = useState(false)
      function load() {
        setLoading(true)
        fetchJson('/dsh-usage/balance?provider=' + encodeURIComponent(provider)).then(function (d) { setData(d); setLoading(false) })
      }
      useEffect(function () { load() }, [provider])
      var providerName = { deepseek: 'DeepSeek', openrouter: 'OpenRouter' }[data && data.provider ? data.provider : provider] || 'DeepSeek'
      return el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, [
        el('div', { key: 'hd', style: { display: 'flex', alignItems: 'center', gap: '8px', width: '100%' } }, [
          el('span', { key: 't', style: { fontWeight: 600, fontSize: '13px', color: INK, flex: '1 1 auto' } }, '供应商余额'),
          el('select', {
            key: 'pr', value: provider, style: SELECT,
            onChange: function (e) { setProvider(e.target.value) },
          }, [
            el('option', { key: 'ds', value: 'deepseek' }, 'DeepSeek'),
            el('option', { key: 'or', value: 'openrouter' }, 'OpenRouter'),
          ]),
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
                return el('div', { key: info.currency, style: { border: '1px solid var(--dsw-alias-border-default, #e5e7eb)', borderRadius: '10px', padding: '10px 12px' } }, [
                  el('div', { key: 'c', style: { fontWeight: 600, fontSize: '13px' } }, providerName + ' · ' + info.currency),
                  el('div', { key: 't', style: { fontSize: '18px', fontWeight: 700, margin: '4px 0' } }, symbol + info.totalBalance),
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
    function UsageTab(props) {
      var [data, setData] = useState(null)
      function load() {
        fetchJson(sessionUrl('/dsh-usage/session', props.sessionId)).then(function (d) { setData(d) })
      }
      useEffect(function () { load() }, [props.sessionId])
      var d = data && !data.noSession ? data : null
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
                el('div', { key: 'c', style: MUTED2 }, '成本（估算）' + fmtMoney(d.costCny, props.cnyPerUsd)),
                el('div', { key: 'sp', style: { flex: '1 1 auto' } }),
                el('button', { key: 'r', type: 'button', style: BTN, onClick: load }, '重新统计'),
              ]),
              el('div', { key: 'rows', style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                d.rounds.map(function (r, i) {
                  return el('div', { key: i, style: { display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px' } }, [
                    el('span', { key: 'm', style: { flex: '1 1 auto', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.model || '?'),
                    el('span', { key: 'u', style: MUTED2 }, '入 ' + fmtTokens(r.uncachedInput)),
                    el('span', { key: 'c', style: MUTED2 }, '命中 ' + fmtTokens(r.cacheRead)),
                    el('span', { key: 'o', style: MUTED2 }, '出 ' + fmtTokens(r.output)),
                    el('span', { key: 'co', style: { color: ACCENT } }, fmtMoney(r.costCny, props.cnyPerUsd)),
                  ])
                })),
            ],
      ])
    }

    // 折线图（cc-switch 风格：最近 14 天按天聚合，悬浮显示每日明细；Token / 成本双视图）
    function ChartTab(props) {
      var [data, setData] = useState(null)
      var [view, setView] = useState('token')   // token | cost
      var [hover, setHover] = useState(-1)
      function load() {
        fetchJson(sessionUrl('/dsh-usage/session', props.sessionId)).then(function (d) { setData(d) })
      }
      useEffect(function () { load() }, [props.sessionId])
      useEffect(function () { setHover(-1) }, [props.sessionId, view])
      var d = data && !data.noSession ? data : null
      var rounds = (d && d.rounds) || []
      var W = 620, H = 200, PAD = 28, N = 14

      // 按天聚合最近 N 天（与热力图同一时间窗）
      var days = []
      var today = new Date(); today.setHours(0, 0, 0, 0)
      for (var i = N - 1; i >= 0; i--) {
        var day = new Date(today.getTime() - i * 86400000)
        var key = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0')
        days.push({ key: key, label: String(day.getMonth() + 1) + '/' + String(day.getDate()), uncachedInput: 0, cacheRead: 0, output: 0, costCny: 0 })
      }
      var dayMap = {}
      days.forEach(function (x) { dayMap[x.key] = x })
      rounds.forEach(function (r) {
        if (!r.time) return
        var dt = new Date(r.time)
        var k = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0')
        var day = dayMap[k]
        if (!day) return
        day.uncachedInput += r.uncachedInput || 0
        day.cacheRead += r.cacheRead || 0
        day.output += r.output || 0
        day.costCny += r.costCny || 0
      })

      var max = 1
      if (view === 'cost') {
        days.forEach(function (x) { max = Math.max(max, x.costCny) })
      } else {
        days.forEach(function (x) { max = Math.max(max, x.uncachedInput, x.cacheRead, x.output) })
      }
      function xAt(i) { return PAD + (i / (N - 1)) * (W - PAD * 2) }
      function yAt(v) { return H - PAD - (v / max) * (H - PAD * 2) }
      function line(key, color) {
        var pts = days.map(function (x, i) { return xAt(i).toFixed(1) + ',' + yAt(x[key]).toFixed(1) }).join(' ')
        return el('polyline', { key: key, points: pts, fill: 'none', stroke: color, strokeWidth: 1.5 })
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
      var day = hover >= 0 ? days[hover] : null
      var yAxisLabel = view === 'cost' ? 'USD' : 'tokens'

      return el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, [
        el('div', { key: 'lg', style: { display: 'flex', gap: '10px', fontSize: '11px', alignItems: 'center', color: 'var(--dsw-alias-label-secondary, #4b5563)' } }, [
          view === 'token' ? el('span', { key: 'i' }, '输入(未命中)') : null,
          view === 'token' ? el('span', { key: 'c' }, '命中') : null,
          view === 'token' ? el('span', { key: 'o' }, '输出') : null,
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
            view === 'token' ? line('uncachedInput', '#b45409') : null,
            view === 'token' ? line('cacheRead', OK) : null,
            view === 'token' ? line('output', ACCENT) : null,
            view === 'cost' ? line('costCny', ACCENT) : null,
            hover >= 0 ? el('line', { key: 'vl', x1: xAt(hover), y1: PAD, x2: xAt(hover), y2: H - PAD, stroke: 'var(--dsw-alias-border-strong, #b0b7c3)', strokeDasharray: '3 3' }) : null,
            hover >= 0 && view === 'token' ? [
              el('circle', { key: 'i', cx: xAt(hover), cy: yAt(days[hover].uncachedInput), r: 3, fill: '#b45409' }),
              el('circle', { key: 'c', cx: xAt(hover), cy: yAt(days[hover].cacheRead), r: 3, fill: OK }),
              el('circle', { key: 'o', cx: xAt(hover), cy: yAt(days[hover].output), r: 3, fill: ACCENT }),
            ] : null,
            hover >= 0 && view === 'cost' ? el('circle', { key: 'co', cx: xAt(hover), cy: yAt(days[hover].costCny), r: 3, fill: ACCENT }) : null,
            days.map(function (x, i) {
              if (i % 3 !== 0 && i !== 0 && i !== N - 1) return null
              return el('text', { key: 'dl' + i, x: xAt(i), y: H - PAD + 14, fontSize: 9, fill: 'var(--dsw-alias-label-tertiary, #6b7684)', textAnchor: 'middle' }, x.label)
            }),
            el('text', { key: 'mx', x: W - PAD, y: H - PAD + 14, fontSize: 10, fill: MUTED.color, textAnchor: 'end' }, yAxisLabel),
            rounds.length === 0 ? el('text', { key: 'em', x: W / 2, y: H / 2, fontSize: 12, fill: MUTED.color, textAnchor: 'middle' }, '暂无足够的轮次数据') : null,
          ]),
          day ? el('div', {
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
                el('div', { key: 'dt', style: { fontWeight: 600 } }, day.label),
                el('div', { key: 'i' }, '输入(未命中) ' + fmtTokens(day.uncachedInput)),
                el('div', { key: 'c' }, '命中 ' + fmtTokens(day.cacheRead)),
                el('div', { key: 'o' }, '输出 ' + fmtTokens(day.output)),
                el('div', { key: 'co', style: { color: ACCENT } }, '成本(估算) ' + fmtMoney(day.costCny, props.cnyPerUsd)),
              ]
            : [
                el('div', { key: 'dt', style: { fontWeight: 600 } }, day.label),
                el('div', { key: 'co', style: { color: ACCENT } }, '成本(估算) ' + fmtMoney(day.costCny, props.cnyPerUsd)),
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

      // ---- 时间模式：最近 13 周 × 星期 ----
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
        for (var i = DAYS - 1; i >= 0; i--) {
          var day = new Date(today.getTime() - i * 86400000)
          var key = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0')
          cells.push({ key: key, week: Math.floor((DAYS - 1 - i) / 7), dow: day.getDay(), v: byDay[key] || 0, title: key + ' · ' + fmtTokens(byDay[key] || 0) + ' tokens' })
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
            var weeks = []
            for (var w = 0; w < 13; w++) weeks.push(cells.filter(function (c) { return c.week === w }))
            return el('div', { key: 'grid', style: { display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: '3px', padding: '6px 0', width: '100%' } }, [
              el('div', { key: 'lbl', style: { flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: '3px', marginRight: '6px', fontSize: '10px', color: 'var(--dsw-alias-label-tertiary, #6b7684)' } },
                DOW.map(function (x, i) { return el('span', { key: i, style: { height: '18px', lineHeight: '18px' } }, x) })),
              weeks.map(function (wk, w) {
                return el('div', { key: w, style: { width: '18px', flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: '3px' } },
                  wk.map(function (c) {
                    return el('div', { key: c.key, title: c.title, style: { width: '18px', height: '18px', borderRadius: '3px', background: shade(c.v) } })
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

    // 历史明细
    var HISTORY_PAGE = 15
    var PAGE_BTN = Object.assign({}, BTN, { padding: '0 8px', minHeight: '24px', fontSize: '11px' })
    function csvEscape(v) {
      var s = String(v == null ? '' : v)
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    function downloadCsv(rows, cnyPerUsd) {
      if (!rows || !rows.length) return
      var head = ['时间', '会话', '模型', '输入', '命中', '输出', '成本USD(估算)']
      var lines = [head.join(',')].concat(rows.map(function (r) {
        var d = r.time ? new Date(r.time) : null
        var t = d ? String(d.getFullYear()) + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : ''
        return [t, r.sessionId || '', r.model || '', r.uncachedInput || 0, r.cacheRead || 0, r.output || 0, fmtMoney(r.costCny || 0, cnyPerUsd)].map(csvEscape).join(',')
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
      useEffect(function () { setPage(1) }, [props.sessionId])
      var rows = (data && data.rows) || []
      var pages = Math.max(1, Math.ceil(rows.length / HISTORY_PAGE))
      var cur = Math.min(page, pages)
      var pageRows = rows.slice((cur - 1) * HISTORY_PAGE, cur * HISTORY_PAGE)
      function timeOf(t) {
        if (!t) return '—'
        var d = new Date(t)
        return String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
      }
      return el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, [
        el('div', { key: 'hd', style: { display: 'flex', alignItems: 'center', gap: '8px', width: '100%' } }, [
          el('span', { key: 't', style: { fontWeight: 600, fontSize: '13px', color: INK, flex: '1 1 auto' } }, '历史明细'),
          el('span', { key: 'n', style: MUTED2 }, rows.length + ' 轮' + ((data && data.note) ? ' · ' + data.note : '')),
          el('button', { key: 'csv', type: 'button', style: BTN, disabled: !rows.length, onClick: function () { downloadCsv(rows, props.cnyPerUsd) } }, '导出 CSV'),
          el('button', { key: 'r', type: 'button', style: BTN, onClick: load }, '刷新'),
        ]),
        rows.length === 0 ? el('div', { key: 'e', style: MUTED }, '暂无历史数据。')
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
                      el('td', { key: 'co', style: { padding: '3px 8px' } }, fmtMoney(r.costCny, props.cnyPerUsd)),
                    ])
                  })),
                ])),
              pages > 1 ? el('div', { key: 'pg', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' } }, [
                el('button', { key: 'prev', type: 'button', style: PAGE_BTN, disabled: cur <= 1, onClick: function () { setPage(cur - 1) } }, '上一页'),
                el('span', { key: 'info', style: MUTED2 }, '第 ' + cur + ' / ' + pages + ' 页 · 共 ' + rows.length + ' 行'),
                el('button', { key: 'next', type: 'button', style: PAGE_BTN, disabled: cur >= pages, onClick: function () { setPage(cur + 1) } }, '下一页'),
              ]) : null,
            ],
      ])
    }

    // ------------------------------------------------------------- panel

    function UsagePanel(props) {
      var [cnyPerUsd, setCnyPerUsd] = useState(6.76)
      var [sessionId, setSessionId] = useState(null)   // null = 全部会话
      var [sessionList, setSessionList] = useState([])

      useEffect(function () {
        fetchJson('/dsh-usage/pricing').then(function (p) {
          if (p && p.cnyPerUsd) setCnyPerUsd(p.cnyPerUsd)
        })
      }, [])
      useEffect(function () {
        fetchJson('/dsh-usage/sessions').then(function (d) {
          if (d && d.ok) setSessionList(d.sessions || [])
        })
      }, [])

      var tabProps = { cnyPerUsd: cnyPerUsd, sessionId: sessionId, sessionList: sessionList, onSessionChange: setSessionId }

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
            el('div', { key: 't2', style: MUTED2 }, '成本为估算值 · USD'),
          ]),
          el('button', { key: 'x', type: 'button', onClick: props.onClose, style: Object.assign({}, BTN, { minWidth: '28px', padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }) },
            el(Glyph, { paths: CLOSE_PATHS, viewBox: '0 0 24 24', size: 14 })),
        ]),
        // 单页卡片流：内容列居中（margin auto）并撑满合理宽度
        el('div', { key: 'body', style: { flex: '1 1 auto', minHeight: '0', overflowY: 'auto', padding: '16px 20px' } }, [
          el('div', { key: 'col', style: { width: '100%', maxWidth: '640px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '14px' } }, [
            el(Card, { key: 'bal' }, el(BalanceTab, { key: 'b' })),
            el(Card, { key: 'use' }, el(UsageTab, { key: 'u', ...tabProps })),
            el(Card, { key: 'chart', title: 'token 折线图' }, el(ChartTab, { key: 'c', ...tabProps })),
            el(Card, { key: 'heat', title: 'token 热力图（最近 13 周）' }, el(HeatTab, { key: 'h', ...tabProps })),
            el(Card, { key: 'hist' }, el(HistoryTab, { key: 'r', ...tabProps })),
          ]),
        ]),
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
