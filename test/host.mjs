import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = mkdtempSync(join(tmpdir(), 'pm-workbench-host-'));
process.env.DSH_HOME = home;

const { apply, inject } = await import('../index.js');
assert.deepEqual(inject, ['webServer', 'connection']);
const { advanceDailyMemos, normalizeMemo } = await import('../store.js');
const { mailToMemoDraft } = await import('../inbox.js');
const { getInboxStatus, saveInboxConfig } = await import('../inbox.js');

const handlers = {};
const streamCalls = [];
let gateStatus;
let pageHtml = '<html><head><title>产品更新</title></head><body><nav><a href="/about">关于我们</a><a href="/login">登录</a></nav><main><a href="/articles/1">第一篇文章标题</a><a href="/articles/2">第二篇文章标题</a></main></body></html>';
let wechatArticles = [{
  url: 'https://mp.weixin.qq.com/s?__biz=abc&mid=1',
  title: '公众号旧文章',
  snippet: '旧文摘要。',
  publishedAt: '2026-11-18T08:00:00.000Z',
}];

const ctx = {
  effect: (fn) => fn(),
  get(name) {
    if (name === 'webServer') {
      return { register(route) { handlers[route.path] = route.handler; return () => {}; } };
    }
    if (name === 'connection') {
      return { requestRejection: () => gateStatus };
    }
    if (name === 'web') {
      return {
        async search(request) {
          if (request && String(request.query).includes('site:mp.weixin.qq.com')) {
            return { sources: wechatArticles, truncated: false };
          }
          return {
            sources: [{
              url: 'https://example.com/ai-pm-old',
              title: 'AI 产品经理的旧消息',
              snippet: '旧消息。',
              publishedAt: '2026-11-18T08:00:00.000Z',
            }, {
              url: 'https://example.com/ai-pm',
              title: 'AI 产品经理的职责',
              snippet: 'AI 产品经理需要懂模型能力边界。',
              publishedAt: '2026-11-19T08:00:00.000Z',
            }],
            truncated: false,
          };
        },
        async fetch() {
          return {
            url: 'https://example.com/product',
            statusCode: 200,
            body: { kind: 'html', content: pageHtml },
            truncated: false,
          };
        },
      };
    }
    if (name === 'agentDefaultModel') {
      return { currentSelection: () => ({ provider: 'fake-provider', model: 'fake-model' }) };
    }
    if (name === 'llm') {
      return {
        async resolveModelInfo() {
          return { reasoning: { efforts: [{ id: 'high' }, { id: 'low' }] } };
        },
        async *stream(options) {
          streamCalls.push(options);
          const user = options.messages[0].content[0].text;
          const isSummary = user.indexOf('【备忘】') >= 0;
          if (isSummary) {
            yield { type: 'text-delta', text: '```json\n' };
            yield { type: 'text-delta', text: JSON.stringify({
              headline: '会员改版收尾',
              summary: '本周完成评审，推进验收标准。',
              done: ['完成会员改版评审'],
              progress: ['补齐验收标准'],
              risks: ['接口联调延期'],
              next: ['上线灰度'],
            }) };
            yield { type: 'text-delta', text: '\n```' };
          } else {
            yield { type: 'text-delta', text: JSON.stringify({
              memos: [{ text: '整理竞品定价页', tags: ['想法'], dueDate: null, dueTime: null }],
              events: [{ title: '设计评审', date: '2026-11-18', time: '15:00', tags: ['会议'], note: '' }],
            }) };
          }
          yield { type: 'finish', reason: { kind: 'stop' } };
        },
      };
    }
    return undefined;
  },
};

apply(ctx);
assert.equal(typeof handlers['/pm-workbench/ai'], 'function', 'AI route registered');
assert.equal(typeof handlers['/pm-workbench/data'], 'function', 'data route registered');
assert.equal(typeof handlers['/pm-workbench/inbox'], 'function', 'inbox route registered');
assert.equal(typeof handlers['/pm-workbench/feeds'], 'function', 'feeds route registered');
assert.equal(typeof handlers['/pm-workbench/knowledge'], 'function', 'knowledge route registered');

function request(method, payload) {
  const req = new EventEmitter();
  req.method = method;
  setImmediate(() => {
    if (payload !== undefined) req.emit('data', Buffer.from(JSON.stringify(payload)));
    req.emit('end');
  });
  return req;
}

