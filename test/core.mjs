import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

let api = null;
let mod = null;
globalThis.window = {
  __ModuleLoader__: { load: (m) => { mod = m; } },
  __PM_WORKBENCH_HOOK__: (x) => { api = x; },
};
vm.runInThisContext(fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8'), { filename: 'client.js' });
assert.ok(mod && typeof mod.factory === 'function', 'module not registered');
mod.factory(() => ({ createElement: () => null }));
assert.ok(api, 'hook not called');

const {
  parseCapture, parseDue, groupMemos, weekRange, weekStats, dayEntries,
  localParseText, localSummary, migrateLegacy, normalizeMemo, sanitizeParseResult,
  isBulkDraft, buildMemoPrompt,
  ymd, addDays, startOfWeek,
} = api;

const now = new Date(2026, 10, 17, 9, 26, 0); // Tue 2026-11-17
const T = '2026-11-17';

// --- parseCapture: natural date + time + tag ------------------------------
const a = parseCapture('明天下午3点跟设计对齐会员改版 #重要', now);
assert.equal(a.dueDate, '2026-11-18');
assert.equal(a.dueTime, '15:00');
assert.deepEqual(a.tags, ['重要']);
assert.equal(a.title, '跟设计对齐会员改版');
assert.ok(!/明天|15:00|#重要/.test(a.title), 'title keeps no date/tag markers: ' + a.title);

const b = parseCapture('周五前补验收标准 #会员 #紧急', now);
assert.equal(b.dueDate, '2026-11-20', 'Friday of this week');
assert.deepEqual(b.tags, ['会员', '紧急']);
assert.equal(b.title, '补验收标准');

const c = parseCapture('下周一 10:00 周会', now);
assert.equal(c.dueDate, '2026-11-23');
assert.equal(c.dueTime, '10:00');
assert.equal(c.title, '周会');

const d = parseCapture('3 天后交方案', now);
assert.equal(d.dueDate, '2026-11-20');
assert.equal(d.title, '交方案');

const e = parseCapture('2026-12-01 发版', now);
assert.equal(e.dueDate, '2026-12-01');
assert.equal(e.title, '发版');

const f = parseCapture('10月30日 复盘', now);
assert.equal(f.dueDate, '2026-10-30', 'past month-day stays in the current year');

const g = parseCapture('10-30 交季度报告', new Date(2026, 9, 24, 10, 0, 0));
assert.equal(g.dueDate, '2026-10-30');
assert.equal(g.dueTime, null);

const h = parseCapture('整理一下竞对定价页', now);
assert.equal(h.dueDate, null);
assert.equal(h.title, '整理一下竞对定价页');
assert.deepEqual(h.tags, []);

const i = parseCapture('晚上8点半 跑步', now);
assert.equal(i.dueDate, T);
assert.equal(i.dueTime, '20:30');

assert.equal(parseDue('明天', now), '2026-11-18');
assert.equal(parseDue('瞎写的', now), null);

// --- bulk detection -------------------------------------------------------
assert.equal(isBulkDraft(''), false);
assert.equal(isBulkDraft('记一下竞品定价'), false);
assert.equal(isBulkDraft('第一件事\n第二件事'), true, 'multi-line is bulk');
assert.equal(isBulkDraft('这是一段很长的信息'.repeat(8)), true, 'long text is bulk');
assert.equal(isBulkDraft('短句'), false);

// --- one-click prompt ------------------------------------------------------
const prompt = buildMemoPrompt({
  id: 'm_test',
  text: '跟设计对齐会员改版',
  tags: ['重要'],
  dueDate: T,
  dueTime: '15:00',
  done: false,
}, now);
assert.ok(prompt.includes('跟设计对齐会员改版'));
assert.ok(prompt.includes('m_test'));
assert.ok(prompt.includes('pm_memo_update'));
assert.ok(prompt.includes('今天 15:00'));

// --- normalizeMemo: a time without a date is not a due time --------------
const nm = normalizeMemo({ text: 'x', dueTime: '15:00' });
assert.equal(nm.dueDate, null);
assert.equal(nm.dueTime, null);

// --- groupMemos -----------------------------------------------------------
const iso = (date, hour = 9) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour).toISOString();
const memos = [
  { id: '1', text: 'pinned', done: false, pinned: true, dueDate: null, createdAt: iso(now) },
  { id: '2', text: 'late', done: false, dueDate: '2026-11-10', createdAt: iso(now) },
  { id: '3', text: 'today', done: false, dueDate: T, createdAt: iso(now) },
  { id: '4', text: 'week', done: false, dueDate: '2026-11-20', createdAt: iso(now) },
  { id: '5', text: 'later', done: false, dueDate: '2026-12-01', createdAt: iso(now) },
  { id: '6', text: 'someday', done: false, dueDate: null, createdAt: iso(now) },
  { id: '7', text: 'done', done: true, doneAt: iso(now), dueDate: null, createdAt: iso(now) },
];
const groups = groupMemos(memos, now);
assert.equal(groups.pinned.length, 1);
assert.equal(groups.overdue.length, 1);
assert.equal(groups.today.length, 1);
assert.equal(groups.week.length, 1);
assert.equal(groups.later.length, 1);
assert.equal(groups.someday.length, 1);
assert.equal(groups.done.length, 1);

// --- week helpers ---------------------------------------------------------
assert.equal(ymd(startOfWeek(now)), '2026-11-16');
const range = weekRange(now);
assert.deepEqual([range.start, range.end], ['2026-11-16', '2026-11-22']);

const stats = weekStats([
  { id: 'a', done: true, doneAt: iso(new Date(2026, 10, 17)), createdAt: iso(new Date(2026, 10, 16)), tags: ['重要'], dueDate: T },
  { id: 'b', done: false, createdAt: iso(new Date(2026, 10, 18)), tags: [], dueDate: '2026-11-19' },
  { id: 'c', done: true, doneAt: iso(new Date(2026, 10, 1)), createdAt: iso(new Date(2026, 9, 20)), tags: [], dueDate: null },
], [], now);
assert.equal(stats.done.length, 1, 'only this week');
assert.equal(stats.created.length, 2);
assert.equal(stats.open.length, 1);
assert.equal(stats.important.length, 0, 'a completed important memo does not count this week');
assert.equal(stats.rate, 50);

const statsImportant = weekStats([
  { id: 'd', done: false, tags: ['重要'], dueDate: '2026-11-19', createdAt: iso(new Date(2026, 10, 18)) },
], [], now);
assert.equal(statsImportant.important.length, 1);

// --- dayEntries merges memos and events ----------------------------------
const day = dayEntries(
  [{ id: 'm1', text: 'memo due', dueDate: T, dueTime: '15:00', done: false, tags: ['重要'] }],
  [
    { id: 'e1', title: 'event all day', date: T, time: null, tags: [], note: '' },
    { id: 'e2', title: 'event morning', date: T, time: '09:00', tags: [], note: '' },
  ],
  T,
);
assert.equal(day.length, 3);
assert.equal(day[0].title, 'event morning');
assert.equal(day[1].title, 'memo due');
assert.equal(day[2].title, 'event all day');

// --- local parser / local summary ---------------------------------------
const parsed = localParseText('明天下午3点和设计评审\n整理竞品定价页', now);
assert.equal(parsed.events.length, 0, 'scheduled items become dated memos');
assert.equal(parsed.memos.length, 2);
const reviewMemo = parsed.memos.find((memo) => memo.text === '和设计评审');
assert.ok(reviewMemo);
assert.equal(reviewMemo.dueDate, '2026-11-18');
assert.equal(reviewMemo.dueTime, '15:00');

const many = localParseText(Array.from({ length: 14 }, (_, index) => `事项 ${index + 1}`).join('\n'), now);
assert.equal(many.memos.length, 12, 'local split is capped at 12 items');

const summary = localSummary(memos, [], now, now);
assert.equal(summary.engine, 'local');
assert.ok(summary.headline.includes('本周') || summary.headline.includes('完成'));
assert.ok(Array.isArray(summary.risks));
assert.ok(summary.risks.length >= 1, 'overdue memo becomes a risk');

// --- migration ------------------------------------------------------------
const migrated = migrateLegacy({
  todos: [
    { id: '1', title: 'old high', status: 'open', tag: '会员', priority: 'high', due: '2026-11-20', createdAt: iso(now) },
    { id: '2', title: 'old done', status: 'done', doneAt: iso(now), createdAt: iso(now) },
    { id: '3', title: 'dropped', status: 'dropped', createdAt: iso(now) },
  ],
  keywords: ['x'],
  intel: [{ title: 'gone' }],
});
assert.equal(migrated.memos.length, 2);
assert.ok(migrated.memos[0].tags.includes('重要'));
assert.equal(migrated.memos[1].done, true);
assert.deepEqual(migrated.events, []);
assert.ok(!('keywords' in migrated), 'legacy tracking fields are dropped');

// --- AI result sanitising -------------------------------------------------
const safe = sanitizeParseResult({
  memos: [
    { text: 'ok memo', tags: ['重要'], dueDate: '2026-11-20', dueTime: '9:30' },
    { text: '', tags: [] },
  ],
  events: [
    { title: 'ok event', date: '2026-11-21', time: '10:00', tags: ['会议'] },
    { title: 'no date', date: null },
  ],
}, 'ai');
assert.equal(safe.memos.length, 3, 'events are folded into memos, dated or not');
assert.equal(safe.memos[0].dueTime, '09:30');
assert.ok(safe.memos.some((memo) => memo.text === 'ok event' && memo.dueDate === '2026-11-21'));
assert.ok(safe.memos.some((memo) => memo.text === 'no date'));
assert.equal(safe.events.length, 0);
assert.equal(safe.engine, 'ai');

// --- due labels -----------------------------------------------------------
assert.equal(api.dueSummary({ dueDate: T, dueTime: '15:00' }, now), '今天 15:00');
assert.equal(api.dueSummary({ dueDate: '2026-11-10' }, now), '逾期 7 天');

console.log('core tests: ok');
