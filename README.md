# 插件管家（Plugin Console）

一个面向 **第三方 profile 插件** 的集中管理面板。它不替代 DSH 自带的“插件”页，而是补上自带页面对第三方插件缺失的部分：

- 只列出 profile 安装的第三方插件（例如 `dsh-whale-widget`、`dsh-ops`），不和 199 行核心插件混在一起
- 检查 npm registry 上的最新版本，标出可更新项
- 一键 **更新**（先卸载再安装指定的最新版，与自带页面对官方插件的更新方式一致）
- 启用 / 停用、卸载（带二次确认）
- 显示每个插件贡献的插件行及其运行状态（运行中 / 加载失败）
- “详情”直接跳到 DSH 自带的插件详情页，配置、行开关仍由自带页面负责
- **返回**：任意非对话面板的标题栏右侧（刷新图标左边）出现一个返回箭头；插件管家页标题上方也有一个“← 返回”

## 安装

在 DSH 的“插件”页 → **添加插件**，输入仓库地址：

```bash
dsh plugin add github:mouyfang/Plugin-Console
```

或在会话里让 Agent 用 `plugin_manager` 安装这个仓库。插件会以 `@local/dsh-plugin-console` 的包名出现在“已安装插件”里。

## 使用

安装后在左侧栏出现“插件管家”图标。打开后：

1. 点 **检查更新**：并行访问 npm registry（失败时回退 npmmirror），缓存 10 分钟
2. 可更新的插件出现 **更新** 按钮；第一次点击变为确认条，确认后执行卸载 + 安装
3. **停用/启用** 直接调用 profile 的 bundle 选择
4. **卸载** 需要二次确认；不可卸载（随安装附带或被保护）的插件不显示卸载
5. **详情** 打开自带插件页，可继续做行级开关和配置

## 更新行为与风险

更新 = `pluginManager.removeBundle(name)` + `pluginManager.installBundle(name@version, { saveExact: true })`，与自带页面对官方插件的 “Update” 相同。因此：

- 更新期间插件会短暂下线
- 如果卸载成功但重装失败，插件会保持卸载状态；页面会提示可在“插件”页重新安装的具体 spec
- 需要重启的变更会显示“需要重启 DSH 生效”
- 非 registry 来源（`github:`、`file:`、`link:`、tarball、本地路径）不提供自动更新

## 边界

- API 只接受 loopback 请求，并校验同源 `Origin`，防止跨站请求伪造
- 同一时间只允许一个管理操作，避免两个标签页并发卸载/安装
- 不管理 agent preset 的会话级插件，也不改动官方插件页的安装流程
- 不会自动更新；检查与更新都由用户显式触发

## 配置

Host 行没有额外配置。可选字段（写在 profile 的 `cordis.patch.yml` 该行 `config` 下）：

| 字段 | 默认 | 含义 |
|---|---|---|
| `requestTimeoutMs` | `8000` | 单次 registry 查询超时 |
| `cacheTtlMs` | `600000` | 版本查询缓存时长 |
| `maxBodyBytes` | `16384` | 管理请求体上限 |

## 文件

- `index.js` — Host 半：`/plugin-console/state`、`/check`、`/action` 路由，包管理与 npm 查询
- `client.js` — Client 半：侧栏入口 + 主面板（React，无构建）
- `cordis.patch.yml` — 插入 `plugin-console` 行
- `locale/zh.json`、`locale/en.json` — 插件页显示名与描述
- `icon.svg` — 侧栏与插件列表图标
