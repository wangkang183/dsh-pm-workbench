import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

let captured = null;
globalThis.window = { __ModuleLoader__: { load: (m) => { captured = m; } } };
const code = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8');
vm.runInThisContext(code, { filename: 'client.js' });

assert.ok(captured, 'module not registered');
assert.equal(captured.id, '@local/pm-workbench');

const React = {
  createElement: (...args) => ({ t: args[0], p: args[1], c: args[2] }),
  useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  useEffect: () => {},
  useMemo: (f) => f(),
  useRef: (v) => ({ current: v }),
  useCallback: (f) => f,
};

const calls = [];
let registeredTab = null;
const mod = captured.factory(() => React);
assert.equal(typeof mod.apply, 'function');
assert.ok(Array.isArray(mod.inject));

const ctx = {
  effect: (fn) => fn(),
  slots: {
    inject: (name, cb) => { calls.push(['inject', name]); cb(); },
    register: (opts) => { calls.push(['register', opts.name, opts.key || opts.id || '']); return () => {}; },
  },
  sidebarRight: { openTab: (k) => calls.push(['openTab', k]), isExpanded: () => true },
  sidebarRightTabs: { register: (def) => { registeredTab = def; calls.push(['tabs.register', def.id, def.kind]); return () => {}; } },
};

mod.apply(ctx);

assert.ok(mod.inject.includes('sidebarRightTabs'));
assert.ok(mod.inject.includes('slots'));
assert.ok(calls.some((call) => call[0] === 'tabs.register' && call[1] === '@local/pm-workbench' && call[2] === 'pm-workbench'), 'tab type registered');
assert.ok(registeredTab && Array.isArray(registeredTab.guide) && registeredTab.guide.some((entry) => entry.id === 'open'), 'start-page guide entry registered');
assert.ok(calls.some((call) => call[0] === 'inject' && call[1] === 'sidebar.right.pane.tab'), 'pane slot injected');
assert.ok(calls.some((call) => call[0] === 'register' && call[1] === 'sidebar.right.pane.tab' && call[2] === '@local/pm-workbench'), 'pane body registered');
assert.ok(calls.some((call) => call[0] === 'register' && call[1] === 'conversation.input.left' && call[2] === 'pm-workbench-launcher'), 'launcher registered');
assert.ok(registeredTab && Array.isArray(registeredTab.guide) && registeredTab.guide.some((entry) => entry.id === 'open'), 'start-page guide entry registered');

console.log('smoke: ok — tab type, pane body, launcher, start-page guide entry registered');
process.exit(0);
