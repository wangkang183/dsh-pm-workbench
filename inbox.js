/**
 * Read-only QQ Mail inbox for the PM workbench.
 *
 * The authorization code lives in DSH's credential store; only the account
 * address and sync metadata are written to the workbench storage folder.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const HOME = process.env.DSH_HOME || join(homedir(), '.dsh');
const INBOX_FILE = join(HOME, 'storages', 'pm-workbench', 'inbox.json');
export const INBOX_CREDENTIAL = 'PM_WORKBENCH_QQ_AUTH';
const IMAP_HOST = 'imap.qq.com';
const IMAP_PORT = 993;
const CACHE_MS = 60_000;

let cached = null;
let mailLibs = null;

function nowIso() {
  return new Date().toISOString();
}

function readConfig() {
  try {
    const raw = JSON.parse(readFileSync(INBOX_FILE, 'utf8'));
    return raw && typeof raw === 'object' ? raw : null;
  } catch (err) {
    return null;
  }
}

function writeConfig(config) {
  mkdirSync(dirname(INBOX_FILE), { recursive: true });
  const temp = `${INBOX_FILE}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify({ version: 1, ...config }, null, 2), 'utf8');
  renameSync(temp, INBOX_FILE);
}

function getCredentials(ctx) {
  try {
    return typeof ctx.get === 'function' ? ctx.get('credentials') : undefined;
  } catch (err) {
    return undefined;
  }
}

function cleanText(value, limit) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, limit || 12000);
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"');
}

async function loadMailLibs() {
  if (mailLibs) return mailLibs;
  try {
    const [imap, parser] = await Promise.all([import('imapflow'), import('mailparser')]);
    mailLibs = { ImapFlow: imap.ImapFlow, simpleParser: parser.simpleParser };
    return mailLibs;
  } catch (err) {
    // Local development can reuse the DSH profile where a mail-capable plugin
    // already installed these packages; published installs resolve them from
    // this package's own dependencies.
    const profiles = join(HOME, 'profiles');
    if (existsSync(profiles)) {
      for (const profile of readdirSync(profiles)) {
        const pkg = join(profiles, profile, 'package.json');
        if (!existsSync(pkg)) continue;
        try {
          const require = createRequire(pkg);
          const ImapFlow = require('imapflow').ImapFlow;
          const simpleParser = require('mailparser').simpleParser;
          if (ImapFlow && simpleParser) {
            mailLibs = { ImapFlow, simpleParser };
            return mailLibs;
          }
        } catch (err2) {
          /* try next profile */
        }
      }
    }
    throw new Error('邮件组件未安装：请先安装 imapflow 和 mailparser。');
  }
}

async function withMailbox(email, authCode, fn) {
  const { ImapFlow, simpleParser } = await loadMailLibs();
  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: email, pass: authCode },
    clientInfo: { name: 'DSH Workbench', version: '2.5.1', vendor: 'DeepSeek Harness' },
    logger: false,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 45_000,
  });
  await client.connect();
  let lock;
  try {
    lock = await client.getMailboxLock('INBOX');
    return await fn(client, simpleParser);
  } finally {
    try { if (lock) lock.release(); } catch (err) { /* ignore */ }
    try { await client.logout(); } catch (err) { /* ignore */ }
  }
}

async function verifyConnection(email, authCode) {
  return withMailbox(email, authCode, async (client) => {
    const status = await client.status('INBOX', { messages: true });
    return { messages: status.messages || 0 };
  });
}

async function fetchMessages(email, authCode) {
  return withMailbox(email, authCode, async (client, simpleParser) => {
    const status = await client.status('INBOX', { messages: true });
    const total = Number(status.messages) || 0;
    if (!total) return [];
    const start = Math.max(1, total - 9);
    const messages = [];
    for await (const item of client.fetch(`${start}:*`, {
      uid: true,
      envelope: true,
      internalDate: true,
      flags: true,
      source: true,
    })) {
      let parsed;
      try {
        parsed = await simpleParser(item.source);
      } catch (err) {
        parsed = null;
      }
      const from = parsed && parsed.from && parsed.from.text
        ? parsed.from.text
        : item.envelope && item.envelope.from && item.envelope.from[0]
          ? [item.envelope.from[0].name, item.envelope.from[0].address].filter(Boolean).join(' <') + '>'
          : '';
      const subject = cleanText((parsed && parsed.subject) || (item.envelope && item.envelope.subject) || '(无主题)', 300);
      const date = (parsed && parsed.date) || item.internalDate || new Date();
      const body = cleanText((parsed && parsed.text) || htmlToText(parsed && parsed.html), 12000);
      const preview = body.replace(/\s+/g, ' ').slice(0, 180);
      messages.push({
        id: String(item.uid),
        subject,
        from: cleanText(from, 300),
        date: new Date(date).toISOString(),
        preview,
        text: body,
        unread: !(item.flags && item.flags.has && item.flags.has('\\Seen')),
      });
    }
    messages.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return messages;
  });
}

