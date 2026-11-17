/**
 * Host-side persistence for the PM workbench.
 *
 * The browser keeps a localStorage cache, but the Host file is the shared
 * source of truth so agent tools (including the WeChat bridge) can read and
 * change the same memos the sidebar shows.
 *
 * File: $DSH_HOME/storages/pm-workbench/workbench.json
 * Shape: { version: 1, rev: number, updatedAt: ISO, store: { v:2, memos, events, reports, ui } }
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const HOME = process.env.DSH_HOME || join(homedir(), '.dsh');
const DATA_FILE = join(HOME, 'storages', 'pm-workbench', 'workbench.json');
const DEFAULT_TAGS = ['重要', '不重要', '紧急', '想法', '会议', '客户', '项目'];

let cache = null;

export function emptyStore() {
  return { v: 2, memos: [], events: [], reports: {}, projects: [], tagOptions: DEFAULT_TAGS.slice(), ui: { tab: 'memos', filter: 'all' } };
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function text(value, limit) {
  return String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim().slice(0, limit || 2000);
}

function multiline(value, limit) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, limit || 4000);
}

export function isDateText(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function isTimeText(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return false;
  return Number(match[1]) < 24 && Number(match[2]) < 60;
}

export function normalizeMemo(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const body = multiline(raw.text, 4000);
  if (!body) return null;
  const done = raw.done === true;
  const dueDate = isDateText(raw.dueDate) ? String(raw.dueDate) : null;
  const dueTime = dueDate && isTimeText(raw.dueTime) ? String(raw.dueTime).padStart(5, '0') : null;
  const repeat = raw.repeat === 'daily' ? 'daily' : null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : makeId('m'),
    text: body,
    note: multiline(raw.note, 4000),
    tags: uniqueTags(raw.tags),
    repeat,
    seriesId: repeat ? (typeof raw.seriesId === 'string' && raw.seriesId ? raw.seriesId : makeId('r')) : null,
    projectId: typeof raw.projectId === 'string' && raw.projectId ? raw.projectId : null,
    done,
    doneAt: done ? (typeof raw.doneAt === 'string' ? raw.doneAt : nowIso()) : null,
    dueDate,
    dueTime,
    createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : nowIso(),
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : nowIso(),
    pinned: raw.pinned === true,
    ai: raw.ai === true,
  };
}

export function normalizeEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = text(raw.title, 300);
  if (!title || !isDateText(raw.date)) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : makeId('e'),
    title,
    date: String(raw.date),
    time: isTimeText(raw.time) ? String(raw.time).padStart(5, '0') : null,
    tags: uniqueTags(raw.tags),
    note: text(raw.note, 600),
    done: raw.done === true,
    source: raw.source === 'ai' ? 'ai' : 'manual',
    memoId: typeof raw.memoId === 'string' ? raw.memoId : null,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : nowIso(),
  };
}

export function uniqueTags(value) {
  const out = [];
  for (const entry of Array.isArray(value) ? value : []) {
    const tag = text(entry, 12).replace(/^#/, '');
    if (tag && out.indexOf(tag) < 0) out.push(tag);
    if (out.length >= 8) break;
  }
  return out;
}

export function normalizeTagList(value, fallback) {
  if (!Array.isArray(value)) return fallback ? DEFAULT_TAGS.slice() : [];
  const out = [];
  for (const entry of value) {
    const tag = text(entry, 12).replace(/^#/, '');
    if (tag && out.indexOf(tag) < 0) out.push(tag);
    if (out.length >= 40) break;
  }
  return out;
}

export function normalizeProjectTask(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = text(raw.title, 200);
  if (!title) return null;
  const progress = Math.max(0, Math.min(100, Math.round(Number(raw.progress) || 0)));
  const dependsOn = [];
  for (const entry of Array.isArray(raw.dependsOn) ? raw.dependsOn : []) {
    const id = text(entry, 60);
    if (id && dependsOn.indexOf(id) < 0) dependsOn.push(id);
    if (dependsOn.length >= 20) break;
  }
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : makeId('t'),
    title,
    owner: text(raw.owner, 60) || '我',
    role: text(raw.role, 60),
    startDate: isDateText(raw.startDate) ? String(raw.startDate) : null,
    dueDate: isDateText(raw.dueDate) ? String(raw.dueDate) : null,
    progress,
    dependsOn,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : nowIso(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : nowIso(),
  };
}

export function normalizeProject(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = text(raw.name, 120);
  if (!name) return null;
  const tasks = (Array.isArray(raw.tasks) ? raw.tasks : []).map(normalizeProjectTask).filter(Boolean);
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : makeId('p'),
    name,
    description: multiline(raw.description, 2000),
    owner: text(raw.owner, 60) || '我',
    role: text(raw.role, 60),
    startDate: isDateText(raw.startDate) ? String(raw.startDate) : null,
    dueDate: isDateText(raw.dueDate) ? String(raw.dueDate) : null,
    status: raw.status === 'done' ? 'done' : 'active',
    tasks,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : nowIso(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : nowIso(),
  };
}

export function normalizeStore(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const reports = {};
  if (source.reports && typeof source.reports === 'object' && !Array.isArray(source.reports)) {
    for (const [key, value] of Object.entries(source.reports)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) reports[key] = value;
    }
  }
  const ui = source.ui && typeof source.ui === 'object'
    ? {
      tab: ['memos', 'calendar', 'weekly', 'projects', 'inbox'].includes(source.ui.tab) ? source.ui.tab : 'memos',
      filter: ['all', 'open', 'important', 'today'].includes(source.ui.filter) ? source.ui.filter : 'all',
    }
    : { tab: 'memos', filter: 'all' };
  const memos = (Array.isArray(source.memos) ? source.memos : []).map(normalizeMemo).filter(Boolean);
  const events = (Array.isArray(source.events) ? source.events : []).map(normalizeEvent).filter(Boolean);
  const projects = (Array.isArray(source.projects) ? source.projects : []).map(normalizeProject).filter(Boolean);
  if (events.length) {
    const keys = new Set(memos.map((memo) => `${memo.text}|${memo.dueDate || ''}|${memo.dueTime || ''}`));
    for (const event of events) {
      const memo = normalizeMemo({
        text: event.title,
        tags: event.tags,
        done: event.done,
        dueDate: event.date,
        dueTime: event.time,
        createdAt: event.createdAt,
        updatedAt: event.createdAt,
        ai: event.source === 'ai',
      });
      if (!memo) continue;
      const key = `${memo.text}|${memo.dueDate || ''}|${memo.dueTime || ''}`;
      if (keys.has(key)) continue;
      keys.add(key);
      memos.push(memo);
    }
  }
  return {
    v: 2,
    memos,
    events: [],
    projects,
    reports,
    tagOptions: normalizeTagList(source.tagOptions, true),
    ui,
  };
}

function ymdLocal(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function advanceDailyMemos(memos, nowInput) {
  const now = nowInput instanceof Date ? nowInput : new Date();
  const today = ymdLocal(now);
  const series = new Map();
  for (const memo of memos) {
    if (memo.repeat !== 'daily') continue;
    const key = memo.seriesId || memo.id;
    if (!series.has(key)) series.set(key, []);
    series.get(key).push(memo);
  }
  if (!series.size) return { memos, changed: false };

  const updates = new Map();
  const additions = [];
  const timestamp = nowIso();

  for (const [key, list] of series) {
    list.sort((a, b) => String(b.dueDate || '').localeCompare(String(a.dueDate || '')));
    const latest = list[0];
    if (!latest || !latest.dueDate) continue;
    if (latest.dueDate >= today) {
      for (const memo of list) {
        if (memo.id !== latest.id) {
          updates.set(memo.id, { repeat: null, seriesId: null, updatedAt: timestamp });
        }
      }
      continue;
    }
    const existing = list.find((memo) => memo.dueDate === today);
    if (latest.done) {
      if (!existing) {
        additions.push({
          ...latest,
          id: makeId('m'),
          done: false,
          doneAt: null,
          dueDate: today,
          createdAt: timestamp,
          updatedAt: timestamp,
          repeat: 'daily',
          seriesId: key,
        });
      }
      for (const memo of list) {
        if (!existing || memo.id !== existing.id) {
          updates.set(memo.id, { repeat: null, seriesId: null, updatedAt: timestamp });
        }
      }
    } else if (!existing) {
      updates.set(latest.id, { dueDate: today, updatedAt: timestamp });
    } else {
      for (const memo of list) {
        if (memo.id !== existing.id) {
          updates.set(memo.id, { repeat: null, seriesId: null, updatedAt: timestamp });
        }
      }
    }
  }

  if (!updates.size && !additions.length) return { memos, changed: false };
  const next = memos.map((memo) => (updates.has(memo.id) ? { ...memo, ...updates.get(memo.id) } : memo));
  return { memos: additions.concat(next), changed: true };
}

function persistState(state) {
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  const temp = `${DATA_FILE}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(state, null, 2), 'utf8');
  renameSync(temp, DATA_FILE);
  cache = state;
  return state;
}

function rollCache() {
  if (!cache) return cache;
  const next = advanceDailyMemos(cache.store.memos, new Date());
  if (!next.changed) return cache;
  return persistState({
    version: 1,
    rev: cache.rev + 1,
    updatedAt: nowIso(),
    store: { ...cache.store, memos: next.memos },
  });
}

export function loadState() {
  if (cache) return rollCache();
  try {
    const parsed = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
    const store = normalizeStore(parsed && parsed.store);
    cache = {
      version: 1,
      rev: Number.isSafeInteger(parsed && parsed.rev) && parsed.rev >= 0 ? parsed.rev : 0,
      updatedAt: typeof (parsed && parsed.updatedAt) === 'string' ? parsed.updatedAt : nowIso(),
      store,
    };
  } catch (err) {
    cache = { version: 1, rev: 0, updatedAt: null, store: emptyStore() };
  }
  return rollCache();
}

export function saveState(store, baseRev) {
  const current = loadState();
  if (baseRev !== undefined && baseRev !== null && Number(baseRev) !== current.rev) {
    return { conflict: true, state: current };
  }
  const next = {
    version: 1,
    rev: current.rev + 1,
    updatedAt: nowIso(),
    store: normalizeStore(store),
  };
  return { conflict: false, state: persistState(next) };
}

/** Apply one mutation to the durable store and return the new state. */
export function updateState(mutator) {
  const current = loadState();
  const draft = JSON.parse(JSON.stringify(current.store));
  const result = mutator(draft);
  const saved = saveState(draft, current.rev);
  return { state: saved.state, result };
}

export function dataFilePath() {
  return DATA_FILE;
}
