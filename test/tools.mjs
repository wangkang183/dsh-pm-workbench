import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = mkdtempSync(join(tmpdir(), 'pm-workbench-tools-'));
process.env.DSH_HOME = home;

const { createTools } = await import('../tools.js');
const definitions = createTools();
const tools = new Map(definitions.map((definition) => [definition.name, definition]));
assert.equal(tools.size, 10);
for (const name of ['pm_memo_list', 'pm_memo_add', 'pm_memo_update', 'pm_memo_delete', 'pm_workbench_stats', 'pm_project_list', 'pm_project_create', 'pm_project_update', 'pm_project_task_add', 'pm_project_task_update']) {
  assert.ok(tools.has(name), name);
}

const signal = new AbortController().signal;
const run = (name, args) => tools.get(name).execute(args, { signal });

const empty = await run('pm_memo_list', {});
assert.match(empty, /没有匹配的待办/);

const added = await run('pm_memo_add', {
  items: [
    { text: '明天下午三点跟设计对齐会员改版', tags: ['重要'], dueDate: '2026-11-18', dueTime: '15:00', note: '带上会员改版验收标准' },
    { text: '整理竞品定价页', tags: ['想法'] },
  ],
});
assert.match(added, /已新增 2 条待办/);
assert.match(added, /id=m_/);
assert.match(added, /备注=带上会员改版验收标准/);

const listed = await run('pm_memo_list', { status: 'open' });
assert.match(listed, /跟设计对齐会员改版/);
assert.match(listed, /标签=重要/);
assert.match(listed, /截止=2026-11-18 15:00/);
assert.match(listed, /备注=带上会员改版验收标准/);

const updated = await run('pm_memo_update', { query: '设计对齐', note: '改成带合同附件', done: true });
assert.match(updated, /已更新/);
assert.match(updated, /\[x\]/);
assert.match(updated, /备注=改成带合同附件/);

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

const repeated = await run('pm_memo_update', { query: '竞品定价', repeat: 'daily' });
assert.match(repeated, /每天/);
assert.match(repeated, /截止=/);

const removed = await run('pm_memo_delete', { query: '竞品定价', confirm: true });
assert.match(removed, /已删除/);
const after = await run('pm_memo_list', { status: 'all' });
assert.ok(!after.includes('整理竞品定价页'));

const project = await run('pm_project_create', { name: '全球搜方案验证', owner: '我', role: '产品' });
assert.match(project, /已创建项目/);
assert.match(project, /负责人=我 · 产品/);
const projectId = project.match(/id=(p_[a-z0-9_]+)/)[1];

const task1 = await run('pm_project_task_add', {
  projectId, title: '竞品调研', owner: '我', role: '产品', dueDate: '2026-11-20', progress: 20,
});
assert.match(task1, /已新增任务/);
assert.match(task1, /进度=20%/);
const task1Id = task1.match(/\[(t_[a-z0-9_]+)\]/)[1];

const task2 = await run('pm_project_task_add', {
  projectId, title: '方案初稿', owner: '我', role: '产品', dueDate: '2026-11-22', dependsOn: [task1Id],
});
assert.match(task2, /依赖=t_/);

const task2Id = task2.match(/\[(t_[a-z0-9_]+)\]/)[1];
const progressed = await run('pm_project_task_update', { projectId, taskId: task2Id, progress: 60 });
assert.match(progressed, /已更新任务/);
assert.match(progressed, /进度=60%/);
assert.match(progressed, /项目进度=40%/);

const projectList = await run('pm_project_list', {});
assert.match(projectList, /全球搜方案验证/);
assert.match(projectList, /竞品调研/);
assert.match(projectList, /方案初稿/);
assert.match(projectList, /依赖=t_/);

console.log('tools tests: ok');
rmSync(home, { recursive: true, force: true });