function response() {
  const res = {
    statusCode: 0,
    headers: null,
    body: '',
    writeHead(status, headers) { this.statusCode = status; this.headers = headers; },
    end(chunk) { if (chunk) this.body += String(chunk); if (this.resolve) this.resolve(); },
  };
  res.done = new Promise((resolve) => { res.resolve = resolve; });
  return res;
}

async function call(path, method, payload) {
  const res = response();
  handlers[path](request(method, payload), res);
  await res.done;
  return { status: res.statusCode, json: JSON.parse(res.body || '{}') };
}

const health = await call('/pm-workbench/ai', 'GET');
assert.equal(health.status, 200);
assert.equal(health.json.ok, true);
assert.equal(health.json.route.provider, 'fake-provider');

const inboxStatusRoute = await call('/pm-workbench/inbox', 'GET');
assert.equal(inboxStatusRoute.status, 200);
assert.equal(inboxStatusRoute.json.configured, false);
const inboxSyncRoute = await call('/pm-workbench/inbox', 'POST', { action: 'sync' });
assert.equal(inboxSyncRoute.status, 400);
assert.match(inboxSyncRoute.json.error, /还没有配置/);

const feedsEmpty = await call('/pm-workbench/feeds', 'GET');
assert.equal(feedsEmpty.status, 200);
assert.deepEqual(feedsEmpty.json.subscriptions, []);
const feedAdded = await call('/pm-workbench/feeds', 'POST', { action: 'add', value: 'AI 产品经理' });
assert.equal(feedAdded.status, 200);
assert.equal(feedAdded.json.subscriptions.length, 1);
assert.equal(feedAdded.json.subscriptions[0].value, 'AI 产品经理');
const feedId = feedAdded.json.subscriptions[0].id;
const feedRun = await call('/pm-workbench/feeds', 'POST', { action: 'run', id: feedId });
assert.equal(feedRun.status, 200);
assert.equal(feedRun.json.items.length, 2);
assert.equal(feedRun.json.items[0].title, 'AI 产品经理的职责');
assert.equal(feedRun.json.items[1].title, 'AI 产品经理的旧消息');

const urlAdded = await call('/pm-workbench/feeds', 'POST', {
  action: 'add',
  type: 'url',
  value: 'https://example.com/product',
});
assert.equal(urlAdded.status, 200);
const urlId = urlAdded.json.subscriptions.find((feed) => feed.type === 'url').id;
const urlBaseline = await call('/pm-workbench/feeds', 'POST', { action: 'run', id: urlId });
assert.equal(urlBaseline.status, 200);
assert.equal(urlBaseline.json.items.length, 2, 'first fetch only establishes a baseline');
const urlFeed = urlBaseline.json.subscriptions.find((feed) => feed.id === urlId);
assert.equal(urlFeed.lastLinks.length, 2);
pageHtml = '<html><head><title>产品更新</title></head><body><nav><a href="/about">关于我们</a><a href="/login">登录</a></nav><main><a href="/articles/1">第一篇文章标题</a><a href="/articles/2">第二篇文章标题</a><a href="/articles/3">第三篇文章标题</a></main></body></html>';
const urlChanged = await call('/pm-workbench/feeds', 'POST', { action: 'run', id: urlId });
assert.equal(urlChanged.status, 200);
assert.equal(urlChanged.json.items.length, 3);
assert.equal(urlChanged.json.items[0].source, 'web-page');
assert.equal(urlChanged.json.items[0].title, '第三篇文章标题');
assert.equal(urlChanged.json.items[0].url, 'https://example.com/articles/3');
const navOnly = await call('/pm-workbench/feeds', 'POST', { action: 'run', id: urlId });
assert.equal(navOnly.status, 200);
assert.equal(navOnly.json.items.length, 3, 'navigation changes do not create messages');

