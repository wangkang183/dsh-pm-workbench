import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = mkdtempSync(join(tmpdir(), 'pm-workbench-host-'));
process.env.DSH_HOME = home;

const { apply, inject } = await import('../index.js');
assert.deepEqual(inject, ['webServer']);

const handlers = {};
const streamCalls = [];

const ctx = {
  effect: (fn) => fn(),
  get(name) {
    if (name === 'webServer') {
      return { register(route) { handlers[route.path] = route.handler; return () => {}; } };
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
assert.deepEqual(empty.json.store.tagOptions, ['重要', '不重要', '紧急', '想法', '会议', '客户']);

const store = {
  v: 2,
  memos: [{
    id: 'm_test',
    text: '明天下午三点跟设计对齐',
    tags: ['重要'],
    done: false,
    dueDate: '2026-11-18',
    dueTime: '15:00',
    createdAt: '2026-11-17T01:00:00.000Z',
  }],
  events: [],
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
assert.deepEqual(loaded.json.store.tagOptions, ['重要', '自检']);

const conflict = await call('/pm-workbench/data', 'POST', { store, baseRev: 0 });
assert.equal(conflict.status, 409);
assert.equal(conflict.json.code, 'conflict');
assert.equal(conflict.json.rev, 1);
assert.equal(conflict.json.store.memos.length, 1);

console.log('host tests: ok');
rmSync(home, { recursive: true, force: true });
