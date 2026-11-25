/**
 * Keyword information subscriptions for the PM workbench.
 *
 * The feed store is separate from workbench.json: hourly results grow, and the
 * sidebar sync route should not carry them. Search goes through DSH's own web
 * service, so provider selection and credentials stay in the Host.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const HOME = process.env.DSH_HOME || join(homedir(), '.dsh');
const STORE_FILE = join(HOME, 'storages', 'pm-workbench', 'feeds.json');
const INTERVAL_SECONDS = 60 * 60;
const MAX_SUBSCRIPTIONS = 20;
const MAX_ITEMS = 200;
const MAX_RESULTS = 10;
const ITEM_TTL_MS = 30 * 24 * 60 * 60 * 1000;

let timer = null;
let running = null;

function nowIso() {
  return new Date().toISOString();
}

function text(value, limit) {
  return String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim().slice(0, limit || 500);
}

function readStore() {
  try {
    const raw = JSON.parse(readFileSync(STORE_FILE, 'utf8'));
    return {
      version: 1,
      subscriptions: Array.isArray(raw.subscriptions) ? raw.subscriptions : [],
      items: Array.isArray(raw.items) ? raw.items : [],
    };
  } catch (err) {
    return { version: 1, subscriptions: [], items: [] };
  }
}

function writeStore(store) {
  mkdirSync(dirname(STORE_FILE), { recursive: true });
  const temp = `${STORE_FILE}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify({ version: 1, ...store }, null, 2), 'utf8');
  renameSync(temp, STORE_FILE);
}

function getWeb(ctx) {
  try {
    return typeof ctx.get === 'function' ? ctx.get('web') : undefined;
  } catch (err) {
    return undefined;
  }
}

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 24);
}

function prune(store, now) {
  const cutoff = now.getTime() - ITEM_TTL_MS;
  store.items = sortItems(store.items
    .filter((item) => {
      const time = Date.parse(item.fetchedAt || '');
      return Number.isNaN(time) || time >= cutoff;
    }))
    .slice(0, MAX_ITEMS);
  return store;
}

function itemTime(item) {
  const published = Date.parse(item.publishedAt || '');
  if (!Number.isNaN(published)) return published;
  const fetched = Date.parse(item.fetchedAt || '');
  return Number.isNaN(fetched) ? 0 : fetched;
}

function sortItems(items) {
  return items.slice().sort((a, b) => itemTime(b) - itemTime(a)
    || String(b.fetchedAt || '').localeCompare(String(a.fetchedAt || ''))
    || String(b.id || '').localeCompare(String(a.id || '')));
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '::1' || host.endsWith('.localhost')) return false;
    if (/^(127|10|169\.254|192\.168)\./.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    return true;
  } catch (err) {
    return false;
  }
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

function pageText(body) {
  const raw = body && typeof body.content === 'string' ? body.content : '';
  const html = body && body.kind === 'html';
  const title = html
    ? decodeEntities((raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim()
    : '';
  let content = raw;
  if (html) {
    content = raw
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ');
  }
  content = decodeEntities(content).replace(/\s+/g, ' ').trim();
  return { title: title.slice(0, 300), content };
}

const ARTICLE_UTILITY_TITLE = /^(首页|主页|登录|注册|关于|关于我们|联系我们|更多|更多文章|全部|栏目|分类|标签|搜索|下载|客户端|APP|English|Home|Login|Sign in|Sign up|About|Contact|More|All|Search|Privacy|Terms)(\s|$|·|\||-|_)/i;
const ARTICLE_UTILITY_PATH = /^\/(login|signin|signup|register|about|contact|privacy|terms|search|tag|tags|category|categories|user|users|download|app)(\/|$)/i;
const ARTICLE_PATH = /\/(article|articles|post|posts|news|blog|story|stories|detail|content)\/|\/(19|20)\d{2}\/\d{1,2}\/|\/\d{4,}\/?$|\.(s?html?|md)(\?|$)/i;

function isArticlePage(html) {
  return /<meta[^>]+property=["']og:type["'][^>]*content=["']article["']/i.test(html)
    || /<meta[^>]+content=["']article["'][^>]*property=["']og:type["']/i.test(html)
    || /<meta[^>]+name=["']article:published_time["']/i.test(html);
}

function articleBody(html) {
  const blocks = [];
  const pattern = /<article\b[^>]*>([\s\S]*?)<\/article>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const text = decodeEntities(String(match[1] || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
    if (text) blocks.push(text);
  }
  return blocks.join(' ').trim();
}

function articleLinks(html, baseValue) {
  let base;
  try { base = new URL(baseValue); } catch (err) { return []; }
  const found = new Map();
  const pattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null && found.size < 30) {
    const attrs = match[1] || '';
    const hrefMatch = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    let url;
    try { url = new URL(hrefMatch[1], base); } catch (err) { continue; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
    const baseHost = base.hostname.replace(/^www\./i, '').toLowerCase();
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    if (host !== baseHost) continue;
    if (url.pathname === '/' || ARTICLE_UTILITY_PATH.test(url.pathname)) continue;
    const inner = decodeEntities(String(match[2] || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    const attrTitle = (attrs.match(/\btitle\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
    const title = (attrTitle || inner).replace(/\s+/g, ' ').trim();
    if (title.length < 4 || ARTICLE_UTILITY_TITLE.test(title)) continue;
    if (url.pathname === base.pathname && (url.search || '') === (base.search || '')) continue;
    let score = 0;
    if (ARTICLE_PATH.test(url.pathname)) score += 2;
    if (/\b(class|rel)\s*=\s*["'][^"']*(article|post|entry|title|headline|bookmark)/i.test(attrs)) score += 2;
    if (title.length >= 8) score += 1;
    if (title.length >= 14) score += 1;
    if (score < 2) continue;
    if (!found.has(url.href)) found.set(url.href, { url: url.href, title: title.slice(0, 300) });
  }
  return [...found.values()];
}

function normalizeSubscription(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = raw.type === 'url' ? 'url' : raw.type === 'wechat' ? 'wechat' : raw.type === 'keyword' ? 'keyword' : null;
  if (!type) return null;
  const value = text(raw.value, 1000);
  if (!value) return null;
  if (type === 'url' && !isHttpUrl(value)) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    name: text(raw.name, 100) || (type === 'url' ? new URL(value).hostname : value),
    value,
    enabled: raw.enabled !== false,
    intervalMinutes: 60,
    lastHash: text(raw.lastHash, 80) || null,
    lastTitle: text(raw.lastTitle, 300) || null,
    lastLinks: Array.isArray(raw.lastLinks)
      ? raw.lastLinks.filter((link) => typeof link === 'string' && /^https?:\/\//i.test(link)).slice(0, 200)
      : [],
    lastRunAt: typeof raw.lastRunAt === 'string' ? raw.lastRunAt : null,
    nextRunAt: typeof raw.nextRunAt === 'string' ? raw.nextRunAt : nowIso(),
    lastStatus: ['ok', 'error', 'running'].includes(raw.lastStatus) ? raw.lastStatus : null,
    lastError: text(raw.lastError, 300) || null,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : nowIso(),
  };
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const url = text(raw.url, 1000);
  const title = text(raw.title, 300);
  if (!url && !title) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `i_${hash((url || '') + '|' + title)}`,
    subscriptionId: text(raw.subscriptionId, 80),
    title: title || url,
    url,
    snippet: text(raw.snippet, 1000),
    summary: text(raw.summary, 4000),
    publishedAt: text(raw.publishedAt, 40),
    fetchedAt: typeof raw.fetchedAt === 'string' ? raw.fetchedAt : nowIso(),
    source: raw.source === 'web-page' ? 'web-page' : raw.source === 'wechat-search' ? 'wechat-search' : 'web-search',
    unread: raw.unread !== false,
  };
}

function sanitizeStore(raw) {
  const store = { version: 1, subscriptions: [], items: [] };
  if (!raw || typeof raw !== 'object') return store;
  store.subscriptions = (Array.isArray(raw.subscriptions) ? raw.subscriptions : [])
    .map(normalizeSubscription)
    .filter(Boolean)
    .slice(0, MAX_SUBSCRIPTIONS);
  store.items = (Array.isArray(raw.items) ? raw.items : [])
    .map(normalizeItem)
    .filter(Boolean)
    .slice(0, MAX_ITEMS);
  return prune(store, new Date());
}

export function getFeeds() {
  const store = sanitizeStore(readStore());
  return {
    subscriptions: store.subscriptions,
    items: sortItems(store.items),
    intervalMinutes: 60,
    available: true,
  };
}

export function addFeed(ctx, payload) {
  const store = sanitizeStore(readStore());
  if (store.subscriptions.length >= MAX_SUBSCRIPTIONS) throw new Error(`最多 ${MAX_SUBSCRIPTIONS} 个订阅。`);
  const type = payload && payload.type === 'wechat' ? 'wechat' : payload && payload.type === 'url' ? 'url' : 'keyword';
  if (type === 'url' && !isHttpUrl(payload && payload.value)) throw new Error('请填写可访问的 http/https 网址，不能是本地或私网地址。');
  const feed = normalizeSubscription({
    type,
    value: payload && payload.value,
    name: payload && payload.name,
    enabled: true,
  });
  if (!feed) throw new Error(type === 'url' ? '请填写可访问的 http/https 网址。' : '请填写关键词。');
  store.subscriptions.unshift(feed);
  writeStore(store);
  return { feed, ...getFeeds() };
}

export function updateFeed(ctx, payload) {
  const store = sanitizeStore(readStore());
  const id = text(payload && payload.id, 80);
  const feed = store.subscriptions.find((entry) => entry.id === id);
  if (!feed) throw new Error('找不到这个订阅。');
  if (payload.name !== undefined) feed.name = text(payload.name, 100) || feed.value;
  if (payload.value !== undefined) {
    const value = text(payload.value, feed.type === 'url' ? 1000 : 300);
    if (!value) throw new Error(feed.type === 'url' ? '网址不能为空。' : '关键词不能为空。');
    if (feed.type === 'url' && !isHttpUrl(value)) throw new Error('请填写可访问的 http/https 网址，不能是本地或私网地址。');
    if (value !== feed.value) {
      feed.value = value;
      feed.lastHash = null;
      feed.lastTitle = null;
      feed.lastLinks = [];
      if (!payload.name) feed.name = feed.type === 'url' ? new URL(value).hostname : value;
    }
  }
  if (payload.enabled !== undefined) feed.enabled = payload.enabled === true;
  if (payload.enabled === true) feed.nextRunAt = nowIso();
  writeStore(store);
  return getFeeds();
}

export function deleteFeed(ctx, payload) {
  const store = sanitizeStore(readStore());
  const id = text(payload && payload.id, 80);
  store.subscriptions = store.subscriptions.filter((entry) => entry.id !== id);
  store.items = store.items.filter((item) => item.subscriptionId !== id);
  writeStore(store);
  return getFeeds();
}

async function runSubscriptions(ctx, onlyId) {
  const web = getWeb(ctx);
  if (!web || (typeof web.search !== 'function' && typeof web.fetch !== 'function')) {
    throw new Error('DSH Web 服务不可用，请先在模型/网页服务里配置搜索或网页抓取 provider。');
  }
  const store = sanitizeStore(readStore());
  const now = new Date();
  const due = store.subscriptions.filter((feed) => {
    if (onlyId) return feed.id === onlyId;
    if (!feed.enabled) return false;
    const next = Date.parse(feed.nextRunAt || '');
    return Number.isNaN(next) || next <= now.getTime();
  });
  let added = 0;
  for (const feed of due) {
    feed.lastStatus = 'running';
    feed.lastError = null;
    writeStore(store);
    try {
      const known = new Set(store.items.map((item) => item.id));
      if (feed.type === 'url') {
        if (typeof web.fetch !== 'function') throw new Error('DSH Web 抓取服务不可用，请配置 fetch provider。');
        const result = await web.fetch({ url: feed.value });
        if (!result || result.statusCode < 200 || result.statusCode >= 400) {
          throw new Error(`网页抓取失败：HTTP ${result ? result.statusCode : 'unknown'}`);
        }
        const page = pageText(result.body);
        if (!page.content && !page.title) throw new Error('网页没有可读正文。');
        const html = result.body && result.body.kind === 'html' ? result.body.content : '';
        const links = html ? articleLinks(html, feed.value) : [];
        const singleArticle = isArticlePage(html) || (links.length === 0 && page.content.length >= 600 && !!page.title);
        if (links.length > 0 && !singleArticle) {
          const previous = Array.isArray(feed.lastLinks) ? feed.lastLinks : [];
          const known = new Set(previous);
          if (previous.length === 0) {
            feed.lastLinks = links.map((link) => link.url).slice(0, 200);
          } else {
            for (const link of links) {
              if (known.has(link.url)) continue;
              const item = normalizeItem({
                id: `i_${hash(`${feed.id}:${link.url}`)}`,
                subscriptionId: feed.id,
                title: link.title,
                url: link.url,
                snippet: '',
                summary: '',
                fetchedAt: nowIso(),
                source: 'web-page',
                unread: true,
              });
              if (item && !known.has(item.id)) {
                store.items.unshift(item);
                added += 1;
              }
              known.add(link.url);
            }
            feed.lastLinks = links.map((link) => link.url).slice(0, 200);
          }
          feed.lastHash = null;
          feed.lastTitle = page.title || feed.name;
        } else {
          if (!singleArticle) throw new Error('未识别到文章列表；请填写网站栏目页或文章页。');
          const bodyText = articleBody(html) || page.content;
          const pageHash = hash(`${page.title}\n${bodyText.slice(0, 50000)}`);
          if (!feed.lastHash) {
            feed.lastHash = pageHash;
            feed.lastTitle = page.title || feed.name;
          } else if (feed.lastHash !== pageHash) {
            const item = normalizeItem({
              id: `i_${hash(`${feed.id}:${pageHash}`)}`,
              subscriptionId: feed.id,
              title: page.title || feed.name,
              url: feed.value,
              snippet: bodyText.slice(0, 1000),
              summary: bodyText.slice(0, 4000),
              fetchedAt: nowIso(),
              source: 'web-page',
              unread: true,
            });
            if (item && !known.has(item.id)) {
              store.items.unshift(item);
              added += 1;
            }
            feed.lastHash = pageHash;
            feed.lastTitle = page.title || feed.name;
          }
        }
      } else if (feed.type === 'wechat') {
        if (typeof web.search !== 'function') throw new Error('DSH Web 搜索服务不可用，请配置搜索 provider。');
        const result = await web.search({
          query: `site:mp.weixin.qq.com "${feed.value}" ${new Date().getFullYear()}`,
          maxResults: MAX_RESULTS,
        });
        const sources = (Array.isArray(result && result.sources) ? result.sources : [])
          .filter((source) => {
            try { return new URL(source.url).hostname === 'mp.weixin.qq.com'; } catch (err) { return false; }
          });
        const urls = [...new Set(sources.map((source) => source.url))];
        const previous = Array.isArray(feed.lastLinks) ? feed.lastLinks : [];
        if (feed.lastRunAt) {
          const known = new Set(previous);
          for (const source of sources) {
            if (known.has(source.url)) continue;
            const item = normalizeItem({
              id: `i_${hash(`${feed.id}:${source.url}`)}`,
              subscriptionId: feed.id,
              title: source.title || '公众号文章',
              url: source.url,
              snippet: source.snippet || '',
              summary: source.summary || '',
              publishedAt: source.publishedAt,
              fetchedAt: nowIso(),
              source: 'wechat-search',
              unread: true,
            });
            if (item && !known.has(item.id)) {
              store.items.unshift(item);
              added += 1;
            }
            known.add(source.url);
          }
        }
        feed.lastLinks = urls.slice(0, 200);
        feed.lastHash = null;
        feed.lastTitle = feed.value;
      } else {
        if (typeof web.search !== 'function') throw new Error('DSH Web 搜索服务不可用，请配置搜索 provider。');
        const result = await web.search({ query: feed.value, maxResults: MAX_RESULTS });
        const sources = Array.isArray(result && result.sources) ? result.sources : [];
        for (const source of sources) {
          const item = normalizeItem({
            subscriptionId: feed.id,
            title: source.title,
            url: source.url,
            snippet: source.snippet,
            summary: source.summary,
            publishedAt: source.publishedAt,
            fetchedAt: nowIso(),
            unread: true,
          });
          if (!item || known.has(item.id)) continue;
          known.add(item.id);
          store.items.unshift(item);
          added += 1;
        }
      }
      feed.lastStatus = 'ok';
      feed.lastError = null;
      feed.lastRunAt = nowIso();
      feed.nextRunAt = new Date(now.getTime() + INTERVAL_SECONDS * 1000).toISOString();
    } catch (err) {
      feed.lastStatus = 'error';
      feed.lastError = text(err && err.message ? err.message : err, 300);
      feed.lastRunAt = nowIso();
      feed.nextRunAt = new Date(now.getTime() + INTERVAL_SECONDS * 1000).toISOString();
    }
  }
  prune(store, now);
  writeStore(store);
  return { added, ...getFeeds() };
}

export async function runFeed(ctx, id) {
  if (running) return running;
  running = runSubscriptions(ctx, id).finally(() => { running = null; });
  return running;
}

export function startFeedScheduler(ctx) {
  if (timer || typeof setInterval !== 'function') return;
  const tick = () => {
    const store = sanitizeStore(readStore());
    const now = Date.now();
    const due = store.subscriptions.some((feed) => {
      if (!feed.enabled) return false;
      const next = Date.parse(feed.nextRunAt || '');
      return Number.isNaN(next) || next <= now;
    });
    if (!due || running) return;
    runFeed(ctx).catch(() => {});
  };
  timer = setInterval(tick, 60 * 1000);
  if (timer && typeof timer.unref === 'function') timer.unref();
  ctx.effect(() => () => {
    if (timer) clearInterval(timer);
    timer = null;
  });
  // A missed run while DSH was closed is caught on the next tick.
  setTimeout(tick, 3000).unref?.();
}
