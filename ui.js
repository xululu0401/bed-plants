/* 一畦几棵苗 · 界面（ui.js）
 * 把输入读成 state → 交给 AppCore.compute → 把同一次输出画出来。页面不自己算数（俯视图的点位也来自 AppCore.layout）。
 * 表单只在换预设 / 恢复 / 点改法 / 增删段时整体回填；打字时只刷新结果，不丢光标。 */
(function () {
  'use strict';
  var A = window.AppCore;
  var KEY = 'bed-plants:v1';
  var $ = function (id) { return document.getElementById(id); };
  var CK = ['name', 'len', 'r', 'p', 'lay', 'how', 'k', 'g', 'packN', 'packPrice', 'price'];
  var COLORS = ['#c0533a', '#5e9e3f', '#2f7d6d', '#d08a1e', '#7a5ea8', '#3b78b0'];
  var state = load() || A.defaultState();
  var out = null;
  var f2 = function (x) { return A.fmtV(x, 2); }, f1 = function (x) { return A.fmtV(x, 1); }, n = A.num;

  function str(v) { return String(v == null ? '' : v); }
  function sanitize(s) {
    if (!s || typeof s !== 'object') return null;
    var d = A.defaultState(), any = false;
    A.KEYS.forEach(function (k) { if (s[k] != null && typeof s[k] !== 'object') { d[k] = str(s[k]); any = true; } });
    if (Array.isArray(s.crops)) {
      d.crops = s.crops.slice(0, A.MAX_CROP).filter(function (c) { return c && typeof c === 'object'; }).map(function (c) {
        var o = {}; CK.forEach(function (k) { o[k] = str(c[k]); }); return o;
      });
      any = true;
    }
    return any ? d : null;
  }
  function load() { try { var t = localStorage.getItem(KEY); if (!t) return null; var j = JSON.parse(t); return sanitize(j && j.state); } catch (e) { return null; } }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ state: state })); $('saveTag').textContent = '· 已存到本机'; }
    catch (e) { $('saveTag').textContent = '· 没能存到本机'; }
  }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function renderPresets() {
    var k = A.presetKey(state);
    $('presets').innerHTML = A.PRESETS.map(function (p) { return '<button type="button" class="chip" id="preset_' + p.key + '" data-p="' + p.key + '" aria-pressed="' + (k === p.key) + '">' + esc(p.name) + '</button>'; }).join('');
    var cur = A.PRESETS.filter(function (p) { return p.key === k; })[0];
    $('presetNote').textContent = cur ? cur.note : '已按你的输入计算（不是预设）。';
  }
  $('presets').addEventListener('click', function (e) { var b = e.target.closest('[data-p]'); if (!b) return; state = A.stateFromPreset(b.getAttribute('data-p')); fill(); update(); });

  /* 每段一块：只在 fill() 时重建；直播 / 移栽各自的字段按选项显示 */
  function fieldHtml(i, k, label, val, cls) {
    var id = 'c' + i + '_' + k;
    return '<div class="f' + (cls ? ' ' + cls : '') + '" id="f_' + id + '"><label for="' + id + '">' + label + '</label><input id="' + id + '" data-c="' + i + '" data-ck="' + k + '"' + (k === 'name' ? ' maxlength="24"' : ' inputmode="decimal"') + ' value="' + esc(val) + '"></div>';
  }
  function selHtml(i, k, label, val, opts) {
    var id = 'c' + i + '_' + k, known = opts.some(function (o) { return o[0] === val; });
    return '<div class="f" id="f_' + id + '"><label for="' + id + '">' + label + '</label><select id="' + id + '" data-c="' + i + '" data-ck="' + k + '">' +
      opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === val ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
      (known ? '' : '<option value="' + esc(val) + '" selected>（未选）</option>') + '</select></div>';
  }
  function cropRows() {
    $('crops').innerHTML = state.crops.map(function (c, i) {
      var sow = c.how === 'sow';
      return '<div class="crop" id="crop_' + i + '">' +
        fieldHtml(i, 'name', '<span style="color:' + COLORS[i % 6] + '">●</span> 种什么', c.name, 'txt') +
        fieldHtml(i, 'len', '这段长 cm', c.len) + fieldHtml(i, 'r', '行距 cm', c.r) + fieldHtml(i, 'p', '株距 cm', c.p) +
        selHtml(i, 'lay', '排法', c.lay, [['grid', '方格'], ['stag', '三角交错']]) +
        selHtml(i, 'how', '种法', c.how, [['sow', '直播'], ['plant', '移栽']]) +
        '<button type="button" class="del" data-del="' + i + '" id="del_' + i + '"' + (state.crops.length <= 1 ? ' disabled' : '') + '>删掉</button>' +
        '<div class="more">' + (sow ? fieldHtml(i, 'k', '每穴几粒', c.k) + fieldHtml(i, 'g', '发芽率 %', c.g) + fieldHtml(i, 'packN', '每袋几粒', c.packN) + fieldHtml(i, 'packPrice', '每袋 元', c.packPrice)
          : fieldHtml(i, 'price', '每棵苗 元', c.price)) + '</div></div>';
    }).join('');
    $('addCrop').disabled = state.crops.length >= A.MAX_CROP;
    $('cropCount').textContent = state.crops.length + ' / ' + A.MAX_CROP + ' 段';
  }
  function onCrop(e) {
    var i = e.target.getAttribute('data-c'), k = e.target.getAttribute('data-ck');
    if (i == null || !k) return;
    state.crops[+i][k] = e.target.value;
    if (k === 'how') { cropRows(); }
    update();
  }
  $('crops').addEventListener('input', function (e) { if (e.target.tagName !== 'SELECT') onCrop(e); });
  $('crops').addEventListener('change', function (e) { if (e.target.tagName === 'SELECT') onCrop(e); });
  $('crops').addEventListener('click', function (e) { var b = e.target.closest('[data-del]'); if (!b || state.crops.length <= 1) return; state.crops.splice(+b.getAttribute('data-del'), 1); fill(); update(); });
  $('addCrop').addEventListener('click', function () { if (state.crops.length >= A.MAX_CROP) return; var left = out && out.ok ? out.T.unused : 0; /* 有空长就把空长给新的一段，不然加了就超长 */
    state.crops.push({ name: '新的一段', len: left >= 5 ? A.num(left) : '60', r: '30', p: '30', lay: 'grid', how: 'plant', k: '1', g: '80', packN: '100', packPrice: '5', price: '1' }); fill(); update(); });

  function fill() { A.KEYS.forEach(function (k) { $(k).value = state[k]; }); cropRows(); }
  $('form').addEventListener('input', function (e) { var k = e.target.getAttribute('data-k'); if (!k) return; state[k] = e.target.value; update(); });

  function markErrors() {
    document.querySelectorAll('.f.bad').forEach(function (f) { f.classList.remove('bad'); });
    (out.errors || []).forEach(function (e) { if ($('f_' + e.field)) $('f_' + e.field).classList.add('bad'); });
  }

  function segText(r) {
    var dt = A.rowsText(r) + ' · 行距 ' + n(r.r) + ' × 株距 ' + n(r.p) + ' cm' + (r.near != null ? '，最近两棵 ' + f1(r.near) + ' cm' : '') + ' · ' + A.buyText(r) + (r.how === 'sow' ? '，可能空 ' + f1(r.empty) + ' 穴' : '') + ' · 约 ' + f2(r.cost) + ' 元';
    return { qty: r.plants + ' 棵', dt: dt };
  }

  function render() {
    var bad = !out.ok;
    $('errBox').classList.toggle('hide', !bad);
    $('resCard').classList.toggle('hide', bad);
    if (bad) { $('errBox').innerHTML = '<b>还算不出来</b>，先把这些改对（原文都保留着）：<ul>' + out.errors.map(function (e) { return '<li>' + esc(e.message) + '</li>'; }).join('') + '</ul>'; return; }
    var v = out.v, T = out.T;
    $('plantsN').innerHTML = T.plants + '<small>棵</small>';
    $('costN').textContent = f2(T.cost) + ' 元';
    $('howN').textContent = '畦 ' + n(v.L) + ' × ' + n(v.B) + ' cm，边距 ' + n(v.e) + ' cm · ' + out.rows.length + ' 段' +
      (T.packs ? ' · 种子 ' + T.seeds + ' 粒 / ' + T.packs + ' 袋' : '') + (T.seedlings ? ' · 买苗 ' + T.seedlings + ' 棵（多备 ' + n(v.spare) + '%）' : '') +
      (T.unused > 1e-9 ? ' · 畦尾空着 ' + n(T.unused) + ' cm' : '');
    $('segs').innerHTML = out.rows.map(function (r, i) {
      var t = segText(r);
      return '<li id="seg_' + i + '"><span class="sw" style="background:' + COLORS[i % 6] + '"></span><span class="nm">' + esc(r.name) + '</span><span class="qty">' + t.qty + '</span><span class="dt">' + esc(t.dt) + '</span></li>';
    }).join('');
    $('actsBlock').classList.toggle('hide', !out.actions.length);
    $('acts').innerHTML = out.actions.map(function (a, i) {
      var d = a.after.plants - T.plants;
      var sub = a.kind.indexOf('seed_') === 0 ? '改完：棵数不变；种子 ' + T.seeds + ' → ' + a.after.seeds + ' 粒（' + T.packs + ' → ' + a.after.packs + ' 袋），全畦可能空着的穴 ' + f1(T.empty) + ' → ' + f1(a.after.empty) + '，约 ' + f2(a.after.cost) + ' 元'
        : '改完：' + a.after.plants + ' 棵（多 ' + d + ' 棵），约 ' + f2(a.after.cost) + ' 元';
      return '<button type="button" class="act" id="act_' + a.kind + '" data-a="' + i + '">→ ' + esc(a.text) + '<small>' + sub + '</small></button>';
    }).join('');
    $('warnBox').classList.toggle('hide', !out.warnings.length);
    $('warnBox').innerHTML = '<ul>' + out.warnings.map(function (x) { return '<li>' + esc(x.message) + '</li>'; }).join('') + '</ul>';
    bedView();
  }
  $('acts').addEventListener('click', function (e) { var b = e.target.closest('[data-a]'); if (!b) return; state = A.applyAction(state, out.actions[+b.getAttribute('data-a')]); fill(); update(); });

  /* 俯视图：长宽同一比例（畦太窄时宽度方向单独放大，并在说明里写明） */
  function bedGeom(lay, Wpx, maxH) {
    var sx = Wpx / lay.L, sy = sx, h = lay.B * sy, stretched = false;
    if (h > maxH) { sx = sy = maxH / lay.B; h = maxH; }
    if (h < 46) { sy = 46 / lay.B; h = 46; stretched = true; }
    return { sx: sx, sy: sy, w: lay.L * sx, h: h, stretched: stretched };
  }
  function dotR(r, g) {
    var d = r.near != null ? r.near : Math.min(r.r, r.p);
    return Math.max(1.6, Math.min(14, d * Math.min(g.sx, g.sy) * 0.36));
  }
  function bedView() {
    var lay = A.layout(out), W = 900, L0 = 14, T0 = 34, g = bedGeom(lay, W - 2 * L0, 300), H = T0 + g.h + 40;
    var s = '<defs><pattern id="soil" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#c7a984"/><circle cx="3" cy="3" r="0.9" fill="#b18f68"/><circle cx="8" cy="7" r="0.7" fill="#b18f68"/></pattern>' +
      '<pattern id="idle" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#e6dccb"/><line x1="0" y1="0" x2="0" y2="8" stroke="#cdbfa6" stroke-width="3"/></pattern></defs>';
    s += '<rect x="' + L0 + '" y="' + T0 + '" width="' + g.w.toFixed(1) + '" height="' + g.h.toFixed(1) + '" rx="6" fill="url(#soil)" stroke="#8a6a4a" stroke-width="1.5"/>';
    if (lay.used < lay.L - 1e-9) s += '<rect x="' + (L0 + lay.used * g.sx).toFixed(1) + '" y="' + T0 + '" width="' + ((lay.L - lay.used) * g.sx).toFixed(1) + '" height="' + g.h.toFixed(1) + '" fill="url(#idle)"/>';
    lay.segs.forEach(function (sg, k) {
      var x = L0 + sg.x * g.sx, r = out.rows[sg.i];
      if (k) s += '<line x1="' + x.toFixed(1) + '" y1="' + (T0 - 4) + '" x2="' + x.toFixed(1) + '" y2="' + (T0 + g.h + 4).toFixed(1) + '" stroke="#fff" stroke-width="2" stroke-dasharray="5 4"/>';
      /* 可用区淡框 */
      s += '<rect x="' + (x + out.v.e * g.sx).toFixed(1) + '" y="' + (T0 + out.v.e * g.sy).toFixed(1) + '" width="' + Math.max(0, r.l * g.sx).toFixed(1) + '" height="' + Math.max(0, r.w * g.sy).toFixed(1) + '" fill="none" stroke="rgba(255,255,255,.55)" stroke-dasharray="3 3"/>';
      var lab = r.name + ' ' + r.plants;
      var maxCh = Math.max(1, Math.floor(sg.len * g.sx / 13));
      if (lab.length > maxCh) lab = lab.slice(0, Math.max(1, maxCh - 1)) + '…';
      s += '<text x="' + (x + 3).toFixed(1) + '" y="' + (T0 - 10) + '" font-size="13" fill="' + COLORS[sg.i % 6] + '" font-weight="700">' + esc(lab) + '</text>';
    });
    var rad = out.rows.map(function (r) { return dotR(r, g); });
    var dots = lay.pts.length <= 4000 ? lay.pts : lay.pts.filter(function (_, k) { return k % Math.ceil(lay.pts.length / 4000) === 0; });
    dots.forEach(function (q) {
      s += '<circle cx="' + (L0 + q.x * g.sx).toFixed(1) + '" cy="' + (T0 + q.y * g.sy).toFixed(1) + '" r="' + rad[q.i].toFixed(1) + '" fill="' + COLORS[q.i % 6] + '" stroke="#fff" stroke-width="' + (rad[q.i] > 4 ? 1.2 : 0.5) + '"/>';
    });
    s += '<text x="' + L0 + '" y="' + (T0 + g.h + 26).toFixed(1) + '" font-size="12.5" fill="#4f5848">畦头 0</text>';
    s += '<text x="' + (L0 + g.w).toFixed(1) + '" y="' + (T0 + g.h + 26).toFixed(1) + '" font-size="12.5" text-anchor="end" fill="#4f5848">' + n(lay.L) + ' cm</text>';
    s += '<text x="' + (L0 + g.w / 2).toFixed(1) + '" y="' + (T0 + g.h + 26).toFixed(1) + '" font-size="12.5" text-anchor="middle" fill="#7f8876">宽 ' + n(lay.B) + ' cm' + (g.stretched ? '（太窄，宽度方向放大画）' : '') + '</text>';
    $('bedSvg').setAttribute('viewBox', '0 0 ' + W + ' ' + Math.ceil(H));
    $('bedSvg').innerHTML = s;
    $('bedNote').textContent = '每个点是一棵（或一穴），按比例画' + (g.stretched ? '（这条畦太窄，宽度方向单独放大了）' : '') + (dots.length < lay.pts.length ? '；棵数太多，图上只画了每 ' + Math.ceil(lay.pts.length / 4000) + ' 棵中的 1 棵' : '') + '；白虚线是两段的交界，淡虚框是留完边距后能种的地方' + (lay.used < lay.L - 1e-9 ? '，斜线是畦尾空着没分出去的' : '') + '。';
  }

  function update() { out = A.compute(state); markErrors(); render(); renderPresets(); save(); }

  /* ── 导出 ── */
  function stamp() { var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function download(name, blob) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  $('dlCsv').addEventListener('click', function () { download('一畦几棵苗.csv', new Blob(['\ufeff' + A.toCSV(out, stamp())], { type: 'text/csv;charset=utf-8' })); });
  $('dlMd').addEventListener('click', function () { download('一畦几棵苗.md', new Blob([A.toMD(out, stamp())], { type: 'text/markdown;charset=utf-8' })); });
  $('dlJson').addEventListener('click', function () { download('一畦几棵苗-备份.json', new Blob([JSON.stringify({ app: '一畦几棵苗', slug: 'bed-plants', version: 1, exported_at: stamp(), state: state, out: out }, null, 2)], { type: 'application/json' })); });
  $('impJson').addEventListener('click', function () { $('impFile').click(); });
  $('impFile').addEventListener('change', function () { var f = this.files && this.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { importText(String(r.result)); }; r.readAsText(f); this.value = ''; });
  function importText(t) {
    var s = null;
    try { var j = JSON.parse(t); s = sanitize(j && j.state ? j.state : j); } catch (e) { s = null; }
    if (!s) { $('saveTag').textContent = '· 这个文件读不出来，没改动'; return false; }
    state = s; fill(); update(); return true;
  }
  $('reset').addEventListener('click', function () { state = A.defaultState(); fill(); update(); });

  /* PNG 种植图 1080×1350：所有文字与点位取自同一次 out */
  function drawCard() {
    var W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    var F = '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif', M = 'ui-monospace,Menlo,Consolas,monospace';
    g.fillStyle = '#f1f3ec'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffffff'; g.fillRect(48, 48, W - 96, H - 96);
    var L = 96, R = W - 96, maxW = R - L, y = 132;
    function clip(t, w) { t = String(t); if (g.measureText(t).width <= w) return t; while (t.length > 1 && g.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; }
    function text(t, size, color, bold, font, x, w) { g.font = (bold ? '700 ' : '') + size + 'px ' + (font || F); g.fillStyle = color; g.fillText(clip(t, w || maxW), x == null ? L : x, y); }
    text('一畦几棵苗', 52, '#1f251c', true); y += 44;
    text('导出 ' + stamp() + ' · 默认场景为虚构示例', 22, '#7f8876'); y += 50;
    if (!out.ok) {
      y += 20; text('还算不出来', 44, '#b13a2b', true); y += 60;
      out.errors.slice(0, 14).forEach(function (e) { text('· ' + e.message, 25, '#4f5848'); y += 40; });
      return cv;
    }
    var v = out.v, T = out.T;
    g.fillStyle = '#e7f0df'; g.fillRect(L, y - 10, maxW, 140);
    g.font = '24px ' + F; g.fillStyle = '#4f5848'; g.fillText('一共种', L + 24, y + 26); g.fillText('种子和苗约', L + 470, y + 26);
    g.font = '700 76px ' + F; g.fillStyle = '#3f6b2f'; g.fillText(String(T.plants), L + 24, y + 104);
    var bw = g.measureText(String(T.plants)).width; g.font = '28px ' + F; g.fillText(' 棵', L + 24 + bw, y + 104);
    g.font = '700 56px ' + F; g.fillStyle = '#1f251c'; g.fillText(f2(T.cost) + ' 元', L + 470, y + 100);
    y += 170;
    text('畦 ' + n(v.L) + ' × ' + n(v.B) + ' cm · 边距 ' + n(v.e) + ' cm' + (T.packs ? ' · 种子 ' + T.packs + ' 袋' : '') + (T.seedlings ? ' · 买苗 ' + T.seedlings + ' 棵' : ''), 24, '#4f5848'); y += 30;
    /* 俯视图 */
    var lay = A.layout(out), gm = bedGeom(lay, maxW, 300), top = y + 34;
    g.font = '700 20px ' + F;
    lay.segs.forEach(function (sg) {
      var r = out.rows[sg.i]; g.fillStyle = COLORS[sg.i % 6];
      g.fillText(clip(r.name + ' ' + r.plants, Math.max(14, sg.len * gm.sx - 6)), L + sg.x * gm.sx + 3, top - 10);
    });
    g.fillStyle = '#c7a984'; g.fillRect(L, top, gm.w, gm.h); g.strokeStyle = '#8a6a4a'; g.lineWidth = 2; g.strokeRect(L, top, gm.w, gm.h);
    if (lay.used < lay.L - 1e-9) { g.fillStyle = '#e6dccb'; g.fillRect(L + lay.used * gm.sx, top, (lay.L - lay.used) * gm.sx, gm.h); }
    g.setLineDash([8, 6]); g.strokeStyle = '#ffffff'; g.lineWidth = 2;
    lay.segs.forEach(function (sg, k) { if (!k) return; var x = L + sg.x * gm.sx; g.beginPath(); g.moveTo(x, top - 4); g.lineTo(x, top + gm.h + 4); g.stroke(); });
    g.setLineDash([]);
    var rad = out.rows.map(function (r) { return dotR(r, gm); });
    lay.pts.forEach(function (q) { g.beginPath(); g.arc(L + q.x * gm.sx, top + q.y * gm.sy, rad[q.i], 0, 2 * Math.PI); g.fillStyle = COLORS[q.i % 6]; g.fill(); if (rad[q.i] > 4) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); } });
    g.font = '19px ' + F; g.fillStyle = '#7f8876'; g.fillText('畦头 0', L, top + gm.h + 28); g.textAlign = 'right'; g.fillText(n(v.L) + ' cm', L + gm.w, top + gm.h + 28); g.textAlign = 'left';
    y = top + gm.h + 84;
    /* 每段一行 */
    var skipped = 0;
    out.rows.forEach(function (r, i) {
      if (y > H - 330) { skipped++; return; }
      g.fillStyle = COLORS[i % 6]; g.beginPath(); g.arc(L + 10, y - 10, 10, 0, 2 * Math.PI); g.fill();
      var q = r.plants + ' 棵'; g.font = '600 28px ' + M; var qw = g.measureText(q).width;
      g.font = '700 28px ' + F; g.fillStyle = '#1f251c'; g.fillText(clip(r.name, maxW - qw - 60), L + 34, y);
      g.font = '600 28px ' + M; g.fillStyle = '#3f6b2f'; g.textAlign = 'right'; g.fillText(q, R, y); g.textAlign = 'left';
      y += 34;
      text(A.rowsText(r) + ' · ' + A.buyText(r), 21, '#4f5848', false, null, L + 34, maxW - 34); y += 22;
      g.strokeStyle = '#dde3d4'; g.lineWidth = 1.5; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke(); g.setLineDash([]); y += 40;
    });
    if (skipped) { y -= 14; text('另有 ' + skipped + ' 段没画进来，见 CSV / MD', 21, '#7f8876'); y += 44; }
    var adds = out.actions.filter(function (a) { return a.kind.indexOf('seed_') !== 0; });
    if (adds.length && y < H - 170) {
      text('想多种几棵（每条只改一项）', 26, '#1f251c', true); y += 40;
      adds.forEach(function (a) {
        if (y > H - 120) return;
        var tail = '  → ' + a.after.plants + ' 棵（+' + (a.after.plants - T.plants) + '）';
        g.font = '600 22px ' + F; var tw = g.measureText(tail).width;
        text(a.text, 21, '#2b4a1f', false, null, L, maxW - tw - 8);
        g.font = '600 22px ' + F; g.fillStyle = '#3f6b2f'; g.textAlign = 'right'; g.fillText(tail, R, y); g.textAlign = 'left'; y += 36;
      });
    }
    g.font = '21px ' + F; g.fillStyle = '#7f8876';
    g.fillText(clip('行株距以种子袋和当地经验为准；边距、多备比例、交错规则是可改的设计值', maxW), L, H - 72);
    return cv;
  }
  $('dlPng').addEventListener('click', function () { drawCard().toBlob(function (b) { if (b) download('一畦几棵苗-1080x1350.png', b); }, 'image/png'); });

  window.__bedUi = { state: function () { return JSON.parse(JSON.stringify(state)); }, out: function () { return out; }, importText: importText, drawCard: drawCard, storageKey: KEY };

  fill(); update();
})();
