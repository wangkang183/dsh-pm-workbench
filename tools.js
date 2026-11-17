/**
 * Host tools for the PM workbench.
 *
 * Plain DSH ToolDefinition objects: any agent (Web, Desktop, WeChat through
 * dsh-im, subagents) can read and change the same memos the sidebar shows.
 * `parameters` is raw JSON Schema, so this module needs no Harness import and
 * stays testable in plain Node.
 */
import {
  isDateText,
  isTimeText,
  loadState,
  normalizeMemo,
  uniqueTags,
  updateState,
} from './store.js';

const MAX_TEXT = 4000;

function ymd(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayText() {
  return ymd(new Date());
}

function startOfWeek(date) {
  const day = date.getDay();
  const shift = (day + 6) % 7;
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() - shift);
  return next;
}

function oneLine(value, limit) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit || 160);
}

function dueText(memo) {
  if (!memo.dueDate) return '';
  const today = todayText();
  const flags = [];
  if (memo.dueDate < today && !memo.done) flags.push('已逾期');
  else if (memo.dueDate === today) flags.push('今天');
  return `${memo.dueDate}${memo.dueTime ? ' ' + memo.dueTime : ''}${flags.length ? `（${flags.join('，')}）` : ''}`;
}

function memoLine(memo) {
  const bits = [`${memo.done ? '[x]' : '[ ]'} ${oneLine(memo.text)}`];
  bits.push(`id=${memo.id}`);
  if (memo.tags && memo.tags.length) bits.push(`标签=${memo.tags.join(',')}`);
  if (memo.note) bits.push(`备注=${oneLine(memo.note, 120)}`);
  const due = dueText(memo);
  if (due) bits.push(`截止=${due}`);
  if (memo.pinned) bits.push('置顶');
  return `- ${bits.join(' | ')}`;
}

function findMemo(state, args) {
  if (typeof args.id === 'string' && args.id.trim()) {
    const byId = state.memos.find((memo) => memo.id === args.id.trim());
    if (!byId) throw new Error(`没有找到 id=${args.id} 的待办；请先调用 pm_memo_list 查看 id。`);
    return byId;
  }
  const query = oneLine(args.query, 200);
  if (!query) throw new Error('请提供待办的 id，或一段能唯一匹配待办正文的 query。');
  const needle = query.toLowerCase();
  const matches = state.memos.filter((memo) => memo.text.toLowerCase().includes(needle));
  if (!matches.length) throw new Error(`没有找到包含「${query}」的待办。`);
  if (matches.length > 1) {
    const lines = matches.slice(0, 6).map((memo) => `- ${oneLine(memo.text, 80)} | id=${memo.id}`).join('\n');
    throw new Error(`「${query}」匹配到 ${matches.length} 条，请用 id 指定：\n${lines}`);
  }
  return matches[0];
}

function normalizeDue(args, memo) {
  if (args.clearDue === true) {
    memo.dueDate = null;
    memo.dueTime = null;
    return;
  }
  if (args.dueDate !== undefined) {
    if (args.dueDate === null || args.dueDate === '') {
      memo.dueDate = null;
      memo.dueTime = null;
    } else if (isDateText(args.dueDate)) {
      memo.dueDate = String(args.dueDate);
      if (!memo.dueTime) memo.dueTime = null;
    } else {
      throw new Error('dueDate 必须是 YYYY-MM-DD，或传 clearDue:true 清除。');
    }
  }
  if (args.dueTime !== undefined) {
    if (args.dueTime === null || args.dueTime === '') {
      memo.dueTime = null;
    } else if (isTimeText(args.dueTime)) {
      if (!memo.dueDate) throw new Error('设置 dueTime 前需要先有 dueDate。');
      memo.dueTime = String(args.dueTime).padStart(5, '0');
    } else {
      throw new Error('dueTime 必须是 HH:mm，或传空字符串清除。');
    }
  }
}

function listMemos(args) {
  const state = loadState().store;
  const status = args.status || 'open';
  const due = args.due || 'all';
  const tag = oneLine(args.tag, 20).replace(/^#/, '');
  const query = oneLine(args.query, 200).toLowerCase();
  const limit = Math.max(1, Math.min(100, Number.isSafeInteger(args.limit) ? args.limit : 50));
  const today = todayText();
  const weekEnd = ymd(new Date(startOfWeek(new Date()).getTime() + 6 * 86400000));

  let memos = state.memos.slice();
  if (status === 'open') memos = memos.filter((memo) => !memo.done);
  else if (status === 'done') memos = memos.filter((memo) => memo.done);
  if (tag) memos = memos.filter((memo) => memo.tags.includes(tag));
  if (query) memos = memos.filter((memo) => memo.text.toLowerCase().includes(query));
  if (due === 'today') memos = memos.filter((memo) => memo.dueDate === today);
  else if (due === 'overdue') memos = memos.filter((memo) => !memo.done && memo.dueDate && memo.dueDate < today);
  else if (due === 'week') memos = memos.filter((memo) => memo.dueDate && memo.dueDate >= today && memo.dueDate <= weekEnd);

  memos.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const at = a.dueDate ? `${a.dueDate}T${a.dueTime || '23:59'}` : '9999';
    const bt = b.dueDate ? `${b.dueDate}T${b.dueTime || '23:59'}` : '9999';
    if (at !== bt) return at < bt ? -1 : 1;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });

  const total = memos.length;
  const openCount = state.memos.filter((memo) => !memo.done).length;
  if (!total) return `没有匹配的待办（工作台共 ${state.memos.length} 条，未完成 ${openCount} 条）。`;
  const shown = memos.slice(0, limit);
  return [
    `工作台待办：匹配 ${total} 条，显示 ${shown.length} 条（全部 ${state.memos.length}，未完成 ${openCount}）。`,
    ...shown.map(memoLine),
  ].join('\n');
}

