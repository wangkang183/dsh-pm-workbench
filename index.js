/**
 * Host half of the PM workbench bundle (v2).
 *
 * One job only: run model-backed features for the sidebar panel.
 *
 *   GET  /pm-workbench/ai   → health: which provider/model would be used
 *   POST /pm-workbench/ai   → { task: 'parse' | 'summary', ... }
 *   GET  /pm-workbench/inbox → mailbox status
 *   POST /pm-workbench/inbox → config / sync / disconnect
 *
 * The browser never sees a key and never talks to a model provider directly.
 * The model route is the harness default (`agentDefaultModel`), with a live
 * session route and the first registered provider as fallbacks.
 *
 * Every failure is returned as `{ ok: false, error, code }` with HTTP 200 so
 * the client can degrade to its local parser / local weekly digest instead of
 * treating an unavailable model as a page-breaking error.
 */
import { loadState, saveState } from './store.js';
import { createTools } from './tools.js';
import { disconnectInbox, getInboxStatus, saveInboxConfig, syncInbox } from './inbox.js';

const ROUTE = '/pm-workbench/ai';
const DATA_ROUTE = '/pm-workbench/data';
const INBOX_ROUTE = '/pm-workbench/inbox';
const BODY_LIMIT = 256 * 1024;
const DATA_BODY_LIMIT = 1024 * 1024;
const MODEL_TIMEOUT_MS = 45_000;
const MAX_OUTPUT_TOKENS = 2000;
const MAX_PARSE_CHARS = 6000;
const MAX_PROMPT_ITEMS = 120;
const MAX_PROMPT_CHARS = 14_000;

export const inject = ['webServer'];

export function apply(ctx) {
  const server = getService(ctx, 'webServer');
  if (!server || typeof server.register !== 'function') return;
  registerRoute(ctx, server, ROUTE, handle);
  registerRoute(ctx, server, DATA_ROUTE, handleData);
  registerRoute(ctx, server, INBOX_ROUTE, handleInbox);
  registerTools(ctx);
  registerPrompt(ctx);
}

function registerRoute(ctx, server, path, handler) {
  try {
    ctx.effect(() => server.register({
      kind: 'exact',
      path,
      handler: (req, res) => {
        handler(ctx, req, res).catch((err) => fail(res, 500, String((err && err.message) || err), 'internal'));
      },
    }));
  } catch (err) {
    try { console.warn('[pm-workbench] route registration failed', path, err); } catch (err2) { /* no console */ }
  }
}

function registerTools(ctx) {
  const tools = getService(ctx, 'tools');
  if (!tools || typeof tools.register !== 'function') return;
  let definitions;
  try {
    definitions = createTools();
  } catch (err) {
    try { console.warn('[pm-workbench] tool definitions failed', err); } catch (err2) { /* no console */ }
    return;
  }
  for (const definition of definitions) {
    try {
      ctx.effect(() => tools.register(definition));
    } catch (err) {
      try { console.warn('[pm-workbench] tool registration failed', definition && definition.name, err); } catch (err2) { /* no console */ }
    }
  }
}

function registerPrompt(ctx) {
  const prompt = getService(ctx, 'systemPrompt');
  if (!prompt || typeof prompt.section !== 'function') return;
  try {
    ctx.effect(() => prompt.section({
      name: 'pm-workbench',
      order: 180,
      text: [
        '工作台待办：当用户用自然语言说「记一下 / 加入待办 / 提醒我 / 存到工作台」时，直接调用 pm_memo_add 写入，不要只回复确认。',
        '一条消息里有多个事项就放进 items；相对日期要换算成 YYYY-MM-DD，时间用 HH:mm。',
        '查询用 pm_memo_list，完成/修改用 pm_memo_update；删除前必须向用户确认并传 confirm:true。',
        '项目管理：创建项目用 pm_project_create，查询用 pm_project_list；加任务用 pm_project_task_add；更新任务进度、负责人、岗位、日期或依赖用 pm_project_task_update。用户说「项目/任务进度到多少」时直接更新并回报项目总进度。',
      ].join(''),
    }));
  } catch (err) {
    try { console.warn('[pm-workbench] prompt section failed', err); } catch (err2) { /* no console */ }
  }
}