const wechatAdded = await call('/pm-workbench/feeds', 'POST', {
  action: 'add',
  type: 'wechat',
  value: '机器之心',
});
assert.equal(wechatAdded.status, 200);
const wechatId = wechatAdded.json.subscriptions.find((feed) => feed.type === 'wechat').id;
const wechatBaseline = await call('/pm-workbench/feeds', 'POST', { action: 'run', id: wechatId });
assert.equal(wechatBaseline.status, 200);
assert.equal(wechatBaseline.json.items.length, 3, 'first WeChat search is a baseline');
wechatArticles = [{
  url: 'https://mp.weixin.qq.com/s?__biz=abc&mid=2',
  title: '公众号新文章',
  snippet: '新文摘要。',
  publishedAt: '2026-11-20T08:00:00.000Z',
}, ...wechatArticles];
const wechatChanged = await call('/pm-workbench/feeds', 'POST', { action: 'run', id: wechatId });
assert.equal(wechatChanged.status, 200);
assert.equal(wechatChanged.json.items.length, 4);
const wechatItem = wechatChanged.json.items.find((item) => item.source === 'wechat-search');
assert.equal(wechatItem.title, '公众号新文章');

const knowledgeDir = join(home, 'knowledge-folder');
mkdirSync(knowledgeDir, { recursive: true });
writeFileSync(join(knowledgeDir, 'brief.md'), '# 项目材料\n', 'utf8');
writeFileSync(join(knowledgeDir, 'report.txt'), 'report', 'utf8');
const knowledgeDefault = await call('/pm-workbench/knowledge', 'GET');
assert.equal(knowledgeDefault.status, 200);
assert.equal(knowledgeDefault.json.folders.length, 1);
assert.equal(knowledgeDefault.json.folders[0].name, '默认手册');
const knowledgeAdded = await call('/pm-workbench/knowledge', 'POST', { action: 'add', path: knowledgeDir });
assert.equal(knowledgeAdded.status, 200);
assert.equal(knowledgeAdded.json.folder.fileCount, 2);
const knowledgeId = knowledgeAdded.json.folder.id;
const knowledgeLinked = await call('/pm-workbench/knowledge', 'POST', { action: 'link', id: knowledgeId, projectId: 'p-test' });
assert.equal(knowledgeLinked.status, 200);
assert.deepEqual(knowledgeLinked.json.folders[0].projectIds, ['p-test']);
const knowledgeUnlinked = await call('/pm-workbench/knowledge', 'POST', { action: 'unlink', id: knowledgeId, projectId: 'p-test' });
assert.equal(knowledgeUnlinked.status, 200);
assert.deepEqual(knowledgeUnlinked.json.folders[0].projectIds, []);

const summary = await call('/pm-workbench/ai', 'POST', {
  task: 'summary',
  weekStart: '2026-11-16',
  weekEnd: '2026-11-22',
  now: '2026-11-17T01:00:00.000Z',
  memos: [{ text: '会员改版评审', done: true, tags: ['重要'], dueDate: null, dueTime: null }],
  events: [],
});
assert.equal(summary.status, 200);
assert.equal(summary.json.ok, true);
assert.equal(summary.json.task, 'summary');
assert.equal(summary.json.result.headline, '会员改版收尾');
assert.deepEqual(summary.json.result.done, ['完成会员改版评审']);
assert.equal(streamCalls[0].reasoningEffort, 'low', 'lowest reasoning effort requested');

const parsed = await call('/pm-workbench/ai', 'POST', { task: 'parse', text: '明天下午3点设计评审', now: '2026-11-17T01:00:00.000Z' });
assert.equal(parsed.json.ok, true);
assert.equal(parsed.json.result.events.length, 0, 'events are folded into memos');
assert.equal(parsed.json.result.memos.length, 2);
const review = parsed.json.result.memos.find((memo) => memo.text === '设计评审');
assert.ok(review, 'event title became a memo');
assert.equal(review.dueDate, '2026-11-18');
assert.equal(review.dueTime, '15:00');

const bad = await call('/pm-workbench/ai', 'POST', { task: 'nope' });
assert.equal(bad.status, 400);
assert.equal(bad.json.ok, false);

/* ------------------------------------------------------------ data route */
const empty = await call('/pm-workbench/data', 'GET');
assert.equal(empty.status, 200);
assert.equal(empty.json.rev, 0);
assert.deepEqual(empty.json.store.memos, []);
assert.deepEqual(empty.json.store.tagOptions, ['重要', '不重要', '紧急', '想法', '会议', '客户', '项目']);

