/**
 * Plugin Console — a focused manager for third-party profile plugins.
 *
 * Host half: reads the profile's bundles/rows through `ctx.pluginManager`,
 * checks npm for newer versions, and exposes a small same-origin JSON API:
 *
 *   GET  /plugin-console/state
 *   POST /plugin-console/check
 *   POST /plugin-console/action   { name, action, version? }
 *
 * The API is loopback-only, same-origin-only, and serializes management
 * actions so two browser tabs cannot race a remove/install pair.
 */

export const name = 'plugin-console'

const ROUTE = '/plugin-console'

const DEFAULTS = {
  requestTimeoutMs: 8000,
  cacheTtlMs: 10 * 60 * 1000,
  maxBodyBytes: 16 * 1024,
}

const REGISTRY_BASE = [
  { id: 'npm', base: 'https://registry.npmjs.org' },
  { id: 'npmmirror', base: 'https://registry.npmmirror.com' },
]

export function apply(ctx, config = {}) {
  const options = { ...DEFAULTS, ...config }
  const cache = new Map()
  let busy = null

  const manager = () => ctx.get('pluginManager')
  const webServer = ctx.get('webServer')

  function send(res, status, payload) {
    if (res.writableEnded) return
    const body = JSON.stringify(payload)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(body),
      'cache-control': 'no-store',
    })
    res.end(body)
  }

  function isLoopback(req) {
    const address = req.socket?.remoteAddress ?? ''
    return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
  }

  function isSameOrigin(req) {
    const origin = req.headers.origin
    if (origin === undefined) return true
    const host = req.headers.host
    return origin === `http://${host}` || origin === `https://${host}`
  }

  async function readBody(req) {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > options.maxBodyBytes) throw new Error('request body too large')
      chunks.push(chunk)
    }
    if (size === 0) return {}
    const text = Buffer.concat(chunks).toString('utf8')
    const parsed = JSON.parse(text)
    return parsed !== null && typeof parsed === 'object' ? parsed : {}
  }

  function pickText(value) {
    if (typeof value === 'string') return value
    if (value === null || typeof value !== 'object') return undefined
    for (const key of ['zh', 'zh-CN', 'zh-cn', 'en']) {
      if (typeof value[key] === 'string') return value[key]
    }
    return Object.values(value).find(item => typeof item === 'string')
  }

  function parseVersion(value) {
    const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(value ?? '').trim())
    if (match === null) return null
    return {
      major: Number(match[1]),
      minor: Number(match[2]),
      patch: Number(match[3]),
      pre: match[4] === undefined ? [] : match[4].split('.'),
    }
  }

  function compareVersions(left, right) {
    const a = parseVersion(left)
    const b = parseVersion(right)
    if (a === null || b === null) return 0
    for (const key of ['major', 'minor', 'patch']) {
      if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1
    }
    if (a.pre.length === 0 && b.pre.length === 0) return 0
    if (a.pre.length === 0) return 1
    if (b.pre.length === 0) return -1
    const length = Math.max(a.pre.length, b.pre.length)
    for (let index = 0; index < length; index += 1) {
      const x = a.pre[index]
      const y = b.pre[index]
      if (x === undefined) return -1
      if (y === undefined) return 1
      const xNumeric = /^\d+$/.test(x)
      const yNumeric = /^\d+$/.test(y)
      if (xNumeric && yNumeric) {
        if (Number(x) !== Number(y)) return Number(x) > Number(y) ? 1 : -1
      } else if (xNumeric) return -1
      else if (yNumeric) return 1
      else if (x !== y) return x > y ? 1 : -1
    }
    return 0
  }

  function isNewer(candidate, current) {
    return typeof current === 'string' && candidate !== undefined && compareVersions(candidate, current) > 0
  }

  function isRegistrySource(source) {
    if (typeof source !== 'string') return false
    const value = source.trim()
    if (value.length === 0) return false
    if (/^(github:|git\+|git:|https?:|file:|link:|\.{0,2}[\\/]|[A-Za-z]:[\\/])/i.test(value)) return false
    if (/\.tgz(?:$|\?)/i.test(value)) return false
    return true
  }

  function sanitizeResult(result) {
    if (result === null || typeof result !== 'object') return result
    const copy = { ...result }
    if (copy.packageResult !== null && typeof copy.packageResult === 'object') {
      copy.packageResult = {
        ...copy.packageResult,
        output: String(copy.packageResult.output ?? '').slice(0, 4000),
      }
    }
    return copy
  }

  function describeError(result) {
    if (result === null || typeof result !== 'object') return 'unknown error'
    const error = result.error
    if (error === undefined || error === null) return null
    const code = typeof error.code === 'string' ? error.code : 'operation-error'
    const diagnostic = typeof error.diagnostic === 'string' ? error.diagnostic : ''
    return diagnostic.length > 0 ? `${code}: ${diagnostic}` : code
  }

  function rowsWithPhase(bundle, plugins) {
    const byEntry = new Map(plugins.map(plugin => [plugin.entryId, plugin]))
    return (bundle.rows ?? []).map(row => {
      const live = row.entryId === undefined ? undefined : byEntry.get(row.entryId)
      return {
        rowId: row.rowId,
        moduleName: row.moduleName,
        enabled: live === undefined ? null : live.enabled,
        phase: live === undefined ? null : live.fiberPhase,
      }
    })
  }

  async function readState() {
    const pm = manager()
    if (pm === undefined) {
      return {
        ok: false,
        error: '当前 profile 没有可用的插件管理器（pluginManager）。',
        bundles: [],
      }
    }
    const [bundles, plugins] = await Promise.all([pm.listBundles(), pm.listPlugins()])
    let registries = null
    try {
      registries = await pm.registries()
    } catch {
      registries = null
    }
    const thirdParty = bundles
      .filter(bundle => bundle.name !== '@local/dsh-plugin-console')
      .filter(bundle => bundle.installed === true || bundle.availability === 'profile')
      .map(bundle => {
        const rows = rowsWithPhase(bundle, plugins)
        const failed = rows.some(row => row.phase === 'failed')
        const cached = cache.get(bundle.name)
        const latest = cached !== undefined && cached.error === undefined && typeof cached.version === 'string'
          ? cached.version
          : null
        return {
          name: bundle.name,
          version: bundle.version ?? null,
          title: pickText(bundle.meta?.title) ?? bundle.name,
          description: bundle.description ?? pickText(bundle.meta?.description) ?? '',
          icon: bundle.meta?.icon ?? null,
          enabled: bundle.enabled === true,
          installed: bundle.installed === true,
          removable: bundle.removable === true,
          readOnlyReason: bundle.readOnlyReason ?? null,
          source: bundle.source ?? null,
          official: bundle.official === true,
          optional: bundle.optional === true,
          error: bundle.error ?? null,
          health: failed ? 'failed' : 'ok',
          rows,
          update: latest === null
            ? null
            : {
                latest,
                available: isNewer(latest, bundle.version),
                checkedAt: cached.at ?? null,
                homepage: cached.homepage ?? null,
                repository: cached.repository ?? null,
                registry: cached.registry ?? null,
              },
          updateError: cached?.error ?? null,
        }
      })
      .sort((left, right) => {
        const updating = Number(right.update?.available === true) - Number(left.update?.available === true)
        return updating !== 0 ? updating : left.name.localeCompare(right.name)
      })
    const checkedAt = [...cache.values()].reduce((latest, entry) => Math.max(latest, entry.at ?? 0), 0)
    return {
      ok: true,
      profile: process.env.DSH_PROFILE ?? null,
      registry: registries?.resolved ?? registries?.registry ?? null,
      fallbackRegistries: registries?.fallbackRegistries ?? [],
      checkedAt: checkedAt > 0 ? checkedAt : null,
      generatedAt: Date.now(),
      bundles: thirdParty,
    }
  }

  async function latestVersion(name) {
    const cached = cache.get(name)
    if (cached !== undefined && Date.now() - cached.at < options.cacheTtlMs) return cached
    const entry = { at: Date.now() }
    let lastError = null
    const encoded = name.startsWith('@') ? name.replace('/', '%2f') : name
    for (const registry of REGISTRY_BASE) {
      try {
        const response = await fetch(`${registry.base}/${encoded}/latest`, {
          signal: AbortSignal.timeout(options.requestTimeoutMs),
          headers: {
            accept: 'application/json',
            'user-agent': 'dsh-plugin-console/0.1',
          },
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const document = await response.json()
        entry.version = typeof document.version === 'string' ? document.version : undefined
        entry.homepage = typeof document.homepage === 'string' ? document.homepage : undefined
        entry.repository = typeof document.repository === 'string'
          ? document.repository
          : document.repository?.url
        entry.registry = registry.id
        cache.set(name, entry)
        return entry
      } catch (error) {
        lastError = error
      }
    }
    entry.error = String(lastError?.message ?? lastError ?? 'registry unavailable')
    cache.set(name, entry)
    return entry
  }

  async function checkUpdates() {
    const pm = manager()
    if (pm === undefined) throw new Error('当前 profile 没有可用的插件管理器（pluginManager）。')
    const bundles = await pm.listBundles()
    const targets = bundles.filter(bundle => bundle.installed === true && isRegistrySource(bundle.source))
    const results = {}
    await Promise.all(targets.map(async bundle => {
      const info = await latestVersion(bundle.name)
      results[bundle.name] = {
        current: bundle.version ?? null,
        latest: info.version ?? null,
        available: info.version !== undefined && isNewer(info.version, bundle.version),
        homepage: info.homepage ?? null,
        repository: info.repository ?? null,
        registry: info.registry ?? null,
        checkedAt: info.at,
        error: info.error ?? null,
      }
    }))
    return {
      ok: true,
      checkedAt: Date.now(),
      results,
      skipped: bundles
        .filter(bundle => bundle.installed === true && !isRegistrySource(bundle.source))
        .map(bundle => ({ name: bundle.name, source: bundle.source ?? null })),
    }
  }

  async function runAction(body) {
    const pm = manager()
    if (pm === undefined) throw new Error('当前 profile 没有可用的插件管理器（pluginManager）。')
    if (busy !== null) {
      return { status: 409, payload: { ok: false, error: `已有操作正在进行：${busy}` } }
    }
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const action = typeof body.action === 'string' ? body.action : ''
    if (name.length === 0) return { status: 400, payload: { ok: false, error: '缺少插件名' } }
    if (!['enable', 'disable', 'remove', 'update'].includes(action)) {
      return { status: 400, payload: { ok: false, error: `未知操作：${action}` } }
    }
    busy = `${action}:${name}`
    try {
      const bundles = await pm.listBundles()
      const bundle = bundles.find(item => item.name === name)
      if (bundle === undefined) {
        return { status: 404, payload: { ok: false, error: `没有找到插件：${name}` } }
      }

      if (action === 'enable' || action === 'disable') {
        const result = await pm.setBundleEnabled(name, action === 'enable')
        const ok = result.error === undefined && result.application !== 'failed'
        return {
          status: 200,
          payload: {
            ok,
            action,
            result: sanitizeResult(result),
            note: ok ? null : describeError(result),
          },
        }
      }

      if (action === 'remove') {
        if (bundle.removable !== true) {
          return { status: 409, payload: { ok: false, error: '该插件不可卸载（安装随附或被保护）。' } }
        }
        const result = await pm.removeBundle(name)
        const ok = result.error === undefined && result.application !== 'failed'
        return {
          status: 200,
          payload: {
            ok,
            action,
            result: sanitizeResult(result),
            note: ok ? null : describeError(result),
          },
        }
      }

      // update = remove + install the requested/latest version (the same pair
      // the built-in page performs for an explicit update).
      if (bundle.removable !== true) {
        return { status: 409, payload: { ok: false, error: '该插件不可卸载，因此无法自动更新。' } }
      }
      let target = typeof body.version === 'string' && body.version.trim().length > 0
        ? body.version.trim()
        : undefined
      if (target === undefined) {
        const info = await latestVersion(name)
        if (typeof info.version !== 'string') {
          return { status: 502, payload: { ok: false, error: `无法读取 ${name} 的最新版本：${info.error ?? 'registry unavailable'}` } }
        }
        target = info.version
      }
      if (parseVersion(target) === null) {
        return { status: 400, payload: { ok: false, error: `无效的版本号：${target}` } }
      }
      if (!isNewer(target, bundle.version)) {
        return { status: 200, payload: { ok: true, action, upToDate: true, note: `当前已是 ${target}，无需更新。` } }
      }
      const removed = await pm.removeBundle(name)
      if (removed.error !== undefined || removed.application === 'failed') {
        return {
          status: 200,
          payload: {
            ok: false,
            action,
            stage: 'remove',
            remove: sanitizeResult(removed),
            error: describeError(removed) ?? '卸载失败，未执行重装',
            note: '卸载失败，未执行重装；插件保持原状态。',
          },
        }
      }
      const installed = await pm.installBundle(`${name}@${target}`, { saveExact: true, enabled: true })
      const ok = installed.error === undefined && installed.application !== 'failed'
      return {
        status: 200,
        payload: {
          ok,
          action,
          stage: 'install',
          target: `${name}@${target}`,
          remove: sanitizeResult(removed),
          install: sanitizeResult(installed),
          error: ok ? null : describeError(installed),
          note: ok
            ? null
            : `插件已卸载，但重装 ${target} 失败。请在“插件”页重新安装 ${name}@${target}。`,
        },
      }
    } finally {
      busy = null
    }
  }

  async function handler(req, res) {
    try {
      if (!isLoopback(req)) {
        send(res, 403, { ok: false, error: 'plugin-console API is loopback-only' })
        return
      }
      if (!isSameOrigin(req)) {
        send(res, 403, { ok: false, error: 'cross-origin request refused' })
        return
      }
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (req.method === 'GET' && url.pathname === `${ROUTE}/state`) {
        send(res, 200, await readState())
        return
      }
      if (req.method === 'POST' && url.pathname === `${ROUTE}/check`) {
        send(res, 200, await checkUpdates())
        return
      }
      if (req.method === 'POST' && url.pathname === `${ROUTE}/action`) {
        const body = await readBody(req)
        const { status, payload } = await runAction(body)
        send(res, status, payload)
        return
      }
      send(res, 404, { ok: false, error: 'not found' })
    } catch (error) {
      ctx.logger?.warn?.('[plugin-console] request failed: %s', String(error))
      send(res, 500, { ok: false, error: String(error?.message ?? error) })
    }
  }

  if (webServer === undefined) {
    ctx.logger?.warn?.('[plugin-console] webServer is unavailable; the console page will show no data')
    return
  }
  ctx.effect(() => webServer.register({ kind: 'prefix', path: ROUTE, handler }))
}
