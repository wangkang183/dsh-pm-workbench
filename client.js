/* PM Workbench — client half (v2, Material Design).
 *
 * One tab in the right sidebar with three Material tabs:
 *   memo     — a notepad: check, strike-through, tags, arbitrary due date
 *   calendar — month + day agenda; memo deadlines flow in automatically
 *   weekly   — stats + an AI-written weekly digest (local fallback)
 *
 * State lives in localStorage (v2, migrating the old v1 todo list).
 * AI work runs on the Host via POST /pm-workbench/ai; the browser never
 * touches a provider key.
 */
window.__ModuleLoader__.load({
  id: 'dsh-pm-workbench',
  factory(require) {
    'use strict';

    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useMemo, useRef, useCallback } = React;

    const TAB_ID = 'dsh-pm-workbench';
    const KIND = 'pm-workbench';
    const STORE_KEY = 'dsh.pm-workbench.v2';
    const LEGACY_KEY = 'dsh.pm-workbench.v1';
    const HOST_SYNC_KEY = 'dsh.pm-workbench.hostsync';
    const DATA_ROUTE = '/pm-workbench/data';
    const DAY = 86400000;
    const BULK_MIN_CHARS = 50;
    const DEFAULT_TAGS = ['重要', '不重要', '紧急', '想法', '会议', '客户'];

    /* ------------------------------------------------------------------ i18n */

    const ZH = {
      title: '工作台',
      tab_memos: '备忘',
      tab_calendar: '日历',
      tab_weekly: '周报',
      composer_ph: '记点什么… 明天 15:00 对齐 #重要',
      composer_hint: 'Enter 保存 · Shift+Enter 换行',
      composer_hint_due: '已识别 {date}',
      composer_bulk_hint: '长文本：Enter AI 拆分 · Ctrl+Enter 存为一条',
      send_to_chat: '在对话中处理',
      sent_to_chat: '已加入当前对话',
      drawer_chat: '对话',
      drawer_more: '更多',
      no_chat: '当前没有可用对话',
      copied_to_clipboard: '已复制，粘贴到对话即可',
      chat_prompt_intro: '请处理这条工作台待办：',
      bulk_title: 'AI 拆分待办',
      bulk_desc: '把整段信息按语义拆成多条备忘，日期/时间直接写进截止日期，勾选后一次保存。识别失败会退回本地按行/句拆分。',
      bulk_placeholder: '粘贴会议纪要、聊天记录或一段长想法…',
      bulk_apply_n: '保存 {n} 条',
      bulk_run: '拆分',
      bulk_running: '拆分中…',
      save_one: '存为一条',
      save: '保存',
      saved: '已记下',
      deleted: '已删除',
      undo: '撤销',
      empty_memo_title: '还没有记录',
      empty_memo_desc: '把脑子里那句话写下来，回车就好。不用先想它属于什么分类。',
      empty_done: '还没有完成的事',
      filter_all: '全部',
      filter_open: '未完成',
      filter_important: '重要',
      filter_today: '今天',
      filter_empty: '当前筛选下没有内容',
      import_confirm: '导入会替换当前工作台数据，继续？',
      g_pinned: '置顶',
      g_overdue: '已逾期',
      g_today: '今天',
      g_week: '本周',
      g_later: '以后',
      g_someday: '无日期',
      g_done: '已完成',
      tag_important: '重要',
      tag_not_important: '不重要',
      tag_urgent: '紧急',
      tag_idea: '想法',
      tag_meeting: '会议',
      tag_client: '客户',
      manage_tags: '管理标签',
      tag_manage_hint: '新增、重命名或删除标签；重命名会同步所有待办，删除会从所有待办中移除。',
      tag_new_ph: '输入新标签',
      tag_add: '添加',
      tag_in_use: '{n} 条在用',
      tag_quick: '快捷',
      tag_used_only: '使用中',
      tag_rename: '重命名',
      tag_delete: '删除',
      tag_delete_confirm: '删除标签「{tag}」？会从快捷标签和所有待办中移除。',
      tag_exists: '标签已存在',
      tag_empty: '还没有标签',
      tag_changed: '标签已更新',
      due_today: '今天',
      due_tomorrow: '明天',
      due_overdue: '逾期 {n} 天',
      due_none: '无截止',
      due_all_day: '全天',
      today: '今天',
      tomorrow: '明天',
      yesterday: '昨天',
      weekly_title: '本周复盘',
      week_this: '本周',
      week_prev: '上一周',
      week_next: '下一周',
      stat_done: '完成',
      stat_created: '新增',
      stat_open: '本周待办',
      stat_important: '重要',
      ai_report: 'AI 周报',
      ai_generate: 'AI 总结本周',
      ai_regenerate: '重新生成',
      ai_generating: '正在梳理这一周…',
      ai_ready: 'AI 就绪',
      ai_local: '本地生成',
      ai_copy: '复制',
      copied: '已复制 Markdown',
      ai_empty_title: '把这一周交给 AI 梳理',
      ai_empty_desc: '根据备忘和日程，生成「完成 / 推进 / 风险 / 下周」四组要点，可直接贴进周报。',
      ai_no_data: '这一周还没有记录。先记几条，再回来生成。',
      report_done: '完成',
      report_progress: '推进',
      report_risks: '风险 / 卡点',
      report_next: '下周计划',
      report_engine_ai: 'AI',
      report_engine_local: '本地',
      ai_failed: 'AI 不可用，已用本地统计生成',
      ai_parse_failed: 'AI 不可用，已用本地规则解析',
      cal_add_event: '添加日程',
      cal_ai_parse: 'AI 识别',
      cal_no_events: '这一天还没有待办',
      cal_no_events_desc: '在备忘里给条目加个截止日期，它就会出现在这里。',
      cal_event_title_ph: '日程标题，例如：会员改版评审',
      cal_time: '时间',
      cal_save: '加入日历',
      cal_all_day: '不设时间（全天）',
      cal_today: '回今天',
      cal_ai_title: 'AI 识别日程',
      cal_ai_desc: '粘贴一段会议纪要、聊天记录或随手记，AI 会拆成日程和备忘。识别失败时自动用本地规则。',
      cal_ai_placeholder: '例如：明天下午 3 点跟设计对齐会员改版；周五前把验收标准发给老王；下周一 10 点周会 #会议',
      cal_ai_run: '识别',
      cal_ai_running: '识别中…',
      cal_ai_apply: '加入日历',
      cal_ai_apply_n: '加入日历 · {n} 条',
      cal_ai_engine_ai: 'AI 识别',
      cal_ai_engine_local: '本地识别',
      cal_ai_empty: '识别结果会出现在这里',
      cal_ai_need_text: '先粘贴一段文字',
      cal_ai_result_event: '日程',
      cal_ai_result_memo: '备忘',
      cal_ai_done: '已加入 {n} 条',
      cal_ai_none: '没有识别到可加入的内容',
      export: '导出 JSON',
      import: '导入 JSON',
      clear_done: '清空已完成',
      clear_done_confirm: '删除全部已完成备忘？此操作不可撤销。',
      pin: '置顶',
      unpin: '取消置顶',
      edit: '编辑',
      cancel: '取消',
      delete: '删除',
      due_label: '截止日期',
      time_label: '时间',
      from_memo: '来自备忘',
      event: '日程',
      memo: '备忘',
      greeting_morning: '上午好',
      greeting_afternoon: '下午好',
      greeting_evening: '晚上好',
      week_progress: '本周进度',
      more_actions: '更多',
      close: '关闭',
      menu_filter: '筛选',
      add: '新建',
      import_failed: '导入失败：不是有效的工作台 JSON',
      imported: '已导入 {n} 条',
      mark_done: '标记完成',
      mark_open: '恢复为未完成',
      save_failed: '本地存储写入失败，请从右上角导出备份',
      copy_failed: '复制失败，请手动选择文本',
      sync_conflict: '工作台数据已在别处更新，已刷新',
      sync_offline: '宿主同步不可用，数据仍保存在本地',
      ai_items: '{n} 条',
    };

    const EN = {
      title: 'Workbench',
      tab_memos: 'Memos',
      tab_calendar: 'Calendar',
      tab_weekly: 'Weekly',
      composer_ph: 'Jot it down… tomorrow 3pm sync #important',
      composer_hint: 'Enter to save · Shift+Enter for a new line',
      composer_hint_due: 'Recognized {date}',
      composer_bulk_hint: 'Long text: Enter to AI split · Ctrl+Enter saves one',
      send_to_chat: 'Handle in chat',
      sent_to_chat: 'Sent to this conversation',
      drawer_chat: 'Chat',
      drawer_more: 'More',
      no_chat: 'No conversation available',
      copied_to_clipboard: 'Copied — paste it into the conversation',
      chat_prompt_intro: 'Please handle this Workbench memo:',
      bulk_title: 'AI split into items',
      bulk_desc: 'Split a long note into memos; dates and times become due dates. Falls back to line/sentence splitting if AI is unavailable.',
      bulk_placeholder: 'Paste meeting notes, a chat log, or a long thought…',
      bulk_apply_n: 'Save {n}',
      bulk_run: 'Split',
      bulk_running: 'Splitting…',
      save_one: 'Save as one',
      save: 'Save',
      saved: 'Saved',
      deleted: 'Deleted',
      undo: 'Undo',
      empty_memo_title: 'Nothing here yet',
      empty_memo_desc: 'Write the thought down and press Enter. No category required.',
      empty_done: 'Nothing completed yet',
      filter_all: 'All',
      filter_open: 'Open',
      filter_important: 'Important',
      filter_today: 'Today',
      filter_empty: 'Nothing matches this filter',
      import_confirm: 'Importing replaces the current workbench data. Continue?',
      g_pinned: 'Pinned',
      g_overdue: 'Overdue',
      g_today: 'Today',
      g_week: 'This week',
      g_later: 'Later',
      g_someday: 'No date',
      g_done: 'Done',
      tag_important: 'Important',
      tag_not_important: 'Low',
      tag_urgent: 'Urgent',
      tag_idea: 'Idea',
      tag_meeting: 'Meeting',
      tag_client: 'Client',
      manage_tags: 'Manage tags',
      tag_manage_hint: 'Add, rename, or delete tags. Renaming updates every memo; deleting removes the tag from every memo.',
      tag_new_ph: 'New tag',
      tag_add: 'Add',
      tag_in_use: '{n} in use',
      tag_quick: 'Quick',
      tag_used_only: 'In use',
      tag_rename: 'Rename',
      tag_delete: 'Delete',
      tag_delete_confirm: 'Delete tag "{tag}"? It will be removed from quick tags and every memo.',
      tag_exists: 'Tag already exists',
      tag_empty: 'No tags yet',
      tag_changed: 'Tags updated',
      due_today: 'Today',
      due_tomorrow: 'Tomorrow',
      due_overdue: '{n}d overdue',
      due_none: 'No due date',
      due_all_day: 'All day',
      today: 'Today',
      tomorrow: 'Tomorrow',
      yesterday: 'Yesterday',
      weekly_title: 'Weekly review',
      week_this: 'This week',
      week_prev: 'Previous week',
      week_next: 'Next week',
      stat_done: 'Done',
      stat_created: 'Created',
      stat_open: 'Due this week',
      stat_important: 'Important',
      ai_report: 'AI weekly',
      ai_generate: 'Summarize my week',
      ai_regenerate: 'Regenerate',
      ai_generating: 'Reading your week…',
      ai_ready: 'AI ready',
      ai_local: 'Local',
      ai_copy: 'Copy',
      copied: 'Markdown copied',
      ai_empty_title: 'Let AI make sense of the week',
      ai_empty_desc: 'Turn memos and events into Done / In progress / Risks / Next week, ready to paste into a report.',
      ai_no_data: 'No records this week yet. Add a few first.',
      report_done: 'Done',
      report_progress: 'In progress',
      report_risks: 'Risks',
      report_next: 'Next week',
      report_engine_ai: 'AI',
      report_engine_local: 'Local',
      ai_failed: 'AI unavailable — generated locally',
      ai_parse_failed: 'AI unavailable — parsed with local rules',
      cal_add_event: 'Add event',
      cal_ai_parse: 'AI parse',
      cal_no_events: 'Nothing due this day',
      cal_no_events_desc: 'Add a due date to a memo and it appears here.',
      cal_event_title_ph: 'Event title, e.g. Membership review',
      cal_time: 'Time',
      cal_save: 'Add to calendar',
      cal_all_day: 'No time (all day)',
      cal_today: 'Today',
      cal_ai_title: 'AI schedule parser',
      cal_ai_desc: 'Paste meeting notes or a chat log; AI splits it into events and memos. Falls back to local rules.',
      cal_ai_placeholder: 'e.g. Tomorrow 3pm design sync on membership; send acceptance criteria to Wang by Friday; Monday 10am weekly #meeting',
      cal_ai_run: 'Parse',
      cal_ai_running: 'Parsing…',
      cal_ai_apply: 'Add to calendar',
      cal_ai_apply_n: 'Add to calendar · {n}',
      cal_ai_engine_ai: 'AI parse',
      cal_ai_engine_local: 'Local parse',
      cal_ai_empty: 'Parsed results appear here',
      cal_ai_need_text: 'Paste some text first',
      cal_ai_result_event: 'Event',
      cal_ai_result_memo: 'Memo',
      cal_ai_done: 'Added {n}',
      cal_ai_none: 'Nothing to add',
      export: 'Export JSON',
      import: 'Import JSON',
      clear_done: 'Clear completed',
      clear_done_confirm: 'Delete every completed memo? This cannot be undone.',
      pin: 'Pin',
      unpin: 'Unpin',
      edit: 'Edit',
      cancel: 'Cancel',
      delete: 'Delete',
      due_label: 'Due date',
      time_label: 'Time',
      from_memo: 'From memo',
      event: 'Event',
      memo: 'Memo',
      greeting_morning: 'Good morning',
      greeting_afternoon: 'Good afternoon',
      greeting_evening: 'Good evening',
      week_progress: 'Week progress',
      more_actions: 'More',
      close: 'Close',
      menu_filter: 'Filter',
      add: 'New',
      import_failed: 'Import failed: not a Workbench JSON file',
      imported: 'Imported {n}',
      mark_done: 'Mark as done',
      mark_open: 'Mark as open',
      save_failed: 'Could not write local storage — export a backup',
      copy_failed: 'Copy failed — select the text manually',
      sync_conflict: 'Workbench data changed elsewhere and was refreshed',
      sync_offline: 'Host sync unavailable — data is still saved locally',
      ai_items: '{n} items',
    };

    const LANG = String((typeof navigator !== 'undefined' && navigator.language) || 'zh').toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en';
    const STR = LANG === 'zh' ? ZH : EN;

    function t(key, vars) {
      let text = STR[key];
      if (text === undefined) text = ZH[key];
      if (text === undefined) return key;
      if (vars) {
        text = String(text).replace(/\{(\w+)\}/g, (_, name) => (vars[name] === undefined ? '' : String(vars[name])));
      }
      return text;
    }

    /* ------------------------------------------------------------------ theme */

    const PRIMARY = '#6200EE';
    const PRIMARY_DEEP = '#3700B3';
    const PRIMARY_LIGHT = '#7C4DFF';
    const TEAL = '#03DAC6';

    const CSS = `
.pmw-root{
  --pmw-ink:var(--dsw-alias-label-primary,#1d1b20);
  --pmw-muted:var(--dsw-alias-label-secondary,#6f6b7a);
  --pmw-line:var(--dsw-alias-border-l1,#e8e4f0);
  --pmw-line-strong:var(--dsw-alias-border-l2,#d7d2e3);
  --pmw-surface:var(--dsw-alias-bg-layer-1,#ffffff);
  --pmw-surface-2:var(--dsw-alias-bg-layer-2,#f7f4fe);
  --pmw-bg:var(--dsw-alias-bg-base,#fbf9ff);
  --pmw-primary:${PRIMARY};
  --pmw-primary-deep:${PRIMARY_DEEP};
  --pmw-primary-light:${PRIMARY_LIGHT};
  --pmw-fill:${PRIMARY};
  --pmw-on-fill:#ffffff;
  --pmw-primary-soft:rgba(98,0,238,.10);
  --pmw-primary-faint:rgba(98,0,238,.055);
  --pmw-teal:${TEAL};
  --pmw-teal-ink:#00786d;
  --pmw-danger:var(--dsw-alias-state-error-primary,#b3261e);
  --pmw-warn:var(--dsw-alias-state-warn-primary,#a15c00);
  --pmw-ok:var(--dsw-alias-state-success-primary,#146c2e);
  --pmw-shadow-1:0 1px 2px rgba(28,20,50,.05),0 2px 8px rgba(28,20,50,.04);
  --pmw-shadow-2:0 2px 6px rgba(28,20,50,.06),0 14px 32px rgba(98,0,238,.10);
  position:relative;display:flex;flex-direction:column;height:100%;min-height:0;
  color:var(--pmw-ink);background:var(--pmw-bg);
  font-family:Roboto,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,-apple-system,sans-serif;
  font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased;
}
.pmw-root *{box-sizing:border-box}
.pmw-root button{font-family:inherit}
.pmw-root ::selection{background:rgba(98,0,238,.18)}
.pmw-hero{position:relative;flex:0 0 auto;padding:13px 16px 12px;color:#fff;overflow:hidden;
  background:linear-gradient(135deg,var(--pmw-primary-deep) 0%,var(--pmw-fill) 46%,var(--pmw-primary-light) 100%);}
.pmw-hero::after{content:"";position:absolute;right:-46px;top:-62px;width:158px;height:158px;border-radius:50%;
  background:rgba(255,255,255,.10);pointer-events:none}
.pmw-hero::before{content:"";position:absolute;left:-30px;bottom:-64px;width:120px;height:120px;border-radius:50%;
  background:rgba(3,218,198,.16);pointer-events:none}
.pmw-hero-inner{position:relative;z-index:1;display:flex;align-items:flex-start;gap:10px}
.pmw-hero-main{flex:1 1 auto;min-width:0}
.pmw-hero-kicker{font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;opacity:.72}
.pmw-hero-date{font-size:16px;font-weight:700;line-height:1.35;margin-top:3px}
.pmw-hero-meta{font-size:11px;opacity:.82;margin-top:2px;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pmw-hero-meta i{width:3px;height:3px;border-radius:50%;background:currentColor;opacity:.7;flex:0 0 auto}
.pmw-hero-menu{flex:0 0 auto;width:30px;height:30px;border-radius:50%;border:0;background:rgba(255,255,255,.14);
  color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .18s}
.pmw-hero-menu:hover{background:rgba(255,255,255,.26)}
.pmw-ring{flex:0 0 auto;position:relative;width:48px;height:48px;margin-top:1px}
.pmw-ring svg{display:block;transform:rotate(-90deg)}
.pmw-ring-label{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  font-size:10px;font-weight:700;line-height:1.1;color:#fff}
.pmw-ring-label small{font-size:8px;font-weight:600;opacity:.72;letter-spacing:.04em}
.pmw-tabs{display:flex;flex:0 0 auto;gap:2px;padding:0 8px;background:var(--pmw-surface);border-bottom:1px solid var(--pmw-line)}
.pmw-tab{flex:1 1 0;position:relative;display:flex;align-items:center;justify-content:center;gap:6px;height:45px;
  border:0;background:transparent;color:var(--pmw-muted);font-size:12px;font-weight:600;cursor:pointer;
  border-radius:12px 12px 0 0;transition:color .18s,background .18s}
.pmw-tab:hover{background:var(--pmw-primary-faint);color:var(--pmw-ink)}
.pmw-tab.is-active{color:var(--pmw-primary)}
.pmw-tab.is-active::after{content:"";position:absolute;left:15%;right:15%;bottom:0;height:3px;border-radius:3px 3px 0 0;background:var(--pmw-primary)}
.pmw-tab svg{opacity:.9}
.pmw-body{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;padding:12px 12px 16px;scrollbar-width:thin;scrollbar-color:var(--pmw-line-strong) transparent}
.pmw-body::-webkit-scrollbar{width:6px}
.pmw-body::-webkit-scrollbar-thumb{background:var(--pmw-line-strong);border-radius:3px}
.pmw-body::-webkit-scrollbar-track{background:transparent}
.pmw-composer{position:relative;background:var(--pmw-surface);border:1px solid var(--pmw-line);border-radius:18px;
  box-shadow:var(--pmw-shadow-2);padding:10px 10px 8px;transition:border-color .2s,box-shadow .2s}
.pmw-composer:focus-within{border-color:rgba(98,0,238,.45);box-shadow:0 0 0 3px rgba(98,0,238,.09),var(--pmw-shadow-2)}
.pmw-composer textarea{display:block;width:100%;border:0;outline:0;background:transparent;color:var(--pmw-ink);
  font-size:13px;line-height:1.6;resize:none;min-height:46px;max-height:150px;padding:2px 4px;overflow-y:auto}
.pmw-composer textarea::placeholder{color:var(--pmw-muted);opacity:.72}
.pmw-composer-foot{display:flex;align-items:center;gap:5px;margin-top:5px;flex-wrap:wrap}
.pmw-composer-hint{flex:1 1 auto;min-width:80px;font-size:10px;line-height:1.4;color:var(--pmw-muted);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pmw-send{flex:0 0 auto;width:30px;height:30px;border-radius:50%;border:0;background:var(--pmw-fill);color:var(--pmw-on-fill);
  display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 12px rgba(98,0,238,.28);
  transition:transform .16s,background .16s,opacity .16s}
.pmw-send:hover{background:var(--pmw-primary-deep);transform:translateY(-1px)}.pmw-send:active{transform:scale(.94)}
.pmw-send:disabled{opacity:.4;cursor:default;transform:none;box-shadow:none}
.pmw-chip{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 9px;border-radius:999px;
  border:1px solid var(--pmw-line);background:var(--pmw-surface);color:var(--pmw-muted);
  font-size:11px;font-weight:600;line-height:1;cursor:pointer;white-space:nowrap;max-width:100%;
  transition:background .16s,border-color .16s,color .16s}
.pmw-chip:hover{border-color:var(--pmw-line-strong);color:var(--pmw-ink)}
.pmw-chip.is-on{background:var(--pmw-primary-soft);border-color:rgba(98,0,238,.32);color:var(--pmw-primary)}
.pmw-chip.is-danger{background:rgba(179,38,30,.08);border-color:rgba(179,38,30,.22);color:var(--pmw-danger)}
.pmw-chip.is-warn{background:rgba(161,92,0,.08);border-color:rgba(161,92,0,.22);color:var(--pmw-warn)}
.pmw-chip.is-teal{background:rgba(3,218,198,.12);border-color:rgba(3,218,198,.38);color:var(--pmw-teal-ink)}
.pmw-chip.is-static{cursor:default}
.pmw-chip.is-static:hover{border-color:var(--pmw-line);color:var(--pmw-muted)}
.pmw-chip.is-static.is-on:hover{color:var(--pmw-primary);border-color:rgba(98,0,238,.32)}
.pmw-chip.is-static.is-danger:hover{color:var(--pmw-danger);border-color:rgba(179,38,30,.22)}
.pmw-chip.is-static.is-warn:hover{color:var(--pmw-warn);border-color:rgba(161,92,0,.22)}
.pmw-chip .pmw-chip-dot{width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.85;flex:0 0 auto}
.pmw-filterbar{display:flex;flex-wrap:wrap;gap:6px;margin:12px 1px 2px;align-items:center}
.pmw-tagbar{display:flex;flex-wrap:wrap;gap:5px;margin:7px 0 0;align-items:center}
.pmw-tagbar-label{display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;letter-spacing:.05em;color:var(--pmw-muted);margin-right:1px}
.pmw-tagbar-manage{display:inline-flex;align-items:center;gap:3px;height:22px;padding:0 6px;border:1px dashed var(--pmw-line-strong);
  border-radius:999px;background:transparent;color:var(--pmw-muted);font-size:10px;font-weight:600;cursor:pointer;font-family:inherit}
.pmw-tagbar-manage:hover{border-color:var(--pmw-primary);color:var(--pmw-primary);background:var(--pmw-primary-faint)}
.pmw-tagrow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:center;padding:7px 0;border-bottom:1px solid var(--pmw-line)}
.pmw-tagrow-main{display:flex;align-items:center;gap:6px;min-width:0;flex-wrap:wrap}
.pmw-tag-count{font-size:10px;color:var(--pmw-muted);white-space:nowrap}
.pmw-tag-actions{display:flex;align-items:center;gap:1px}
.pmw-tag-add{display:flex;align-items:center;gap:6px;margin-top:10px}
.pmw-tag-add .pmw-input{flex:1 1 auto}
.pmw-section{display:flex;align-items:center;gap:6px;margin:16px 2px 8px;font-size:10px;font-weight:800;
  letter-spacing:.09em;text-transform:uppercase;color:var(--pmw-muted)}
.pmw-section::after{content:"";flex:1 1 auto;height:1px;background:var(--pmw-line)}
.pmw-section-count{font-size:9px;font-weight:700;color:var(--pmw-muted);background:var(--pmw-surface-2);
  border-radius:999px;padding:1px 6px;min-width:18px;text-align:center}
.pmw-memo{position:relative;display:grid;grid-template-columns:23px minmax(0,1fr);gap:9px;
  padding:12px 9px 11px 12px;margin-bottom:8px;background:var(--pmw-surface);border:1px solid var(--pmw-line);
  border-radius:16px;box-shadow:var(--pmw-shadow-1);transition:transform .18s,box-shadow .18s,border-color .18s,opacity .18s}
.pmw-memo:hover{transform:translateY(-1px);box-shadow:var(--pmw-shadow-2);border-color:var(--pmw-line-strong)}
.pmw-memo:focus-visible{outline:2px solid var(--pmw-primary);outline-offset:1px}
.pmw-memo.is-important::before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:3px;border-radius:0 3px 3px 0;background:var(--pmw-primary)}
.pmw-memo.is-done{opacity:.66;box-shadow:none}
.pmw-memo.is-done:hover{transform:none;box-shadow:none}
.pmw-memo.is-flash{animation:pmw-flash 1.5s ease}
.pmw-check{width:23px;height:23px;margin-top:1px;padding:0;border-radius:50%;border:2px solid var(--pmw-line-strong);
  background:transparent;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;
  transition:background .16s,border-color .16s,transform .16s;flex:0 0 auto}
.pmw-check:hover{border-color:var(--pmw-primary);background:var(--pmw-primary-faint)}
.pmw-check.is-on{background:var(--pmw-fill);border-color:var(--pmw-fill);animation:pmw-pop .22s ease}
.pmw-check:active{transform:scale(.9)}
.pmw-memo-text{font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word;cursor:text;min-height:21px}
.pmw-memo.is-done .pmw-memo-text{text-decoration:line-through;text-decoration-thickness:1.5px;color:var(--pmw-muted)}
.pmw-memo-meta{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin-top:7px}
.pmw-meta-text{font-size:10px;color:var(--pmw-muted);line-height:1.4}
.pmw-pin{display:inline-flex;align-items:center;color:var(--pmw-primary);opacity:.85}
.pmw-due{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 7px;border-radius:7px;
  background:var(--pmw-surface-2);color:var(--pmw-muted);font-size:10px;font-weight:700;white-space:nowrap}
.pmw-due.is-today{color:var(--pmw-primary);background:var(--pmw-primary-faint)}
.pmw-due.is-danger{color:var(--pmw-danger);background:rgba(179,38,30,.07)}
.pmw-memo.is-drawer{border-color:rgba(98,0,238,.34);box-shadow:0 8px 24px rgba(98,0,238,.12);min-height:96px}
.pmw-memo-drawer{position:absolute;top:0;right:0;bottom:0;width:86px;padding:8px;display:flex;flex-direction:column;
  align-items:stretch;justify-content:center;gap:4px;background:var(--pmw-surface);border-left:1px solid var(--pmw-line);
  border-radius:0 16px 16px 0;box-shadow:-10px 0 24px rgba(28,20,50,.08);z-index:4;
  animation:pmw-drawer-in .18s ease}
.pmw-drawer-btn{display:flex;flex-direction:row;align-items:center;justify-content:center;gap:4px;height:36px;
  padding:0;border:1px solid var(--pmw-line);border-radius:11px;background:var(--pmw-surface);
  color:var(--pmw-muted);font-size:10px;font-weight:700;font-family:inherit;cursor:pointer;
  transition:background .16s,border-color .16s,color .16s}
.pmw-drawer-btn:hover{background:var(--pmw-primary-faint);border-color:rgba(98,0,238,.28);color:var(--pmw-primary)}
.pmw-menu{position:absolute;right:6px;top:38px;z-index:30;min-width:138px;padding:4px;background:var(--pmw-surface);
  border:1px solid var(--pmw-line);border-radius:12px;box-shadow:var(--pmw-shadow-2);animation:pmw-rise .14s ease}
.pmw-menu button{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;border:0;border-radius:8px;
  background:transparent;color:var(--pmw-ink);font-size:12px;text-align:left;cursor:pointer}
.pmw-menu button:hover{background:var(--pmw-primary-faint)}
.pmw-menu button.is-danger{color:var(--pmw-danger)}
.pmw-menu button.is-danger:hover{background:rgba(179,38,30,.08)}
.pmw-editbox{margin-top:6px}
.pmw-editbox textarea{width:100%;min-height:58px;max-height:180px;resize:vertical;border:1px solid var(--pmw-line);
  border-radius:12px;background:var(--pmw-surface);color:var(--pmw-ink);font-size:12.5px;line-height:1.6;padding:8px 10px;outline:none}
.pmw-editbox textarea:focus{border-color:var(--pmw-primary);box-shadow:0 0 0 3px var(--pmw-primary-soft)}
.pmw-editrow{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:6px}
.pmw-input{height:32px;border:1px solid var(--pmw-line);border-radius:10px;background:var(--pmw-surface);color:var(--pmw-ink);
  font-size:12px;padding:0 9px;outline:none;min-width:0}
.pmw-input:focus{border-color:var(--pmw-primary);box-shadow:0 0 0 3px var(--pmw-primary-soft)}
.pmw-input[type="date"],.pmw-input[type="time"]{font-variant-numeric:tabular-nums}
.pmw-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:30px;padding:0 12px;
  border-radius:999px;border:1px solid var(--pmw-line);background:var(--pmw-surface);color:var(--pmw-ink);
  font-size:11.5px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background .16s,border-color .16s,color .16s}
.pmw-btn:hover{border-color:var(--pmw-line-strong);background:var(--pmw-surface-2)}
.pmw-btn.is-primary{background:var(--pmw-fill);border-color:var(--pmw-fill);color:var(--pmw-on-fill);box-shadow:0 4px 12px rgba(98,0,238,.22);white-space:nowrap}
.pmw-btn.is-primary:hover{background:var(--pmw-primary-deep);border-color:var(--pmw-primary-deep)}
.pmw-btn.is-ghost{border-color:transparent;background:transparent;color:var(--pmw-muted)}
.pmw-btn.is-ghost:hover{background:var(--pmw-primary-faint);color:var(--pmw-primary)}
.pmw-btn:disabled{opacity:.45;cursor:default;box-shadow:none}
.pmw-iconbtn{width:28px;height:28px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--pmw-muted);
  display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .16s,color .16s;flex:0 0 auto}
.pmw-iconbtn:hover{background:var(--pmw-primary-faint);color:var(--pmw-primary)}
.pmw-empty{display:flex;flex-direction:column;align-items:center;text-align:center;padding:22px 14px 14px}
.pmw-empty h4{margin:10px 0 3px;font-size:13px;font-weight:700;color:var(--pmw-ink)}
.pmw-empty p{margin:0;font-size:11.5px;line-height:1.65;color:var(--pmw-muted);max-width:240px}
.pmw-dock{flex:0 0 auto;padding:9px 12px 12px;background:var(--pmw-bg);border-top:1px solid var(--pmw-line);
  box-shadow:0 -8px 22px rgba(28,20,50,.045)}
.pmw-toast{position:absolute;left:14px;right:14px;bottom:18px;z-index:60;display:flex;align-items:center;gap:10px;
  padding:10px 12px;border-radius:14px;background:#2b2345;color:#fff;font-size:12px;
  box-shadow:0 12px 32px rgba(20,14,36,.4);animation:pmw-rise .2s ease}
.pmw-toast-text{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pmw-toast button{border:0;background:transparent;color:#d8c9ff;font-size:12px;font-weight:700;cursor:pointer;padding:2px 4px}
.pmw-toast button:hover{color:#fff}
.pmw-cal-head{display:flex;align-items:center;gap:2px;margin:0 0 8px}
.pmw-cal-title{flex:1 1 auto;font-size:14px;font-weight:800;letter-spacing:.01em}
.pmw-cal-title small{display:block;font-size:10px;font-weight:600;color:var(--pmw-muted);letter-spacing:.04em;margin-top:1px}
.pmw-cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:1px}
.pmw-cal-dow{text-align:center;font-size:10px;font-weight:700;color:var(--pmw-muted);padding:4px 0 6px}
.pmw-cal-cell{position:relative;height:42px;border:0;border-radius:11px;background:transparent;color:var(--pmw-ink);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;cursor:pointer;
  font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;transition:background .15s,color .15s}
.pmw-cal-cell:hover{background:var(--pmw-primary-faint)}
.pmw-cal-cell.is-out{color:var(--pmw-muted);opacity:.42}
.pmw-cal-cell.is-selected{background:var(--pmw-fill);color:#fff;box-shadow:0 4px 12px rgba(98,0,238,.28)}
.pmw-cal-num{width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:50%;line-height:1}
.pmw-cal-cell.is-today:not(.is-selected) .pmw-cal-num{box-shadow:inset 0 0 0 1.5px var(--pmw-primary);color:var(--pmw-primary)}
.pmw-cal-cell.is-selected .pmw-cal-num{color:#fff;box-shadow:none}
.pmw-dots{display:flex;gap:2px;height:4px;align-items:center}
.pmw-dot{width:4px;height:4px;border-radius:50%;background:var(--pmw-primary)}
.pmw-cal-cell.is-selected .pmw-dot{background:#fff;opacity:.9}
.pmw-dot.is-teal{background:var(--pmw-teal)}
.pmw-dot.is-warn{background:var(--pmw-warn)}
.pmw-agenda{margin-top:14px}
.pmw-agenda-head{display:flex;align-items:baseline;gap:8px;margin-bottom:6px}
.pmw-agenda-date{font-size:13px;font-weight:800}
.pmw-agenda-count{font-size:10px;color:var(--pmw-muted)}
.pmw-agenda-item{display:grid;grid-template-columns:42px minmax(0,1fr) 24px;gap:7px;align-items:start;
  padding:9px 6px 9px 8px;border-radius:12px;border:1px solid transparent;cursor:pointer;transition:background .15s,border-color .15s}
.pmw-agenda-item:hover{background:var(--pmw-primary-faint);border-color:var(--pmw-line)}
.pmw-agenda-time{font-size:10px;font-weight:700;color:var(--pmw-muted);padding-top:2px;font-variant-numeric:tabular-nums;white-space:nowrap}
.pmw-agenda-time.is-now{color:var(--pmw-primary)}
.pmw-agenda-title{font-size:12px;line-height:1.5;word-break:break-word}
.pmw-agenda-item.is-done .pmw-agenda-title{text-decoration:line-through;color:var(--pmw-muted)}
.pmw-agenda-sub{font-size:10px;color:var(--pmw-muted);margin-top:2px;display:flex;gap:5px;flex-wrap:wrap;align-items:center}
.pmw-form{margin-top:10px;padding:10px;border:1px solid var(--pmw-line);border-radius:14px;background:var(--pmw-surface-2)}
.pmw-form-row{display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap}
.pmw-form-row .pmw-input{flex:1 1 90px}
.pmw-form-actions{display:flex;gap:6px;justify-content:flex-end;margin-top:8px}
.pmw-stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:2px}
.pmw-stat{padding:11px 12px;border-radius:16px;background:var(--pmw-surface);border:1px solid var(--pmw-line);box-shadow:var(--pmw-shadow-1)}
.pmw-stat-num{font-size:22px;font-weight:800;line-height:1.15;color:var(--pmw-primary);font-variant-numeric:tabular-nums}
.pmw-stat.is-teal .pmw-stat-num{color:var(--pmw-teal-ink)}
.pmw-stat.is-warn .pmw-stat-num{color:var(--pmw-warn)}
.pmw-stat-label{font-size:10px;font-weight:700;letter-spacing:.05em;color:var(--pmw-muted);margin-top:2px}
.pmw-week-nav{display:flex;align-items:center;gap:4px;margin:0 0 10px}
.pmw-week-range{flex:1 1 auto;font-size:13px;font-weight:800}
.pmw-week-range small{display:block;font-size:10px;color:var(--pmw-muted);font-weight:600;margin-top:1px}
.pmw-report{margin-top:12px;padding:14px;border-radius:18px;border:1px solid rgba(98,0,238,.16);
  background:linear-gradient(180deg,rgba(98,0,238,.065),var(--pmw-surface) 42%);box-shadow:var(--pmw-shadow-2)}
.pmw-report-head{display:flex;align-items:center;gap:8px}
.pmw-spark{width:30px;height:30px;border-radius:10px;flex:0 0 auto;color:#fff;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(135deg,var(--pmw-fill) 0%,var(--pmw-primary-light) 100%);box-shadow:0 4px 10px rgba(98,0,238,.26)}
.pmw-report-title{flex:1 1 auto;font-size:12px;font-weight:800;line-height:1.3}
.pmw-report-sub{font-size:9.5px;color:var(--pmw-muted);font-weight:600;margin-top:1px}
.pmw-badge{font-size:9px;font-weight:800;letter-spacing:.06em;padding:2px 6px;border-radius:999px;
  background:var(--pmw-primary-soft);color:var(--pmw-primary);text-transform:uppercase}
.pmw-badge.is-local{background:rgba(120,120,140,.14);color:var(--pmw-muted)}
.pmw-report-headline{font-size:15px;font-weight:800;line-height:1.45;margin:12px 0 4px;letter-spacing:.01em}
.pmw-report-summary{font-size:12px;line-height:1.75;color:var(--pmw-ink)}
.pmw-report-section{margin-top:12px}
.pmw-report-label{display:flex;align-items:center;gap:5px;font-size:10px;font-weight:800;letter-spacing:.07em;
  text-transform:uppercase;color:var(--pmw-muted);margin-bottom:5px}
.pmw-report-list{margin:0;padding:0;list-style:none}
.pmw-report-list li{position:relative;padding-left:13px;font-size:12px;line-height:1.7;margin-bottom:1px;word-break:break-word}
.pmw-report-list li::before{content:"";position:absolute;left:2px;top:8px;width:4px;height:4px;border-radius:50%;background:var(--pmw-primary)}
.pmw-report-list.is-teal li::before{background:var(--pmw-teal)}
.pmw-report-list.is-warn li::before{background:var(--pmw-warn)}
.pmw-report-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}
.pmw-idle{padding:18px 4px 4px;text-align:center}
.pmw-idle p{font-size:11.5px;line-height:1.65;color:var(--pmw-muted);margin:8px 0 12px}
.pmw-shimmer{height:11px;border-radius:6px;margin:9px 0;
  background:linear-gradient(90deg,rgba(98,0,238,.08) 0%,rgba(98,0,238,.18) 40%,rgba(98,0,238,.08) 80%);
  background-size:220% 100%;animation:pmw-shimmer 1.2s linear infinite}
.pmw-backdrop{position:absolute;inset:0;z-index:50;display:flex;align-items:flex-end;background:rgba(20,14,36,.44);
  animation:pmw-fade .16s ease;backdrop-filter:blur(1px)}
.pmw-sheet{width:100%;max-height:90%;display:flex;flex-direction:column;background:var(--pmw-surface);
  border-radius:22px 22px 0 0;box-shadow:0 -16px 44px rgba(0,0,0,.26);animation:pmw-slide .24s cubic-bezier(.2,.8,.2,1);overflow:hidden}
.pmw-sheet-grip{width:38px;height:4px;border-radius:2px;background:var(--pmw-line-strong);margin:8px auto 0;flex:0 0 auto}
.pmw-sheet-head{display:flex;align-items:center;gap:8px;padding:9px 16px 4px;flex:0 0 auto}
.pmw-sheet-head h3{margin:0;font-size:14px;font-weight:800;flex:1 1 auto}
.pmw-sheet-body{padding:6px 16px 18px;overflow-y:auto;min-height:120px}
.pmw-sheet-body textarea{width:100%;min-height:92px;max-height:180px;resize:vertical;border:1px solid var(--pmw-line);
  border-radius:14px;background:var(--pmw-surface-2);color:var(--pmw-ink);font-size:12.5px;line-height:1.65;padding:10px 11px;outline:none}
.pmw-sheet-body textarea:focus{border-color:var(--pmw-primary);box-shadow:0 0 0 3px var(--pmw-primary-soft)}
.pmw-sheet-hint{font-size:10.5px;line-height:1.6;color:var(--pmw-muted);margin:7px 1px 10px}
.pmw-result{display:grid;grid-template-columns:20px minmax(0,1fr);gap:7px;align-items:start;padding:8px 7px;border-radius:11px;border:1px solid transparent;cursor:pointer}
.pmw-result .pmw-check{width:20px;height:20px;margin-top:0}
.pmw-result:hover{background:var(--pmw-primary-faint);border-color:var(--pmw-line)}
.pmw-result.is-off{opacity:.45}
.pmw-result-title{font-size:12px;line-height:1.5;word-break:break-word}
.pmw-result-meta{display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-top:3px}
.pmw-sheet-foot{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 16px 14px;border-top:1px solid var(--pmw-line);flex:0 0 auto}
.pmw-sheet-foot .pmw-btn{flex:1 1 auto;min-width:0}
.pmw-launcher{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 8px;border:0;border-radius:999px;
  background:transparent;color:inherit;font-size:11px;font-weight:600;cursor:pointer;opacity:.86}
.pmw-launcher:hover{background:var(--pmw-primary-faint);opacity:1}
.pmw-launcher-badge{min-width:15px;height:15px;padding:0 4px;border-radius:8px;background:var(--pmw-primary);color:#fff;
  font-size:9px;font-weight:800;line-height:15px;text-align:center}
.pmw-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@keyframes pmw-drawer-in{from{transform:translateX(16px);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes pmw-pop{0%{transform:scale(.82)}65%{transform:scale(1.08)}100%{transform:scale(1)}}
@keyframes pmw-fade{from{opacity:0}to{opacity:1}}
@keyframes pmw-slide{from{transform:translateY(26px);opacity:.4}to{transform:translateY(0);opacity:1}}
@keyframes pmw-rise{from{transform:translateY(7px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes pmw-flash{0%,100%{box-shadow:var(--pmw-shadow-1)}28%{box-shadow:0 0 0 3px rgba(98,0,238,.28)}}
@keyframes pmw-shimmer{0%{background-position:120% 0}100%{background-position:-120% 0}}
body[data-ds-dark-theme] .pmw-root{
  --pmw-shadow-1:0 1px 2px rgba(0,0,0,.35);--pmw-shadow-2:0 10px 28px rgba(0,0,0,.45);
  --pmw-primary:#B388FF;--pmw-primary-deep:#7C4DFF;--pmw-primary-light:#B388FF;--pmw-fill:#7C4DFF;
  --pmw-on-fill:#1b1030;
  --pmw-primary-soft:rgba(179,136,255,.16);--pmw-primary-faint:rgba(179,136,255,.08);
  --pmw-teal-ink:#7FF5E8;
}
body[data-ds-dark-theme] .pmw-hero{background:linear-gradient(135deg,#2a1257 0%,#5b21c9 48%,#7C4DFF 100%)}
body[data-ds-dark-theme] .pmw-toast{background:#161122}
@media (prefers-reduced-motion: reduce){
  .pmw-root *,.pmw-root *::before,.pmw-root *::after{animation-duration:.001ms !important;transition-duration:.001ms !important}
}
`;

    /* ------------------------------------------------------------------ icons */

    const ICONS = {
      note: [
        h('path', { key: 'a', d: 'M3.2 2.8h9.6v10.4H3.2z' }),
        h('path', { key: 'b', d: 'M5.6 5.8h4.8M5.6 8.2h4.8M5.6 10.6h3' }),
      ],
      calendar: [
        h('rect', { key: 'a', x: 2.4, y: 3.4, width: 11.2, height: 10, rx: 2 }),
        h('path', { key: 'b', d: 'M2.4 6.6h11.2M5.2 2.2v2.4M10.8 2.2v2.4' }),
        h('circle', { key: 'c', cx: 8, cy: 10, r: 0.9, fill: 'currentColor', stroke: 'none' }),
      ],
      spark: [
        h('path', { key: 'a', d: 'M8 2.2l1.35 3.45L12.8 7l-3.45 1.35L8 11.8 6.65 8.35 3.2 7l3.45-1.35z' }),
        h('path', { key: 'b', d: 'M12.4 10.6l.55 1.4 1.45.55-1.45.55-.55 1.4-.55-1.4-1.45-.55 1.45-.55z' }),
      ],
      plus: [h('path', { key: 'a', d: 'M8 3.4v9.2M3.4 8h9.2' })],
      check: [h('path', { key: 'a', d: 'M3.4 8.4l3.1 3.1 6.1-6.6' })],
      more: [
        h('circle', { key: 'a', cx: 3.2, cy: 8, r: 0.95, fill: 'currentColor', stroke: 'none' }),
        h('circle', { key: 'b', cx: 8, cy: 8, r: 0.95, fill: 'currentColor', stroke: 'none' }),
        h('circle', { key: 'c', cx: 12.8, cy: 8, r: 0.95, fill: 'currentColor', stroke: 'none' }),
      ],
      left: [h('path', { key: 'a', d: 'M9.8 4.2L6 8l3.8 3.8' })],
      right: [h('path', { key: 'a', d: 'M6.2 4.2L10 8l-3.8 3.8' })],
      close: [h('path', { key: 'a', d: 'M4 4l8 8M12 4l-8 8' })],
      trash: [h('path', { key: 'a', d: 'M3.2 4.6h9.6M6.4 4.6V3.2h3.2v1.4M4.6 4.6l.6 8h5.6l.6-8' })],
      edit: [
        h('path', { key: 'a', d: 'M10.8 2.8l2.4 2.4-7.2 7.2-3.2.8.8-3.2z' }),
        h('path', { key: 'b', d: 'M9.4 4.2l2.4 2.4' }),
      ],
      pin: [
        h('path', { key: 'a', d: 'M9.6 2.4l4 4-2.8 1.2-2.4 2.4-.8 2.8-4.4-4.4 2.8-.8 2.4-2.4z' }),
        h('path', { key: 'b', d: 'M6.2 9.8L3.2 12.8' }),
      ],
      clock: [
        h('circle', { key: 'a', cx: 8, cy: 8, r: 5.4 }),
        h('path', { key: 'b', d: 'M8 4.8V8l2.2 1.3' }),
      ],
      tag: [
        h('path', { key: 'a', d: 'M2.8 7.4V3.4a.8.8 0 01.8-.8h4l6 6-4.6 4.6-6.2-5.8z' }),
        h('circle', { key: 'b', cx: 5.4, cy: 5.4, r: 0.9, fill: 'currentColor', stroke: 'none' }),
      ],
      filter: [h('path', { key: 'a', d: 'M2.4 3.2h11.2l-4.3 4.8v4.9l-2.6 1.5V8z' })],
      chat: [h('path', { key: 'a', d: 'M2.4 3.2h11.2v7.2H8l-3.1 2.4v-2.4H2.4z' })],
      sparkles: [
        h('path', { key: 'a', d: 'M8 2l1.2 3.1L12.4 6.3 9.2 7.5 8 10.6 6.8 7.5 3.6 6.3 6.8 5.1z' }),
        h('path', { key: 'b', d: 'M12.2 10.4l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z' }),
        h('path', { key: 'c', d: 'M3.6 10.8l.35.9.9.35-.9.35-.35.9-.35-.9-.9-.35.9-.35z' }),
      ],
      copy: [
        h('rect', { key: 'a', x: 5.2, y: 5.2, width: 7.4, height: 8, rx: 1.6 }),
        h('path', { key: 'b', d: 'M3.4 10.8V3.4h7.4' }),
      ],
      refresh: [
        h('path', { key: 'a', d: 'M12.4 7.2a4.4 4.4 0 10-1.1 3.2' }),
        h('path', { key: 'b', d: 'M12.4 3.6v3.6H8.8' }),
      ],
      arrow: [h('path', { key: 'a', d: 'M3.2 8h9.2M9 4.4L12.6 8 9 11.6' })],
      download: [h('path', { key: 'a', d: 'M8 3v7M5.2 7.4L8 10.2l2.8-2.8M3.4 12.6h9.2' })],
      upload: [h('path', { key: 'a', d: 'M8 10.2V3M5.2 5.8L8 3l2.8 2.8M3.4 12.6h9.2' })],
      alert: [
        h('path', { key: 'a', d: 'M8 3.2v5.2' }),
        h('circle', { key: 'b', cx: 8, cy: 11.8, r: 0.9, fill: 'currentColor', stroke: 'none' }),
      ],
      sun: [
        h('circle', { key: 'a', cx: 8, cy: 8, r: 3 }),
        h('path', { key: 'b', d: 'M8 1.6v1.4M8 13v1.4M1.6 8h1.4M13 8h1.4M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1' }),
      ],
    };

    function Icon(props) {
      const size = props.size || 14;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: props.weight || 1.45,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
        style: { display: 'block', flex: '0 0 auto', ...(props.style || {}) },
      }, ICONS[props.name] || null);
    }

    /* ------------------------------------------------------------------ utils */

    const pad2 = (n) => String(n).padStart(2, '0');

    function ymd(date) {
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    }

    function parseYmd(text) {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ''));
      if (!match) return null;
      const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      return Number.isNaN(date.getTime()) ? null : date;
    }

    function isDateText(value) {
      const date = parseYmd(value);
      return !!date && ymd(date) === String(value);
    }

    function isTimeText(value) {
      const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
      if (!match) return false;
      return Number(match[1]) < 24 && Number(match[2]) < 60;
    }

    function startOfDay(date) {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    function addDays(date, days) {
      const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      next.setDate(next.getDate() + days);
      return next;
    }

    /** Monday-first week start. */
    function startOfWeek(date) {
      const day = date.getDay();
      const shift = (day + 6) % 7;
      return addDays(startOfDay(date), -shift);
    }

    function endOfWeek(date) {
      return addDays(startOfWeek(date), 6);
    }

    function startOfMonth(date) {
      return new Date(date.getFullYear(), date.getMonth(), 1);
    }

    function daysInMonth(year, month) {
      return new Date(year, month + 1, 0).getDate();
    }

    function sameDay(a, b) {
      return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }

    function weekdayIndex(date) {
      return (date.getDay() + 6) % 7; // Monday = 0
    }

    const WEEKDAY_CN = ['一', '二', '三', '四', '五', '六', '日'];
    const WEEKDAY_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    function weekdayLabel(date) {
      const index = weekdayIndex(date);
      return (LANG === 'zh' ? '周' : '') + (LANG === 'zh' ? WEEKDAY_CN[index] : WEEKDAY_EN[index]);
    }

    function monthDayLabel(date) {
      return LANG === 'zh'
        ? `${date.getMonth() + 1}月${date.getDate()}日`
        : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function clockLabel(date) {
      const hour = date.getHours();
      if (hour < 6) return t('greeting_evening');
      if (hour < 12) return t('greeting_morning');
      if (hour < 18) return t('greeting_afternoon');
      return t('greeting_evening');
    }

    function timeText(hm) {
      if (!hm) return '';
      return hm;
    }

    function compareDue(a, b) {
      const at = a.dueDate ? new Date(`${a.dueDate}T${a.dueTime || '23:59'}`).getTime() : Number.POSITIVE_INFINITY;
      const bt = b.dueDate ? new Date(`${b.dueDate}T${b.dueTime || '23:59'}`).getTime() : Number.POSITIVE_INFINITY;
      return at - bt;
    }

    function uid(prefix) {
      return `${prefix || 'x'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    }

    function safeArray(value) {
      return Array.isArray(value) ? value : [];
    }

    function cleanString(value, limit) {
      return String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim().slice(0, limit || 2000);
    }

    function cleanMultiline(value, limit) {
      return String(value === null || value === undefined ? '' : value)
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, limit || 4000);
    }

    function cleanTag(value) {
      return cleanString(value, 12).replace(/^#/, '');
    }

    function uniqueTags(tags) {
      const out = [];
      for (const entry of safeArray(tags)) {
        const tag = cleanTag(entry);
        if (tag && out.indexOf(tag) < 0) out.push(tag);
        if (out.length >= 8) break;
      }
      return out;
    }

    function hasTag(memo, tag) {
      return uniqueTags(memo && memo.tags).indexOf(tag) >= 0;
    }

    /** A multi-line or long draft is a bulk capture: split it before saving. */
    function isBulkDraft(text) {
      const value = String(text || '').trim();
      if (!value) return false;
      const lines = value.split(/\n/).filter((line) => line.trim()).length;
      return lines > 1 || value.length >= BULK_MIN_CHARS;
    }

    /* --------------------------------------------------------------- date NLP */

    const CN_WEEKDAY = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };

    function applyHourPeriod(hour, period) {
      if (!period) return hour;
      if (period === '下午' || period === '傍晚' || period === '晚上') return hour < 12 ? hour + 12 : hour;
      if (period === '中午') return hour < 11 ? hour + 12 : hour;
      return hour;
    }

    /**
     * Parse a free-form capture line into a memo draft.
     * Returns { title, tags, dueDate, dueTime, dueLabel, matched }.
     * Mutating a scratch copy lets us remove date tokens without losing the
     * original order (e.g. "明天下午3点" → date removed, time still parsed).
     */
    function parseCapture(text, now) {
      const source = String(text || '').trim();
      const base = now instanceof Date ? now : new Date();
      const today = startOfDay(base);
      let scan = source;
      const matched = [];
      const tags = [];
      let dueDate = null;
      let dueTime = null;

      const take = (token) => {
        const at = scan.indexOf(token);
        if (at < 0) return;
        scan = scan.slice(0, at) + ' ' + scan.slice(at + token.length);
        matched.push(token);
      };

      // 1) hashtags
      scan = scan.replace(/#([^\s#，,。；;：:、]+)/g, (whole, tag) => {
        const clean = cleanTag(tag);
        if (clean && tags.indexOf(clean) < 0) tags.push(clean);
        matched.push(whole);
        return ' ';
      });

      // 2) explicit 2026-11-17 / 2026/11/17
      let match = scan.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
      if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const candidate = new Date(year, month - 1, day);
        if (candidate.getMonth() === month - 1 && candidate.getDate() === day) {
          dueDate = ymd(candidate);
          take(match[0]);
        }
      }

      // 3) 10月30日 / 10月30号
      if (!dueDate) {
        match = scan.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/);
        if (match) {
          const month = Number(match[1]);
          const day = Number(match[2]);
          if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            const candidate = new Date(today.getFullYear(), month - 1, day);
            dueDate = ymd(candidate);
            take(match[0]);
          }
        }
      }

      // 4) 10-30 / 10.30 (M-D shorthand)
      if (!dueDate) {
        match = scan.match(/(\d{1,2})[-/.](\d{1,2})/);
        if (match) {
          const month = Number(match[1]);
          const day = Number(match[2]);
          if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            dueDate = ymd(new Date(today.getFullYear(), month - 1, day));
            take(match[0]);
          }
        }
      }

      // 5) 下周一 / 本周五 / 周五
      if (!dueDate) {
        match = scan.match(/(下下周|下周|下星期|本周|这周|本星期|这星期|周|星期)([一二三四五六日天])/);
        if (match) {
          const token = match[1];
          const weekday = CN_WEEKDAY[match[2]];
          const monday = startOfWeek(today);
          let target = monday;
          if (token.indexOf('下下') === 0) target = addDays(monday, 14);
          else if (token.indexOf('下') === 0) target = addDays(monday, 7);
          else if (token !== '周' && token !== '星期') target = monday;
          const offset = weekday === 0 ? 6 : weekday - 1;
          target = addDays(target, offset);
          if (token === '周' || token === '星期') {
            // "周五" from a later weekday means the coming one; today means today.
            if (target < today) target = addDays(target, 7);
          }
          dueDate = ymd(target);
          take(match[0]);
        }
      }

      // 6) relative days: 今天/明天/后天/大后天/N天后/下周
      if (!dueDate) {
        const relative = [
          [/大后天/, 3],
          [/后天/, 2],
          [/明天|明日|明早|明晚/, 1],
          [/今天|今日|今晚/, 0],
        ];
        for (const [pattern, days] of relative) {
          match = scan.match(pattern);
          if (match) {
            dueDate = ymd(addDays(today, days));
            take(match[0]);
            break;
          }
        }
      }
      if (!dueDate) {
        match = scan.match(/(\d{1,2})\s*天后/);
        if (match) {
          dueDate = ymd(addDays(today, Number(match[1])));
          take(match[0]);
        }
      }
      if (!dueDate) {
        match = scan.match(/下个?月/);
        if (match) {
          const next = new Date(today.getFullYear(), today.getMonth() + 1, 1);
          dueDate = ymd(next);
          take(match[0]);
        }
      }
      if (!dueDate) {
        match = scan.match(/(?:这个?|本)?月(?:底|末)/);
        if (match) {
          dueDate = ymd(new Date(today.getFullYear(), today.getMonth() + 1, 0));
          take(match[0]);
        }
      }

      // 7) time: 15:30 / 下午3点 / 3点半 / 早上9点
      const timeMatch = scan.match(/(凌晨|早上|上午|中午|下午|傍晚|晚上)?\s*(\d{1,2})\s*[:：]\s*(\d{1,2})/);
      if (timeMatch) {
        const hour = applyHourPeriod(Number(timeMatch[2]), timeMatch[1]);
        const minute = Number(timeMatch[3]);
        if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
          dueTime = `${pad2(hour)}:${pad2(minute)}`;
          take(timeMatch[0]);
        }
      }
      if (!dueTime) {
        const pointMatch = scan.match(/(凌晨|早上|上午|中午|下午|傍晚|晚上)?\s*(\d{1,2})\s*点\s*(半|\d{1,2}\s*分?)?/);
        if (pointMatch) {
          const hour = applyHourPeriod(Number(pointMatch[2]), pointMatch[1]);
          let minute = 0;
          if (pointMatch[3] === '半') minute = 30;
          else if (pointMatch[3]) minute = Number(String(pointMatch[3]).replace(/\D/g, '')) || 0;
          if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
            dueTime = `${pad2(hour)}:${pad2(minute)}`;
            take(pointMatch[0]);
          }
        }
      }

      if (dueTime && !dueDate) dueDate = ymd(today);

      // 8) "周五前 / 明天前" prefixes: the date token was consumed already.
      let title = scan
        .replace(/[，,。;；]+/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^(?:记得|记一下|提醒我|需要|要)[ \t]*/i, '')
        .replace(/[ \t]*(?:前|之前)[ \t]*$/i, '')
        .trim();
      if (!title) title = source.replace(/#[^\s#]+/g, '').trim();
      if (!title) title = source;
      if (dueDate) title = title.replace(/^之前[ \t]*/, '').replace(/^前(?![台端后])/, '').trim();

      const dueLabel = dueDate ? dueSummary({ dueDate, dueTime }, base) : '';
      return { title, tags: uniqueTags(tags), dueDate, dueTime, dueLabel, matched };
    }

    function dueSummary(memo, now) {
      if (!memo || !memo.dueDate) return '';
      const date = parseYmd(memo.dueDate);
      if (!date) return '';
      const today = startOfDay(now);
      const delta = Math.round((startOfDay(date).getTime() - today.getTime()) / DAY);
      let label;
      if (delta === 0) label = t('due_today');
      else if (delta === 1) label = t('due_tomorrow');
      else if (delta < 0) label = t('due_overdue', { n: -delta });
      else if (delta < 7) label = weekdayLabel(date);
      else label = monthDayLabel(date);
      return memo.dueTime ? `${label} ${memo.dueTime}` : label;
    }

    function dueTone(memo, now) {
      if (!memo || !memo.dueDate) return 'default';
      const date = parseYmd(memo.dueDate);
      if (!date) return 'default';
      const delta = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY);
      if (delta < 0) return 'danger';
      if (delta === 0) return 'primary';
      if (delta === 1) return 'primary';
      return 'default';
    }

    function relativeCreated(iso, now) {
      if (!iso) return '';
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return '';
      const delta = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / DAY);
      if (delta === 0) return `${t('today')} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
      if (delta === 1) return t('yesterday');
      return monthDayLabel(date);
    }

    /* ------------------------------------------------------------------- data */

    function emptyStore() {
      return { v: 2, memos: [], events: [], reports: {}, tagOptions: DEFAULT_TAGS.slice(), ui: { tab: 'memos', filter: 'all' } };
    }

    function normalizeTagList(value, fallback) {
      if (!Array.isArray(value)) return fallback ? DEFAULT_TAGS.slice() : [];
      const out = [];
      for (const entry of value) {
        const tag = cleanTag(entry);
        if (tag && out.indexOf(tag) < 0) out.push(tag);
        if (out.length >= 40) break;
      }
      return out;
    }

    function normalizeMemo(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const text = cleanMultiline(raw.text, 4000);
      if (!text) return null;
      const done = raw.done === true;
      return {
        id: typeof raw.id === 'string' && raw.id ? raw.id : uid('m'),
        text,
        tags: uniqueTags(raw.tags),
        done,
        doneAt: done ? (typeof raw.doneAt === 'string' ? raw.doneAt : new Date().toISOString()) : null,
        dueDate: isDateText(raw.dueDate) ? raw.dueDate : null,
        dueTime: isDateText(raw.dueDate) && isTimeText(raw.dueTime)
          ? String(raw.dueTime).padStart(5, '0')
          : null,
        createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
        pinned: raw.pinned === true,
        ai: raw.ai === true,
      };
    }

    function normalizeEvent(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const title = cleanString(raw.title, 300);
      const date = String(raw.date || '');
      if (!title || !isDateText(date)) return null;
      return {
        id: typeof raw.id === 'string' && raw.id ? raw.id : uid('e'),
        title,
        date,
        time: isTimeText(raw.time) ? String(raw.time).padStart(5, '0') : null,
        tags: uniqueTags(raw.tags),
        note: cleanString(raw.note, 600),
        done: raw.done === true,
        source: raw.source === 'ai' ? 'ai' : 'manual',
        memoId: typeof raw.memoId === 'string' ? raw.memoId : null,
        createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
      };
    }

    function migrateLegacy(raw) {
      const store = emptyStore();
      if (!raw || typeof raw !== 'object') return store;
      const todos = safeArray(raw.todos);
      for (const todo of todos) {
        if (!todo || typeof todo !== 'object') continue;
        if (todo.status === 'dropped') continue;
        const memo = normalizeMemo({
          text: todo.title || todo.text,
          tags: todo.tag ? [todo.tag] : [],
          done: todo.status === 'done',
          doneAt: todo.doneAt || null,
          dueDate: todo.due || null,
          dueTime: null,
          createdAt: todo.createdAt || new Date().toISOString(),
          updatedAt: todo.updatedAt || todo.createdAt || new Date().toISOString(),
        });
        if (memo) {
          if (todo.priority === 'high' && memo.tags.indexOf('重要') < 0) memo.tags.unshift('重要');
          store.memos.push(memo);
        }
      }
      return store;
    }

    /** Calendar is a view of memos: fold any legacy standalone events into memos. */
    function migrateEvents(store) {
      if (!store.events || !store.events.length) {
        store.events = [];
        return store;
      }
      const keys = new Set(store.memos.map((memo) => `${memo.text}|${memo.dueDate || ''}|${memo.dueTime || ''}`));
      for (const event of store.events) {
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
        store.memos.push(memo);
      }
      store.events = [];
      return store;
    }

    function loadStore() {
      try {
        const raw = window.localStorage.getItem(STORE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          const store = emptyStore();
          store.memos = safeArray(parsed.memos).map(normalizeMemo).filter(Boolean);
          store.events = safeArray(parsed.events).map(normalizeEvent).filter(Boolean);
          store.reports = parsed.reports && typeof parsed.reports === 'object' ? parsed.reports : {};
          store.ui = parsed.ui && typeof parsed.ui === 'object' ? parsed.ui : store.ui;
          store.tagOptions = normalizeTagList(parsed.tagOptions, true);
          return migrateEvents(store);
        }
        const legacy = window.localStorage.getItem(LEGACY_KEY);
        if (legacy) return migrateLegacy(JSON.parse(legacy));
      } catch (err) {
        /* a corrupt store must not make the panel unusable */
      }
      return emptyStore();
    }

    function saveStore(store) {
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
        return true;
      } catch (err) {
        /* quota or privacy mode: keep running in memory */
        return false;
      }
    }

    /* --------------------------------------------------------------- grouping */

    function isOpen(memo) {
      return !memo.done;
    }

    function groupMemos(memos, now) {
      const groups = { pinned: [], overdue: [], today: [], week: [], later: [], someday: [], done: [] };
      const weekEnd = ymd(endOfWeek(now));
      const today = ymd(now);
      for (const memo of memos) {
        if (memo.done) { groups.done.push(memo); continue; }
        if (memo.pinned) { groups.pinned.push(memo); continue; }
        if (!memo.dueDate) { groups.someday.push(memo); continue; }
        if (memo.dueDate < today) { groups.overdue.push(memo); continue; }
        if (memo.dueDate === today) { groups.today.push(memo); continue; }
        if (memo.dueDate <= weekEnd) { groups.week.push(memo); continue; }
        groups.later.push(memo);
      }
      for (const key of Object.keys(groups)) {
        groups[key].sort((a, b) => {
          if (key === 'done') return String(b.doneAt || '').localeCompare(String(a.doneAt || ''));
          const at = a.dueDate ? new Date(`${a.dueDate}T${a.dueTime || '23:59'}`).getTime() : null;
          const bt = b.dueDate ? new Date(`${b.dueDate}T${b.dueTime || '23:59'}`).getTime() : null;
          if (at !== null && bt !== null && at !== bt) return at - bt;
          if (at !== null && bt === null) return -1;
          if (at === null && bt !== null) return 1;
          return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
        });
      }
      return groups;
    }

    function filterMemos(memos, filter, now) {
      const today = ymd(now);
      if (filter === 'open') return memos.filter(isOpen);
      if (filter === 'important') return memos.filter((memo) => !memo.done && hasTag(memo, '重要'));
      if (filter === 'today') return memos.filter((memo) => !memo.done && memo.dueDate === today);
      return memos.slice();
    }

    function dayEntries(memos, events, dateText) {
      const entries = [];
      for (const memo of memos) {
        if (memo.dueDate !== dateText) continue;
        entries.push({
          id: 'memo:' + memo.id,
          kind: 'memo',
          title: memo.text,
          time: memo.dueTime,
          done: memo.done,
          tags: memo.tags,
          memoId: memo.id,
        });
      }
      for (const event of events) {
        if (event.date !== dateText) continue;
        entries.push({
          id: 'event:' + event.id,
          kind: 'event',
          title: event.title,
          time: event.time,
          done: event.done,
          tags: event.tags,
          note: event.note,
          eventId: event.id,
        });
      }
      entries.sort((a, b) => {
        if (a.time && b.time) return a.time.localeCompare(b.time);
        if (a.time && !b.time) return -1;
        if (!a.time && b.time) return 1;
        return a.title.localeCompare(b.title);
      });
      return entries;
    }

    function reportKey(date) {
      return ymd(startOfWeek(date));
    }

    function weekRange(date) {
      const start = startOfWeek(date);
      return {
        start: ymd(start),
        end: ymd(addDays(start, 6)),
        startDate: start,
        endDate: addDays(start, 6),
      };
    }

    function weekStats(memos, events, anchor, nowInput) {
      const now = nowInput instanceof Date ? nowInput : new Date();
      const range = weekRange(anchor);
      const inRange = (text) => text && text >= range.start && text <= range.end;
      const done = memos.filter((memo) => memo.done && inRange(String(memo.doneAt || '').slice(0, 10)));
      const created = memos.filter((memo) => inRange(String(memo.createdAt || '').slice(0, 10)));
      const open = memos.filter((memo) => !memo.done && memo.dueDate && inRange(memo.dueDate));
      const important = memos.filter((memo) => {
        if (memo.done || !hasTag(memo, '重要')) return false;
        const created = String(memo.createdAt || '').slice(0, 10);
        return (memo.dueDate && inRange(memo.dueDate)) || inRange(created);
      });
      const overdue = memos.filter((memo) => !memo.done && memo.dueDate && memo.dueDate < ymd(now));
      const total = done.length + open.length;
      const rate = total ? Math.round((done.length / total) * 100) : 0;
      return { range, done, created, open, important, overdue, rate, events: events.filter((event) => inRange(event.date)) };
    }

    function groupOverdue(memos, now) {
      const today = ymd(now);
      return memos.filter((memo) => !memo.done && memo.dueDate && memo.dueDate < today);
    }

    /* ---------------------------------------------------------------- summary */

    function localSummary(memos, events, anchor, now) {
      const stats = weekStats(memos, events, anchor, now);
      const doneAll = stats.done;
      const progressAll = memos.filter((memo) => !memo.done && memo.dueDate && memo.dueDate >= stats.range.start && memo.dueDate <= stats.range.end);
      const risksAll = groupOverdue(memos, now);
      const done = doneAll.slice(0, 6).map((memo) => memo.text.slice(0, 60));
      const progress = progressAll.slice(0, 6).map((memo) => memo.text.slice(0, 60));
      const risks = risksAll
        .slice(0, 5)
        .map((memo) => `${memo.text.slice(0, 50)}（${dueSummary(memo, now)}）`);
      const next = memos
        .filter((memo) => !memo.done && memo.dueDate && memo.dueDate > stats.range.end)
        .slice(0, 5)
        .map((memo) => memo.text.slice(0, 60));

      const headline = doneAll.length
        ? `这一周完成 ${doneAll.length} 项，推进 ${progressAll.length} 项`
        : `这一周新增 ${stats.created.length} 条，完成 0 项`;
      const summary = [
        `这一周新增 ${stats.created.length} 条备忘，完成 ${doneAll.length} 条，待办 ${stats.open.length} 条。`,
        stats.important.length ? `其中重要事项 ${stats.important.length} 条。` : '',
        risksAll.length ? `有 ${risksAll.length} 条已逾期，建议优先处理。` : '没有逾期事项。',
      ].join('');

      return {
        headline,
        summary,
        done,
        progress,
        risks,
        next,
        engine: 'local',
        generatedAt: new Date().toISOString(),
      };
    }

    function sanitizeReport(raw, engine) {
      const value = raw && typeof raw === 'object' ? raw : {};
      const list = (input) => safeArray(input).map((entry) => cleanString(entry, 120)).filter(Boolean).slice(0, 6);
      return {
        headline: cleanString(value.headline, 80) || t('weekly_title'),
        summary: cleanString(value.summary, 600),
        done: list(value.done),
        progress: list(value.progress),
        risks: list(value.risks),
        next: list(value.next),
        engine: engine || 'ai',
        generatedAt: new Date().toISOString(),
      };
    }

    function localParseText(text, now) {
      const segments = String(text || '')
        .split(/\n|；|;|。|！|？/)
        .map((line) => line.replace(/^[\s\-•*\d.、]+/, '').trim())
        .filter(Boolean)
        .slice(0, 12);
      const memos = [];
      for (const segment of segments) {
        const parsed = parseCapture(segment, now);
        if (!parsed.title) continue;
        memos.push({
          text: parsed.title,
          tags: parsed.tags,
          dueDate: parsed.dueDate,
          dueTime: parsed.dueTime,
        });
      }
      return { memos, events: [] };
    }

    function sanitizeParseResult(raw, engine) {
      const value = raw && typeof raw === 'object' ? raw : {};
      const memos = safeArray(value.memos).map((memo) => ({
        text: cleanString(memo && memo.text, 500),
        tags: uniqueTags(memo && memo.tags),
        dueDate: isDateText(memo && memo.dueDate) ? memo.dueDate : null,
        dueTime: isDateText(memo && memo.dueDate) && isTimeText(memo && memo.dueTime)
          ? String(memo.dueTime).padStart(5, '0')
          : null,
      })).filter((memo) => memo.text);
      const eventMemos = safeArray(value.events).map((event) => ({
        text: cleanString(event && event.title, 300),
        tags: uniqueTags(event && event.tags),
        dueDate: isDateText(event && event.date) ? event.date : null,
        dueTime: isTimeText(event && event.time) ? String(event.time).padStart(5, '0') : null,
      })).filter((memo) => memo.text);
      return { memos: memos.concat(eventMemos).slice(0, 12), events: [], engine: engine || 'ai' };
    }

    /* ------------------------------------------------------------------- AI IO */

    async function callAI(task, payload) {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 60_000) : null;
      try {
        const response = await fetch('/pm-workbench/ai', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ task, ...payload }),
          signal: controller ? controller.signal : undefined,
        });
        const data = await response.json().catch(() => null);
        if (!data || data.ok !== true) {
          throw new Error((data && data.error) || `AI 请求失败 (HTTP ${response.status})`);
        }
        return data.result;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    async function generateReport(memos, events, anchor, now) {
      const range = weekRange(anchor);
      const stats = weekStats(memos, events, anchor, now);
      const payload = {
        weekStart: range.start,
        weekEnd: range.end,
        now: now.toISOString(),
        memos: memos
          .filter((memo) => {
            const created = String(memo.createdAt || '').slice(0, 10);
            const doneAt = String(memo.doneAt || '').slice(0, 10);
            const due = memo.dueDate || '';
            return (created >= range.start && created <= range.end)
              || (doneAt >= range.start && doneAt <= range.end)
              || (due >= range.start && due <= range.end);
          })
          .slice(0, 60)
          .map((memo) => ({
            text: memo.text.slice(0, 160),
            done: memo.done,
            tags: memo.tags,
            dueDate: memo.dueDate,
            dueTime: memo.dueTime,
            createdAt: memo.createdAt,
            doneAt: memo.doneAt,
          })),
        events: stats.events.slice(0, 40).map((event) => ({
          title: event.title.slice(0, 120),
          date: event.date,
          time: event.time,
          tags: event.tags,
        })),
      };
      try {
        const raw = await callAI('summary', payload);
        return sanitizeReport(raw, 'ai');
      } catch (err) {
        return {
          ...localSummary(memos, events, anchor, now),
          error: String((err && err.message) || err),
        };
      }
    }

    async function parseWithAI(text, now) {
      try {
        const raw = await callAI('parse', { text: text.slice(0, 6000), now: now.toISOString() });
        return sanitizeParseResult(raw, 'ai');
      } catch (err) {
        return {
          ...localParseText(text, now),
          engine: 'local',
          error: String((err && err.message) || err),
        };
      }
    }

    /* --------------------------------------------------------------- UI bits */

    function useNow(intervalMs) {
      const [now, setNow] = useState(() => new Date());
      useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), intervalMs || 60_000);
        return () => clearInterval(timer);
      }, [intervalMs]);
      return now;
    }

    function Ring(props) {
      const size = props.size || 48;
      const stroke = 4;
      const radius = (size - stroke) / 2;
      const circumference = 2 * Math.PI * radius;
      const rate = Math.max(0, Math.min(1, props.rate || 0));
      return h('div', { className: 'pmw-ring', style: { width: size, height: size } },
        h('svg', { width: size, height: size, 'aria-hidden': 'true' },
          h('circle', { cx: size / 2, cy: size / 2, r: radius, fill: 'none', stroke: 'rgba(255,255,255,.24)', strokeWidth: stroke }),
          h('circle', {
            cx: size / 2,
            cy: size / 2,
            r: radius,
            fill: 'none',
            stroke: '#ffffff',
            strokeWidth: stroke,
            strokeLinecap: 'round',
            strokeDasharray: `${circumference * rate} ${circumference}`,
            style: { transition: 'stroke-dasharray .5s ease' },
          }),
        ),
        h('div', { className: 'pmw-ring-label' },
          h('span', null, String(props.label || '')),
          h('small', null, props.sub || ''),
        ));
    }

    function EmptyArt(props) {
      const kind = props.kind || 'memo';
      const common = { width: 118, height: 86, viewBox: '0 0 118 86', 'aria-hidden': 'true', focusable: 'false', style: { display: 'block', margin: '0 auto' } };
      if (kind === 'calendar') {
        return h('svg', common,
          h('rect', { x: 17, y: 17, width: 84, height: 58, rx: 12, fill: 'rgba(98,0,238,.08)', stroke: 'rgba(98,0,238,.32)', strokeWidth: 1.3 }),
          h('path', { d: 'M17 32h84', stroke: 'rgba(98,0,238,.22)', strokeWidth: 1.2 }),
          h('path', { d: 'M29 10v12M89 10v12', stroke: PRIMARY, strokeWidth: 2.4, strokeLinecap: 'round' }),
          h('rect', { x: 34, y: 40, width: 14, height: 12, rx: 3, fill: 'rgba(98,0,238,.16)' }),
          h('rect', { x: 52, y: 40, width: 14, height: 12, rx: 3, fill: 'rgba(3,218,198,.28)' }),
          h('rect', { x: 70, y: 40, width: 14, height: 12, rx: 3, fill: 'rgba(98,0,238,.16)' }),
          h('rect', { x: 34, y: 57, width: 14, height: 12, rx: 3, fill: 'rgba(98,0,238,.10)' }),
          h('circle', { cx: 94, cy: 62, r: 9, fill: '#ffffff', stroke: PRIMARY, strokeWidth: 1.5 }),
          h('path', { d: 'M90.5 62l2.4 2.4 4-4.6', stroke: PRIMARY, strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }),
          h('circle', { cx: 20, cy: 70, r: 2.4, fill: TEAL, opacity: 0.7 }),
        );
      }
      if (kind === 'weekly') {
        return h('svg', common,
          h('rect', { x: 16, y: 15, width: 86, height: 58, rx: 12, fill: 'rgba(98,0,238,.07)', stroke: 'rgba(98,0,238,.28)', strokeWidth: 1.3 }),
          h('path', { d: 'M30 56l13-13 12 7 14-18 19 10', stroke: PRIMARY, strokeWidth: 2.2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }),
          h('circle', { cx: 59, cy: 43, r: 3.2, fill: '#ffffff', stroke: PRIMARY, strokeWidth: 1.6 }),
          h('circle', { cx: 88, cy: 42, r: 3.2, fill: '#ffffff', stroke: TEAL, strokeWidth: 1.8 }),
          h('path', { d: 'M92 8l1.6 4.2 4.4 1.6-4.4 1.6L92 19.6l-1.6-4.2-4.4-1.6 4.4-1.6z', fill: PRIMARY_LIGHT, opacity: 0.9 }),
          h('circle', { cx: 22, cy: 30, r: 2.2, fill: TEAL, opacity: 0.75 }),
        );
      }
      return h('svg', common,
        h('rect', { x: 28, y: 13, width: 62, height: 60, rx: 10, fill: 'rgba(98,0,238,.08)', stroke: 'rgba(98,0,238,.30)', strokeWidth: 1.3 }),
        h('rect', { x: 46, y: 7, width: 26, height: 11, rx: 4, fill: PRIMARY }),
        h('circle', { cx: 41, cy: 33, r: 5, fill: '#ffffff', stroke: PRIMARY, strokeWidth: 1.4 }),
        h('path', { d: 'M38.8 33.2l1.7 1.8 2.7-3.2', stroke: PRIMARY, strokeWidth: 1.6, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }),
        h('path', { d: 'M51 31.5h26M51 35h20', stroke: 'rgba(98,0,238,.34)', strokeWidth: 2.4, strokeLinecap: 'round' }),
        h('circle', { cx: 41, cy: 50, r: 5, fill: '#ffffff', stroke: 'rgba(98,0,238,.42)', strokeWidth: 1.4 }),
        h('path', { d: 'M51 48.5h23M51 52h16', stroke: 'rgba(98,0,238,.20)', strokeWidth: 2.4, strokeLinecap: 'round' }),
        h('circle', { cx: 98, cy: 30, r: 8, fill: 'rgba(3,218,198,.16)', stroke: TEAL, strokeWidth: 1.4 }),
        h('path', { d: 'M94.6 30h6.8M98 26.6v6.8', stroke: '#00897b', strokeWidth: 1.6, strokeLinecap: 'round' }),
      );
    }

    function Chip(props) {
      const tone = props.tone || 'default';
      const classes = ['pmw-chip'];
      if (props.active) classes.push('is-on');
      if (tone === 'danger') classes.push('is-danger');
      if (tone === 'warn') classes.push('is-warn');
      if (tone === 'teal') classes.push('is-teal');
      if (props.static) classes.push('is-static');
      if (props.className) classes.push(props.className);
      return h('button', {
        type: 'button',
        className: classes.join(' '),
        title: props.title || undefined,
        onClick: props.onClick,
        disabled: props.disabled || undefined,
        tabIndex: props.static && !props.onClick ? -1 : undefined,
        style: props.style || undefined,
      }, props.dot ? h('span', { className: 'pmw-chip-dot' }) : null, props.icon ? h(Icon, { name: props.icon, size: 11 }) : null, props.children);
    }

    /* -------------------------------------------------------------- store hook */

    function mergeStores(local, remote) {
      const memos = safeArray(remote && remote.memos).slice();
      const memoIds = new Set(memos.map((memo) => memo.id));
      for (const memo of safeArray(local && local.memos)) {
        if (!memoIds.has(memo.id)) { memos.push(memo); memoIds.add(memo.id); }
      }
      const events = safeArray(remote && remote.events).slice();
      const eventIds = new Set(events.map((event) => event.id));
      for (const event of safeArray(local && local.events)) {
        if (!eventIds.has(event.id)) { events.push(event); eventIds.add(event.id); }
      }
      return {
        ...(remote || emptyStore()),
        v: 2,
        memos,
        events,
        reports: { ...(local && local.reports ? local.reports : {}), ...(remote && remote.reports ? remote.reports : {}) },
        tagOptions: normalizeTagList(
          [...(remote && remote.tagOptions ? remote.tagOptions : []), ...(local && local.tagOptions ? local.tagOptions : [])],
          true,
        ),
        ui: (remote && remote.ui) || (local && local.ui) || { tab: 'memos', filter: 'all' },
      };
    }

    function useStore() {
      const [store, setStore] = useState(loadStore);
      const [saveError, setSaveError] = useState(0);
      const [syncNotice, setSyncNotice] = useState(null);
      const storeRef = useRef(store);
      const revRef = useRef(0);
      const hydratedRef = useRef(false);
      const remoteApplyRef = useRef(false);
      const syncEnabledRef = useRef(true);
      const pendingRef = useRef(false);
      const savingRef = useRef(false);
      const saveTimerRef = useRef(null);
      const offlineNotifiedRef = useRef(false);

      useEffect(() => { storeRef.current = store; }, [store]);

      function notify(kind) {
        if (kind === 'offline' && offlineNotifiedRef.current) return;
        if (kind === 'offline') offlineNotifiedRef.current = true;
        setSyncNotice({ kind, at: Date.now() });
      }

      async function postStore(value, baseRev) {
        const response = await fetch(DATA_ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ store: value, baseRev }),
        });
        const data = await response.json().catch(() => null);
        if (response.status === 409 && data && data.code === 'conflict' && data.store) {
          revRef.current = data.rev;
          remoteApplyRef.current = true;
          setStore(data.store);
          saveStore(data.store);
          try { window.localStorage.setItem(HOST_SYNC_KEY, '1'); } catch (err) { /* ignore */ }
          notify('conflict');
          return false;
        }
        if (!response.ok || !data || data.ok !== true) {
          throw new Error((data && data.error) || `HTTP ${response.status}`);
        }
        revRef.current = data.rev;
        try { window.localStorage.setItem(HOST_SYNC_KEY, '1'); } catch (err) { /* ignore */ }
        return true;
      }

      useEffect(() => {
        let cancelled = false;
        (async () => {
          try {
            const response = await fetch(DATA_ROUTE, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (cancelled || !data || data.ok !== true) return;
            revRef.current = data.rev;
            const remote = data.store;
            const local = storeRef.current;
            const hostInitialized = Number(data.rev) > 0;
            let synced = false;
            try { synced = window.localStorage.getItem(HOST_SYNC_KEY) === '1'; } catch (err) { synced = false; }
            const localHas = local.memos.length > 0 || local.events.length > 0 || Object.keys(local.reports || {}).length > 0;
            if (hostInitialized && !synced) {
              const merged = mergeStores(local, remote);
              remoteApplyRef.current = true;
              setStore(merged);
              saveStore(merged);
              await postStore(merged, data.rev);
            } else if (hostInitialized) {
              remoteApplyRef.current = true;
              setStore(remote);
              saveStore(remote);
            } else if (localHas) {
              await postStore(local, data.rev);
            } else {
              try { window.localStorage.setItem(HOST_SYNC_KEY, '1'); } catch (err) { /* ignore */ }
            }
          } catch (err) {
            syncEnabledRef.current = false;
            notify('offline');
          } finally {
            hydratedRef.current = true;
          }
        })();
        return () => { cancelled = true; };
      }, []);

      useEffect(() => {
        const ok = saveStore(store);
        if (ok) setSaveError(0);
        else setSaveError((count) => count + 1);

        if (!hydratedRef.current || !syncEnabledRef.current) return;
        if (remoteApplyRef.current) { remoteApplyRef.current = false; return; }
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        const snapshot = store;
        pendingRef.current = true;
        saveTimerRef.current = setTimeout(async () => {
          savingRef.current = true;
          try {
            await postStore(snapshot, revRef.current);
          } catch (err) {
            try { window.localStorage.removeItem(HOST_SYNC_KEY); } catch (err2) { /* ignore */ }
            pendingRef.current = false;
            notify('offline');
          } finally {
            savingRef.current = false;
            pendingRef.current = false;
          }
        }, 350);
        return () => {
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
      }, [store]);

      useEffect(() => {
        const timer = setInterval(async () => {
          if (!hydratedRef.current || !syncEnabledRef.current || savingRef.current || pendingRef.current) return;
          try {
            const response = await fetch(DATA_ROUTE, { cache: 'no-store' });
            if (!response.ok) return;
            const data = await response.json();
            if (!data || data.ok !== true || data.rev === revRef.current) return;
            revRef.current = data.rev;
            remoteApplyRef.current = true;
            setStore(data.store);
            saveStore(data.store);
          } catch (err) {
            /* keep the local cache */
          }
        }, 5000);
        return () => clearInterval(timer);
      }, []);

      return [store, setStore, saveError, syncNotice];
    }

    /* ------------------------------------------------------------------ tags */

    const TAG_OPTIONS = DEFAULT_TAGS;
    const TAG_KEYS = {
      重要: 'tag_important',
      不重要: 'tag_not_important',
      紧急: 'tag_urgent',
      想法: 'tag_idea',
      会议: 'tag_meeting',
      客户: 'tag_client',
    };

    function tagLabel(tag) {
      return TAG_KEYS[tag] ? t(TAG_KEYS[tag]) : tag;
    }

    function tagTone(tag) {
      if (tag === '紧急') return 'danger';
      if (tag === '客户') return 'warn';
      if (tag === '想法' || tag === '会议') return 'teal';
      return 'default';
    }

    function TagChip(props) {
      const tag = props.tag;
      return h(Chip, {
        static: !props.onClick,
        active: tag === '重要',
        tone: tagTone(tag),
        title: tagLabel(tag),
        onClick: props.onClick,
        style: props.style,
      }, tagLabel(tag));
    }

    function DueBadge(props) {
      const tone = dueTone(props.memo, props.now);
      return h('span', {
        className: 'pmw-due' + (tone === 'danger' ? ' is-danger' : tone === 'primary' ? ' is-today' : ''),
        title: t('due_label'),
      }, h(Icon, { name: 'clock', size: 11 }), dueSummary(props.memo, props.now));
    }

    function buildMemoPrompt(memo, now) {
      const tags = uniqueTags(memo.tags).map(tagLabel).join(LANG === 'zh' ? '、' : ', ');
      const due = memo.dueDate ? `${dueSummary(memo, now)}（${memo.dueDate}${memo.dueTime ? ' ' + memo.dueTime : ''}）` : '';
      const lines = LANG === 'zh'
        ? [
          t('chat_prompt_intro'),
          `- 内容：${memo.text}`,
          tags ? `- 标签：${tags}` : '',
          due ? `- 截止：${due}` : '',
          `- 状态：${memo.done ? '已完成' : '未完成'}`,
          `- ID：${memo.id}`,
          '',
          '请先判断需要哪些动作，然后直接开始执行；涉及不可逆操作或对外发送前先向我确认。完成后简要汇报结果，并告诉我是否要把这条标记为完成。需要改状态时调用 pm_memo_update（id 已给出）。',
        ]
        : [
          t('chat_prompt_intro'),
          `- Text: ${memo.text}`,
          tags ? `- Tags: ${tags}` : '',
          due ? `- Due: ${due}` : '',
          `- Status: ${memo.done ? 'done' : 'open'}`,
          `- ID: ${memo.id}`,
          '',
          'Decide what needs to be done, then start executing. Ask before irreversible or outward-facing actions. Report the result briefly and tell me whether to mark this memo done. Use pm_memo_update with the given id when the status changes.',
        ];
      return lines.filter(Boolean).join('\n');
    }

    async function copyText(text) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch (err) {
        /* fall through */
      }
      try {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(area);
        return ok;
      } catch (err) {
        return false;
      }
    }

    /* -------------------------------------------------------------- composer */

    function Composer(props) {
      const now = props.now;
      const draft = props.draft;
      const [tagAdd, setTagAdd] = useState([]);
      const [tagOff, setTagOff] = useState([]);
      const [dateOpen, setDateOpen] = useState(false);
      const [overrideDate, setOverrideDate] = useState(null);
      const [overrideTime, setOverrideTime] = useState(null);
      const [useOverride, setUseOverride] = useState(false);
      const areaRef = useRef(null);

      const parsed = useMemo(() => parseCapture(draft, now), [draft, now]);
      const bulk = isBulkDraft(draft);
      const parsedTags = parsed.tags.filter((tag) => tagOff.indexOf(tag) < 0);
      const activeTags = uniqueTags(parsedTags.concat(tagAdd));
      const dueDate = useOverride ? overrideDate : parsed.dueDate;
      const dueTime = useOverride ? overrideTime : parsed.dueTime;
      const dueLabel = dueDate ? dueSummary({ dueDate, dueTime }, now) : '';

      useEffect(() => {
        const area = areaRef.current;
        if (!area) return;
        area.style.height = 'auto';
        area.style.height = Math.min(area.scrollHeight, 150) + 'px';
      }, [draft]);

      useEffect(() => {
        if (draft) return;
        setUseOverride(false);
        setOverrideDate(null);
        setOverrideTime(null);
        setDateOpen(false);
      }, [draft]);

      function toggleTag(tag) {
        if (activeTags.indexOf(tag) >= 0) {
          if (tagAdd.indexOf(tag) >= 0) setTagAdd(tagAdd.filter((entry) => entry !== tag));
          else setTagOff(uniqueTags(tagOff.concat([tag])));
        } else {
          setTagOff(tagOff.filter((entry) => entry !== tag));
          setTagAdd(uniqueTags(tagAdd.concat([tag])));
        }
      }

      function submit(forceOne) {
        const title = parsed.title.trim();
        if (!title) return;
        if (bulk && !forceOne) {
          props.onBulk(draft, activeTags);
          return;
        }
        props.onAdd({ text: title, tags: activeTags, dueDate, dueTime: dueDate ? dueTime : null });
        setTagAdd([]);
        setTagOff([]);
        setUseOverride(false);
        setOverrideDate(null);
        setOverrideTime(null);
        setDateOpen(false);
        if (areaRef.current) areaRef.current.style.height = 'auto';
      }

      function onKeyDown(event) {
        if (event.key !== 'Enter') return;
        if (event.nativeEvent && event.nativeEvent.isComposing) return;
        if (event.shiftKey) return;
        event.preventDefault();
        submit(event.metaKey || event.ctrlKey);
      }

      function setDate(value) {
        setUseOverride(true);
        setOverrideDate(value || null);
        if (!value) setOverrideTime(null);
      }

      return h('div', { className: 'pmw-composer' },
        h('textarea', {
          ref: areaRef,
          value: draft,
          rows: 2,
          placeholder: t('composer_ph'),
          'aria-label': t('composer_ph'),
          onChange: (event) => props.onDraftChange(event.target.value),
          onKeyDown,
        }),
        dateOpen ? h('div', { className: 'pmw-editrow' },
          h('input', {
            className: 'pmw-input',
            type: 'date',
            value: dueDate || '',
            onChange: (event) => setDate(event.target.value),
            'aria-label': t('due_label'),
            style: { flex: '1 1 120px' },
          }),
          h('input', {
            className: 'pmw-input',
            type: 'time',
            value: dueTime || '',
            onChange: (event) => {
              setUseOverride(true);
              setOverrideTime(event.target.value || null);
            },
            'aria-label': t('time_label'),
            style: { flex: '0 0 92px' },
          }),
          h('button', {
            type: 'button',
            className: 'pmw-btn is-ghost',
            style: { height: 26, padding: '0 8px' },
            onClick: () => {
              setUseOverride(false);
              setOverrideDate(null);
              setOverrideTime(null);
              setDateOpen(false);
            },
          }, t('cancel')),
        ) : null,
        h('div', { className: 'pmw-composer-foot' },
          dueDate
            ? h(Chip, {
              active: true,
              icon: 'calendar',
              title: t('due_label'),
              onClick: () => setDateOpen((open) => !open),
            }, dueLabel)
            : h(Chip, {
              icon: 'calendar',
              title: t('due_label'),
              onClick: () => setDateOpen((open) => !open),
            }, t('due_none')),
          h('span', { className: 'pmw-composer-hint' }, bulk
            ? t('composer_bulk_hint')
            : (dueLabel ? t('composer_hint_due', { date: dueLabel }) : t('composer_hint'))),
          h('button', {
            type: 'button',
            className: 'pmw-send pmw-ai-send',
            title: draft.trim() ? t('ai_split') : t('cal_ai_parse'),
            'aria-label': t('cal_ai_parse'),
            onClick: () => (draft.trim() ? props.onBulk(draft, activeTags) : props.onOpenAI()),
          }, h(Icon, { name: 'sparkles', size: 15 })),
          h('button', {
            type: 'button',
            className: 'pmw-send',
            title: bulk ? t('ai_split') : t('save'),
            'aria-label': bulk ? t('ai_split') : t('save'),
            disabled: !parsed.title.trim(),
            onClick: () => submit(false),
          }, h(Icon, { name: 'arrow', size: 15 })),
        ),
        h('div', { className: 'pmw-tagbar' },
          h('span', { className: 'pmw-tagbar-label' }, h(Icon, { name: 'tag', size: 10 }), LANG === 'zh' ? '标签' : 'Tags'),
          h('button', {
            type: 'button',
            className: 'pmw-tagbar-manage',
            title: t('manage_tags'),
            'aria-label': t('manage_tags'),
            onClick: props.onManageTags,
          }, h(Icon, { name: 'edit', size: 10 }), t('manage_tags')),
          (Array.isArray(props.tagOptions) ? props.tagOptions : TAG_OPTIONS).map((tag) => h(Chip, {
            key: tag,
            active: activeTags.indexOf(tag) >= 0,
            tone: tagTone(tag),
            onClick: () => toggleTag(tag),
          }, tagLabel(tag))),
        ),
      );
    }

    /* --------------------------------------------------------------- memo row */

    function MemoItem(props) {
      const memo = props.memo;
      const now = props.now;
      const [menuOpen, setMenuOpen] = useState(false);
      const [editText, setEditText] = useState(memo.text);
      const [editTags, setEditTags] = useState(memo.tags);
      const [editDate, setEditDate] = useState(memo.dueDate || '');
      const [editTime, setEditTime] = useState(memo.dueTime || '');
      const [tagDraft, setTagDraft] = useState('');
      const rootRef = useRef(null);

      useEffect(() => {
        if (!props.editing) return;
        setEditText(memo.text);
        setEditTags(memo.tags);
        setEditDate(memo.dueDate || '');
        setEditTime(memo.dueTime || '');
        setTagDraft('');
      }, [props.editing, memo.id]);

      useEffect(() => {
        if (!menuOpen) return;
        const close = (event) => {
          if (rootRef.current && !rootRef.current.contains(event.target)) setMenuOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
      }, [menuOpen]);

      useEffect(() => {
        if (!props.flash || !rootRef.current) return;
        try { rootRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (err) { /* old browser */ }
      }, [props.flash]);

      useEffect(() => {
        if (!props.drawerOpen) return;
        const close = (event) => {
          if (rootRef.current && !rootRef.current.contains(event.target)) props.onDrawerClose();
        };
        const onKey = (event) => { if (event.key === 'Escape') props.onDrawerClose(); };
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', onKey);
        return () => {
          document.removeEventListener('mousedown', close);
          document.removeEventListener('keydown', onKey);
        };
      }, [props.drawerOpen]);

      useEffect(() => {
        if (!props.drawerOpen) setMenuOpen(false);
      }, [props.drawerOpen]);

      useEffect(() => {
        if (props.editing && props.drawerOpen) props.onDrawerClose();
      }, [props.editing, props.drawerOpen]);

      function save() {
        const text = editText.trim();
        if (!text) return;
        props.onSave(memo.id, {
          text,
          tags: uniqueTags(editTags),
          dueDate: editDate || null,
          dueTime: editDate ? (editTime || null) : null,
        });
      }

      function toggleEditTag(tag) {
        setEditTags((tags) => (tags.indexOf(tag) >= 0 ? tags.filter((entry) => entry !== tag) : uniqueTags(tags.concat([tag]))));
      }

      function addEditTag() {
        const tag = cleanTag(tagDraft);
        if (!tag) return;
        setEditTags((tags) => uniqueTags(tags.concat([tag])));
        setTagDraft('');
      }

      const important = hasTag(memo, '重要');
      const metaTags = memo.tags.slice(0, 3);
      const moreTags = memo.tags.length - metaTags.length;

      return h('article', {
        ref: rootRef,
        className: ['pmw-memo', memo.done ? 'is-done' : '', important ? 'is-important' : '', props.flash ? 'is-flash' : '', props.drawerOpen ? 'is-drawer' : ''].filter(Boolean).join(' '),
        onClick: (event) => {
          const target = event.target;
          if (target && typeof target.closest === 'function'
            && target.closest('button,input,textarea,select,a,label')) return;
          if (typeof window !== 'undefined' && window.getSelection && String(window.getSelection()).trim()) return;
          props.onDrawerToggle(memo.id);
        },
        tabIndex: props.editing ? -1 : 0,
        onKeyDown: (event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            props.onDrawerToggle(memo.id);
          }
        },
      },
      h('button', {
        type: 'button',
        className: 'pmw-check' + (memo.done ? ' is-on' : ''),
        role: 'checkbox',
        'aria-checked': memo.done,
        'aria-label': memo.done ? t('mark_open') : t('mark_done'),
        onClick: () => props.onToggle(memo.id),
      }, memo.done ? h(Icon, { name: 'check', size: 13, weight: 2.4 }) : null),

      h('div', { style: { minWidth: 0 } },
        props.editing
          ? h('div', { className: 'pmw-editbox' },
            h('textarea', {
              value: editText,
              autoFocus: true,
              onChange: (event) => setEditText(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Escape') { event.preventDefault(); props.onCancelEdit(); }
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save(); }
              },
            }),
            h('div', { className: 'pmw-editrow' },
              h('input', {
                className: 'pmw-input',
                type: 'date',
                value: editDate,
                onChange: (event) => { setEditDate(event.target.value); if (!event.target.value) setEditTime(''); },
                'aria-label': t('due_label'),
                style: { flex: '1 1 110px' },
              }),
              h('input', {
                className: 'pmw-input',
                type: 'time',
                value: editTime,
                onChange: (event) => setEditTime(event.target.value),
                'aria-label': t('time_label'),
                style: { flex: '0 0 86px' },
              }),
            ),
            h('div', { className: 'pmw-editrow' },
              normalizeTagList((Array.isArray(props.tagOptions) ? props.tagOptions : TAG_OPTIONS).concat(editTags), false).map((tag) => h(Chip, {
                key: tag,
                active: editTags.indexOf(tag) >= 0,
                tone: tagTone(tag),
                onClick: () => toggleEditTag(tag),
              }, tagLabel(tag))),
            ),
            h('div', { className: 'pmw-editrow' },
              h('input', {
                className: 'pmw-input',
                value: tagDraft,
                placeholder: t('tag_new_ph'),
                'aria-label': t('tag_new_ph'),
                onChange: (event) => setTagDraft(event.target.value),
                onKeyDown: (event) => { if (event.key === 'Enter') { event.preventDefault(); addEditTag(); } },
                style: { flex: '1 1 100px' },
              }),
              h('button', { type: 'button', className: 'pmw-btn is-ghost', onClick: addEditTag, disabled: !cleanTag(tagDraft) }, t('tag_add')),
            ),
            h('div', { className: 'pmw-editrow', style: { justifyContent: 'flex-end' } },
              h('button', { type: 'button', className: 'pmw-btn is-ghost', onClick: props.onCancelEdit }, t('cancel')),
              h('button', { type: 'button', className: 'pmw-btn is-primary', onClick: save }, t('save')),
            ),
          )
          : h('div', {
            className: 'pmw-memo-text',
            onDoubleClick: () => { props.onDrawerClose(); props.onEdit(memo.id); },
            title: t('edit'),
          }, memo.text),

        !props.editing && (metaTags.length || memo.dueDate || memo.pinned)
          ? h('div', { className: 'pmw-memo-meta' },
            memo.pinned ? h('span', { className: 'pmw-pin', title: t('pin') }, h(Icon, { name: 'pin', size: 11 })) : null,
            metaTags.map((tag) => h(TagChip, {
              key: tag,
              tag,
              onClick: () => props.onDrawerToggle(memo.id),
            })),
            moreTags > 0 ? h('span', { className: 'pmw-meta-text' }, `+${moreTags}`) : null,
            memo.dueDate ? h(DueBadge, { memo, now }) : null,
          )
          : null,

        !props.editing && props.drawerOpen
          ? h('div', { className: 'pmw-memo-drawer', onClick: (event) => event.stopPropagation() },
            h('button', {
              type: 'button',
              className: 'pmw-drawer-btn',
              title: t('send_to_chat'),
              onClick: () => { props.onDrawerClose(); props.onSend(memo.id); },
            }, h(Icon, { name: 'chat', size: 15 }), h('span', null, t('drawer_chat'))),
            h('button', {
              type: 'button',
              className: 'pmw-drawer-btn',
              title: t('more_actions'),
              'aria-expanded': menuOpen,
              onClick: () => setMenuOpen((open) => !open),
            }, h(Icon, { name: 'more', size: 15 }), h('span', null, t('drawer_more'))),
          )
          : null,
      ),

      menuOpen ? h('div', {
        className: 'pmw-menu',
        role: 'menu',
        style: { right: 92, top: 48 },
        onClick: (event) => event.stopPropagation(),
      },
        h('button', {
          type: 'button',
          role: 'menuitem',
          onClick: () => { setMenuOpen(false); props.onDrawerClose(); props.onSend(memo.id); },
        }, h(Icon, { name: 'chat', size: 13 }), t('send_to_chat')),
        h('button', {
          type: 'button',
          role: 'menuitem',
          onClick: () => { setMenuOpen(false); props.onDrawerClose(); props.onPin(memo.id); },
        }, h(Icon, { name: 'pin', size: 13 }), memo.pinned ? t('unpin') : t('pin')),
        h('button', {
          type: 'button',
          role: 'menuitem',
          onClick: () => { setMenuOpen(false); props.onDrawerClose(); props.onEdit(memo.id); },
        }, h(Icon, { name: 'edit', size: 13 }), t('edit')),
        h('button', {
          type: 'button',
          role: 'menuitem',
          className: 'is-danger',
          onClick: () => { setMenuOpen(false); props.onDrawerClose(); props.onDelete(memo.id); },
        }, h(Icon, { name: 'trash', size: 13 }), t('delete')),
      ) : null,
      );
    }

    /* -------------------------------------------------------------- memos view */

    function MemosView(props) {
      const now = props.now;
      const [showDone, setShowDone] = useState(false);
      const [drawerId, setDrawerId] = useState(null);
      const filtered = filterMemos(props.memos, props.filter, now);
      const groups = groupMemos(filtered, now);
      const total = props.memos.length;

      useEffect(() => {
        if (!props.highlightId) return;
        const target = props.memos.find((memo) => memo.id === props.highlightId);
        if (target && target.done) setShowDone(true);
      }, [props.highlightId, props.memos]);

      useEffect(() => {
        if (drawerId && !props.memos.some((memo) => memo.id === drawerId)) setDrawerId(null);
      }, [props.memos, drawerId]);

      const sections = [
        ['pinned', t('g_pinned')],
        ['overdue', t('g_overdue')],
        ['today', t('g_today')],
        ['week', t('g_week')],
        ['later', t('g_later')],
        ['someday', t('g_someday')],
      ];
      const visibleCount = sections.reduce((sum, [key]) => sum + groups[key].length, 0) + groups.done.length;

      return h('div', null,
        h('div', { className: 'pmw-filterbar', role: 'group', 'aria-label': t('menu_filter') },
          h('span', { className: 'pmw-tagbar-label' }, h(Icon, { name: 'filter', size: 10 }), t('menu_filter')),
          [['all', t('filter_all')], ['open', t('filter_open')], ['important', t('filter_important')], ['today', t('filter_today')]]
            .map(([value, label]) => h(Chip, {
              key: value,
              active: props.filter === value,
              onClick: () => props.onFilter(value),
            }, label)),
        ),

        total === 0
          ? h('div', { className: 'pmw-empty' },
            h(EmptyArt, { kind: 'memo' }),
            h('h4', null, t('empty_memo_title')),
            h('p', null, t('empty_memo_desc')),
          )
          : null,

        sections.map(([key, label]) => {
          const items = groups[key];
          if (!items.length) return null;
          return h('section', { key },
            h('div', { className: 'pmw-section' },
              h('span', null, label),
              h('span', { className: 'pmw-section-count' }, String(items.length)),
            ),
            items.map((memo) => h(MemoItem, {
              key: memo.id,
              memo,
              now,
              editing: props.editingId === memo.id,
              flash: props.highlightId === memo.id,
              onToggle: props.onToggle,
              onEdit: props.onEdit,
              onCancelEdit: props.onCancelEdit,
              onSave: props.onSave,
              onDelete: props.onDelete,
              onPin: props.onPin,
              onSend: props.onSend,
              tagOptions: props.tagOptions,
              drawerOpen: drawerId === memo.id,
              onDrawerToggle: (id) => setDrawerId((current) => (current === id ? null : id)),
              onDrawerClose: () => setDrawerId(null),
            })),
          );
        }),

        groups.done.length
          ? h('section', { key: 'done' },
            h('div', {
              className: 'pmw-section',
              style: { cursor: 'pointer' },
              role: 'button',
              tabIndex: 0,
              'aria-expanded': showDone,
              onClick: () => setShowDone((value) => !value),
              onKeyDown: (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setShowDone((value) => !value);
                }
              },
            },
            h('span', null, t('g_done')),
            h('span', { className: 'pmw-section-count' }, String(groups.done.length)),
            h('span', { style: { marginLeft: 2, display: 'inline-flex', color: 'var(--pmw-muted)' } },
              h(Icon, { name: showDone ? 'left' : 'right', size: 11, style: { transform: showDone ? 'rotate(-90deg)' : 'rotate(90deg)' } })),
            ),
            showDone
              ? groups.done.map((memo) => h(MemoItem, {
                key: memo.id,
                memo,
                now,
                editing: props.editingId === memo.id,
                flash: props.highlightId === memo.id,
                onToggle: props.onToggle,
                onEdit: props.onEdit,
                onCancelEdit: props.onCancelEdit,
                onSave: props.onSave,
                onDelete: props.onDelete,
                onPin: props.onPin,
                onSend: props.onSend,
              tagOptions: props.tagOptions,
                drawerOpen: drawerId === memo.id,
                onDrawerToggle: (id) => setDrawerId((current) => (current === id ? null : id)),
                onDrawerClose: () => setDrawerId(null),
              }))
              : null,
          )
          : null,

        total > 0 && visibleCount === 0
          ? h('div', { className: 'pmw-empty' },
            h(EmptyArt, { kind: 'memo' }),
            h('h4', null, t('filter_empty')),
            h('button', {
              type: 'button',
              className: 'pmw-btn is-ghost',
              style: { marginTop: 8 },
              onClick: () => props.onFilter('all'),
            }, t('filter_all')),
          )
          : null,
      );
    }

    /* ------------------------------------------------------------ calendar view */

    function monthCells(cursor) {
      const first = startOfMonth(cursor);
      const start = startOfWeek(first);
      const out = [];
      for (let index = 0; index < 42; index += 1) {
        const date = addDays(start, index);
        out.push({ date, inMonth: date.getMonth() === cursor.getMonth() });
      }
      return out;
    }

    function CalendarView(props) {
      const now = props.now;
      const [cursor, setCursor] = useState(() => startOfMonth(now));
      const [selected, setSelected] = useState(() => ymd(now));

      useEffect(() => {
        if (!props.focusDate) return;
        const date = parseYmd(props.focusDate);
        if (!date) return;
        setSelected(props.focusDate);
        setCursor(startOfMonth(date));
        if (typeof props.onFocusApplied === 'function') props.onFocusApplied();
      }, [props.focusDate]);

      const cells = useMemo(() => monthCells(cursor), [cursor]);
      const selectedDate = parseYmd(selected) || now;
      const entries = useMemo(() => dayEntries(props.memos, [], selected), [props.memos, selected]);
      const todayText = ymd(now);

      const dotsByDate = useMemo(() => {
        const map = {};
        for (const cell of cells) {
          const text = ymd(cell.date);
          map[text] = [];
        }
        for (const memo of props.memos) {
          if (!memo.dueDate || !map[memo.dueDate]) continue;
          map[memo.dueDate].push(memo.dueDate < todayText && !memo.done ? 'warn' : 'memo');
        }
        return map;
      }, [cells, props.memos, todayText]);

      function shiftMonth(step) {
        const next = new Date(cursor.getFullYear(), cursor.getMonth() + step, 1);
        setCursor(next);
        const day = Math.min(selectedDate.getDate(), daysInMonth(next.getFullYear(), next.getMonth()));
        setSelected(ymd(new Date(next.getFullYear(), next.getMonth(), day)));
      }

      function goToday() {
        setCursor(startOfMonth(now));
        setSelected(todayText);
      }

      function selectCell(date) {
        setSelected(ymd(date));
        if (date.getMonth() !== cursor.getMonth()) setCursor(startOfMonth(date));
      }

      const monthLabel = LANG === 'zh'
        ? `${cursor.getFullYear()} 年 ${cursor.getMonth() + 1} 月`
        : cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      return h('div', null,
        h('div', { className: 'pmw-cal-head' },
          h('div', { className: 'pmw-cal-title' },
            monthLabel,
            h('small', null, selectedDate.getMonth() === cursor.getMonth()
              ? weekdayLabel(selectedDate)
              : `${monthDayLabel(selectedDate)} ${weekdayLabel(selectedDate)}`),
          ),
          h('button', { type: 'button', className: 'pmw-iconbtn', onClick: goToday, title: t('cal_today'), 'aria-label': t('cal_today') }, h(Icon, { name: 'sun', size: 14 })),
          h('button', { type: 'button', className: 'pmw-iconbtn', onClick: () => shiftMonth(-1), title: t('week_prev'), 'aria-label': t('week_prev') }, h(Icon, { name: 'left', size: 15 })),
          h('button', { type: 'button', className: 'pmw-iconbtn', onClick: () => shiftMonth(1), title: t('week_next'), 'aria-label': t('week_next') }, h(Icon, { name: 'right', size: 15 })),
        ),

        h('div', { className: 'pmw-cal-grid' },
          WEEKDAY_CN.map((day, index) => h('div', { key: 'dow' + index, className: 'pmw-cal-dow' }, LANG === 'zh' ? '周' + day : WEEKDAY_EN[index].slice(0, 1))),
          cells.map((cell) => {
            const text = ymd(cell.date);
            const dots = (dotsByDate[text] || []).slice(0, 3);
            const classes = ['pmw-cal-cell'];
            if (!cell.inMonth) classes.push('is-out');
            if (text === todayText) classes.push('is-today');
            if (text === selected) classes.push('is-selected');
            return h('button', {
              key: text,
              type: 'button',
              className: classes.join(' '),
              onClick: () => selectCell(cell.date),
              'aria-label': `${monthDayLabel(cell.date)} ${weekdayLabel(cell.date)}`,
            },
            h('span', { className: 'pmw-cal-num' }, String(cell.date.getDate())),
            h('span', { className: 'pmw-dots' },
              dots.map((kind, index) => h('span', {
                key: kind + index,
                className: 'pmw-dot' + (kind === 'event' ? ' is-teal' : kind === 'warn' ? ' is-warn' : ''),
              })),
            ));
          }),
        ),

        h('div', { className: 'pmw-agenda' },
          h('div', { className: 'pmw-agenda-head' },
            h('span', { className: 'pmw-agenda-date' }, `${monthDayLabel(selectedDate)} ${weekdayLabel(selectedDate)}`),
            h('span', { className: 'pmw-agenda-count' }, `${entries.length}${LANG === 'zh' ? ' 项' : ''}`),
          ),

          entries.length
            ? entries.map((entry) => {
              const done = entry.done;
              return h('div', {
                key: entry.id,
                className: 'pmw-agenda-item' + (done ? ' is-done' : ''),
                style: { cursor: 'pointer' },
                onClick: () => props.onOpenMemo(entry.memoId),
              },
              h('div', { className: 'pmw-agenda-time' }, entry.time || t('due_all_day')),
              h('div', { style: { minWidth: 0 } },
                h('div', { className: 'pmw-agenda-title' }, entry.title),
                h('div', { className: 'pmw-agenda-sub' },
                  entry.tags.slice(0, 3).map((tag) => h(TagChip, { key: tag, tag })),
                ),
              ),
              h('button', {
                type: 'button',
                className: 'pmw-check' + (done ? ' is-on' : ''),
                style: { width: 20, height: 20, marginTop: 0 },
                role: 'checkbox',
                'aria-checked': done,
                'aria-label': done ? t('mark_open') : t('mark_done'),
                onClick: (event) => { event.stopPropagation(); props.onToggleEntry(entry); },
              }, done ? h(Icon, { name: 'check', size: 11, weight: 2.4 }) : null),
              );
            })
            : h('div', { className: 'pmw-empty', style: { padding: '14px 10px 6px' } },
              h(EmptyArt, { kind: 'calendar' }),
              h('h4', null, t('cal_no_events')),
              h('p', null, t('cal_no_events_desc')),
            ),
        ),
      );
    }

    /* --------------------------------------------------------------- tag sheet */

    function TagSheet(props) {
      const [draft, setDraft] = useState('');
      const [editing, setEditing] = useState(null);
      const [editValue, setEditValue] = useState('');

      useEffect(() => {
        if (!props.open) return;
        setDraft('');
        setEditing(null);
        setEditValue('');
      }, [props.open]);

      useEffect(() => {
        if (!props.open) return;
        const onKey = (event) => { if (event.key === 'Escape') props.onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
      }, [props.open, props.onClose]);

      if (!props.open) return null;

      const counts = {};
      for (const memo of props.memos || []) {
        for (const tag of memo.tags || []) counts[tag] = (counts[tag] || 0) + 1;
      }
      const allTags = normalizeTagList((props.tagOptions || []).concat(Object.keys(counts)), false);
      const quick = new Set(props.tagOptions || []);

      function add() {
        const tag = cleanTag(draft);
        if (!tag) return;
        props.onAdd(tag);
        setDraft('');
      }

      function startRename(tag) {
        setEditing(tag);
        setEditValue(tag);
      }

      function saveRename() {
        if (!editing) return;
        props.onRename(editing, editValue);
        setEditing(null);
        setEditValue('');
      }

      function remove(tag) {
        if (!window.confirm(t('tag_delete_confirm', { tag }))) return;
        props.onDelete(tag);
      }

      return h('div', {
        className: 'pmw-backdrop',
        onMouseDown: (event) => { if (event.target === event.currentTarget) props.onClose(); },
      },
      h('div', { className: 'pmw-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('manage_tags') },
        h('div', { className: 'pmw-sheet-grip' }),
        h('div', { className: 'pmw-sheet-head' },
          h('div', { className: 'pmw-spark', style: { width: 26, height: 26, borderRadius: 9 } }, h(Icon, { name: 'tag', size: 14 })),
          h('h3', null, t('manage_tags')),
          h('button', { type: 'button', className: 'pmw-iconbtn', onClick: props.onClose, 'aria-label': t('close'), title: t('close') }, h(Icon, { name: 'close', size: 15 })),
        ),
        h('div', { className: 'pmw-sheet-body' },
          h('div', { className: 'pmw-sheet-hint', style: { marginTop: 0 } }, t('tag_manage_hint')),
          allTags.length
            ? allTags.map((tag) => h('div', { key: tag, className: 'pmw-tagrow' },
              h('div', { className: 'pmw-tagrow-main' },
                editing === tag
                  ? h('input', {
                    className: 'pmw-input',
                    value: editValue,
                    autoFocus: true,
                    onChange: (event) => setEditValue(event.target.value),
                    onKeyDown: (event) => {
                      if (event.key === 'Enter') { event.preventDefault(); saveRename(); }
                      if (event.key === 'Escape') setEditing(null);
                    },
                    style: { flex: '1 1 100px' },
                  })
                  : h(TagChip, { tag }),
                h('span', { className: 'pmw-tag-count' }, t('tag_in_use', { n: counts[tag] || 0 })),
                h('span', { className: 'pmw-badge' + (quick.has(tag) ? '' : ' is-local') }, quick.has(tag) ? t('tag_quick') : t('tag_used_only')),
              ),
              h('div', { className: 'pmw-tag-actions' },
                editing === tag
                  ? h('button', { type: 'button', className: 'pmw-btn is-ghost', onClick: saveRename }, t('save'))
                  : h('button', { type: 'button', className: 'pmw-iconbtn', title: t('tag_rename'), 'aria-label': t('tag_rename'), onClick: () => startRename(tag) }, h(Icon, { name: 'edit', size: 14 })),
                editing === tag
                  ? h('button', { type: 'button', className: 'pmw-btn is-ghost', onClick: () => setEditing(null) }, t('cancel'))
                  : h('button', { type: 'button', className: 'pmw-iconbtn', title: t('tag_delete'), 'aria-label': t('tag_delete'), onClick: () => remove(tag) }, h(Icon, { name: 'trash', size: 14 })),
              ),
            ))
            : h('div', { className: 'pmw-empty', style: { padding: '10px 8px' } }, h('p', { style: { margin: 0 } }, t('tag_empty'))),
          h('div', { className: 'pmw-tag-add' },
            h('input', {
              className: 'pmw-input',
              value: draft,
              placeholder: t('tag_new_ph'),
              'aria-label': t('tag_new_ph'),
              onChange: (event) => setDraft(event.target.value),
              onKeyDown: (event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } },
            }),
            h('button', { type: 'button', className: 'pmw-btn is-primary', onClick: add, disabled: !cleanTag(draft) }, t('tag_add')),
          ),
        ),
        h('div', { className: 'pmw-sheet-foot' },
          h('button', { type: 'button', className: 'pmw-btn is-ghost', onClick: props.onClose }, t('close')),
        ),
      ));
    }

    /* ---------------------------------------------------------------- AI sheet */

    function AISheet(props) {
      const now = props.now;
      const initialText = String(props.initialText || '');
      const [text, setText] = useState('');
      const [loading, setLoading] = useState(false);
      const [result, setResult] = useState(null);
      const [selected, setSelected] = useState({});
      const [error, setError] = useState('');
      const areaRef = useRef(null);
      const runId = useRef(0);

      useEffect(() => {
        runId.current += 1;
        if (!props.open) return;
        setText(initialText);
        setResult(null);
        setSelected({});
        setError('');
        setLoading(false);
        const focusTimer = setTimeout(() => { if (areaRef.current) areaRef.current.focus(); }, 60);
        const runTimer = props.autoRun && initialText.trim()
          ? setTimeout(() => { run(initialText); }, 90)
          : null;
        return () => {
          clearTimeout(focusTimer);
          if (runTimer) clearTimeout(runTimer);
        };
      }, [props.open, initialText]);

      useEffect(() => {
        if (!props.open) return;
        const onKey = (event) => { if (event.key === 'Escape') props.onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
      }, [props.open, props.onClose]);

      if (!props.open) return null;

      const title = t('bulk_title');
      const description = t('bulk_desc');
      const placeholder = t('bulk_placeholder');

      async function run(textArg) {
        const source = String(textArg !== undefined ? textArg : text).trim();
        if (!source) { setError(t('cal_ai_need_text')); return; }
        const id = ++runId.current;
        setLoading(true);
        setError('');
        try {
          const parsed = await parseWithAI(source, now);
          if (id !== runId.current) return;
          const nextSelected = {};
          parsed.memos.forEach((memo, index) => { nextSelected['m' + index] = true; });
          parsed.events.forEach((event, index) => { nextSelected['e' + index] = true; });
          setResult(parsed);
          setSelected(nextSelected);
          setError(parsed.error ? String(parsed.error) : '');
        } catch (err) {
          if (id === runId.current) setError(String((err && err.message) || err));
        } finally {
          if (id === runId.current) setLoading(false);
        }
      }

      const selectedCount = result
        ? result.memos.filter((memo, index) => selected['m' + index]).length + result.events.filter((event, index) => selected['e' + index]).length
        : 0;

      function apply() {
        if (!result || !selectedCount) return;
        const memos = result.memos.filter((memo, index) => selected['m' + index]);
        const events = result.events.filter((event, index) => selected['e' + index]);
        props.onApply({ memos, events, engine: result.engine });
        props.onClose();
      }

      return h('div', {
        className: 'pmw-backdrop',
        onMouseDown: (event) => { if (event.target === event.currentTarget) props.onClose(); },
      },
      h('div', { className: 'pmw-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('div', { className: 'pmw-sheet-grip' }),
        h('div', { className: 'pmw-sheet-head' },
          h('div', { className: 'pmw-spark', style: { width: 26, height: 26, borderRadius: 9 } }, h(Icon, { name: 'sparkles', size: 14 })),
          h('h3', null, title),
          h('button', { type: 'button', className: 'pmw-iconbtn', onClick: props.onClose, 'aria-label': t('close'), title: t('close') }, h(Icon, { name: 'close', size: 15 })),
        ),
        h('div', { className: 'pmw-sheet-body' },
          h('textarea', {
            ref: areaRef,
            value: text,
            placeholder,
            'aria-label': title,
            onChange: (event) => setText(event.target.value),
          }),
          h('div', { className: 'pmw-sheet-hint' }, description),
          error && !result ? h('div', { className: 'pmw-sheet-hint', style: { color: 'var(--pmw-danger)' } }, error) : null,
          loading
            ? h('div', null,
              h('div', { className: 'pmw-shimmer', style: { width: '82%' } }),
              h('div', { className: 'pmw-shimmer', style: { width: '64%' } }),
              h('div', { className: 'pmw-shimmer', style: { width: '74%' } }),
            )
            : result
              ? h('div', null,
                h('div', { className: 'pmw-editrow', style: { margin: '2px 0 6px' } },
                  result.memos.length + result.events.length
                    ? h(Chip, { static: true, icon: 'check', active: true }, t('ai_items', { n: result.memos.length + result.events.length }))
                    : h('span', { className: 'pmw-meta-text' }, t('cal_ai_none')),
                  h('span', { style: { flex: 1 } }),
                  h('span', { className: 'pmw-badge' + (result.engine === 'ai' ? '' : ' is-local') }, result.engine === 'ai' ? t('cal_ai_engine_ai') : t('cal_ai_engine_local')),
                ),
                result.error ? h('div', { className: 'pmw-sheet-hint', style: { color: 'var(--pmw-warn)', margin: '0 0 6px' } }, t('ai_parse_failed')) : null,
                result.memos.map((memo, index) => {
                  const key = 'm' + index;
                  return h('div', {
                    key,
                    className: 'pmw-result' + (selected[key] ? '' : ' is-off'),
                    onClick: () => setSelected((value) => ({ ...value, [key]: !value[key] })),
                  },
                  h('button', {
                    type: 'button',
                    className: 'pmw-check' + (selected[key] ? ' is-on' : ''),
                    role: 'checkbox',
                    'aria-checked': !!selected[key],
                    'aria-label': memo.text,
                    onClick: (event) => { event.stopPropagation(); setSelected((value) => ({ ...value, [key]: !value[key] })); },
                  }, selected[key] ? h(Icon, { name: 'check', size: 11, weight: 2.4 }) : null),
                  h('div', { style: { minWidth: 0 } },
                    h('div', { className: 'pmw-result-title' }, memo.text),
                    h('div', { className: 'pmw-result-meta' },
                      h('span', { className: 'pmw-meta-text' }, t('cal_ai_result_memo')),
                      memo.tags.map((tag) => h(TagChip, { key: tag, tag })),
                      memo.dueDate ? h('span', { className: 'pmw-meta-text' }, `${memo.dueDate}${memo.dueTime ? ' ' + memo.dueTime : ''}`) : null,
                    ),
                  ),
                  );
                }),
                result.events.map((event, index) => {
                  const key = 'e' + index;
                  return h('div', {
                    key,
                    className: 'pmw-result' + (selected[key] ? '' : ' is-off'),
                    onClick: () => setSelected((value) => ({ ...value, [key]: !value[key] })),
                  },
                  h('button', {
                    type: 'button',
                    className: 'pmw-check' + (selected[key] ? ' is-on' : ''),
                    role: 'checkbox',
                    'aria-checked': !!selected[key],
                    'aria-label': event.title,
                    onClick: (clickEvent) => { clickEvent.stopPropagation(); setSelected((value) => ({ ...value, [key]: !value[key] })); },
                  }, selected[key] ? h(Icon, { name: 'check', size: 11, weight: 2.4 }) : null),
                  h('div', { style: { minWidth: 0 } },
                    h('div', { className: 'pmw-result-title' }, event.title),
                    h('div', { className: 'pmw-result-meta' },
                      h('span', { className: 'pmw-meta-text' }, t('cal_ai_result_event')),
                      event.tags.map((tag) => h(TagChip, { key: tag, tag })),
                      h('span', { className: 'pmw-meta-text' }, `${event.date}${event.time ? ' ' + event.time : ' ' + t('due_all_day')}`),
                    ),
                  ),
                  );
                }),
              )
              : h('div', { className: 'pmw-empty', style: { padding: '10px 8px 0' } },
                h('p', { style: { margin: 0 } }, t('cal_ai_empty')),
              ),
        ),
        h('div', { className: 'pmw-sheet-foot' },
          h('button', {
            type: 'button',
            className: 'pmw-btn is-ghost',
            disabled: !text.trim(),
            onClick: () => { if (text.trim() && props.onSaveOne) props.onSaveOne(text.trim()); },
          }, t('save_one')),
          h('button', {
            type: 'button',
            className: 'pmw-btn',
            onClick: () => run(),
            disabled: loading,
          }, h(Icon, { name: 'sparkles', size: 12 }), loading ? t('bulk_running') : t('bulk_run')),
          h('button', {
            type: 'button',
            className: 'pmw-btn is-primary',
            onClick: apply,
            disabled: !selectedCount,
          }, t('bulk_apply_n', { n: selectedCount })),
        ),
      ));
    }

    /* -------------------------------------------------------------- weekly view */

    function WeekNav(props) {
      return h('div', { className: 'pmw-week-nav' },
        h('div', { className: 'pmw-week-range' },
          props.title,
          h('small', null, props.sub),
        ),
        h('button', {
          type: 'button',
          className: 'pmw-iconbtn',
          onClick: props.onPrev,
          title: t('week_prev'),
          'aria-label': t('week_prev'),
        }, h(Icon, { name: 'left', size: 15 })),
        h('button', {
          type: 'button',
          className: 'pmw-iconbtn',
          onClick: props.onNext,
          disabled: props.nextDisabled,
          title: t('week_next'),
          'aria-label': t('week_next'),
          style: props.nextDisabled ? { opacity: 0.35, cursor: 'default' } : undefined,
        }, h(Icon, { name: 'right', size: 15 })),
      );
    }

    function ReportCard(props) {
      const report = props.report;
      const loading = props.loading;
      const [copied, setCopied] = useState(false);

      async function copy() {
        const text = reportToMarkdown(report, props.range);
        const fallback = () => {
          const area = document.createElement('textarea');
          area.value = text;
          area.style.position = 'fixed';
          area.style.opacity = '0';
          document.body.appendChild(area);
          area.select();
          const ok = document.execCommand('copy');
          document.body.removeChild(area);
          return ok;
        };
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
          } else if (!fallback()) {
            throw new Error('copy rejected');
          }
          setCopied(true);
          props.onToast(t('copied'));
          setTimeout(() => setCopied(false), 2000);
        } catch (err) {
          try {
            if (!fallback()) throw new Error('copy rejected');
            setCopied(true);
            props.onToast(t('copied'));
            setTimeout(() => setCopied(false), 2000);
          } catch (err2) {
            props.onToast(t('copy_failed'));
          }
        }
      }

      if (loading) {
        return h('div', { className: 'pmw-report' },
          h('div', { className: 'pmw-report-head' },
            h('div', { className: 'pmw-spark' }, h(Icon, { name: 'sparkles', size: 15 })),
            h('div', { style: { flex: 1 } },
              h('div', { className: 'pmw-report-title' }, t('ai_report')),
              h('div', { className: 'pmw-report-sub' }, t('ai_generating')),
            ),
          ),
          h('div', { style: { padding: '10px 2px 2px' } },
            h('div', { className: 'pmw-shimmer', style: { width: '88%', height: 14 } }),
            h('div', { className: 'pmw-shimmer', style: { width: '96%' } }),
            h('div', { className: 'pmw-shimmer', style: { width: '72%' } }),
            h('div', { className: 'pmw-shimmer', style: { width: '64%' } }),
          ),
        );
      }

      if (!report) {
        return h('div', { className: 'pmw-report' },
          h('div', { className: 'pmw-report-head' },
            h('div', { className: 'pmw-spark' }, h(Icon, { name: 'sparkles', size: 15 })),
            h('div', { style: { flex: 1 } },
              h('div', { className: 'pmw-report-title' }, t('ai_report')),
              h('div', { className: 'pmw-report-sub' }, t('ai_empty_title')),
            ),
          ),
          h('div', { className: 'pmw-idle' },
            h(EmptyArt, { kind: 'weekly' }),
            h('p', null, t('ai_empty_desc')),
            h('button', { type: 'button', className: 'pmw-btn is-primary', onClick: props.onGenerate }, h(Icon, { name: 'sparkles', size: 12 }), t('ai_generate')),
          ),
        );
      }

      const sections = [
        ['done', t('report_done'), 'done'],
        ['progress', t('report_progress'), 'progress'],
        ['risks', t('report_risks'), 'risks'],
        ['next', t('report_next'), 'next'],
      ];

      return h('div', { className: 'pmw-report' },
        h('div', { className: 'pmw-report-head' },
          h('div', { className: 'pmw-spark' }, h(Icon, { name: 'sparkles', size: 15 })),
          h('div', { style: { flex: 1 } },
            h('div', { className: 'pmw-report-title' }, t('ai_report')),
            h('div', { className: 'pmw-report-sub' }, `${report.generatedAt ? relativeCreated(report.generatedAt, new Date()) : ''} · ${props.rangeLabel}`),
          ),
          h('span', { className: 'pmw-badge' + (report.engine === 'ai' ? '' : ' is-local') }, report.engine === 'ai' ? t('report_engine_ai') : t('report_engine_local')),
        ),
        report.error ? h('div', { className: 'pmw-sheet-hint', style: { color: 'var(--pmw-warn)', marginTop: 8 } }, t('ai_failed')) : null,
        h('div', { className: 'pmw-report-headline' }, report.headline),
        report.summary ? h('div', { className: 'pmw-report-summary' }, report.summary) : null,
        sections.map(([key, label, tone]) => {
          const items = safeArray(report[key]);
          if (!items.length) return null;
          return h('div', { key, className: 'pmw-report-section' },
            h('div', { className: 'pmw-report-label' }, h(Icon, { name: tone === 'risks' ? 'alert' : tone === 'next' ? 'arrow' : 'check', size: 11 }), label),
            h('ul', { className: 'pmw-report-list' + (tone === 'risks' ? ' is-warn' : tone === 'progress' ? ' is-teal' : '') },
              items.map((item, index) => h('li', { key: index }, item)),
            ),
          );
        }),
        h('div', { className: 'pmw-report-actions' },
          h('button', { type: 'button', className: 'pmw-btn', onClick: props.onGenerate }, h(Icon, { name: 'refresh', size: 12 }), t('ai_regenerate')),
          h('button', { type: 'button', className: 'pmw-btn is-ghost', onClick: copy }, h(Icon, { name: copied ? 'check' : 'copy', size: 12 }), copied ? t('copied') : t('ai_copy')),
        ),
      );
    }

    function reportToMarkdown(report, range) {
      const lines = [
        `# ${LANG === 'zh' ? '周报' : 'Weekly report'} ${range.start} ~ ${range.end}`,
        '',
        `## ${report.headline}`,
        '',
        report.summary || '',
        '',
      ];
      const groups = [
        [t('report_done'), report.done],
        [t('report_progress'), report.progress],
        [t('report_risks'), report.risks],
        [t('report_next'), report.next],
      ];
      for (const [label, items] of groups) {
        if (!items || !items.length) continue;
        lines.push(`## ${label}`);
        for (const item of items) lines.push(`- ${item}`);
        lines.push('');
      }
      return lines.join('\n').trim() + '\n';
    }

    function WeeklyView(props) {
      const now = props.now;
      const currentWeek = startOfWeek(now);
      const [anchor, setAnchor] = useState(currentWeek);
      const [loading, setLoading] = useState(false);
      const key = reportKey(anchor);
      const report = props.reports ? props.reports[key] : null;
      const range = weekRange(anchor);
      const stats = weekStats(props.memos, props.events, anchor, now);
      const isThisWeek = ymd(anchor) === ymd(currentWeek);
      const rangeLabel = `${range.start.slice(5).replace('-', '/')} - ${range.end.slice(5).replace('-', '/')}`;

      const generate = useCallback(async () => {
        if (loading) return;
        setLoading(true);
        try {
          const next = await generateReport(props.memos, props.events, anchor, now);
          props.onSaveReport(key, next);
          if (next.error) props.onToast(t('ai_failed'));
        } catch (err) {
          props.onToast(String((err && err.message) || err));
        } finally {
          setLoading(false);
        }
      }, [loading, anchor, props.memos, props.events, props.onSaveReport, now]);

      function shift(step) {
        const next = addDays(anchor, step * 7);
        if (step > 0 && next > currentWeek) return;
        setAnchor(next);
      }

      const title = isThisWeek ? t('week_this') : `${monthDayLabel(anchor)} ${weekdayLabel(anchor)}`;
      const hasData = stats.done.length + stats.created.length + stats.open.length + stats.events.length > 0;

      return h('div', null,
        h(WeekNav, {
          title,
          sub: rangeLabel,
          onPrev: () => shift(-1),
          onNext: () => shift(1),
          nextDisabled: isThisWeek,
        }),

        h('div', { className: 'pmw-stat-grid' },
          h('div', { className: 'pmw-stat' }, h('div', { className: 'pmw-stat-num' }, String(stats.done.length)), h('div', { className: 'pmw-stat-label' }, t('stat_done'))),
          h('div', { className: 'pmw-stat is-teal' }, h('div', { className: 'pmw-stat-num' }, String(stats.created.length)), h('div', { className: 'pmw-stat-label' }, t('stat_created'))),
          h('div', { className: 'pmw-stat' }, h('div', { className: 'pmw-stat-num' }, String(stats.open.length)), h('div', { className: 'pmw-stat-label' }, t('stat_open'))),
          h('div', { className: 'pmw-stat is-warn' }, h('div', { className: 'pmw-stat-num' }, String(stats.important.length)), h('div', { className: 'pmw-stat-label' }, t('stat_important'))),
        ),

        !hasData && !report && !loading
          ? h('div', { className: 'pmw-empty', style: { paddingTop: 18 } },
            h(EmptyArt, { kind: 'weekly' }),
            h('h4', null, t('weekly_title')),
            h('p', null, t('ai_no_data')),
          )
          : h(ReportCard, {
            report,
            loading,
            range,
            rangeLabel,
            onGenerate: generate,
            onToast: props.onToast,
          }),
      );
    }

    /* --------------------------------------------------------------------- app */

    const TABS = [
      { id: 'memos', label: 'tab_memos', icon: 'note' },
      { id: 'calendar', label: 'tab_calendar', icon: 'calendar' },
      { id: 'weekly', label: 'tab_weekly', icon: 'spark' },
    ];

    function Workbench(props) {
      const [store, setStore, saveError, syncNotice] = useStore();
      const now = useNow(60_000);
      const inputDraft = typeof props.useInput === 'function'
        ? props.useInput((state) => (state && typeof state.draft === 'string' ? state.draft : ''))
        : '';
      const [tab, setTab] = useState(() => (store.ui && (store.ui.tab === 'calendar' || store.ui.tab === 'weekly') ? store.ui.tab : 'memos'));
      const [filter, setFilter] = useState(() => (store.ui && store.ui.filter) || 'all');
      const [draft, setDraft] = useState('');
      const [editingId, setEditingId] = useState(null);
      const [highlightId, setHighlightId] = useState(null);
      const [toast, setToast] = useState(null);
      const [menuOpen, setMenuOpen] = useState(false);
      const [aiOpen, setAiOpen] = useState(false);
      const [tagOpen, setTagOpen] = useState(false);
      const [bulk, setBulk] = useState(null);
      const [calendarFocus, setCalendarFocus] = useState(null);
      const toastTimer = useRef(null);
      const fileRef = useRef(null);
      const bodyRef = useRef(null);

      useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
      useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; }, [tab]);
      useEffect(() => { if (saveError) showToast(t('save_failed'), undefined, true); }, [saveError]);
      useEffect(() => {
        if (!syncNotice) return;
        if (syncNotice.kind === 'conflict') showToast(t('sync_conflict'), undefined, true);
        else showToast(t('sync_offline'), undefined, true);
      }, [syncNotice]);

      function showToast(text, action, force) {
        if (!action && !force && toast && toast.action) return;
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ id: Date.now(), text, action });
        toastTimer.current = setTimeout(() => setToast(null), 5000);
      }

      function switchTab(next) {
        setTab(next);
        setEditingId(null);
        setStore((current) => ({ ...current, ui: { ...current.ui, tab: next } }));
      }

      function changeFilter(next) {
        setFilter(next);
        setStore((current) => ({ ...current, ui: { ...current.ui, filter: next } }));
      }

      function addMemo(input) {
        const timestamp = new Date().toISOString();
        const memo = normalizeMemo({
          text: input.text,
          tags: input.tags,
          dueDate: input.dueDate,
          dueTime: input.dueTime,
          createdAt: timestamp,
          updatedAt: timestamp,
          ai: input.ai === true,
        });
        if (!memo) return;
        setStore((current) => ({ ...current, memos: [memo].concat(current.memos) }));
        setDraft('');
        if (filter === 'important' && !hasTag(memo, '重要')) changeFilter('all');
        if (filter === 'today' && memo.dueDate !== ymd(now)) changeFilter('all');
        if (bodyRef.current) bodyRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        showToast(t('saved'));
      }

      function toggleMemo(id) {
        const timestamp = new Date().toISOString();
        const target = store.memos.find((memo) => memo.id === id);
        const completing = !!target && !target.done;
        setStore((current) => ({
          ...current,
          memos: current.memos.map((memo) => memo.id === id
            ? { ...memo, done: !memo.done, doneAt: memo.done ? null : timestamp, updatedAt: timestamp }
            : memo),
        }));
        if (completing && !(toast && toast.action)) {
          showToast(t('g_done'), {
            label: t('undo'),
            run: () => {
              setStore((current) => ({
                ...current,
                memos: current.memos.map((memo) => memo.id === id
                  ? { ...memo, done: false, doneAt: null, updatedAt: new Date().toISOString() }
                  : memo),
              }));
              setToast(null);
            },
          });
        }
      }

      function saveMemo(id, patch) {
        const timestamp = new Date().toISOString();
        setStore((current) => ({
          ...current,
          memos: current.memos.map((memo) => memo.id === id ? { ...memo, ...patch, updatedAt: timestamp } : memo),
        }));
        setEditingId(null);
      }

      function deleteMemo(id) {
        const target = store.memos.find((memo) => memo.id === id);
        if (!target) return;
        setStore((current) => ({ ...current, memos: current.memos.filter((memo) => memo.id !== id) }));
        if (editingId === id) setEditingId(null);
        showToast(t('deleted'), {
          label: t('undo'),
          run: () => {
            setStore((current) => ({ ...current, memos: [target].concat(current.memos) }));
            setToast(null);
          },
        });
      }

      function pinMemo(id) {
        setStore((current) => ({
          ...current,
          memos: current.memos.map((memo) => memo.id === id ? { ...memo, pinned: !memo.pinned } : memo),
        }));
      }

      function addTagOption(value) {
        const tag = cleanTag(value);
        if (!tag) return;
        setStore((current) => ({
          ...current,
          tagOptions: normalizeTagList([...(current.tagOptions || DEFAULT_TAGS), tag], true),
        }));
        showToast(t('tag_changed'));
      }

      function renameTagOption(fromValue, toValue) {
        const from = cleanTag(fromValue);
        const to = cleanTag(toValue);
        if (!from || !to || from === to) return;
        setStore((current) => {
          const tagOptions = normalizeTagList((current.tagOptions || DEFAULT_TAGS).map((tag) => (tag === from ? to : tag)), true);
          if (tagOptions.indexOf(to) < 0) tagOptions.push(to);
          const timestamp = new Date().toISOString();
          return {
            ...current,
            tagOptions,
            memos: current.memos.map((memo) => (
              memo.tags.indexOf(from) >= 0
                ? { ...memo, tags: uniqueTags(memo.tags.map((tag) => (tag === from ? to : tag))), updatedAt: timestamp }
                : memo
            )),
          };
        });
        showToast(t('tag_changed'));
      }

      function deleteTagOption(tagValue) {
        const tag = cleanTag(tagValue);
        if (!tag) return;
        setStore((current) => ({
          ...current,
          tagOptions: (current.tagOptions || DEFAULT_TAGS).filter((entry) => entry !== tag),
          memos: current.memos.map((memo) => (
            memo.tags.indexOf(tag) >= 0
              ? { ...memo, tags: memo.tags.filter((entry) => entry !== tag), updatedAt: new Date().toISOString() }
              : memo
          )),
        }));
        showToast(t('tag_changed'));
      }

      function toggleEntry(entry) {
        if (entry && entry.memoId) toggleMemo(entry.memoId);
      }

      function openMemo(id) {
        switchTab('memos');
        changeFilter('all');
        setHighlightId(id);
        setTimeout(() => setHighlightId(null), 1800);
      }

      function sendMemoToChat(id) {
        const memo = store.memos.find((entry) => entry.id === id);
        if (!memo) return;
        const prompt = buildMemoPrompt(memo, now);
        const originalDraft = String(inputDraft || '');
        const existing = originalDraft.trim();
        const next = existing ? existing.replace(/\s+$/, '') + '\n\n' + prompt : prompt;
        try {
          if (!props.inputActions
            || typeof props.inputActions.setDraft !== 'function'
            || typeof props.inputActions.submit !== 'function') {
            throw new Error('no-chat');
          }
          props.inputActions.setDraft(next);
          props.inputActions.submit();
          showToast(t('sent_to_chat'));
        } catch (err) {
          try { props.inputActions.setDraft(originalDraft); } catch (err2) { /* no chat */ }
          copyText(prompt).then((ok) => {
            showToast(ok ? t('copied_to_clipboard') : t('no_chat'));
          });
        }
      }

      function applyAI(result, extraTags) {
        const timestamp = new Date().toISOString();
        const sharedTags = uniqueTags(extraTags || []);
        const memos = (result.memos || []).map((memo) => normalizeMemo({
          text: memo.text,
          tags: uniqueTags(sharedTags.concat(memo.tags || [])),
          dueDate: memo.dueDate,
          dueTime: memo.dueTime,
          createdAt: timestamp,
          updatedAt: timestamp,
          ai: true,
        })).filter(Boolean);
        const events = (result.events || []).map((event) => normalizeEvent({
          title: event.title,
          date: event.date,
          time: event.time,
          tags: uniqueTags(sharedTags.concat(event.tags || [])),
          note: event.note,
          source: 'ai',
          createdAt: timestamp,
        })).filter(Boolean);
        const count = memos.length + events.length;
        if (!count) { showToast(t('cal_ai_none')); return; }
        setStore((current) => ({
          ...current,
          memos: memos.concat(current.memos),
          events: events.concat(current.events),
        }));
        showToast(t('cal_ai_done', { n: count }));
        if (bulk) {
          setDraft('');
          setBulk(null);
          if (!memos.length && events.length) {
            setCalendarFocus(events[0].date);
            switchTab('calendar');
          } else {
            switchTab('memos');
            if (bodyRef.current) bodyRef.current.scrollTo({ top: 0, behavior: 'smooth' });
          }
        } else if (events.length) {
          setCalendarFocus(events[0].date);
          switchTab('calendar');
        } else if (memos.length) {
          switchTab('memos');
        }
      }

      function openManualAI() {
        setBulk({ text: '', tags: [] });
        setAiOpen(true);
      }

      function openBulk(text, tags) {
        setBulk({ text: String(text || ''), tags: uniqueTags(tags || []) });
        setAiOpen(true);
      }

      function saveOneBulk(text) {
        if (!String(text || '').trim()) return;
        addMemo({ text, tags: uniqueTags(bulk ? bulk.tags : []), dueDate: null, dueTime: null });
        setBulk(null);
        setAiOpen(false);
      }

      function saveReport(key, report) {
        setStore((current) => ({ ...current, reports: { ...(current.reports || {}), [key]: report } }));
      }

      function exportData() {
        try {
          const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `pm-workbench-${ymd(new Date())}.json`;
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
          setTimeout(() => URL.revokeObjectURL(url), 1200);
        } catch (err) {
          showToast(String(err && err.message ? err.message : err));
        }
        setMenuOpen(false);
      }

      function importData(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const parsed = JSON.parse(String(reader.result || ''));
            if (!parsed || (!Array.isArray(parsed.memos) && !Array.isArray(parsed.todos))) throw new Error('bad');
            if (!window.confirm(t('import_confirm'))) return;
            const next = parsed.v === 2 || Array.isArray(parsed.memos)
              ? {
                ...emptyStore(),
                memos: safeArray(parsed.memos).map(normalizeMemo).filter(Boolean),
                events: safeArray(parsed.events).map(normalizeEvent).filter(Boolean),
                reports: parsed.reports && typeof parsed.reports === 'object' ? parsed.reports : {},
                tagOptions: normalizeTagList(parsed.tagOptions, true),
              }
              : migrateLegacy(parsed);
            migrateEvents(next);
            setStore(next);
            showToast(t('imported', { n: next.memos.length }));
          } catch (err) {
            showToast(t('import_failed'));
          }
          if (fileRef.current) fileRef.current.value = '';
        };
        reader.readAsText(file);
        setMenuOpen(false);
      }

      function clearDone() {
        if (!window.confirm(t('clear_done_confirm'))) return;
        setStore((current) => ({ ...current, memos: current.memos.filter((memo) => !memo.done) }));
        setMenuOpen(false);
        showToast(t('deleted'));
      }

      const ringStats = weekStats(store.memos, store.events, now, now);
      const ringTotal = ringStats.done.length + ringStats.open.length;
      const ringRate = ringTotal ? ringStats.done.length / ringTotal : 0;

      return h('div', { className: 'pmw-root' },
        h('style', null, CSS),

        h('header', { className: 'pmw-hero' },
          h('div', { className: 'pmw-hero-inner' },
            h('div', { className: 'pmw-hero-main' },
              h('div', { className: 'pmw-hero-kicker' }, 'Workbench'),
              h('div', { className: 'pmw-hero-date' }, `${monthDayLabel(now)} · ${weekdayLabel(now)}`),
              h('div', { className: 'pmw-hero-meta' },
                h('span', null, clockLabel(now)),
                h('i'),
                h('span', null, `${t('week_progress')} ${ringStats.done.length}/${ringTotal}`),
              ),
            ),
            h(Ring, {
              rate: ringRate,
              label: `${ringStats.done.length}/${ringTotal}`,
              sub: t('stat_done'),
            }),
            h('button', {
              type: 'button',
              className: 'pmw-hero-menu',
              'aria-label': t('more_actions'),
              'aria-expanded': menuOpen,
              onClick: () => setMenuOpen((open) => !open),
            }, h(Icon, { name: 'more', size: 15 })),
          ),
        ),

        menuOpen
          ? h('div', {
            style: { position: 'absolute', inset: 0, zIndex: 65 },
            onClick: () => setMenuOpen(false),
          })
          : null,
        menuOpen
          ? h('div', { className: 'pmw-menu', style: { position: 'absolute', top: 58, right: 12, zIndex: 70, minWidth: 156 } },
            h('button', { type: 'button', onClick: () => { setMenuOpen(false); setTagOpen(true); } }, h(Icon, { name: 'tag', size: 13 }), t('manage_tags')),
            h('button', { type: 'button', onClick: exportData }, h(Icon, { name: 'download', size: 13 }), t('export')),
            h('button', { type: 'button', onClick: () => { setMenuOpen(false); if (fileRef.current) fileRef.current.click(); } }, h(Icon, { name: 'upload', size: 13 }), t('import')),
            h('button', { type: 'button', className: 'is-danger', onClick: clearDone }, h(Icon, { name: 'trash', size: 13 }), t('clear_done')),
          )
          : null,

        h('nav', { className: 'pmw-tabs', role: 'tablist', 'aria-label': t('title') },
          TABS.map((item) => h('button', {
            key: item.id,
            type: 'button',
            role: 'tab',
            className: 'pmw-tab' + (tab === item.id ? ' is-active' : ''),
            'aria-selected': tab === item.id,
            onClick: () => switchTab(item.id),
          }, h(Icon, { name: item.icon, size: 15 }), t(item.label))),
        ),

        h('div', { className: 'pmw-body', ref: bodyRef, role: 'tabpanel' },
          tab === 'memos'
            ? h(MemosView, {
              now,
              memos: store.memos,
              filter,
              editingId,
              highlightId,
              tagOptions: store.tagOptions || DEFAULT_TAGS,
              onSend: sendMemoToChat,
              onFilter: changeFilter,
              onToggle: toggleMemo,
              onEdit: setEditingId,
              onCancelEdit: () => setEditingId(null),
              onSave: saveMemo,
              onDelete: deleteMemo,
              onPin: pinMemo,
            })
            : tab === 'calendar'
              ? h(CalendarView, {
                now,
                memos: store.memos,
                focusDate: calendarFocus,
                onFocusApplied: () => setCalendarFocus(null),
                onToggleEntry: toggleEntry,
                onOpenMemo: openMemo,
              })
              : h(WeeklyView, {
                now,
                memos: store.memos,
                events: store.events,
                reports: store.reports,
                onSaveReport: saveReport,
                onToast: showToast,
              }),
        ),

        tab === 'memos'
          ? h('div', { className: 'pmw-dock' },
            h(Composer, {
              now,
              draft,
              tagOptions: store.tagOptions || DEFAULT_TAGS,
              onDraftChange: setDraft,
              onAdd: addMemo,
              onOpenAI: openManualAI,
              onBulk: openBulk,
              onManageTags: () => setTagOpen(true),
            }))
          : null,

        toast
          ? h('div', {
            className: 'pmw-toast',
            role: 'status',
            style: { bottom: tab === 'memos' ? 190 : 18 },
          },
          h('span', { className: 'pmw-toast-text' }, toast.text),
          toast.action
            ? h('button', { type: 'button', onClick: toast.action.run }, toast.action.label)
            : null,
          )
          : null,

        h(AISheet, {
          open: aiOpen,
          now,
          initialText: bulk ? bulk.text : '',
          autoRun: !!(bulk && bulk.text.trim()),
          onClose: () => { setAiOpen(false); setBulk(null); },
          onApply: (result) => applyAI(result, bulk ? bulk.tags : []),
          onSaveOne: (text) => saveOneBulk(text),
          onToast: showToast,
        }),

        h(TagSheet, {
          open: tagOpen,
          tagOptions: store.tagOptions || DEFAULT_TAGS,
          memos: store.memos,
          onClose: () => setTagOpen(false),
          onAdd: addTagOption,
          onRename: renameTagOption,
          onDelete: deleteTagOption,
        }),

        h('input', {
          ref: fileRef,
          type: 'file',
          accept: 'application/json,.json',
          style: { display: 'none' },
          onChange: (event) => importData(event.target.files && event.target.files[0]),
        }),
      );
    }

    function Launcher() {
      return h('button', {
        type: 'button',
        className: 'pmw-launcher',
        title: t('title'),
        'aria-label': t('title'),
        style: {
          display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, padding: '0 8px',
          border: 0, borderRadius: 999, background: 'transparent', color: 'inherit',
          fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', opacity: 0.86,
        },
        onClick: () => { openWorkbench(); },
      }, h(Icon, { name: 'note', size: 13 }), t('title'));
    }

    /* ------------------------------------------------------------- registration */

    let openWorkbench = () => {};

    function noteState(patch) {
      try {
        const prev = window.localStorage.getItem('dsh.pm-workbench.state');
        const next = Object.assign({}, prev ? JSON.parse(prev) : {}, patch, { at: new Date().toISOString() });
        window.localStorage.setItem('dsh.pm-workbench.state', JSON.stringify(next));
      } catch (err) {
        /* diagnostics only */
      }
    }

    function attempt(label, fn) {
      try {
        const value = fn();
        noteState({ [label]: true });
        return value;
      } catch (err) {
        noteState({ [label]: false });
        try { console.warn('[pm-workbench] ' + label + ' failed', err); } catch (err2) { /* no console */ }
        return undefined;
      }
    }

    /* Test seam: pure logic + components without a browser. */
    if (typeof window !== 'undefined' && typeof window.__PM_WORKBENCH_HOOK__ === 'function') {
      try {
        window.__PM_WORKBENCH_HOOK__({
          parseCapture,
          parseDue: (text, now) => parseCapture(text, now).dueDate,
          isBulkDraft,
          buildMemoPrompt,
          groupMemos,
          filterMemos,
          weekStats,
          weekRange,
          dayEntries,
          localSummary,
          localParseText,
          sanitizeReport,
          sanitizeParseResult,
          normalizeMemo,
          normalizeEvent,
          migrateLegacy,
          ymd,
          addDays,
          startOfWeek,
          endOfWeek,
          parseYmd,
          dueSummary,
          components: { Workbench, Composer, MemoItem, MemosView, CalendarView, WeeklyView, AISheet },
        });
      } catch (err) {
        /* the test seam must never break the plugin */
      }
    }

    return {
      inject: ['slots', 'sidebarRight', 'sidebarRightTabs'],
      apply(ctx) {
        noteState({ boot: true, tabType: !!ctx.sidebarRightTabs });

        attempt('bind-open', () => { openWorkbench = () => ctx.sidebarRight.openTab(KIND); });

        attempt('tab-type', () => ctx.effect(() => ctx.sidebarRightTabs.register({
          id: TAB_ID,
          kind: KIND,
          title: () => t('title'),
          keepMounted: true,
        })));

        attempt('tab-body', () => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: TAB_ID,
        }, Workbench)));

        attempt('launcher', () => ctx.slots.inject('conversation.session.header.corner', () => ctx.slots.register({
          name: 'conversation.session.header.corner',
          id: 'pm-workbench-launcher',
          order: 60,
        }, Launcher)));

        // Open once on boot; never fight a user who closed the tab afterwards.
        attempt('auto-open', () => {
          let tries = 0;
          let opened = false;
          const timer = setInterval(() => {
            if (opened) { clearInterval(timer); return; }
            tries += 1;
            try {
              ctx.sidebarRight.openTab(KIND);
              opened = true;
              noteState({ opened: true, tries });
              clearInterval(timer);
            } catch (err) {
              if (tries >= 3) { noteState({ opened: false, tries }); clearInterval(timer); }
            }
          }, 2500);
          ctx.effect(() => () => clearInterval(timer));
        });
      },
    };
  },
});


