import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = mkdtempSync(join(tmpdir(), 'pm-workbench-tools-'));
process.env.DSH_HOME = home;

const { createTools } = await import('../tools.js');
const definitions = createTools();
const tools = new Map(definitions.map((definition) => [definition.name, definition]));
assert.equal(tools.size, 5);
for (const name of ['pm_memo_list', 'pm_memo_add', 'pm_memo_update', 'pm_memo_delete', 'pm_workbench_stats']) {
  assert.ok(tools.has(name), name);
}

const signal = new AbortController().signal;
const run = (name, args) => tools.get(name).execute(args, { signal });

const empty = await run('pm_memo_list', {});
assert.match(empty, /没有匹配的待办/);

const added = await run('pm_memo_add', {
  items: [
    { text: '明天下午三点跟设计对齐会员改版', tags: ['重要'], dueDate: '2026-11-18', dueTime: '15:00' },
    { text: '整理竞品定价页', tags: ['想法'] },
  ],
});
assert.match(added, /已新增 2 条待办/);
assert.match(added, /id=m_/);

const listed = await run('pm_memo_list', { status: 'open' });
assert.match(listed, /跟设计对齐会员改版/);
assert.match(listed, /标签=重要/);
assert.match(listed, /截止=2026-11-18 15:00/);

const updated = await run('pm_memo_update', { query: '设计对齐', done: true });
assert.match(updated, /已更新/);
assert.match(updated, /\[x\]/);

const open = await run('pm_memo_list', { status: 'open' });
assert.ok(!open.includes('跟设计对齐会员改版'), 'completed memo is not in the open list');
const done = await run('pm_memo_list', { status: 'done' });
assert.match(done, /跟设计对齐会员改版/);

const stats = await run('pm_workbench_stats', {});
assert.match(stats, /工作台统计/);
assert.match(stats, /未完成 1 条/);
assert.match(stats, /本周完成 1 条/);

const blocked = await run('pm_memo_delete', { query: '竞品定价' }).catch((err) => err);
assert.ok(blocked instanceof Error, 'delete without confirm fails');

const removed = await run('pm_memo_delete', { query: '竞品定价', confirm: true });
assert.match(removed, /已删除/);
const after = await run('pm_memo_list', { status: 'all' });
assert.ok(!after.includes('整理竞品定价页'));

console.log('tools tests: ok');
rmSync(home, { recursive: true, force: true });
