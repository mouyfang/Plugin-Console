window.__ModuleLoader__.load({
  id: '@local/dsh-plugin-console',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const BASE = '/plugin-console'
    const NS = 'plugin-console'

    const STRINGS = {
      zh: {
        panel: '插件管家',
        title: '插件管家',
        subtitle: '管理第三方插件：检查 npm 更新、启用/停用、卸载。',
        refresh: '刷新',
        check: '检查更新',
        checking: '检查中…',
        loading: '正在读取插件…',
        retry: '重试',
        empty: '还没有第三方插件',
        emptyHint: '在 DSH 的“插件”页安装插件后，这里会出现。',
        install: '安装新插件',
        openPlugins: '打开插件页',
        details: '详情',
        update: '更新',
        upToDate: '已是最新',
        checked: '已检查',
        notChecked: '未检查更新',
        nonRegistry: '非 registry 来源，不支持自动更新',
        running: '运行中',
        stopped: '已停用',
        failed: '有异常',
        readOnly: '只读',
        enable: '启用',
        disable: '停用',
        remove: '卸载',
        confirmRemove: '确认卸载？',
        confirmUpdate: '将先卸载再安装，期间插件会短暂下线。确认更新？',
        confirm: '确认',
        cancel: '取消',
        working: '处理中…',
        installed: '已安装',
        updatable: '可更新',
        rows: '插件行',
        source: '来源',
        latest: '最新',
        actionOk: '操作完成',
        actionFailed: '操作失败',
        restartRequired: '需要重启 DSH 生效',
        noManager: '当前 profile 没有可用的插件管理器。',
        networkHint: '无法直连 npm registry；可稍后重试。',
        back: '返回',
        backToChat: '返回对话',
      },
      en: {
        panel: 'Plugin Console',
        title: 'Plugin Console',
        subtitle: 'Manage third-party plugins: npm updates, enable/disable, uninstall.',
        refresh: 'Refresh',
        check: 'Check updates',
        checking: 'Checking…',
        loading: 'Reading plugins…',
        retry: 'Retry',
        empty: 'No third-party plugins yet',
        emptyHint: 'Plugins installed from the Plugins page appear here.',
        install: 'Install a plugin',
        openPlugins: 'Open Plugins',
        details: 'Details',
        update: 'Update',
        upToDate: 'Up to date',
        checked: 'checked',
        notChecked: 'Updates not checked',
        nonRegistry: 'Non-registry source; automatic updates are unavailable',
        running: 'Running',
        stopped: 'Disabled',
        failed: 'Failed',
        readOnly: 'Read-only',
        enable: 'Enable',
        disable: 'Disable',
        remove: 'Uninstall',
        confirmRemove: 'Uninstall this plugin?',
        confirmUpdate: 'This removes then reinstalls the plugin; it goes offline briefly. Continue?',
        confirm: 'Confirm',
        cancel: 'Cancel',
        working: 'Working…',
        installed: 'Installed',
        updatable: 'Update available',
        rows: 'rows',
        source: 'Source',
        latest: 'latest',
        actionOk: 'Done',
        actionFailed: 'Failed',
        restartRequired: 'Restart DSH to apply',
        noManager: 'No plugin manager is available in this profile.',
        networkHint: 'The npm registry is unreachable; try again later.',
        back: 'Back',
        backToChat: 'Back to chat',
      },
    }

    let language = 'zh'
    let translate = key => (STRINGS[language] ?? STRINGS.zh)[key] ?? key
    let navigation = null
    let layoutService = null

    function bindLocale(ctx) {
      try {
        const locale = ctx.get('locale')
        if (locale === undefined) return
        const read = () => {
          try {
            const active = locale.getSnapshot?.()?.active
            language = typeof active === 'string' && active.toLowerCase().startsWith('en') ? 'en' : 'zh'
          } catch {
            language = 'zh'
          }
        }
        read()
        if (typeof locale.subscribe === 'function') {
          ctx.effect(() => locale.subscribe(read))
        }
      } catch {
        // No locale service: Chinese strings remain readable.
      }
    }

    function timeLabel(timestamp) {
      if (typeof timestamp !== 'number') return ''
      const diff = Date.now() - timestamp
      if (diff < 60_000) return '刚刚'
      if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
      if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
      return `${Math.floor(diff / 86_400_000)} 天前`
    }

    function phaseLabel(phase) {
      switch (phase) {
        case 'active': return '运行中'
        case 'failed': return '失败'
        case 'loading': return '加载中'
        case 'pending': return '等待中'
        case 'unloading': return '卸载中'
        default: return '未加载'
      }
    }

    function errorText(bundle) {
      if (!bundle.error) return null
      const code = typeof bundle.error.code === 'string' ? bundle.error.code : 'error'
      return typeof bundle.error.diagnostic === 'string' && bundle.error.diagnostic.length > 0
        ? `${code}: ${bundle.error.diagnostic}`
        : code
    }

    function Badge({ tone, children }) {
      return h('span', { className: `pc-badge pc-badge-${tone}` }, children)
    }

    function Icon({ size = 20, active = false }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: active ? 2 : 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        h('rect', { x: 3, y: 3, width: 7, height: 7, rx: 1.5 }),
        h('rect', { x: 14, y: 3, width: 7, height: 7, rx: 1.5 }),
        h('rect', { x: 3, y: 14, width: 7, height: 7, rx: 1.5 }),
        h('path', { d: 'M14 17.5h7M17.5 14v7' }),
      )
    }

    function BundleIcon({ bundle }) {
      if (typeof bundle.icon === 'string' && bundle.icon.length > 0) {
        return h('img', {
          className: 'pc-icon',
          src: bundle.icon,
          alt: '',
          draggable: false,
        })
      }
      const letter = (bundle.title || bundle.name || '?').replace(/^@/, '').charAt(0).toUpperCase()
      return h('div', { className: 'pc-icon pc-icon-fallback', 'aria-hidden': true }, letter)
    }

    function ActionButton({ tone, disabled, onClick, children }) {
      return h('button', {
        type: 'button',
        className: `pc-btn${tone === undefined ? '' : ` pc-btn-${tone}`}`,
        disabled,
        onClick,
      }, children)
    }

    function BundleCard({ bundle, busy, checking, confirm, onAct, onConfirm, onCancel, onDetails }) {
      const updateAvailable = bundle.update?.available === true
      const readOnly = typeof bundle.readOnlyReason === 'string'
      const isBusy = busy !== null || checking
      const confirming = confirm !== null && confirm.name === bundle.name
      const updateAction = confirm !== null && confirm.name === bundle.name ? confirm.action : null

      const badges = []
      if (updateAvailable) badges.push(h(Badge, { key: 'u', tone: 'brand' }, translate('updatable')))
      if (!bundle.enabled) badges.push(h(Badge, { key: 'd', tone: 'warn' }, translate('stopped')))
      if (bundle.health === 'failed') badges.push(h(Badge, { key: 'f', tone: 'error' }, translate('failed')))
      if (readOnly) badges.push(h(Badge, { key: 'r', tone: 'muted' }, translate('readOnly')))

      let updateLine
      if (bundle.update?.available === true) {
        updateLine = h('div', { className: 'pc-update pc-update-available' },
          h('span', null, `可更新：`),
          h('span', { className: 'pc-version-old' }, `v${bundle.version ?? '?'}`),
          h('span', { className: 'pc-arrow' }, '→'),
          h('strong', null, `v${bundle.update.latest}`),
          bundle.update.checkedAt
            ? h('span', { className: 'pc-muted' }, ` · ${timeLabel(bundle.update.checkedAt)}${translate('checked')}`)
            : null,
        )
      } else if (bundle.update !== null) {
        updateLine = h('div', { className: 'pc-update' }, `${translate('upToDate')}（v${bundle.update.latest}）`)
      } else if (typeof bundle.updateError === 'string') {
        updateLine = h('div', { className: 'pc-update pc-update-error' }, `无法检查更新：${bundle.updateError}`)
      } else if (bundle.source === null || bundle.source === undefined) {
        updateLine = h('div', { className: 'pc-update pc-muted' }, translate('notChecked'))
      } else if (!/^(github:|git\+|git:|https?:|file:|link:|\.{0,2}[\\/]|[A-Za-z]:[\\/])/i.test(bundle.source)) {
        updateLine = h('div', { className: 'pc-update pc-muted' }, translate('notChecked'))
      } else {
        updateLine = h('div', { className: 'pc-update pc-muted' }, translate('nonRegistry'))
      }

      const actions = [
        navigation !== null
          ? h(ActionButton, { key: 'details', disabled: isBusy, onClick: () => onDetails(bundle.name) }, translate('details'))
          : null,
        updateAvailable
          ? h(ActionButton, { key: 'update', tone: 'brand', disabled: isBusy || readOnly || !bundle.removable, onClick: () => onAct(bundle.name, 'update') }, translate('update'))
          : null,
        h(ActionButton, {
          key: 'toggle',
          disabled: isBusy || readOnly,
          onClick: () => onAct(bundle.name, bundle.enabled ? 'disable' : 'enable'),
        }, bundle.enabled ? translate('disable') : translate('enable')),
        bundle.removable
          ? h(ActionButton, { key: 'remove', tone: 'danger', disabled: isBusy || readOnly, onClick: () => onAct(bundle.name, 'remove') }, translate('remove'))
          : null,
      ].filter(Boolean)

      return h('article', { className: 'pc-card' },
        h('div', { className: 'pc-card-head' },
          h(BundleIcon, { bundle }),
          h('div', { className: 'pc-card-title' },
            h('div', { className: 'pc-title-row' },
              h('strong', { className: 'pc-title' }, bundle.title),
              h('span', { className: 'pc-version' }, bundle.version ? `v${bundle.version}` : '—'),
              ...badges,
            ),
            h('div', { className: 'pc-package' }, bundle.name),
          ),
          h('div', { className: `pc-state ${bundle.enabled ? 'is-on' : 'is-off'}` },
            h('span', { className: 'pc-dot' }),
            bundle.enabled ? translate('running') : translate('stopped'),
          ),
        ),
        bundle.description.length > 0 ? h('p', { className: 'pc-desc' }, bundle.description) : null,
        h('div', { className: 'pc-meta' },
          h('span', null, `${bundle.rows.length} ${translate('rows')}`),
          bundle.source !== null && bundle.source !== undefined
            ? h('span', { className: 'pc-mono', title: bundle.source }, `${translate('source')}: ${bundle.source}`)
            : h('span', { className: 'pc-muted' }, '内置来源'),
          bundle.health === 'failed'
            ? h('span', { className: 'pc-danger' }, '有插件行加载失败')
            : null,
        ),
        errorText(bundle) !== null
          ? h('div', { className: 'pc-error' }, errorText(bundle))
          : null,
        updateLine,
        h('div', { className: 'pc-actions' }, ...actions),
        busy !== null && busy.endsWith(`:${bundle.name}`)
          ? h('div', { className: 'pc-update pc-muted' }, translate('working'))
          : null,
        confirming
          ? h('div', { className: 'pc-confirm' },
              h('span', { className: 'pc-confirm-text' },
                updateAction === 'update' ? translate('confirmUpdate') : translate('confirmRemove')),
              h(ActionButton, {
                tone: updateAction === 'update' ? 'brand' : 'danger',
                disabled: isBusy,
                onClick: () => onConfirm(bundle.name, updateAction),
              }, translate('confirm')),
              h(ActionButton, { disabled: isBusy, onClick: onCancel }, translate('cancel')),
            )
          : null,
        bundle.rows.length > 0
          ? h('details', { className: 'pc-rows' },
              h('summary', null, `${bundle.rows.length} ${translate('rows')}`),
              h('ul', null, ...bundle.rows.map(row =>
                h('li', { key: row.rowId },
                  h('span', { className: `pc-dot pc-dot-${row.phase === 'failed' ? 'error' : row.phase === 'active' ? 'on' : 'off'}` }),
                  h('span', { className: 'pc-row-id' }, row.rowId),
                  h('span', { className: 'pc-row-phase' }, phaseLabel(row.phase)),
                  h('code', { className: 'pc-row-module' }, row.moduleName),
                ),
              )),
            )
          : null,
      )
    }

    function BackToChat(props) {
      const usePanelInfo = props.usePanelInfo
      const activePanelId = typeof usePanelInfo === 'function'
        ? usePanelInfo(info => info.activePanelId)
        : null
      if (activePanelId === null || activePanelId === undefined) return null
      if (activePanelId === 'conversation' || activePanelId === 'plugin-console') return null
      return h(React.Fragment, null,
        h('style', null, CSS),
        h('button', {
          type: 'button',
          className: 'pc-back-arrow',
          title: translate('backToChat'),
          'aria-label': translate('backToChat'),
          onClick: () => { if (layoutService !== null) layoutService.selectPanel(null) },
        },
          h('svg', {
            width: 16,
            height: 16,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 2,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            'aria-hidden': true,
          }, h('path', { d: 'M15 18l-6-6 6-6' })),
        ),
      )
    }

    function PluginConsolePage() {
      const [state, setState] = React.useState({ phase: 'loading' })
      const [checking, setChecking] = React.useState(false)
      const [busy, setBusy] = React.useState(null)
      const [confirm, setConfirm] = React.useState(null)
      const [notice, setNotice] = React.useState(null)

      const load = React.useCallback(async () => {
        try {
          const response = await fetch(`${BASE}/state`, { cache: 'no-store' })
          const data = await response.json()
          if (data.ok === true) setState({ phase: 'ready', data })
          else setState({ phase: 'error', error: data.error ?? 'unknown error' })
        } catch (error) {
          setState({ phase: 'error', error: String(error?.message ?? error) })
        }
      }, [])

      React.useEffect(() => {
        let alive = true
        const run = () => { if (alive) load() }
        run()
        const timer = setInterval(run, 15_000)
        return () => { alive = false; clearInterval(timer) }
      }, [load])

      const check = async () => {
        setChecking(true)
        setNotice(null)
        try {
          const response = await fetch(`${BASE}/check`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          })
          const data = await response.json()
          if (data.ok !== true) throw new Error(data.error ?? 'check failed')
          const results = Object.values(data.results ?? {})
          const available = results.filter(item => item.available === true).length
          const failed = results.filter(item => typeof item.error === 'string').length
          setNotice({
            kind: failed > 0 ? 'warn' : 'ok',
            text: available > 0
              ? `发现 ${available} 个可更新插件`
              : failed > 0
                ? `检查完成，${failed} 个插件无法访问 registry`
                : '所有插件都是最新版本',
          })
          await load()
        } catch (error) {
          setNotice({ kind: 'error', text: `检查更新失败：${String(error?.message ?? error)}` })
        } finally {
          setChecking(false)
        }
      }

      const act = async (name, action, version) => {
        if (action === 'update' || action === 'remove') {
          const current = confirm
          if (current === null || current.name !== name || current.action !== action) {
            setConfirm({ name, action })
            setNotice(null)
            return
          }
          setConfirm(null)
        }
        setBusy(`${action}:${name}`)
        setNotice(null)
        try {
          const response = await fetch(`${BASE}/action`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name, action, version }),
          })
          const data = await response.json()
          await load()
          if (data.ok !== true) {
            setNotice({
              kind: 'error',
              text: data.note ?? data.error ?? '操作失败',
              detail: data.install?.error ?? data.result?.error ?? null,
            })
          } else if (data.upToDate === true) {
            setNotice({ kind: 'ok', text: data.note ?? '已是最新版本' })
          } else {
            const restart = data.install?.application === 'restart-required' || data.result?.application === 'restart-required'
            const label = action === 'update'
              ? `已更新 ${name}${data.target ? ` → ${data.target}` : ''}`
              : action === 'remove'
                ? `已卸载 ${name}`
                : action === 'enable'
                  ? `已启用 ${name}`
                  : `已停用 ${name}`
            setNotice({ kind: 'ok', text: restart ? `${label}（${translate('restartRequired')}）` : label })
          }
        } catch (error) {
          setNotice({ kind: 'error', text: `操作失败：${String(error?.message ?? error)}` })
        } finally {
          setBusy(null)
        }
      }

      const data = state.phase === 'ready' ? state.data : null
      const bundles = data?.bundles ?? []
      const updates = bundles.filter(bundle => bundle.update?.available === true).length
      const failures = bundles.filter(bundle => bundle.health === 'failed').length

      return h('div', { className: 'pc-root' },
        h('style', null, CSS),
        h('div', { className: 'pc-inner' },
          h('header', { className: 'pc-header' },
            h('div', { className: 'pc-titleblock' },
              h('button', {
                type: 'button',
                className: 'pc-back-inline',
                onClick: () => { if (layoutService !== null) layoutService.selectPanel(null) },
              }, `← ${translate('back')}`),
              h('h1', { className: 'pc-h1' }, translate('title')),
              h('p', { className: 'pc-subtitle' }, translate('subtitle')),
            ),
            h('div', { className: 'pc-toolbar' },
              h(ActionButton, { tone: 'brand', disabled: checking || busy !== null || bundles.length === 0, onClick: check },
                checking ? translate('checking') : translate('check')),
              h(ActionButton, { disabled: checking || busy !== null, onClick: () => load() }, translate('refresh')),
            ),
          ),
          data !== null
            ? h('div', { className: 'pc-summary' },
                h('span', null, `${translate('installed')} ${bundles.length}`),
                h('span', null, `${translate('updatable')} ${updates}`),
                failures > 0 ? h('span', { className: 'pc-danger' }, `${translate('failed')} ${failures}`) : null,
                data.checkedAt ? h('span', { className: 'pc-muted' }, `${translate('checked')} ${timeLabel(data.checkedAt)}`) : null,
                data.registry ? h('span', { className: 'pc-muted pc-mono' }, data.registry) : null,
              )
            : null,
          notice !== null
            ? h('div', { className: `pc-notice pc-notice-${notice.kind}` },
                h('span', null, notice.text),
                notice.detail !== null && notice.detail !== undefined
                  ? h('code', null, typeof notice.detail === 'string' ? notice.detail : JSON.stringify(notice.detail))
                  : null,
              )
            : null,
          state.phase === 'loading'
            ? h('div', { className: 'pc-placeholder' }, translate('loading'))
            : state.phase === 'error'
              ? h('div', { className: 'pc-placeholder' },
                  h('div', { className: 'pc-error' }, state.error),
                  h('div', { className: 'pc-muted' }, translate('noManager')),
                  h('div', { className: 'pc-actions' },
                    h(ActionButton, { onClick: () => load() }, translate('retry')),
                    navigation !== null
                      ? h(ActionButton, { onClick: () => navigation.openList() }, translate('openPlugins'))
                      : null,
                  ),
                )
              : bundles.length === 0
                ? h('div', { className: 'pc-empty' },
                    h('div', { className: 'pc-empty-icon' }, h(Icon, { size: 40 })),
                    h('h2', null, translate('empty')),
                    h('p', { className: 'pc-muted' }, translate('emptyHint')),
                    navigation !== null
                      ? h(ActionButton, { tone: 'brand', onClick: () => navigation.openList() }, translate('install'))
                      : null,
                  )
                : h('div', { className: 'pc-list' },
                    ...bundles.map(bundle =>
                      h(BundleCard, {
                        key: bundle.name,
                        bundle,
                        busy,
                        checking,
                        confirm,
                        onAct: (name, action) => act(name, action),
                        onConfirm: (name, action) => act(name, action),
                        onCancel: () => setConfirm(null),
                        onDetails: name => {
                          if (navigation !== null && typeof navigation.openBundle === 'function') navigation.openBundle(name)
                        },
                      }),
                    ),
                  ),
          navigation !== null
            ? h('footer', { className: 'pc-footer' },
                h('button', { type: 'button', className: 'pc-link', onClick: () => navigation.openList() },
                  `${translate('install')} / 管理官方插件 →`),
              )
            : null,
        ),
      )
    }

    const CSS = `
.pc-root {
  height: 100%;
  overflow: auto;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
}
.pc-inner { max-width: 940px; margin: 0 auto; padding: 32px 36px 56px; }
.pc-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; flex-wrap: wrap; margin-bottom: 18px; }
.pc-titleblock { display: flex; flex-direction: column; align-items: flex-start; }
.pc-back-inline { appearance: none; border: 0; background: none; padding: 0; margin: 0 0 9px; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.4; cursor: pointer; font-family: inherit; }
.pc-back-inline:hover { color: var(--dsw-alias-label-primary); }
.pc-back-arrow { position: fixed; right: calc((100vw - var(--dsh-windows-sidebar-width, 280px)) / 2 - 298px); top: calc(var(--dsh-frame-top-clearance, 48px) + 26px); z-index: 40; width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-caption); cursor: pointer; font-family: inherit; pointer-events: auto; }
.pc-back-arrow:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); }
.pc-back-arrow:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 1px; }
.pc-h1 { margin: 0; font-size: 22px; font-weight: 650; letter-spacing: -0.01em; }
.pc-subtitle { margin: 6px 0 0; font-size: 13px; color: var(--dsw-alias-label-secondary); }
.pc-toolbar { display: flex; gap: 8px; }
.pc-summary { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 10px 14px; margin-bottom: 16px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); font-size: 12px; color: var(--dsw-alias-label-secondary); }
.pc-list { display: flex; flex-direction: column; gap: 12px; }
.pc-card { border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); padding: 16px 18px; }
.pc-card-head { display: flex; align-items: flex-start; gap: 12px; }
.pc-icon { width: 42px; height: 42px; border-radius: 10px; object-fit: cover; flex: none; background: var(--dsw-alias-bg-layer-2); }
.pc-icon-fallback { display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 650; color: var(--dsw-alias-brand-primary); }
.pc-card-title { flex: 1; min-width: 0; }
.pc-title-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pc-title { font-size: 15px; font-weight: 650; }
.pc-version { font-size: 12px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.pc-package { margin-top: 3px; font-size: 12px; color: var(--dsw-alias-label-secondary); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pc-state { display: flex; align-items: center; gap: 6px; flex: none; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.pc-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); display: inline-block; flex: none; }
.pc-state.is-on .pc-dot { background: var(--dsw-alias-state-success-primary); }
.pc-dot-on { background: var(--dsw-alias-state-success-primary); }
.pc-dot-off { background: var(--dsw-alias-state-idle-primary); }
.pc-dot-error { background: var(--dsw-alias-state-error-primary); }
.pc-desc { margin: 10px 0 0; font-size: 13px; line-height: 1.55; color: var(--dsw-alias-label-secondary); }
.pc-meta { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 10px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.pc-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.pc-muted { color: var(--dsw-alias-label-secondary); }
.pc-danger { color: var(--dsw-alias-state-error-primary); }
.pc-update { margin-top: 10px; font-size: 12.5px; color: var(--dsw-alias-label-secondary); }
.pc-update-available { color: var(--dsw-alias-brand-primary); }
.pc-update-error { color: var(--dsw-alias-state-error-primary); }
.pc-version-old { text-decoration: line-through; opacity: 0.7; }
.pc-arrow { margin: 0 6px; }
.pc-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
.pc-btn { appearance: none; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); border-radius: 8px; padding: 6px 12px; font-size: 12px; line-height: 1.4; cursor: pointer; font-family: inherit; }
.pc-btn:hover:not(:disabled) { border-color: var(--dsw-alias-brand-primary); }
.pc-btn:disabled { opacity: 0.5; cursor: default; }
.pc-btn-brand { border-color: var(--dsw-alias-brand-primary); background: var(--dsw-alias-brand-primary); color: #ffffff; }
.pc-btn-danger { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
.pc-btn-danger.pc-btn-brand { color: #ffffff; }
.pc-confirm { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 10px; padding: 10px 12px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2); border: 1px dashed var(--dsw-alias-state-warn-primary); }
.pc-confirm-text { font-size: 12px; color: var(--dsw-alias-label-secondary); flex: 1; min-width: 220px; }
.pc-badge { display: inline-flex; align-items: center; padding: 1px 7px; border-radius: 999px; font-size: 10.5px; line-height: 1.6; border: 1px solid transparent; }
.pc-badge-brand { color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.pc-badge-warn { color: var(--dsw-alias-state-warn-primary); border-color: var(--dsw-alias-state-warn-primary); }
.pc-badge-error { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
.pc-badge-muted { color: var(--dsw-alias-label-secondary); border-color: var(--dsw-alias-border-l2); }
.pc-error { margin-top: 10px; font-size: 12px; color: var(--dsw-alias-state-error-primary); word-break: break-word; }
.pc-notice { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; padding: 10px 12px; border-radius: 8px; font-size: 12.5px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
.pc-notice-ok { border-color: var(--dsw-alias-state-success-primary); }
.pc-notice-warn { border-color: var(--dsw-alias-state-warn-primary); }
.pc-notice-error { border-color: var(--dsw-alias-state-error-primary); }
.pc-notice code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; color: var(--dsw-alias-label-secondary); white-space: pre-wrap; word-break: break-word; }
.pc-placeholder, .pc-empty { padding: 48px 20px; text-align: center; color: var(--dsw-alias-label-secondary); font-size: 13px; }
.pc-empty h2 { margin: 14px 0 6px; font-size: 16px; color: var(--dsw-alias-label-primary); }
.pc-empty-icon { display: flex; justify-content: center; color: var(--dsw-alias-border-l2); }
.pc-rows { margin-top: 12px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.pc-rows summary { cursor: pointer; color: var(--dsw-alias-label-secondary); }
.pc-rows ul { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.pc-rows li { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pc-row-id { font-weight: 600; color: var(--dsw-alias-label-primary); }
.pc-row-phase { min-width: 42px; }
.pc-row-module { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.pc-footer { margin-top: 22px; display: flex; justify-content: center; }
.pc-link { appearance: none; border: 0; background: none; color: var(--dsw-alias-brand-primary); font-size: 12.5px; cursor: pointer; padding: 6px 8px; font-family: inherit; }
.pc-link:hover { text-decoration: underline; }
@media (max-width: 640px) {
  .pc-inner { padding: 22px 18px 44px; }
  .pc-header { flex-direction: column; }
}
`

    return {
      inject: ['slots'],
      apply(ctx) {
        bindLocale(ctx)
        const nav = ctx.get('pluginNavigation')
        navigation = nav !== undefined && typeof nav.openList === 'function' ? nav : null
        layoutService = ctx.get('layout') ?? null
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'plugin-console.back',
          order: 40,
          label: () => translate('backToChat'),
        }, BackToChat))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'plugin-console',
          order: 20,
          label: () => translate('panel'),
        }, Icon))
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'plugin-console',
        }, PluginConsolePage))
      },
    }
  },
})