function getService(ctx, name) {
  try {
    return typeof ctx.get === 'function' ? ctx.get(name) : undefined;
  } catch (err) {
    return undefined;
  }
}

/* ------------------------------------------------------------------ routing */

async function handle(ctx, req, res) {
  if (req.method === 'OPTIONS') { head(res, 204); return; }
  if (req.method === 'GET') {
    const route = await resolveRoute(ctx).catch((err) => ({ error: String((err && err.message) || err) }));
    writeHead(res, 200);
    res.end(JSON.stringify({
      ok: !route.error,
      route: route.error ? null : { provider: route.provider, model: route.model },
      error: route.error || null,
    }));
    return;
  }
  if (req.method !== 'POST') { fail(res, 405, 'method-not-allowed', 'method'); return; }

  let payload;
  try {
    payload = JSON.parse(await readBody(req, BODY_LIMIT));
  } catch (err) {
    fail(res, 400, 'invalid-json', 'bad-request');
    return;
  }

  const task = String((payload && payload.task) || '');
  if (task !== 'parse' && task !== 'summary') {
    fail(res, 400, 'unknown-task', 'bad-request');
    return;
  }

  const route = await resolveRoute(ctx);
  const llm = getService(ctx, 'llm');
  const system = task === 'summary' ? SUMMARY_SYSTEM : PARSE_SYSTEM;
  const user = task === 'summary' ? buildSummaryPrompt(payload) : buildParsePrompt(payload);

  const raw = await streamModel(llm, route, system, user);
  const parsed = extractJson(raw);
  const result = task === 'summary' ? sanitizeSummary(parsed) : sanitizeParse(parsed);

  writeHead(res, 200);
  res.end(JSON.stringify({ ok: true, task, route: { provider: route.provider, model: route.model }, result }));
}

async function handleData(ctx, req, res) {
  if (req.method === 'OPTIONS') { head(res, 204); return; }
  if (req.method === 'GET') {
    const state = loadState();
    sendJson(res, 200, { ok: true, rev: state.rev, updatedAt: state.updatedAt, store: state.store });
    return;
  }
  if (req.method !== 'POST') { fail(res, 405, 'method-not-allowed', 'method'); return; }

  let payload;
  try {
    payload = JSON.parse(await readBody(req, DATA_BODY_LIMIT));
  } catch (err) {
    fail(res, 400, 'invalid-json', 'bad-request');
    return;
  }
  if (!payload || typeof payload !== 'object' || !payload.store || typeof payload.store !== 'object') {
    fail(res, 400, 'missing-store', 'bad-request');
    return;
  }
  const result = saveState(payload.store, payload.baseRev);
  if (result.conflict) {
    sendJson(res, 409, {
      ok: false,
      code: 'conflict',
      rev: result.state.rev,
      updatedAt: result.state.updatedAt,
      store: result.state.store,
    });
    return;
  }
  sendJson(res, 200, { ok: true, rev: result.state.rev, updatedAt: result.state.updatedAt });
}

async function handleInbox(ctx, req, res) {
  if (req.method === 'OPTIONS') { head(res, 204); return; }
  if (req.method === 'GET') {
    try {
      const status = await getInboxStatus(ctx);
      sendJson(res, 200, { ok: true, ...status });
    } catch (err) {
      fail(res, 500, String((err && err.message) || err), 'inbox-status');
    }
    return;
  }
  if (req.method !== 'POST') { fail(res, 405, 'method-not-allowed', 'method'); return; }
  let payload;
  try {
    payload = JSON.parse(await readBody(req, BODY_LIMIT));
  } catch (err) {
    fail(res, 400, 'invalid-json', 'bad-request');
    return;
  }
  const action = payload && payload.action;
  try {
    if (action === 'config') {
      const result = await saveInboxConfig(ctx, payload);
      const status = await getInboxStatus(ctx);
      sendJson(res, 200, { ok: true, ...status, messages: result.messages });
      return;
    }
    if (action === 'sync') {
      const result = await syncInbox(ctx, payload.force === true);
      sendJson(res, 200, { ok: true, ...result });
      return;
    }
    if (action === 'disconnect') {
      const result = await disconnectInbox(ctx);
      sendJson(res, 200, { ok: true, ...result });
      return;
    }
    fail(res, 400, 'unknown-action', 'bad-request');
  } catch (err) {
    const message = String((err && err.message) || err);
    const code = /授权码|登录|AUTH|LOGIN|invalid credentials/i.test(message) ? 'auth' : 'inbox';
    fail(res, 400, message, code);
  }
}

