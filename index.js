/*
 * ============================================================
 *  一切皆可收纳 · Everything Harvest  v1.6.1
 *  全局聊天记录收藏夹 + 桌面悬浮球收纳器 · SillyTavern 扩展
 *
 *  v1.6.1 修复：
 *   · 多选改用「每条消息唯一 DOM key」：连续多选任意条不再互相覆盖
 *   · 顶部提示条：一进入多选即显示"已选 0 条"，实时更新，不再等选完
 *   · 小窗默认定位：水平居中、垂直 25%；脏位置记忆越界自动重置居中；修好拖动
 *   · ＋主悬浮球改「日间干爽风」：米白/浅金底 + 深墨加号，去黑底
 *  v1.6.0 已含：全屏铺满 / 收藏成功醒目 toast / 小窗固定尺寸 / 重复图标去重 / 提示日间风
 * ============================================================
 */
(function () {
  'use strict';

  var PLUGIN_ID = 'everything-harvest';
  var LS_KEY = 'hv_store_v1';
  var ORBS_KEY = 'hv_orbs_v1';
  var POS_KEY = 'hv_pill_pos';

  /* ---------------- 运行日志（观测） ---------------- */
  var LOGS = [];
  function logV(ev, msg) {
    var line = '[' + new Date().toTimeString().slice(0, 8) + '] ' + ev + (msg != null ? ' :: ' + msg : '');
    LOGS.push(line);
    if (LOGS.length > 400) LOGS.shift();
    var box = document.getElementById('hv-logbox');
    if (box) box.textContent = LOGS.join('\n');
    try { console.log('[一切皆可收纳]', ev, msg || ''); } catch (e) { /* ignore */ }
  }

  /* ---------------- 上下文 ---------------- */
  function getCtx() { try { return SillyTavern && SillyTavern.getContext ? SillyTavern.getContext() : null; } catch (e) { return null; } }
  function getEventSource() { var c = getCtx(); return (c && c.eventSource) || (typeof eventSource !== 'undefined' ? eventSource : null); }
  function getEventTypes() { var c = getCtx(); return (c && c.event_types) || (typeof event_types !== 'undefined' ? event_types : null); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '"', "'": '&#39;' }[c]; }); }

  /* ---------------- 数据 ---------------- */
  function emptyStore() { return { v: 1, items: [] }; }
  function loadStore() {
    var d = null;
    try { d = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { d = null; }
    if (!d || !Array.isArray(d.items)) d = emptyStore();
    return d;
  }
  function persist(d) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch (e) { /* ignore */ }
    try {
      var c = getCtx(); var s = (c && c.extensionSettings) || (typeof extension_settings !== 'undefined' ? extension_settings : null);
      if (s) { s[PLUGIN_ID] = d; if (typeof saveSettingsDebounced === 'function') saveSettingsDebounced(); }
    } catch (e) { /* ignore */ }
  }
  function loadOrbs() { try { var d = JSON.parse(localStorage.getItem(ORBS_KEY) || '[]'); return Array.isArray(d) ? d : []; } catch (e) { return []; } }
  function persistOrbs(arr) { try { localStorage.setItem(ORBS_KEY, JSON.stringify(arr)); } catch (e) { /* ignore */ } }
  function dedupeOrbs() {
    var orbs = loadOrbs();
    var seen = {}; var out = []; var removed = 0;
    orbs.forEach(function (o) {
      if (!o || !o.id) return;
      if (seen[o.id]) { removed++; return; }
      seen[o.id] = 1; out.push(o);
    });
    if (removed > 0) { persistOrbs(out); logV('dedupe', '清理重复图标 ' + removed + ' 个'); }
  }

  function colorFor(s) {
    var P = ['#c98f5f', '#7f9976', '#8d7ba6', '#a17f8f', '#9a8a6b'];
    var h = 0; var str = String(s || '');
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return P[h % P.length];
  }
  function currentRoleName() { var c = getCtx(); if (c && c.characters && c.characterId != null && c.characters[c.characterId]) return c.characters[c.characterId].name || ''; return ''; }
  function currentChatName() { var c = getCtx(); try { return String(c.name2 || '').replace(/\.[a-z]+$/i, ''); } catch (e) { return ''; } }

  /* ---------------- SVG 图标 ---------------- */
  var IC = {
    pill: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    add: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.5 6 .9-4.35 4.2 1 6-5.35-2.8L6.65 19.6l1-6L3.3 9.4l6-.9L12 3z"/></svg>',
    book: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 11h8M8 14h5"/></svg>',
    log: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.5"/></svg>',
    full: '<svg viewBox="0 0 24 24"><path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"/></svg>',
    mini: '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><path d="M4 4h8v8H4z"/></svg>',
    ok: '<svg viewBox="0 0 24 24"><path d="M5 13l4 4 10-10"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
    empty: '<svg viewBox="0 0 24 24"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4V6a2 2 0 0 1 2-2z"/></svg>',
    test: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  };

  var state = { selecting: false, selected: {}, selMeta: {}, curFilter: null, pending: null };
  var collectMode = false;
  var mo = null;
  var doneInit = false;
  var suppressPillClick = 0;
  var suppressOrbClickUntil = 0;
  var suppressOrbClickIdx = -1;
  var mesSeq = 0;
  var mesKey = new WeakMap();

  /* ---------------- 每条消息唯一 key ---------------- */
  function ukey(mesEl) {
    if (!mesEl) return '';
    var k = mesKey.get(mesEl);
    if (!k) { k = 'm' + (++mesSeq); mesKey.set(mesEl, k); }
    return k;
  }

  /* ---------------- 提示 toast（日间干爽风） ---------------- */
  function hvToast(msg, kind) {
    var t = document.getElementById('hv-toast'); if (!t) return;
    kind = kind || 'info';
    var icon = kind === 'ok' ? IC.ok : IC.star;
    t.innerHTML = '<span class="hv-toast-ic">' + icon + '</span><span>' + esc(msg) + '</span>';
    t.className = 'hv-toast ' + kind;
    t.classList.add('on');
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.classList.remove('on'); }, kind === 'ok' ? 2200 : 1600);
  }

  /* ---------------- 注入 DOM ---------------- */
  function ensureRoots() {
    if (document.getElementById('hv-pill')) return;
    var root = document.createElement('div');
    root.id = 'hv-root';
    root.innerHTML =
      '<div id="hv-pill" title="一切皆可收纳">' + IC.pill + '</div>' +
      '<div id="hv-toast" class="hv-toast"></div>' +
      '<div id="hv-pick-hint" class="hv-pick-hint">' +
        '<span>已选 <b class="hv-count">0</b> 条</span>' +
        '<span class="hv-cancel" data-a="cancel">取消</span>' +
        '<button class="hv-go" data-a="go">收纳</button>' +
      '</div>' +
      '<div id="hv-pick-orbs" class="hv-pick-orbs" style="display:none"><span>点击要收纳的悬浮球</span><span class="hv-cancel" data-a="orbcancel">取消</span><button class="hv-done" data-a="orbdone">完成</button></div>' +
      '<div id="hv-tray"></div>' +
      '<div id="hv-panel" class="hv-window">' +
        '<div class="hv-wtop"><span class="hv-wtitle">一切皆可收纳</span>' +
          '<div class="hv-wbtn" data-a="togglepanel" title="全屏/小窗">' + IC.full + '</div>' +
          '<div class="hv-wbtn" data-a="export" title="导出">' + IC.log + '</div>' +
          '<div class="hv-wbtn" data-a="closepanel" title="关闭">' + IC.x + '</div></div>' +
        '<div class="hv-filter" id="hv-filter"></div>' +
        '<div class="hv-body" id="hv-body"></div>' +
      '</div>' +
      '<div id="hv-reader" class="hv-window">' +
        '<div class="hv-wtop"><span class="hv-wtitle" id="hv-rt">阅读</span>' +
          '<div class="hv-wbtn" data-a="togglereader" title="全屏/小窗">' + IC.full + '</div>' +
          '<div class="hv-wbtn" data-a="back" title="返回">' + IC.back + '</div>' +
          '<div class="hv-wbtn" data-a="closereader" title="关闭">' + IC.x + '</div></div>' +
        '<div class="hv-rin" id="hv-rin"></div>' +
      '</div>' +
      '<div id="hv-logwin" class="hv-window">' +
        '<div class="hv-wtop"><span class="hv-wtitle">运行日志</span>' +
          '<div class="hv-wbtn" data-a="logtest" title="引号清洗测试">' + IC.test + '</div>' +
          '<div class="hv-wbtn" data-a="logclear" title="清空">' + IC.x + '</div>' +
          '<div class="hv-wbtn" data-a="logcopy" title="复制">' + IC.back + '</div>' +
          '<div class="hv-wbtn" data-a="logclose" title="关闭">' + IC.x + '</div></div>' +
        '<pre class="hv-logpre" id="hv-logbox"></pre>' +
      '</div>' +
      '<div id="hv-confirm">' +
        '<div class="hv-card">' +
          '<div class="hv-ct">' + IC.star + ' 收藏这段聊天</div>' +
          '<div class="hv-crow"><span class="hv-k">角色卡</span><b id="hv-conf-role"></b></div>' +
          '<div class="hv-crow"><span class="hv-k">楼层</span><span id="hv-conf-floors"></span></div>' +
          '<div class="hv-crow"><span class="hv-k">备注</span><input class="hv-note" id="hv-conf-note" placeholder="可选：写一句你收藏它的原因"></div>' +
          '<div class="hv-cbtns"><button class="hv-no" data-a="confno">取消</button><button class="hv-ok" data-a="confok">确认收藏</button></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);
    renderTray();
    positionWindows();
    logV('init', 'DOM 注入完成');
  }

  /* ---------------- 位置管理（小窗居中 + 日志埋点） ---------------- */
  var winUserPos = {}; // 记录用户是否手动拖过（key -> true）
  function windowDefault(id, idx) {
    var w = window.innerWidth || 400; var h = window.innerHeight || 800;
    var winW = Math.min(340, Math.max(220, w - 24)); // 自适应屏宽，留边距
    var x = Math.max(8, Math.round((w - winW) / 2));
    var y = Math.max(8, Math.round(h * 0.38)); // 更居中
    var offs = { hvpanel: 0, hvreader: 26, hvlogwin: 52 }[id] || 0;
    logV('pos-default', id + ' view=' + w + 'x' + h + ' winW=' + winW + ' -> ' + x + ',' + (y + offs));
    return { x: x, y: y + offs, winW: winW };
  }
  function inScreen(p) {
    var w = window.innerWidth || 400; var h = window.innerHeight || 800;
    return p && typeof p.x === 'number' && typeof p.y === 'number' && p.x >= 0 && p.x <= w - 100 && p.y >= 0 && p.y <= h - 80;
  }
  // 打开某小窗时的位置：若用户从未拖过该窗，则居中并垂直居中；拖过则用记忆
  function winOpenPos(id) {
    if (!winUserPos[id]) { var d0 = windowDefault(id, 0); d0.vertCenter = true; return d0; }
    try { var p = JSON.parse(localStorage.getItem('hv_win_' + id) || 'null'); if (inScreen(p)) { p.vertCenter = false; logV('pos-open', id + ' 用记忆 ' + p.x + ',' + p.y); return p; } } catch (e) { /* ignore */ }
    var d1 = windowDefault(id, 0); d1.vertCenter = true; return d1;
  }
  function loadWinPos(id) {
    try { var p = JSON.parse(localStorage.getItem('hv_win_' + id) || 'null'); if (inScreen(p)) { p.vertCenter = !!winUserPos[id]; logV('pos-load', id + ' 记忆 ' + p.x + ',' + p.y); return p; } } catch (e) { /* ignore */ }
    var d2 = windowDefault(id, 0); d2.vertCenter = true; return d2;
  }
  function saveWinPos(id, p) { try { localStorage.setItem('hv_win_' + id, JSON.stringify(p)); } catch (e) { /* ignore */ } }
  // 移动小窗到指定位置（log 记录最终坐标；顺带设定自适应宽度，并可垂直居中）
  function moveWinTo(w, id, p) {
    if (!w) return;
    if (p.winW) { w.style.width = p.winW + 'px'; w.style.maxWidth = p.winW + 'px'; }
    var y = p.y;
    if (p.vertCenter !== false) {
      // 真垂直居中：先放好宽度，读取实际高度，让窗口中点落屏幕中点
      w.style.left = p.x + 'px'; w.style.top = '0px';
      var r = w.getBoundingClientRect();
      var h = window.innerHeight || 800;
      y = Math.max(6, Math.round((h - r.height) / 2));
    }
    w.style.left = p.x + 'px'; w.style.top = y + 'px';
    logV('pos-set', id + ' -> ' + p.x + ',' + y + ' w=' + (p.winW || 'auto') + ' h=' + (w.getBoundingClientRect().height));
  }
  function positionWindows() {
    var pill = document.getElementById('hv-pill'); if (!pill) return;
    var p = loadPos();
    pill.style.left = p.x + 'px'; pill.style.top = p.y + 'px';
    var tray = document.getElementById('hv-tray'); if (tray) {
      tray.style.left = (p.x + 16) + 'px';
      tray.style.top = (p.y + 16) + 'px';
    }
    ['hv-panel', 'hv-reader', 'hv-logwin'].forEach(function (id) {
      var w = document.getElementById(id); if (!w) return;
      if (w.classList.contains('hv-full')) { w.style.left = '0px'; w.style.top = '0px'; return; }
      var wp = loadWinPos(id); moveWinTo(w, id, wp);
    });
  }
  function loadPos() {
    try { var p = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); if (p && typeof p.x === 'number' && typeof p.y === 'number') return p; } catch (e) { /* ignore */ }
    var w = window.innerWidth || 400; var h = window.innerHeight || 800;
    return { x: Math.max(8, w - 52), y: Math.round(h * 0.46) };
  }
  function savePos(p) { try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ } }

  /* ---------------- 托盘渲染 + 长按移出 ---------------- */
  function renderTray() {
    var t = document.getElementById('hv-tray'); if (!t) return;
    var h = '';
    h += '<div class="t add" data-a="addorb" title="收纳悬浮球">' + IC.add + '</div>';
    h += '<div class="t star" data-a="pickmsg" title="收藏聊天记录">' + IC.star + '</div>';
    h += '<div class="t book" data-a="openpanel" title="查看收藏">' + IC.book + '</div>';
    h += '<div class="t log" data-a="openlog" title="运行日志">' + IC.log + '</div>';
    var orbs = loadOrbs();
    if (orbs.length) {
      h += '<div class="tsep"></div>';
      orbs.forEach(function (o, i) {
        var icon = (o && o.icon) || IC.empty;
        h += '<div class="t orb" data-a="orb' + i + '" title="' + esc(o.label || '悬浮球') + '">' + icon + '</div>';
      });
    }
    t.innerHTML = h;
    Array.prototype.forEach.call(t.querySelectorAll('.t.orb'), function (orb) {
      var timer = null;
      function up() { if (timer) { clearTimeout(timer); timer = null; } orb.classList.remove('hv-longpressing'); }
      orb.addEventListener('pointerdown', function (e) {
        if (e.button && e.button !== 0) return;
        if (timer) clearTimeout(timer);
        orb.classList.add('hv-longpressing');
        timer = setTimeout(function () {
          timer = null;
          orb.classList.remove('hv-longpressing');
          var a = orb.getAttribute('data-a');
          if (a && a.indexOf('orb') === 0) {
            var ix = parseInt(a.slice(3), 10);
            logV('orb', '长按移出 idx=' + ix);
            suppressOrbClickUntil = Date.now() + 500;
            suppressOrbClickIdx = ix;
            removeOrb(ix);
          }
        }, 550);
      });
      orb.addEventListener('pointerup', up);
      orb.addEventListener('pointercancel', up);
      orb.addEventListener('pointerleave', up);
    });
  }

  /* ---------------- 收纳桌面悬浮球 ---------------- */
  function grabIcon(el) {
    if (!el) return '';
    try {
      var clone = el.cloneNode(true);
      var svg = null;
      if (clone.querySelector) svg = clone.querySelector('svg, img, i.fa, i.far, i.fas, i.fab');
      if (svg) { var node = (svg.outerHTML) ? svg.outerHTML : svg; return '<span class="hv-icwrap">' + node + '</span>'; }
      clone.style.cssText = '';
      var inner = clone.innerHTML || '';
      if (inner && inner.length > 4) return '<span class="hv-icwrap">' + inner + '</span>';
      return '';
    } catch (e) { return ''; }
  }
  function beginCollect() {
    if (collectMode) return;
    collectMode = true;
    dedupeOrbs();
    document.body.classList.add('hv-collect-mode');
    var hint = document.getElementById('hv-pick-orbs'); if (hint) hint.style.display = 'flex';
    closeTray();
    logV('collect', '进入收纳模式');
  }
  function endCollect() {
    collectMode = false;
    document.body.classList.remove('hv-collect-mode');
    var hint = document.getElementById('hv-pick-orbs'); if (hint) hint.style.display = 'none';
    renderTray();
    logV('collect', '退出收纳模式');
  }
  function collectEl(el) {
    if (!el || el.id === 'hv-pill') return false;
    if (el.closest('#hv-tray') || el.closest('#hv-pill')) return false;
    var orbs = loadOrbs();
    var oid = el.id;
    var host = el.closest('[id*="fab"], [id*="FAB"]');
    var hostId = host && host.id ? host.id : '';
    if (!oid) {
      oid = hostId
        ? 'hv-orb-host-' + (hostId.replace(/[^a-zA-Z0-9_-]/g, '_')) + '_' + Math.floor(Math.random() * 1e4)
        : 'hv-orb_' + Date.now() + '_' + Math.floor(Math.random() * 1e4);
      try { el.id = oid; } catch (e) { /* ignore */ }
    }
    function alreadyCollected(x) { return x.id === oid || (hostId && x.id.indexOf('hv-orb-host-' + (hostId.replace(/[^a-zA-Z0-9_-]/g, '_'))) === 0); }
    if (orbs.some(alreadyCollected)) {
      hvToast('该悬浮球已在托盘中', 'warn');
      logV('collect', '幂等拦截: id=' + oid + ' host=' + hostId);
      return false;
    }
    var icon = grabIcon(el);
    try { el.style.display = 'none'; } catch (e) { /* ignore */ }
    orbs.push({ id: oid, label: el.title || oid || '悬浮球', icon: icon, color: colorFor(el.title || oid || '') });
    persistOrbs(orbs);
    hvToast('已收纳：' + (el.title || '悬浮球'), 'ok');
    logV('collect', '收纳: ' + (el.title || oid) + ' id=' + oid);
    return true;
  }
  function activateOrb(idx) {
    var orbs = loadOrbs(); var o = orbs[parseInt(idx, 10)];
    if (!o) { logV('orb', 'activate: 数据缺失'); return; }
    var el = document.getElementById(o.id);
    logV('orb', 'activate id=' + o.id + ' el=' + (el ? 'found' : 'NULL'));
    if (el) {
      try {
        el.style.display = '';
        if (typeof el.click === 'function') el.click();
        else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        var self = el;
        requestAnimationFrame(function () { try { self.style.display = 'none'; } catch (e2) { /* ignore */ } });
      } catch (e) { logV('orb', 'activate 异常: ' + e.message); }
    } else { logV('orb', '原球不在页面'); }
    closeTray();
    hvToast('已打开：' + (o.label || '悬浮球'), 'info');
  }
  function removeOrb(idx) {
    var orbs = loadOrbs(); var o = orbs[parseInt(idx, 10)];
    if (!o) { logV('orb', 'remove: 数据缺失'); return; }
    var el = document.getElementById(o.id);
    if (el) { try { el.style.display = ''; } catch (e) { /* ignore */ } }
    orbs.splice(parseInt(idx, 10), 1); persistOrbs(orbs);
    renderTray();
    hvToast('已移出：' + (o.label || '悬浮球'), 'info');
  }

  /* ---------------- 主球拖动 ---------------- */
  function makeDraggable() {
    var pill = document.getElementById('hv-pill'); if (!pill) return;
    var sx = 0, sy = 0, ox = 0, oy = 0, dragging = false, moved = false;
    pill.addEventListener('pointerdown', function (e) {
      if (collectMode) { e.stopPropagation(); return; }
      dragging = true; moved = false;
      suppressPillClick = 0;
      pill.classList.add('hv-squeeze');
      var p = loadPos();
      sx = e.clientX; sy = e.clientY; ox = p.x; oy = p.y;
      if (pill.setPointerCapture) { try { pill.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
    });
    pill.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 5) moved = true;
      if (moved) {
        var p = { x: Math.max(0, Math.min(window.innerWidth - 32, ox + dx)), y: Math.max(0, Math.min(window.innerHeight - 32, oy + dy)) };
        savePos(p); positionWindows();
      }
    });
    function up() {
      if (!dragging) return;
      dragging = false; pill.classList.remove('hv-squeeze');
      positionWindows();
      if (moved) { closeTray(); suppressPillClick = Date.now() + 300; }
    }
    pill.addEventListener('pointerup', up);
    pill.addEventListener('pointercancel', up);
  }
  function makeWindowDraggable(w, id) {
    var top = w.querySelector('.hv-wtop'); if (!top) return;
    var sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    top.addEventListener('pointerdown', function (e) {
      if (w.classList.contains('hv-full')) return;
      if (e.target.closest('.hv-wbtn')) return;
      dragging = true;
      var p = loadWinPos(id); sx = e.clientX; sy = e.clientY; ox = p.x; oy = p.y;
      w.classList.add('hv-drag');
      if (w.setPointerCapture) { try { w.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
    });
    top.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return; // 防误触抖动
      winUserPos[id] = true; // 标记：用户手动拖过了
      var p = { x: Math.max(0, Math.min(window.innerWidth - 60, ox + dx)), y: Math.max(0, Math.min(window.innerHeight - 34, oy + dy)), vertCenter: false, winW: 0 };
      saveWinPos(id, p); moveWinTo(w, id, p);
    });
    function up() { dragging = false; w.classList.remove('hv-drag'); }
    top.addEventListener('pointerup', up);
    top.addEventListener('pointercancel', up);
  }
  function openTray() { var tray = document.getElementById('hv-tray'); if (!tray) return; positionWindows(); tray.classList.add('open'); }
  function closeTray() { var t = document.getElementById('hv-tray'); if (t) t.classList.remove('open'); }

  /* ---------------- 小窗 ⇄ 全屏 ---------------- */
  function toggleWin(id) {
    var w = document.getElementById(id); if (!w) return;
    var full = w.classList.toggle('hv-full');
    var btn = w.querySelector('[data-a="togglepanel"], [data-a="togglereader"]');
    if (btn) btn.innerHTML = full ? IC.mini : IC.full;
    if (full) {
      w.style.left = '0px'; w.style.top = '0px';
      w.style.width = '100vw'; w.style.height = '100vh';
      w.style.minWidth = '0px'; w.style.maxWidth = 'none';
    } else {
      w.style.width = ''; w.style.height = '';
      var wp = loadWinPos(id); w.style.left = wp.x + 'px'; w.style.top = wp.y + 'px';
    }
    logV('win', id + (full ? ' 全屏' : ' 小窗'));
  }

  // 打开某小窗：未手动拖过则强制居中，否则用记忆位置
  function openWindow(id) {
    var w = document.getElementById(id); if (!w) return;
    w.classList.add('hv-on');
    var wp = winOpenPos(id);
    moveWinTo(w, id, wp);
  }

  /* ---------------- 日志窗 ---------------- */
  function toggleLog() {
    var w = document.getElementById('hv-logwin'); if (!w) return;
    var on = w.classList.toggle('hv-on');
    if (on) { var box = document.getElementById('hv-logbox'); if (box) box.textContent = LOGS.join('\n'); openWindow('hv-logwin'); }
    closeTray();
    logV('log', on ? '打开日志窗' : '关闭日志窗');
  }
  function clearLog() { LOGS.length = 0; var box = document.getElementById('hv-logbox'); if (box) box.textContent = ''; logV('log', '日志已清空'); }
  function copyLog() {
    var txt = LOGS.join('\n');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt);
      else { var ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    } catch (e) { /* ignore */ }
    hvToast('日志已复制', 'info');
  }

  /* ---------------- 抓取已渲染 HTML ---------------- */
  function grabRendered(mesEl) {
    if (!mesEl) return '';
    try {
      var t = mesEl.querySelector('.mes_text');
      if (t) return t.innerHTML || '';
      var content = mesEl.querySelector('.mes_block, .mes_content, .mes_textarea');
      if (content) return content.innerHTML || '';
      return '';
    } catch (e) { return ''; }
  }

  /* ---------------- 中文双引号去重 ---------------- */
  // 酒馆正则美化有时会在原文上再包一层全角中文引号，导致阅读页出现 ""…"" (2开2闭)。
  // 这里在显示 rendered 时，把连续重复的全角引号收敛成一个，修复"两对变一对"。
  // 双重防护：① 单文本节点内连续收拢；② 相邻文本节点边界处同向引号收拢（覆盖跨节点情形）。
  var QUOTE_L = '\u201C'; // "
  var QUOTE_R = '\u201D'; // "
  function cleanQuotes(html) {
    if (!html) return html;
    try {
      html = String(html).replace(/<style[\s\S]*?<\/style>/gi, '');
      var d = document.createElement('div');
      d.innerHTML = html;
      var walker = document.createTreeWalker(d, NodeFilter.SHOW_TEXT, null, false);
      var nodes = []; var n;
      while ((n = walker.nextNode())) nodes.push(n);
      var fixed = 0;
      // ① 单文本节点内：连续 2+ 个同向全角引号 → 收拢成 1 个
      var re = /[\u0022\u0027\u2018\u2019\u201C\u201D]{2,}/g; // 双引号/单引号 · 中文全角/英文半角，连续重复收拢成1
      nodes.forEach(function (tn) {
        var t = tn.nodeValue;
        if (t && re.test(t)) {
          re.lastIndex = 0;
          var nt = t.replace(re, function (m) { return m.charAt(0); });
          if (nt !== t) { tn.nodeValue = nt; fixed++; }
        }
      });
      // ② 相邻文本节点边界：A 以引号结尾 && B 以同向引号开头（且紧邻无元素）→ 去掉 B 开头一个
      for (var i = 0; i < nodes.length - 1; i++) {
        var A = nodes[i], B = nodes[i + 1];
        if (!A || !B) continue;
        if (A.nextSibling !== B) continue; // 中间夹了元素，不是连续文本
        var at = A.nodeValue, bt = B.nodeValue;
        if (!at || !bt) continue;
        var aLast = at.charAt(at.length - 1);
        var bFirst = bt.charAt(0);
        if ((aLast === QUOTE_L && bFirst === QUOTE_L) || (aLast === QUOTE_R && bFirst === QUOTE_R)) {
          B.nodeValue = bt.slice(1);
          fixed++;
        }
      }
      if (fixed > 0) logV('quotes', '收敛重复中文引号 共处理=' + fixed);
      return d.innerHTML;
    } catch (e) { logV('quotes', 'clean err ' + e.message); return html; }
  }

  /* ---------------- 收藏夹小窗 ---------------- */
  function fmtTime(ts) { if (!ts) return ''; var d = new Date(ts); function p(n) { return (n < 10 ? '0' : '') + n; } return (d.getMonth() + 1) + '·' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function fmtFullTime(ts) { if (!ts) return ''; var d = new Date(ts); function p(n) { return (n < 10 ? '0' : '') + n; } return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function snip(msgs, i) {
    var m = msgs && msgs[i]; if (!m) return '';
    var t = m.role === 'user' ? (m.name || '你') + '：' : (m.name ? m.name + '：' : '');
    return (t + String(m.mes || '').replace(/\s+/g, ' ').slice(0, 26)) || '（空白）';
  }
  function renderPanel(filter) {
    var body = document.getElementById('hv-body'); if (!body) return;
    var store = loadStore();
    var list = store.items.slice().sort(function (a, b) { return (b.time || 0) - (a.time || 0); });
    if (filter && filter !== '__all') list = list.filter(function (it) { return it.role === filter; });
    var roles = []; var seen = {};
    store.items.forEach(function (it) { var r = it.role || '未分类'; if (!seen[r]) { seen[r] = 1; roles.push(r); } });
    var fh = '<div class="hv-fl' + (!filter || filter === '__all' ? ' hv-on' : '') + '" data-f="__all">全部</div>';
    roles.forEach(function (r) { fh += '<div class="hv-fl' + (r === filter ? ' hv-on' : '') + '" data-f="' + esc(r) + '">' + esc(r) + '</div>'; });
    var fe = document.getElementById('hv-filter'); if (fe) fe.innerHTML = fh;
    if (!list.length) { body.innerHTML = '<div class="hv-empty">' + IC.empty + '<br>还没有收藏<br>点托盘里的五角星，选中楼层即可收藏</div>'; return; }
    var groups = {};
    list.forEach(function (it) { var r = it.role || '未分类'; (groups[r] = groups[r] || []).push(it); });
    var html = '';
    Object.keys(groups).forEach(function (r) {
      var arr = groups[r].slice().sort(function (a, b) { return (b.time || 0) - (a.time || 0); });
      html += '<div class="hv-grp" data-role="' + esc(r) + '">' +
        '<div class="hv-ghead" data-gfold="' + esc(r) + '"><span class="hv-gband" style="background:' + colorFor(r) + '"></span>' +
        '<span class="hv-gname">' + esc(r) + '</span><span class="hv-gcount">' + arr.length + ' 条</span>' +
        '<span class="hv-garrow">' + IC.arrow + '</span></div>' +
        '<div class="hv-gbody">';
      arr.forEach(function (it) {
        html += '<div class="hv-list-item" data-id="' + esc(it.id) + '">' +
          '<div class="hv-li-tit">' + esc(snip(it.msgs, 0) || '未命名') + '</div>' +
          '<div class="hv-li-sub">' + esc(fmtTime(it.time)) + ' · 第 ' + esc(it.startFloor) + '-' + esc(it.endFloor) + ' 楼 · ' + esc(it.chatTitle || '') + '</div></div>';
      });
      html += '</div></div>';
    });
    body.innerHTML = html;
  }
  function openPanel() {
    var p = document.getElementById('hv-panel'); if (!p) return;
    var on = !p.classList.contains('hv-on');
    p.classList.toggle('hv-on', on);
    if (on) { renderPanel(state.curFilter); openWindow('hv-panel'); }
    closeTray();
    logV('panel', on ? '打开收藏夹' : '关闭收藏夹');
  }
  function closePanel() { var p = document.getElementById('hv-panel'); if (p) p.classList.remove('hv-on'); }

  /* ---------------- 阅读小窗 ---------------- */
  function openReader(id) {
    var store = loadStore(); var it = null;
    for (var i = 0; i < store.items.length; i++) if (String(store.items[i].id) === String(id)) { it = store.items[i]; break; }
    if (!it) { logV('reader', '未找到 id=' + id); return; }
    var r = document.getElementById('hv-reader'); var rin = document.getElementById('hv-rin');
    if (!r || !rin) return;
    var title = document.getElementById('hv-rt'); if (title) title.textContent = it.note || snip(it.msgs, 0) || '阅读';
    var tag = (it.role || '未分类') + ' · ' + (it.chatTitle || '') + ' · ' + fmtFullTime(it.time);
    var h = '<div class="hv-novel">';
    h += '<div class="hv-nvote">' + esc(it.note || '') + '</div>';
    h += '<div class="hv-nmeta">' + esc(tag) + '<span class="hv-nfloors">第 ' + esc(it.startFloor) + ' - ' + esc(it.endFloor) + ' 楼</span></div>';
    h += '<div class="hv-nbody">';
    (it.msgs || []).forEach(function (m) {
      var me = !!m.is_user || m.role === 'user';
      var nm = m.name || (me ? '你' : '角色');
      var cls = 'hv-np' + (me ? ' hv-np-me' : ' hv-np-gu');
      var bodyContent = '';
      if (m.rendered && String(m.rendered).trim().length > 4) bodyContent = cleanQuotes(m.rendered);
      else bodyContent = esc(m.mes || '');
      h += '<div class="' + cls + '"><span class="hv-nname">' + esc(nm) + '</span><div class="hv-ncontent">' + bodyContent + '</div></div>';
    });
    h += '</div>';
    h += '<div class="hv-del" data-del="' + esc(it.id) + '">' + IC.x + ' 删除此收藏</div>';
    h += '</div>';
    rin.innerHTML = h;
    r.classList.add('hv-on');
    openWindow('hv-reader');
  }
  function closeReader() { var r = document.getElementById('hv-reader'); if (r) r.classList.remove('hv-on'); }

  function logQuoteTest() {
    try {
      var store = loadStore();
      var items = store && store.items ? store.items : [];
      if (!items.length) { logV('qtest', '无任何收藏数据'); return; }
      logV('qtest', '=== 引号全量分析：共 ' + items.length + ' 条收藏 ===');
      for (var t = 0; t < items.length && t < 6; t++) {
        var it = items[t];
        var msgs = it.msgs || [];
        logV('qtest#i' + t, 'role=' + (it.role || '?') + ' msgs=' + msgs.length + ' time=' + (it.time || ''));
        for (var j = 0; j < msgs.length && j < 5; j++) {
          var m = msgs[j];
          var mesText = String(m.mes || '');
          var rendered = String(m.rendered || '');
          var qMes = countQRaw(mesText);
          // rendered HTML 里引号出现（含实体写法）
          var htmlQ = (rendered.match(/&(?:ldquo|rdquo|#8220|#8221|#8216|#8217)|[\u201C\u201D\u2018\u2019\u0022\u0027]/g) || []).length;
          // rendered 可见文本引号
          var qVis = { c: 0, codes: '' };
          try { var d = document.createElement('div'); d.innerHTML = rendered; qVis = countQRaw(d.innerText || ''); } catch (e) {}
          // 清洗测试
          var clean = '';
          try { clean = cleanQuotes(rendered); } catch (e) {}
          var qClean = { c: 0, codes: '' };
          try { var d2 = document.createElement('div'); d2.innerHTML = clean; qClean = countQRaw(d2.innerText || ''); } catch (e) {}
          // 引号在 rendered 里的 HTML 上下文（一次性 match 收集，避免死循环）
          var quotes = rendered.match(/&(?:ldquo|rdquo|#8220|#8221|#8216|#8217)|[\u201C\u201D\u2018\u2019\u0022\u0027]/g) || [];
          var ctx = [];
          if (quotes.length) {
            var pos = 0, seen = 0;
            for (var z = 0; z < quotes.length && seen < 8; z++) {
              var qs = quotes[z];
              var st = rendered.indexOf(qs, pos);
              if (st < 0) break;
              var seg = rendered.slice(Math.max(0, st - 25), st + 25).replace(/\s+/g, ' ');
              var key = qs + '@' + seg.slice(0, 12);
              if (ctx.indexOf(key) < 0) { ctx.push('[' + qs + '...' + seg + ']'); seen++; }
              pos = st + qs.length;
            }
          }
          logV('qtest#i' + t + 'm' + j,
            'mes(' + qMes.c + ') HTML引号=' + htmlQ + ' 可见引号=' + qVis.c + ' 清洗后=' + qClean.c + ' diff=' + (qVis.c - qClean.c) +
            ' style=' + (/<style/i.test(rendered) ? 'Y' : 'N') + ' span=' + (/<span/i.test(rendered) ? 'Y' : 'N') +
            ' mesCode=' + qMes.codes.substring(0, 60) +
            ' 句="' + mesText.replace(/\s+/g, ' ').slice(0, 18) + '"');
          if (ctx.length) logV('qtest-ctx#i' + t + 'm' + j, 'ctx=' + ctx.slice(0, 4).join(' '));
        }
      }
      // === dump 当前阅读页实际显示的段落 HTML（用户肉眼所见） ===
      try {
        var rin = document.getElementById('hv-rin');
        if (rin) {
          var ncc = rin.querySelectorAll('.hv-ncontent');
          var shown = 0;
          ncc.forEach(function (nc) {
            var hh = nc.innerHTML || '';
            var qnum = (hh.match(/\u201C|\u201D|&(?:ldquo|rdquo|#8220|#8221)|\u0022/g) || []).length;
            if (qnum >= 4 && shown < 3) { shown++; logV('qtest-shown#' + shown, '引号=' + qnum + ' HTML="' + hh.replace(/\s+/g, ' ').slice(0, 260) + '"'); }
          });
          if (!shown) logV('qtest-shown', '阅读页无引号>=4段落（请打开引号多的收藏）');
        } else { logV('qtest-shown', '未打开阅读页'); }
        // 伪元素引号检测（限制节点数防卡）
        var pe = 0, plist = [], lim = 150;
        if (rin) {
          var all = rin.querySelectorAll('.hv-ncontent *');
          for (var k = 0; k < all.length && k < lim; k++) {
            var el = all[k];
            try {
              var bsc = getComputedStyle(el, '::before').content || '';
              var afc = getComputedStyle(el, '::after').content || '';
              var hit = (bsc.indexOf('\u201C') >= 0 || bsc.indexOf('\u201D') >= 0 || bsc.indexOf('\u0022') >= 0 || afc.indexOf('\u201C') >= 0 || afc.indexOf('\u201D') >= 0 || afc.indexOf('\u0022') >= 0);
              if (hit) {
                pe++;
                var cls = el.className ? String(el.className) : el.tagName;
                if (plist.length < 12) plist.push('[' + cls + '=' + (afc || bsc).slice(0, 20) + ']');
              }
            } catch (e) {}
          }
          logV('qtest-pseudo', '伪元素引号节点=' + pe + (plist.length ? ' 详情=' + plist.join(' ') : ''));
        }
      } catch (e) { logV('qtest-pseudo', 'err ' + e.message); }
      logV('qtest', '=== 分析结束（diff>0=纯文本连续引号被收敛；HTML引号含实体/span说明需跨元素处理） ===');
    } catch (e) { logV('qtest', 'err ' + e.message); }
  }
  function countQRaw(st) {
    var c = 0, codes = [];
    var s2 = String(st || '');
    for (var i = 0; i < s2.length; i++) {
      var cc = s2.charCodeAt(i);
      if (cc === 34 || cc === 39 || cc === 8216 || cc === 8217 || cc === 8220 || cc === 8221) { c++; codes.push(cc); }
    }
    return { c: c, codes: codes.join(',') };
  }


  /* ---------------- 多选收藏（唯一 key，顶部实时提示） ---------------- */
  function emitPickButtons() {
    if (!state.selecting) return;
    var chat = document.getElementById('chat'); if (!chat) return;
    chat.querySelectorAll('.mes').forEach(function (mes) {
      if (!mes.classList.contains('hv-pickable')) mes.classList.add('hv-pickable');
      if (mes.querySelector('.hv-selbtn')) return;
      var b = document.createElement('div'); b.className = 'hv-selbtn'; b.setAttribute('data-pick', '1'); b.innerHTML = IC.star;
      if (getComputedStyle(mes).position === 'static') mes.style.position = 'relative';
      mes.appendChild(b);
    });
  }
  // 楼层定位（保留：用于取聊天内容楼层号）
  function messageFloor(mesEl) {
    var h = mesEl.closest('[data-message-id]') || mesEl.closest('[data-msgid]');
    var id = null;
    if (h) id = h.getAttribute('data-message-id') || h.getAttribute('data-msgid');
    if (id != null && !isNaN(id)) return parseInt(id, 10);
    var c = getCtx(); var chat = c && c.chat; if (!chat) return -1;
    var txtEl = mesEl.querySelector('.mes_text');
    var tx = ((txtEl ? txtEl.innerText : null) || mesEl.innerText || '').trim();
    if (!tx) return -1;
    for (var i = chat.length - 1; i >= 0; i--) {
      var m = chat[i];
      var mt = m && m.mes ? String(m.mes).trim() : '';
      if (mt && mt === tx) return i;
    }
    return -1;
  }
  function updatePickHint() {
    var h = document.getElementById('hv-pick-hint'); if (!h) return;
    var n = Object.keys(state.selected).length;
    var c = h.querySelector('.hv-count'); if (c) c.textContent = n;
    // 一进入多选就显示提示条
    h.classList.toggle('hv-on', state.selecting);
  }
  function exitSelecting() {
    state.selecting = false; state.selected = {}; state.selMeta = {};
    var chat = document.getElementById('chat'); if (chat) {
      chat.classList.remove('hv-selecting');
      chat.querySelectorAll('.mes.hv-chosen').forEach(function (el) { el.classList.remove('hv-chosen'); });
    }
    updatePickHint();
  }
  function beginSelecting() {
    state.selecting = true;
    var chat = document.getElementById('chat'); if (chat) chat.classList.add('hv-selecting');
    emitPickButtons();
    updatePickHint(); // 立即显示"已选 0 条"
    closeTray();
    logV('pick', '进入多选收藏');
  }
  // 选中/取消某条：使用唯一 DOM key，互不覆盖；内容直接抓 DOM，不依赖楼层号
  function toggleSelect(mesEl) {
    var k = ukey(mesEl);
    if (state.selected[k] !== undefined) {
      delete state.selected[k];
      delete state.selMeta[k];
      mesEl.classList.remove('hv-chosen');
      updatePickHint();
      return;
    }
    var floor = messageFloor(mesEl); // 楼层号（可能 -1，仅用于展示，不影响内容）
    var rendered = grabRendered(mesEl);
    // 纯文本正文：优先从 DOM 取文本
    var txtEl = mesEl.querySelector('.mes_text');
    var plain = txtEl ? txtEl.innerText : '';
    if (!String(plain).trim()) plain = mesEl.innerText || '';
    // 名字/角色从 chat 或 DOM 兜底
    var c = getCtx(); var chat = (c && c.chat) ? c.chat : [];
    var m = floor >= 0 && chat[floor] ? chat[floor] : {};
    var name = m.name || '';
    var isUser = !!m.is_user || (m.role === 'user');
    // rendered 里若有 <details> 等，plain 可能缺正文；无 rendered 时用 plain
    var mesText = m.mes || m.content || plain || '';
    state.selected[k] = floor;
    state.selMeta[k] = { floor: floor, name: name, is_user: isUser, role: m.role || (isUser ? 'user' : 'assistant'), mes: mesText, rendered: rendered };
    logV('pick-one', 'key=' + k + ' floor=' + floor + ' ren.len=' + (rendered || '').length + ' text.len=' + String(mesText).length);
    mesEl.classList.add('hv-chosen');
    updatePickHint();
  }
  function openConfirm() {
    var keys = Object.keys(state.selected);
    if (!keys.length) { hvToast('请先选择消息', 'warn'); return; }
    var msgs = [];
    var floors = [];
    keys.forEach(function (k) {
      var meta = state.selMeta[k];
      if (!meta) return;
      if (!String(meta.mes).trim() && !String(meta.rendered || '').trim()) return;
      msgs.push(meta);
      if (typeof meta.floor === 'number' && meta.floor >= 0) floors.push(meta.floor);
    });
    if (!msgs.length) { hvToast('所选楼层没有可收藏的正文', 'warn'); return; }
    floors.sort(function (a, b) { return a - b; });
    logV('confirm', '选 =' + keys.length + ' 可存 =' + msgs.length + ' 楼层 =' + floors.join(','));
    msgs.forEach(function (m, i) {
      var rl = (m.rendered || '').length;
      var sample = String(m.rendered || '').replace(/\s+/g, ' ').slice(0, 60);
      var hasDet = /<details/i.test(m.rendered || '') ? 1 : 0;
      var hasImg = /<img/i.test(m.rendered || '') ? 1 : 0;
      logV('render#' + i, 'len=' + rl + ' details=' + hasDet + ' img=' + hasImg + ' head="' + sample + '"');
    });
    var role = currentRoleName() || '未分类';
    document.getElementById('hv-conf-role').textContent = role;
    document.getElementById('hv-conf-floors').textContent = floors.length ? ('第 ' + floors[0] + ' - ' + floors[floors.length - 1] + ' 楼') : '若干楼层';
    var note = document.getElementById('hv-conf-note'); if (note) note.value = '';
    document.getElementById('hv-confirm').classList.add('hv-on');
    state.pending = { ids: floors, msgs: msgs, role: role, count: msgs.length };
    setTimeout(function () { var n = document.getElementById('hv-conf-note'); if (n) n.focus(); }, 120);
  }
  function doSave() {
    var p = state.pending;
    if (!p || !p.msgs.length) return;
    var noteEl = document.getElementById('hv-conf-note');
    var note = noteEl ? (noteEl.value || '').trim() : '';
    var store = loadStore();
    store.items.push({ id: 'h' + Date.now() + '_' + Math.floor(Math.random() * 1e4), role: p.role || '未分类', chatTitle: currentChatName(), startFloor: p.ids[0], endFloor: p.ids[p.ids.length - 1], time: Date.now(), note: note, msgs: p.msgs });
    persist(store);
    document.getElementById('hv-confirm').classList.remove('hv-on');
    var n = p.count; exitSelecting();
    hvToast('已收藏 ' + n + ' 条 · ' + (p.role || '未分类'), 'ok');
    var panel = document.getElementById('hv-panel');
    if (panel && panel.classList.contains('hv-on')) renderPanel(state.curFilter);
    logV('save', '收藏 ' + n + ' 条 · ' + (p.role || '未分类'));
  }
  function doDelete(id) {
    if (!confirm('确定删除这条收藏？')) return;
    var store = loadStore();
    store.items = store.items.filter(function (x) { return String(x.id) !== String(id); });
    persist(store); closeReader();
    var panel = document.getElementById('hv-panel');
    if (panel && panel.classList.contains('hv-on')) renderPanel(state.curFilter);
    hvToast('已删除', 'info');
  }
  function doExport() {
    var store = loadStore();
    var blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = '一切皆可收纳_收藏_' + Date.now() + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 800);
  }

  /* ---------------- 事件委托 ---------------- */
  function bind() {
    document.addEventListener('click', function (e) {
      if (collectMode) {
        var po = e.target.closest('#hv-pick-orbs');
        if (po) { var a0 = e.target.closest('[data-a]'); if (a0) { if (a0.dataset.a === 'orbcancel' || a0.dataset.a === 'orbdone') endCollect(); } return; }
        e.preventDefault(); e.stopPropagation();
        var orbEl = e.target.closest('[id*="fab"], [class*="fab"], [id*="FAB"], [class*="FAB"]');
        if (orbEl && collectEl(orbEl)) { renderTray(); }
        return;
      }
      if (e.target.closest('#hv-pill')) {
        if (Date.now() < suppressPillClick) return;
        openTray(); return;
      }
      var tt = e.target.closest('#hv-tray');
      if (tt) {
        var btn = e.target.closest('[data-a]');
        if (btn) {
          var a = btn.dataset.a;
          if (a === 'addorb') { beginCollect(); }
          else if (a === 'pickmsg') { beginSelecting(); }
          else if (a === 'openpanel') { openPanel(); }
          else if (a === 'openlog') { toggleLog(); }
          else if (a && a.indexOf('orb') === 0) {
            var ix = parseInt(a.slice(3), 10);
            if (Date.now() < suppressOrbClickUntil && suppressOrbClickIdx === ix) { logV('orb', 'click 被长按屏蔽'); return; }
            if (e.shiftKey) { removeOrb(ix); }
            else { activateOrb(ix); }
          }
        }
        return;
      }
      var panel = document.getElementById('hv-panel');
      if (panel && panel.classList.contains('hv-on')) {
        var act = e.target.closest('[data-a]');
        if (act) { var a2 = act.dataset.a; if (a2 === 'closepanel') closePanel(); else if (a2 === 'export') doExport(); else if (a2 === 'togglepanel') toggleWin('hv-panel'); }
        var fl = e.target.closest('.hv-fl');
        if (fl) { state.curFilter = fl.dataset.f; renderPanel(state.curFilter); return; }
        var gh = e.target.closest('[data-gfold]');
        if (gh) { var g = gh.closest('.hv-grp'); if (g) g.classList.toggle('hv-fold'); return; }
        var li = e.target.closest('.hv-list-item');
        if (li) { openReader(li.dataset.id); return; }
      }
      var rd = document.getElementById('hv-reader');
      if (rd && rd.classList.contains('hv-on')) {
        var act2 = e.target.closest('[data-a]');
        if (act2) { var a3 = act2.dataset.a; if (a3 === 'back' || a3 === 'closereader') closeReader(); else if (a3 === 'togglereader') toggleWin('hv-reader'); }
        var del = e.target.closest('[data-del]');
        if (del) { doDelete(del.dataset.del); return; }
      }
      var lw = document.getElementById('hv-logwin');
      if (lw && lw.classList.contains('hv-on')) {
        var act3 = e.target.closest('[data-a]');
        if (act3) { var a4 = act3.dataset.a; if (a4 === 'logclose') lw.classList.remove('hv-on'); else if (a4 === 'logclear') clearLog(); else if (a4 === 'logcopy') copyLog(); else if (a4 === 'logtest') logQuoteTest(); }
      }
      // 多选：点击整条消息
      var mes = e.target.closest('#chat .mes.hv-pickable');
      if (mes && state.selecting) {
        if (e.target.closest('.hv-selbtn') || e.target.closest('#hv-confirm') || e.target.closest('#hv-pick-hint')) { /* 交给下面 */ }
        else {
          toggleSelect(mes);
          e.preventDefault(); e.stopPropagation();
          return;
        }
      }
      // 星标按钮
      var pb = e.target.closest('[data-pick]');
      if (pb) {
        var mes2 = pb.closest('.mes'); if (!mes2) return;
        toggleSelect(mes2);
        e.preventDefault(); e.stopPropagation();
        return;
      }
      var hint = e.target.closest('#hv-pick-hint');
      if (hint) { var a5 = e.target.closest('[data-a]'); if (a5) { if (a5.dataset.a === 'cancel') exitSelecting(); else if (a5.dataset.a === 'go') openConfirm(); } return; }
      var cf = e.target.closest('#hv-confirm');
      if (cf) {
        var a6 = e.target.closest('[data-a]');
        if (a6) { if (a6.dataset.a === 'confno') cf.classList.remove('hv-on'); else if (a6.dataset.a === 'confok') doSave(); }
        else if (e.target === cf) cf.classList.remove('hv-on');
        return;
      }
      if (!e.target.closest('#hv-tray') && !e.target.closest('#hv-pill')) closeTray();
    });
  }

  function watchChat() {
    if (mo) mo.disconnect();
    var chat = document.getElementById('chat'); if (!chat) return;
    mo = new MutationObserver(function () {
      if (document.querySelectorAll('.mes').length && !document.querySelector('#chat .mes .hv-selbtn')) emitPickButtons();
    });
    mo.observe(chat, { childList: true, subtree: true });
    emitPickButtons();
  }

  // 重启后自动重新收纳已收纳球：原插件重启会重新渲染它，这里把它再藏起来，保持"已收纳"状态
  function reapplyOrbHide() {
    var orbs = loadOrbs();
    var hidden = 0;
    orbs.forEach(function (o) {
      if (!o || !o.id) return;
      var el = document.getElementById(o.id);
      if (el) {
        try { el.style.display = 'none'; hidden++; } catch (e) { /* ignore */ }
      }
    });
    if (hidden > 0) logV('reapply', '重启后自动重新收纳 ' + hidden + ' 个悬浮球');
    renderTray();
  }

  /* ---------------- 初始化 ---------------- */
  function doInit() {
    if (doneInit) return; doneInit = true;
    try {
      // 首次运行 v1.6.1：清掉旧的小窗位置记忆，让新版本默认居中对齐
      try {
        if (!localStorage.getItem('hv_v161_first')) {
          ['hv_win_hv-panel', 'hv_win_hv-reader', 'hv_win_hv-logwin'].forEach(function (k) { localStorage.removeItem(k); });
          localStorage.setItem('hv_v161_first', '1');
          logV('init', '已清理旧小窗位置，重置为居中');
        }
      } catch (e) { /* ignore */ }
      ensureRoots();
      bind();
      dedupeOrbs();
      makeDraggable();
      ['hv-panel', 'hv-reader', 'hv-logwin'].forEach(function (id) { var w = document.getElementById(id); if (w) makeWindowDraggable(w, id); });
      positionWindows();
      watchChat();
      // 重启后自动重新收纳已收纳球（延迟，等待各插件重新渲染悬浮球）
      setTimeout(reapplyOrbHide, 600);
      setTimeout(reapplyOrbHide, 2000);
      logV('init', 'v1.6.3 初始化完成');
    } catch (e) { logV('init-error', e.message); console.warn('[一切皆可收纳] init error', e); }
  }

  function fire() { if (doneInit) return; try { doInit(); } catch (e) { console.warn(e); } }
  (function () {
    var started = false;
    function trigger() { if (started) return; started = true; fire(); }
    var es = getEventSource(), et = getEventTypes();
    try { if (es && et && et.APP_READY && typeof es.on === 'function') es.on(et.APP_READY, trigger); } catch (e) { /* ignore */ }
    var t0 = Date.now();
    var iv = setInterval(function () {
      var ok = !!(getCtx() && (getCtx().chat || (typeof extension_settings !== 'undefined' && extension_settings)));
      if (ok || Date.now() - t0 > 3500) { clearInterval(iv); trigger(); }
    }, 250);
    if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(trigger, 300);
    else document.addEventListener('DOMContentLoaded', trigger);
  })();
})();