export async function getInboxStatus(ctx) {
  const config = readConfig();
  const credentials = getCredentials(ctx);
  let credentialConfigured = false;
  if (credentials && typeof credentials.describe === 'function') {
    try {
      const info = await credentials.describe(INBOX_CREDENTIAL);
      credentialConfigured = !!info.configured;
    } catch (err) {
      credentialConfigured = false;
    }
  }
  return {
    configured: !!(config && config.email && credentialConfigured),
    email: config && config.email ? config.email : '',
    lastSyncAt: config && config.lastSyncAt ? config.lastSyncAt : null,
    count: cached ? cached.messages.length : 0,
    channels: config && config.email
      ? [{
        id: 'qq-mail',
        name: 'QQ 邮箱',
        configured: credentialConfigured,
        email: config.email,
        lastSyncAt: config.lastSyncAt || null,
      }]
      : [],
  };
}

export async function saveInboxConfig(ctx, payload) {
  const email = cleanText(payload && payload.email, 200).toLowerCase();
  const authCode = String((payload && payload.authCode) || '').replace(/\s+/g, '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('邮箱地址格式不正确。');
  if (authCode.length < 6) throw new Error('请填写 QQ 邮箱的授权码（不是登录密码）。');
  const credentials = getCredentials(ctx);
  if (!credentials || typeof credentials.set !== 'function') throw new Error('凭据服务不可用，无法保存授权码。');
  const check = await verifyConnection(email, authCode);
  await credentials.set(INBOX_CREDENTIAL, authCode);
  writeConfig({ email, lastSyncAt: null, updatedAt: nowIso() });
  cached = null;
  return { configured: true, email, messages: check.messages };
}

export async function syncInbox(ctx, force) {
  const config = readConfig();
  if (!config || !config.email) throw new Error('还没有配置 QQ 邮箱。');
  const credentials = getCredentials(ctx);
  if (!credentials || typeof credentials.resolve !== 'function') throw new Error('凭据服务不可用');
  const resolved = await credentials.resolve(INBOX_CREDENTIAL);
  if (!resolved || !resolved.value) throw new Error('授权码已失效，请重新配置邮箱。');
  if (!force && cached && Date.now() - cached.at < CACHE_MS) {
    return { messages: cached.messages, lastSyncAt: config.lastSyncAt || cached.atIso };
  }
  const messages = await fetchMessages(config.email, resolved.value);
  const atIso = nowIso();
  cached = { at: Date.now(), atIso, messages };
  writeConfig({ ...config, lastSyncAt: atIso, updatedAt: atIso });
  return { messages, lastSyncAt: atIso };
}

export async function disconnectInbox(ctx) {
  const credentials = getCredentials(ctx);
  if (credentials && typeof credentials.unset === 'function') {
    try { await credentials.unset(INBOX_CREDENTIAL); } catch (err) { /* ignore */ }
  }
  try { rmSync(INBOX_FILE, { force: true }); } catch (err) { /* ignore */ }
  cached = null;
  return { configured: false };
}

export function mailToMemoDraft(message) {
  const subject = cleanText(message && message.subject, 300) || '(无主题)';
  const from = cleanText(message && message.from, 300) || '未知发件人';
  const date = message && message.date ? new Date(message.date).toLocaleString('zh-CN') : '';
  const body = cleanText(message && message.text, 4000);
  return {
    text: subject,
    note: `来自：${from}${date ? `\n时间：${date}` : ''}\n\n${body}`.slice(0, 4000),
    tags: ['邮件'],
  };
}