async function resolveRoute(ctx) {
  const llm = getService(ctx, 'llm');
  if (!llm || typeof llm.stream !== 'function') throw new Error('当前部署没有可用的模型服务');

  const explicit = getService(ctx, 'agentDefaultModel');
  if (explicit && typeof explicit.currentSelection === 'function') {
    try {
      const route = routeOf(explicit.currentSelection());
      if (route) return route;
    } catch (err) {
      /* fall through to a live session route */
    }
  }

  const agents = getService(ctx, 'agents');
  if (agents && typeof agents.list === 'function') {
    try {
      for (const agent of agents.list() || []) {
        const route = routeOf(agent && agent.options);
        if (route) return route;
      }
    } catch (err) {
      /* fall through to the provider catalog */
    }
  }

  if (typeof llm.listProviders === 'function' && typeof llm.listModels === 'function') {
    let providers = [];
    try { providers = (await llm.listProviders()) || []; } catch (err) { providers = []; }
    for (const provider of providers) {
      const id = provider && provider.id;
      if (!id) continue;
      try {
        const models = await llm.listModels(id);
        const model = models && models[0] && models[0].id;
        if (model) return { provider: id, model, effort: undefined };
      } catch (err) {
        /* try the next provider */
      }
    }
  }

  throw new Error('没有找到可用的默认模型，请先在「设置 → 模型」里选择模型');
}

function routeOf(value) {
  if (!value || typeof value !== 'object') return null;
  const provider = String(value.provider || '').trim();
  const model = String(value.model || '').trim();
  if (!provider || !model) return null;
  return { provider, model, effort: undefined };
}

/* --------------------------------------------------------------------- model */

async function streamModel(llm, route, system, user) {
  if (!llm || typeof llm.stream !== 'function') throw new Error('模型服务不可用');
  const effort = await lowestEffort(llm, route);
  let text = '';
  let finishKind = '';
  let failure = '';

  const messages = [{
    role: 'user',
    content: [{ type: 'text', text: user }],
  }];

  const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
    ? AbortSignal.timeout(MODEL_TIMEOUT_MS)
    : undefined;

  try {
    for await (const chunk of llm.stream({
      provider: route.provider,
      model: route.model,
      messages,
      system,
      maxTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.3,
      signal,
      ...(effort ? { reasoningEffort: effort } : {}),
    })) {
      if (!chunk || typeof chunk !== 'object') continue;
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text;
      if (chunk.type === 'finish') {
        finishKind = chunk.reason && chunk.reason.kind ? String(chunk.reason.kind) : '';
        if (chunk.reason && chunk.reason.failure) {
          failure = String(chunk.reason.failure.message || chunk.reason.failure.code || '模型请求失败');
        }
      }
    }
  } catch (err) {
    if (err && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      throw new Error(`模型 ${Math.round(MODEL_TIMEOUT_MS / 1000)} 秒内没有返回，已自动降级`);
    }
    throw err;
  }

  if (!text.trim()) {
    if (finishKind === 'error') throw new Error(failure || '模型返回了错误');
    if (finishKind === 'aborted') throw new Error('模型请求被中止');
    throw new Error('模型返回为空');
  }
  return text.trim();
}

/** The cheapest reasoning level the model advertises (a summary needs no deep thought). */
async function lowestEffort(llm, route) {
  if (typeof llm.resolveModelInfo !== 'function') return undefined;
  try {
    const info = await llm.resolveModelInfo(route.provider, route.model);
    const efforts = info && info.reasoning && Array.isArray(info.reasoning.efforts) ? info.reasoning.efforts : [];
    const order = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
    const ids = efforts.map((entry) => entry && entry.id).filter((id) => typeof id === 'string' && id);
    if (!ids.length) return undefined;
    let best = ids[0];
    let rank = Number.POSITIVE_INFINITY;
    for (const id of ids) {
      const at = order.indexOf(id);
      if (at >= 0 && at < rank) { best = id; rank = at; }
    }
    return best;
  } catch (err) {
    return undefined;
  }
}

