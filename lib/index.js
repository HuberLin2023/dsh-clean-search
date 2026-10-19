// ============================================================================
// dsh-clean-search —— Bing 直连干净搜索 provider
// ----------------------------------------------------------------------------
// 直连 cn.bing.com 抓取搜索结果页，代码过滤掉导航/页脚/广告等一切杂物，
// 只把 { url, title, snippet } 列表交给模型（注册为 ctx.web 的 search
// provider，模型通过内置 web_search 工具使用）。
// ============================================================================

const BING_URL = 'https://cn.bing.com/search';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const TIMEOUT_MS = 15000;

export const name = 'clean-search';
// 声明依赖 web 服务（ctx.web），cordis 会等它就绪后再调 apply
export const inject = ['web'];

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  middot: '·',
};

function decodeEntities(s) {
  return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, body) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()] ?? m;
  });
}

function stripTags(html) {
  return decodeEntities(String(html).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 从 Bing 结果页 HTML 提取干净结果：只取 class="b_algo" 的结果块，
 * 天然排除导航/页脚/侧栏/广告，再从每块里抓首条链接、标题与摘要。
 */
export function parseBingResults(html) {
  const sources = [];
  // b_algo 块可能带额外 class（如 "b_algo b_vtl"），所以 split 后不带结尾引号
  const blocks = html.split(/<li class="b_algo[ "]/g).slice(1);
  for (const block of blocks) {
    const end = block.indexOf('</li>');
    const body = end >= 0 ? block.slice(0, end) : block;
    const link =
      body.match(/<h2[^>]*>\s*<a[^>]*\shref="([^"]+)"/i) ||
      body.match(/<a[^>]*\shref="(https?:[^"]+)"/i);
    if (!link) continue;
    const url = decodeEntities(link[1]);
    if (!/^https?:/i.test(url)) continue;
    const titleMatch = body.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const title = titleMatch ? stripTags(titleMatch[1]) : '';
    const pMatch = body.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = pMatch ? stripTags(pMatch[1]) : '';
    sources.push({
      url,
      title: title || url,
      ...(snippet ? { snippet } : {}),
    });
  }
  return sources;
}

export function apply(ctx) {
  ctx.web.registerSearchProvider({
    id: 'bing-clean',
    available: () => true,
    async search(request, signal) {
      const query = String(request?.query ?? '').trim();
      if (!query) throw new Error('bing-clean: query must be a non-empty string');
      const maxResults =
        Number.isInteger(request?.maxResults) && request.maxResults > 0
          ? request.maxResults
          : 10;
      const count = Math.min(Math.max(maxResults + 5, 10), 28);
      const url = `${BING_URL}?q=${encodeURIComponent(query)}&count=${count}&mkt=zh-CN&setlang=zh-hans`;
      const timeout = AbortSignal.timeout(TIMEOUT_MS);
      const signalArg = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const resp = await fetch(url, {
        headers: {
          'user-agent': UA,
          accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        redirect: 'follow',
        signal: signalArg,
      });
      const html = await resp.text();
      if (!resp.ok) throw new Error(`bing-clean: Bing returned HTTP ${resp.status}`);
      const seen = new Set();
      const sources = [];
      let truncated = false;
      for (const s of parseBingResults(html)) {
        if (seen.has(s.url)) continue;
        seen.add(s.url);
        // Report the cap explicitly: dsh-tool-web copies `result.truncated`
        // onto the tool value unconditionally, and an undefined own property
        // fails the harness lossless-JSON snapshot.
        if (sources.length >= maxResults) {
          truncated = true;
          break;
        }
        sources.push(s);
      }
      return { sources, truncated };
    },
  });
}