function addMemos(args) {
  const source = Array.isArray(args.items) && args.items.length
    ? args.items
    : [{
      text: args.text,
      note: args.note,
      tags: args.tags,
      dueDate: args.dueDate,
      dueTime: args.dueTime,
    }];
  const items = source.slice(0, 20);
  const prepared = [];
  for (const item of items) {
    const memo = normalizeMemo({
      text: item && item.text,
      note: item && item.note,
      tags: item && item.tags,
      dueDate: item && item.dueDate,
      dueTime: item && item.dueTime,
      ai: false,
    });
    if (!memo) continue;
    prepared.push(memo);
  }
  if (!prepared.length) throw new Error('没有可新增的内容：请提供 text 或 items[].text。');
  const saved = updateState((state) => {
    state.memos.unshift(...prepared);
    return prepared;
  });
  return [
    `已新增 ${prepared.length} 条待办：`,
    ...prepared.map(memoLine),
    `当前未完成 ${saved.state.store.memos.filter((memo) => !memo.done).length} 条。`,
  ].join('\n');
}

function updateMemo(args) {
  const saved = updateState((state) => {
    const memo = findMemo(state, args);
    if (args.text !== undefined) {
      const next = String(args.text).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
      if (!next) throw new Error('text 不能为空。');
      memo.text = next;
    }
    if (args.tags !== undefined) memo.tags = uniqueTags(args.tags);
    if (args.note !== undefined) memo.note = String(args.note).replace(/\r\n?/g, '\n').trim().slice(0, MAX_TEXT);
    if (args.done !== undefined) {
      memo.done = args.done === true;
      memo.doneAt = memo.done ? new Date().toISOString() : null;
    }
    if (args.pinned !== undefined) memo.pinned = args.pinned === true;
    normalizeDue(args, memo);
    memo.updatedAt = new Date().toISOString();
    return memo;
  });
  return `已更新：\n${memoLine(saved.result)}`;
}

function deleteMemo(args) {
  if (args.confirm !== true) throw new Error('删除待办必须显式传 confirm:true。');
  const saved = updateState((state) => {
    const memo = findMemo(state, args);
    const index = state.memos.findIndex((entry) => entry.id === memo.id);
    state.memos.splice(index, 1);
    return memo;
  });
  return `已删除：\n${memoLine(saved.result)}`;
}

function stats(args) {
  const offset = Number.isSafeInteger(args.weekOffset) ? args.weekOffset : 0;
  const now = new Date();
  const weekStart = new Date(startOfWeek(now).getTime() + offset * 7 * 86400000);
  const weekStartText = ymd(weekStart);
  const weekEndText = ymd(new Date(weekStart.getTime() + 6 * 86400000));
  const today = todayText();
  const state = loadState().store;
  const open = state.memos.filter((memo) => !memo.done);
  const doneWeek = state.memos.filter((memo) => memo.done && memo.doneAt && String(memo.doneAt).slice(0, 10) >= weekStartText && String(memo.doneAt).slice(0, 10) <= weekEndText);
  const dueWeek = open.filter((memo) => memo.dueDate && memo.dueDate >= weekStartText && memo.dueDate <= weekEndText);
  const overdue = open.filter((memo) => memo.dueDate && memo.dueDate < today);
  const todayDue = open.filter((memo) => memo.dueDate === today);
  const important = open.filter((memo) => memo.tags.includes('重要'));
  const tagCounts = {};
  for (const memo of open) {
    for (const tag of memo.tags) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  }
  const tags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);

  return [
    `工作台统计${offset ? `（第 ${offset > 0 ? '+' : ''}${offset} 周）` : '（本周）'}：${weekStartText} ~ ${weekEndText}`,
    `- 未完成 ${open.length} 条；今天到期 ${todayDue.length}；已逾期 ${overdue.length}；本周到期 ${dueWeek.length}`,
    `- 本周完成 ${doneWeek.length} 条；重要未完成 ${important.length} 条`,
    tags.length ? `- 标签：${tags.map(([tag, count]) => `${tag} ${count}`).join('，')}` : '- 标签：无',
    overdue.length ? `逾期：\n${overdue.slice(0, 8).map(memoLine).join('\n')}` : '',
  ].filter(Boolean).join('\n');
}