/* ------------------------------------------------------------------- prompts */

const SUMMARY_SYSTEM = [
  '你是产品经理的周报助手。根据用户提供的本周备忘与日程，写一份具体、克制、可直接交付的周工作总结。',
  '只允许输出一个 JSON 对象，不要 Markdown 代码围栏，不要任何解释。',
  'JSON 字段：',
  '{"headline":"一句话标题（20字内）","summary":"2-4句概述（120字内）",',
  '"done":["已完成的事项"],"progress":["正在推进的事项"],"risks":["风险、卡点或逾期"],"next":["下周计划"]}',
  '规则：',
  '1. 只能使用输入里出现的事实，不要编造项目、数字或人名。',
  '2. done / progress / risks / next 各最多 5 条，每条不超过 40 字，以动词开头。',
  '3. 没有内容的分组返回空数组 []。',
  '4. 如果本周记录很少，就如实写少，不要凑字数。',
  '5. 用中文。',
].join('\n');

const PARSE_SYSTEM = [
  '你是自然语言待办解析器。把用户输入拆成多条「待办」，只输出一个 JSON 对象，不要 Markdown 代码围栏。',
  'JSON 结构：',
  '{"memos":[{"text":"待办正文","tags":["重要"],"dueDate":"YYYY-MM-DD 或 null","dueTime":"HH:mm 或 null"}]}',
  '规则：',
  '1. 相对日期（今天/明天/下周一/周五/3天后）以用户给出的当前时间为准。',
  '2. 所有事项都放进 memos；有明确日期或时间的，用 dueDate / dueTime 表示，不要单独生成 events。',
  '3. 日期用 YYYY-MM-DD，时间用 24 小时制 HH:mm；没有时间则 dueTime 为 null。',
  '4. 标签只从这些里选：重要、不重要、紧急、想法、会议、客户；没有就给空数组。',
  '5. 如果输入是一段会议纪要、聊天记录或长段落，按语义把它拆成尽可能多的独立事项，不要把多件事塞进同一条；一条输入最多拆成 12 条。',
  '6. 不要改写用户的原意；保留原文里的关键数字、人名和交付物。',
  '7. 用中文。',
].join('\n');

function buildSummaryPrompt(payload) {
  const weekStart = cleanDate(payload && payload.weekStart) || '未知';
  const weekEnd = cleanDate(payload && payload.weekEnd) || '未知';
  const now = cleanText(payload && payload.now, 40) || new Date().toISOString();
  const memos = capList(payload && payload.memos).slice(0, MAX_PROMPT_ITEMS);
  const events = capList(payload && payload.events).slice(0, MAX_PROMPT_ITEMS);

  const memoLines = memos.map((memo, index) => {
    const bits = [];
    bits.push(memo.done ? '[已完成]' : '[未完成]');
    bits.push(cleanText(memo.text, 180) || '（无正文）');
    const tags = cleanTags(memo.tags);
    if (tags.length) bits.push('标签:' + tags.join(','));
    if (memo.dueDate) bits.push('截止:' + memo.dueDate + (memo.dueTime ? ' ' + memo.dueTime : ''));
    if (memo.doneAt) bits.push('完成于:' + cleanText(memo.doneAt, 30));
    return `${index + 1}. ${bits.join(' | ')}`;
  });

  const eventLines = events.map((event, index) => {
    const bits = [`${event.date || '未定'}${event.time ? ' ' + event.time : ''}`, cleanText(event.title, 120) || '（无标题）'];
    const tags = cleanTags(event.tags);
    if (tags.length) bits.push('标签:' + tags.join(','));
    return `${index + 1}. ${bits.join(' | ')}`;
  });

  const body = [
    `本周区间：${weekStart} 至 ${weekEnd}`,
    `当前时间：${now}`,
    '',
    '【备忘】',
    memoLines.length ? memoLines.join('\n') : '（无）',
    '',
    '【日程】',
    eventLines.length ? eventLines.join('\n') : '（无）',
  ].join('\n');

  return body.slice(0, MAX_PROMPT_CHARS);
}

function buildParsePrompt(payload) {
  const text = cleanMultilineText(payload && payload.text, MAX_PARSE_CHARS);
  const now = cleanText(payload && payload.now, 40) || new Date().toISOString();
  return [
    `当前时间：${now}`,
    '输入：',
    '"""',
    text,
    '"""',
  ].join('\n');
}

