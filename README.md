# dsh-clean-search

[![npm](https://img.shields.io/npm/v/dsh-clean-search)](https://www.npmjs.com/package/dsh-clean-search)
[![license](https://img.shields.io/npm/l/dsh-clean-search)](./LICENSE)

DeepSeek Harness（DSH）搜索插件：**Bing 直连 + 代码级净化过滤**。直连 `cn.bing.com` 抓取搜索结果页，过滤掉导航、页脚、侧栏、广告等一切杂物，只把 `{ url, title, snippet }` 干净列表交给模型——不需要任何 API key。

## 工作原理

```
模型调 web_search → DSH 宿主 ctx.web → 本插件 provider "bing-clean"
  → fetch cn.bing.com/search?q=…（Chrome UA，15s 超时）
  → <li class="b_algo"> 切块（天然排除导航/页脚/广告）
  → 块内取首条 h2 链接 + 标题 + 首个 <p> 摘要
  → 实体解码 + 去标签 + 去重 → { sources: [...] }
```

插件注册为 `ctx.web` 的 search provider（`inject: ['web']`）。若 profile 里没有其他可用 provider，内置 `web_search` 工具会自动路由到它，无需任何配置。

## 安装

### 方式一：命令行（web / TUI profile）

```bash
dsh plugin --profile web add dsh-clean-search
```

### 方式二：桌面端 profile

桌面 profile 由 Electron 宿主独占管理，需手动编辑 `~/.dsh/profiles/desktop/package.json`：

1. `dependencies` 加入 `"dsh-clean-search": "^1.0.0"`（或用 pnpm 直接装）
2. `dsh.profile.bundles` 数组加入 `"dsh-clean-search"`
3. 完全退出 DSH 再重启（bundle 列表在启动时读取）

### pnpm minimumReleaseAge 注意事项

若 profile 的 `pnpm-workspace.yaml` 配置了 `minimumReleaseAge`（supply-chain 防护），刚发布的版本会撞 `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`，把包加进 `minimumReleaseAgeExclude` 即可：

```yaml
minimumReleaseAgeExclude:
  - dsh-clean-search
```

## 配置

无。零依赖、零 key、零配置。

## 已知限制

- 依赖 Bing 中文站结果页 DOM 结构（`b_algo` 块），Bing 改版可能需要跟随调整
- 国内网络环境直连 `cn.bing.com` 无需代理；其他地区会自动落到 bing.com 国际版，解析兼容

## License

MIT