function tagSchema() {
  return {
    type: 'array',
    items: { type: 'string' },
    description: '标签，例如 重要 / 不重要 / 紧急 / 想法 / 会议 / 客户；可自定义。',
  };
}

function textOutput() {
  return {
    schema: { type: 'string' },
    render(_args, value) { return [{ type: 'text', text: value }]; },
  };
}

function parameters(properties, required) {
  return {
    type: 'object',
    properties,
    ...(required && required.length ? { required } : {}),
    additionalProperties: false,
  };
}

export function createTools() {
  return [
    {
      name: 'pm_memo_list',
      description: '列出 DSH 工作台（右侧栏「工作台 → 备忘」）里的待办。用户在微信/IM 问「我有哪些待办、今天要做什么、本周完成了什么」时先调用它。返回每条待办的 id、正文、备注、标签、截止日期和完成状态；修改前先拿到 id。',
      parameters: parameters({
        status: {
          type: 'string',
          enum: ['open', 'done', 'all'],
          description: 'open=未完成（默认），done=已完成，all=全部。',
        },
        due: {
          type: 'string',
          enum: ['all', 'today', 'overdue', 'week'],
          description: '按截止日期筛选：today 今天，overdue 已逾期，week 今天到本周日。',
        },
        tag: { type: 'string', description: '只看带这个标签的待办。' },
        query: { type: 'string', description: '正文关键词。' },
        limit: { type: 'integer', description: '最多返回多少条，默认 50，最大 100。' },
      }),
      output: textOutput(),
      execute: async (args, exec) => {
        exec.signal.throwIfAborted();
        return listMemos(args);
      },
    },
    {
      name: 'pm_memo_add',
      description: '把用户口述或粘贴的事项写入工作台待办。一句话里有多个事项时放进 items（最多 20 条）。相对日期要由你根据当前时间换算成 YYYY-MM-DD，时间用 HH:mm。',
      parameters: parameters({
        items: {
          type: 'array',
          description: '要新增的待办列表。',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              text: { type: 'string', description: '待办正文。' },
              note: { type: 'string', description: '可选备注，可多行。' },
              tags: tagSchema(),
              dueDate: { type: 'string', description: '截止日期 YYYY-MM-DD。' },
              dueTime: { type: 'string', description: '截止时间 HH:mm。' },
            },
            required: ['text'],
          },
        },
        text: { type: 'string', description: '只新增一条时的正文（可代替 items）。' },
        note: { type: 'string', description: '只新增一条时的备注（可代替 items）。' },
        tags: tagSchema(),
        dueDate: { type: 'string', description: '只新增一条时的截止日期。' },
        dueTime: { type: 'string', description: '只新增一条时的截止时间。' },
      }),
      output: textOutput(),
      execute: async (args, exec) => {
        exec.signal.throwIfAborted();
        return addMemos(args);
      },
    },
    {
      name: 'pm_memo_update',
      description: '修改工作台待办：完成/重开、改正文/备注、标签、截止日期、置顶。用 id 精确指定，或用 query 提供能唯一匹配正文的片段；匹配多条时会返回候选 id。',
      parameters: parameters({
        id: { type: 'string', description: '待办 id（从 pm_memo_list 获取）。' },
        query: { type: 'string', description: '没有 id 时，用一段唯一的正文片段匹配。' },
        text: { type: 'string', description: '新的正文。' },
        note: { type: 'string', description: '新的备注；空字符串清除。' },
        tags: tagSchema(),
        done: { type: 'boolean', description: 'true 标记完成，false 重开。' },
        pinned: { type: 'boolean', description: '是否置顶。' },
        dueDate: { type: 'string', description: '新的截止日期 YYYY-MM-DD；空字符串清除。' },
        dueTime: { type: 'string', description: '新的截止时间 HH:mm；空字符串清除。' },
        clearDue: { type: 'boolean', description: 'true 时清除截止日期和时间。' },
      }),
      output: textOutput(),
      execute: async (args, exec) => {
        exec.signal.throwIfAborted();
        return updateMemo(args);
      },
    },
    {
      name: 'pm_memo_delete',
      description: '删除一条工作台待办。必须显式传 confirm:true；优先用 id，或用 query 唯一匹配。删除前先向用户确认。',
      parameters: parameters({
        id: { type: 'string', description: '待办 id。' },
        query: { type: 'string', description: '没有 id 时用一段唯一的正文片段匹配。' },
        confirm: { type: 'boolean', description: '必须为 true 才执行删除。' },
      }, ['confirm']),
      output: textOutput(),
      execute: async (args, exec) => {
        exec.signal.throwIfAborted();
        return deleteMemo(args);
      },
    },
    {
      name: 'pm_workbench_stats',
      description: '查看工作台统计：未完成、今天到期、逾期、本周到期、本周完成、重要未完成和标签分布。适合回答「这周完成了多少 / 有什么风险 / 各种数据」。',
      parameters: parameters({
        weekOffset: { type: 'integer', description: '0=本周（默认），-1=上一周，1=下一周。' },
      }),
      output: textOutput(),
      execute: async (args, exec) => {
        exec.signal.throwIfAborted();
        return stats(args);
      },
    },
  ];
}