/* ------------------------------------------------------------------ sanitize */

function extractJson(raw) {
  let text = String(raw || '').trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型没有返回 JSON');
  const slice = text.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch (err) {
    // Tolerate a trailing comma, the most common small-model JSON defect.
    try {
      return JSON.parse(slice.replace(/,\s*([}\]])/g, '$1'));
    } catch (err2) {
      throw new Error('模型返回的 JSON 无法解析');
    }
  }
}

function sanitizeSummary(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  return {
    headline: cleanText(value.headline, 80) || '本周工作小结',
    summary: cleanText(value.summary || value.overview, 600),
    done: cleanList(value.done),
    progress: cleanList(value.progress || value.doing),
    risks: cleanList(value.risks || value.blocked),
    next: cleanList(value.next || value.plan),
  };
}

function sanitizeParse(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const memos = [];
  const events = [];

  const memoSource = Array.isArray(value.memos) ? value.memos : [];
  for (const item of memoSource.slice(0, 12)) {
    if (!item || typeof item !== 'object') continue;
    const text = cleanText(item.text || item.title, 500);
    if (!text) continue;
    memos.push({
      text,
      tags: cleanTags(item.tags),
      dueDate: cleanDate(item.dueDate || item.date || item.dueAt),
      dueTime: cleanTime(item.dueTime || item.time),
    });
  }

  const eventSource = Array.isArray(value.events) ? value.events : [];
  for (const item of eventSource.slice(0, 12)) {
    if (!item || typeof item !== 'object') continue;
    const title = cleanText(item.title || item.text, 200);
    const date = cleanDate(item.date || item.dueDate || item.dueAt);
    if (!title) continue;
    memos.push({
      text: title,
      tags: cleanTags(item.tags),
      dueDate: date,
      dueTime: cleanTime(item.time || item.dueTime),
    });
  }

  // Tolerant fallback: some models answer a flat `items` list with a type field.
  if (!memos.length && Array.isArray(value.items)) {
    for (const item of value.items.slice(0, 12)) {
      if (!item || typeof item !== 'object') continue;
      const title = cleanText(item.title || item.text, 200);
      if (!title) continue;
      memos.push({
        text: title,
        tags: cleanTags(item.tags),
        dueDate: cleanDate(item.date || item.dueDate || item.dueAt),
        dueTime: cleanTime(item.time || item.dueTime),
      });
    }
  }

  return { memos: memos.slice(0, 12), events: [] };
}

function cleanText(value, limit) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    value = value.text || value.value || value.content || '';
  }
  return String(value).replace(/\s+/g, ' ').trim().slice(0, limit || 240);
}

/** Preserve line breaks for the parser: a bulleted list must stay a list. */
function cleanMultilineText(value, limit) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    value = value.text || value.value || value.content || '';
  }
  return String(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, limit || 6000);
}

function cleanList(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const entry of value) {
    const text = cleanText(entry, 120);
    if (text) out.push(text);
    if (out.length >= 6) break;
  }
  return out;
}

function cleanTags(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const entry of value) {
    const tag = cleanText(entry, 12).replace(/^#/, '');
    if (tag && out.indexOf(tag) < 0) out.push(tag);
    if (out.length >= 6) break;
  }
  return out;
}

function cleanDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(text + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return null;
  const [year, month, day] = text.split('-').map(Number);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return text;
}

function cleanTime(value) {
  const text = String(value || '').trim();
  if (!/^\d{1,2}:\d{2}$/.test(text)) return null;
  const [hour, minute] = text.split(':').map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function capList(value) {
  return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object') : [];
}

/* ---------------------------------------------------------------------- http */

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(new Error('body-too-large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function head(res, status) {
  writeHead(res, status);
  res.end();
}

function writeHead(res, status) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
}

function sendJson(res, status, value) {
  writeHead(res, status);
  res.end(JSON.stringify(value));
}

function fail(res, status, message, code) {
  try {
    writeHead(res, status);
    res.end(JSON.stringify({ ok: false, error: message, code: code || 'error' }));
  } catch (err) {
    try { res.destroy(); } catch (err2) { /* already closed */ }
  }
}