const store = {
  v: 2,
  memos: [{
    id: 'm_test',
    text: '明天下午三点跟设计对齐',
    note: '带上会员改版验收标准',
    tags: ['重要'],
    done: false,
    dueDate: '2026-11-18',
    dueTime: '15:00',
    createdAt: '2026-11-17T01:00:00.000Z',
  }],
  events: [],
  projects: [{
    id: 'p_test',
    name: '全球搜方案',
    owner: '我',
    role: '产品',
    tasks: [{
      id: 't_test',
      title: '竞品调研',
      owner: '我',
      role: '产品',
      dueDate: '2026-11-20',
      progress: 30,
      dependsOn: [],
    }],
  }],
  reports: {},
  tagOptions: ['重要', '自检'],
  ui: { tab: 'memos', filter: 'all' },
};
const written = await call('/pm-workbench/data', 'POST', { store, baseRev: 0 });
assert.equal(written.status, 200);
assert.equal(written.json.ok, true);
assert.equal(written.json.rev, 1);

const loaded = await call('/pm-workbench/data', 'GET');
assert.equal(loaded.json.rev, 1);
assert.equal(loaded.json.store.memos.length, 1);
assert.equal(loaded.json.store.memos[0].id, 'm_test');
assert.equal(loaded.json.store.memos[0].dueTime, '15:00');
assert.equal(loaded.json.store.memos[0].note, '带上会员改版验收标准');
assert.deepEqual(loaded.json.store.tagOptions, ['重要', '自检']);
assert.equal(loaded.json.store.projects.length, 1);
assert.equal(loaded.json.store.projects[0].id, 'p_test');
assert.equal(loaded.json.store.projects[0].tasks[0].progress, 30);

const mailDraft = mailToMemoDraft({
  subject: '周会材料',
  from: '小王 <wang@example.com>',
  date: '2026-11-17T06:00:00.000Z',
  text: '请把本周的验收标准发我。',
});
assert.equal(mailDraft.text, '周会材料');
assert.ok(mailDraft.note.includes('小王'));
assert.ok(mailDraft.note.includes('验收标准'));
assert.deepEqual(mailDraft.tags, ['邮件']);
const mailMemo = normalizeMemo({
  text: '回复周会材料',
  origin: {
    kind: 'email',
    channel: 'qq-mail',
    label: 'QQ 邮箱',
    from: '小王 <wang@example.com>',
    subject: '周会材料',
    date: '2026-11-17T06:00:00.000Z',
    messageId: '42',
  },
});
assert.equal(mailMemo.origin.kind, 'email');
assert.equal(mailMemo.origin.from, '小王 <wang@example.com>');
const inboxStatus = await getInboxStatus(ctx);
assert.equal(inboxStatus.configured, false);
await assert.rejects(() => saveInboxConfig(ctx, { email: 'bad', authCode: '123456' }), /邮箱地址/);

const conflict = await call('/pm-workbench/data', 'POST', { store, baseRev: 0 });
assert.equal(conflict.status, 409);
assert.equal(conflict.json.code, 'conflict');
assert.equal(conflict.json.rev, 1);
assert.equal(conflict.json.store.memos.length, 1);

const dailyNow = new Date(2026, 10, 17, 9, 0, 0);
const dailyOpen = normalizeMemo({
  id: 'd_open',
  text: '每日站会',
  dueDate: '2026-11-16',
  repeat: 'daily',
  seriesId: 's_open',
});
const dailyRoll = advanceDailyMemos([dailyOpen], dailyNow);
assert.equal(dailyRoll.changed, true);
assert.equal(dailyRoll.memos[0].id, 'd_open');
assert.equal(dailyRoll.memos[0].dueDate, '2026-11-17');

const dailyDone = normalizeMemo({
  id: 'd_done',
  text: '每日复盘',
  dueDate: '2026-11-16',
  repeat: 'daily',
  seriesId: 's_done',
  done: true,
  doneAt: '2026-11-16T10:00:00.000Z',
});
const dailyNext = advanceDailyMemos([dailyDone], dailyNow);
assert.equal(dailyNext.memos.length, 2);
assert.equal(dailyNext.memos[0].id !== 'd_done', true);
assert.equal(dailyNext.memos[0].dueDate, '2026-11-17');
assert.equal(dailyNext.memos.find((memo) => memo.id === 'd_done').repeat, null);

gateStatus = 403;
const refused = await call('/pm-workbench/ai', 'GET');
assert.equal(refused.status, 403);
assert.equal(refused.json.code, 'untrusted-origin');
gateStatus = undefined;

console.log('host tests: ok');
rmSync(home, { recursive: true, force: true });
