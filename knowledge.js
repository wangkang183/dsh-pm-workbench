/**
 * Project knowledge folders: a Host-owned list of chosen directories plus
 * project associations. File contents stay where the user put them; this
 * module only keeps folder metadata and a bounded file inventory.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, relative } from 'node:path';

const HOME = process.env.DSH_HOME || join(homedir(), '.dsh');
const STORE_FILE = join(HOME, 'storages', 'pm-workbench', 'knowledge.json');
const MAX_FOLDERS = 30;
const MAX_FILES = 300;
const MAX_DEPTH = 4;
const SKIP = new Set(['node_modules', '.git', '.svn', '.hg', 'dist', 'build', '.next', 'target', '__pycache__', '.idea', '.vscode']);

function nowIso() {
  return new Date().toISOString();
}

function text(value, limit) {
  return String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim().slice(0, limit || 500);
}

function uid() {
  return `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function readStore() {
  try {
    const raw = JSON.parse(readFileSync(STORE_FILE, 'utf8'));
    return {
      version: 1,
      folders: Array.isArray(raw.folders) ? raw.folders : [],
    };
  } catch (err) {
    return { version: 1, folders: [] };
  }
}

function writeStore(store) {
  mkdirSync(dirname(STORE_FILE), { recursive: true });
  const temp = `${STORE_FILE}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify({ version: 1, ...store }, null, 2), 'utf8');
  renameSync(temp, STORE_FILE);
}

function normalizeFolder(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const path = text(raw.path, 2000);
  if (!path) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    name: text(raw.name, 160) || basename(path),
    path,
    projectIds: Array.isArray(raw.projectIds) ? raw.projectIds.filter((id) => typeof id === 'string').slice(0, 100) : [],
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : nowIso(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : nowIso(),
  };
}

function scanFolder(path) {
  const files = [];
  const dirs = [];
  function walk(current, depth) {
    if (files.length >= MAX_FILES || depth > MAX_DEPTH) return;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch (err) {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= MAX_FILES) break;
      if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
      const full = join(current, entry.name);
      let info;
      try { info = statSync(full); } catch (err) { continue; }
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        dirs.push(relative(path, full));
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        files.push({
          name: entry.name,
          path: full,
          relativePath: relative(path, full),
          ext: extname(entry.name).toLowerCase(),
          size: info.size,
          modifiedAt: info.mtime.toISOString(),
        });
      }
    }
  }
  walk(path, 0);
  return { files, dirs };
}

function withInventory(folder) {
  if (!existsSync(folder.path)) {
    return { ...folder, missing: true, files: [], dirs: [], fileCount: 0 };
  }
  const inventory = scanFolder(folder.path);
  return {
    ...folder,
    missing: false,
    files: inventory.files,
    dirs: inventory.dirs,
    fileCount: inventory.files.length,
    updatedAt: nowIso(),
  };
}

function sanitizeStore() {
  const raw = readStore();
  return {
    version: 1,
    folders: raw.folders.map(normalizeFolder).filter(Boolean).slice(0, MAX_FOLDERS),
  };
}

function defaultFolder() {
  const path = join(HOME, 'storages', 'pm-workbench', 'knowledge', '默认手册');
  mkdirSync(path, { recursive: true });
  return {
    id: 'k_default_manuals',
    name: '默认手册',
    path,
    projectIds: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export function getKnowledge() {
  const store = sanitizeStore();
  if (store.folders.length === 0) {
    const folder = defaultFolder();
    store.folders.push(folder);
    writeStore(store);
  }
  return {
    folders: store.folders.map(withInventory),
    maxFiles: MAX_FILES,
  };
}

export function addKnowledgeFolder(ctx, payload) {
  const rawPath = text(payload && payload.path, 2000);
  if (!rawPath) throw new Error('请选择一个文件夹。');
  let path;
  try {
    path = realpathSync(rawPath);
  } catch (err) {
    throw new Error('文件夹不存在或无法访问。');
  }
  let info;
  try { info = statSync(path); } catch (err) { throw new Error('无法读取文件夹。'); }
  if (!info.isDirectory()) throw new Error('选择的路径不是文件夹。');
  const store = sanitizeStore();
  if (store.folders.length >= MAX_FOLDERS) throw new Error(`最多 ${MAX_FOLDERS} 个知识库文件夹。`);
  const existing = store.folders.find((folder) => folder.path === path);
  if (existing) {
    existing.updatedAt = nowIso();
    writeStore(store);
    return { folder: withInventory(existing), ...getKnowledge() };
  }
  const folder = {
    id: uid(),
    name: text(payload && payload.name, 160) || basename(path),
    path,
    projectIds: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  store.folders.unshift(folder);
  writeStore(store);
  return { folder: withInventory(folder), ...getKnowledge() };
}

export function refreshKnowledge() {
  return getKnowledge();
}

export function removeKnowledgeFolder(ctx, payload) {
  const store = sanitizeStore();
  const id = text(payload && payload.id, 80);
  store.folders = store.folders.filter((folder) => folder.id !== id);
  writeStore(store);
  return getKnowledge();
}

export function linkKnowledgeFolder(ctx, payload) {
  const store = sanitizeStore();
  const id = text(payload && payload.id, 80);
  const projectId = text(payload && payload.projectId, 80);
  const folder = store.folders.find((entry) => entry.id === id);
  if (!folder) throw new Error('找不到这个知识库文件夹。');
  if (!projectId) throw new Error('缺少项目 id。');
  const linked = payload.action !== 'unlink';
  folder.projectIds = linked
    ? [...new Set([...folder.projectIds, projectId])].slice(0, 100)
    : folder.projectIds.filter((entry) => entry !== projectId);
  folder.updatedAt = nowIso();
  writeStore(store);
  return getKnowledge();
}
