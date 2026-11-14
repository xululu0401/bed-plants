/* 一畦几棵苗 · 计算核心（core.js）
 * 一条长方形的畦，沿长度分成几段，每段种一样菜。每段按「行距、株距、方格 / 三角交错」排，
 * 算出几行、每行几棵、这一段一共几棵；直播的算要几粒种子、几袋、可能空几穴，移栽的算买几棵苗；
 * 再给出只改一项就能多种的改法（改三角交错、边距收一点、把空着的长度分给某段、每穴多下一粒），每条回填重算。
 * 排法约定：行沿畦的长度方向走；第一行、第一棵离畦边（和段的两头）都留「边距」；相邻两段之间各留各的边距。
 * 纯计算，不碰 DOM。浏览器里挂 window.AppCore，Node 里 module.exports。
 * 边距、补苗比例、「三角交错时最近两棵的距离不变」这条收行距规则，都是本页的设计值，不是农艺标准。 */
(function (root) {
  'use strict';

  var EPS = 1e-9;
  var FIELDS = {
    L: { min: 30, max: 3000, label: '畦长 cm' },
    B: { min: 20, max: 300, label: '畦宽 cm' },
    e: { min: 0, max: 50, label: '边距 cm' },
    eMin: { min: 0, max: 50, label: '边距最少接受 cm' },
    spare: { min: 0, max: 100, label: '移栽多备苗 %' }
  };
  var KEYS = ['L', 'B', 'e', 'eMin', 'spare'];
  var CFIELDS = {
    len: { min: 5, max: 3000, label: '这段长 cm' },
    r: { min: 3, max: 200, label: '行距 cm' },
    p: { min: 2, max: 200, label: '株距 cm' },
    k: { min: 1, max: 10, label: '每穴几粒' },
    g: { min: 1, max: 100, label: '发芽率 %' },
    packN: { min: 1, max: 100000, label: '每袋几粒' },
    packPrice: { min: 0, max: 10000, label: '每袋 元' },
    price: { min: 0, max: 1000, label: '每棵苗 元' }
  };
  var SOW_KEYS = ['k', 'g', 'packN', 'packPrice'], PLANT_KEYS = ['price'];
  var MAX_CROP = 6, NAME_MAX = 12, STAG_TOL = 0.2, SLACK_WARN = 5;

  var BASE = {
    L: '600', B: '120', e: '15', eMin: '10', spare: '10',
    crops: [
      { name: '番茄', len: '200', r: '60', p: '45', lay: 'grid', how: 'plant', k: '1', g: '85', packN: '50', packPrice: '8', price: '1.5' },
      { name: '生菜', len: '150', r: '25', p: '25', lay: 'grid', how: 'sow', k: '3', g: '80', packN: '500', packPrice: '3', price: '0.5' },
      { name: '菠菜', len: '120', r: '15', p: '8', lay: 'grid', how: 'sow', k: '2', g: '70', packN: '300', packPrice: '5', price: '0.3' },
      { name: '辣椒', len: '100', r: '50', p: '40', lay: 'grid', how: 'plant', k: '1', g: '75', packN: '100', packPrice: '6', price: '1.2' }
    ]
  };
  function clone(s) { return JSON.parse(JSON.stringify(s)); }
  function patch(o, p) { var s = clone(o); Object.keys(p).forEach(function (k) { s[k] = clone(p[k]); }); return s; }
  var PRESETS = [
    { key: 'default', name: '6 米畦种四样（虚构）', note: '虚构场景：一条 6 米 × 1.2 米的畦，番茄、辣椒买苗移栽，生菜、菠菜直播；边距 15 cm。行株距、发芽率、种子和苗的价格都是示例值，按种子袋背面和你的经验改。', state: BASE },
    { key: 'one', name: '整畦只种生菜（虚构）', note: '虚构场景：3 米 × 1 米的畦只种生菜，行株距都是 25 cm，看看方格和三角交错差多少棵。', state: patch(BASE, { L: '300', B: '100', crops: [{ name: '生菜', len: '300', r: '25', p: '25', lay: 'grid', how: 'sow', k: '3', g: '80', packN: '500', packPrice: '3', price: '0.5' }] }) },
    { key: 'narrow', name: '阳台种植箱（虚构）', note: '虚构场景：阳台上一只 90 × 30 cm 的种植箱，边距 5 cm，小葱直播、草莓买苗。箱子窄，常常只能排一行。', state: patch(BASE, { L: '90', B: '30', e: '5', eMin: '3', crops: [{ name: '小葱', len: '50', r: '10', p: '5', lay: 'grid', how: 'sow', k: '4', g: '60', packN: '200', packPrice: '4', price: '0.2' }, { name: '草莓', len: '40', r: '25', p: '20', lay: 'grid', how: 'plant', k: '1', g: '50', packN: '30', packPrice: '9', price: '3' }] }) }
  ];
  function defaultState() { return clone(BASE); }
  function stateFromPreset(key) { for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].key === key) return clone(PRESETS[i].state); return defaultState(); }
  function presetKey(state) { var t = JSON.stringify(state); for (var i = 0; i < PRESETS.length; i++) if (JSON.stringify(PRESETS[i].state) === t) return PRESETS[i].key; return null; }

  function fmtV(x, d) {
    if (typeof x !== 'number' || !isFinite(x)) return '—';
    var p = Math.pow(10, d), r = Math.round(x * p + (x >= 0 ? EPS : -EPS)) / p;
    if (Object.is(r, -0)) r = 0;
    return r.toFixed(d);
  }
  function num(x) { return String(+x.toFixed(6)); }
  function parseNum(raw) {
    var t = String(raw == null ? '' : raw).trim();
    if (t === '') return { empty: true };
    if (!/^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(t)) return { nan: true };
    return { v: parseFloat(t) };
  }
  function chk(spec, field, raw, errors, prefix) {
    var p = parseNum(raw), lab = (prefix || '') + spec.label;
    if (p.empty) { errors.push({ code: 'empty', field: field, message: lab + '没填' }); return null; }
    if (p.nan) { errors.push({ code: 'nan', field: field, message: lab + '「' + raw + '」不是数字' }); return null; }
    if (p.v < spec.min || p.v > spec.max) { errors.push({ code: 'range', field: field, message: lab + '要在 ' + spec.min + '–' + spec.max + ' 之间，现在是 ' + p.v }); return null; }
    return p.v;
  }

  function validate(state) {
    var errors = [], v = {};
    state = state || {};
    KEYS.forEach(function (k) { var x = chk(FIELDS[k], k, state[k], errors); if (x != null) v[k] = x; });
    if (v.e != null && v.eMin != null && v.eMin > v.e + EPS) errors.push({ code: 'eMin', field: 'eMin', message: '边距最少接受 ' + num(v.eMin) + ' cm 比现在的边距 ' + num(v.e) + ' cm 还大' });
    if (v.B != null && v.e != null && v.B - 2 * v.e < -EPS) errors.push({ code: 'narrow', field: 'e', message: '畦宽 ' + num(v.B) + ' cm 放不下两边各 ' + num(v.e) + ' cm 的边距' });
    var cs = Array.isArray(state.crops) ? state.crops : [];
    if (!cs.length) errors.push({ code: 'nocrop', field: 'crops', message: '一样菜都没有' });
    if (cs.length > MAX_CROP) errors.push({ code: 'manycrop', field: 'crops', message: '最多 ' + MAX_CROP + ' 段，现在是 ' + cs.length });
    v.crops = [];
    var sum = 0, sumOk = true;
    cs.slice(0, MAX_CROP).forEach(function (c, i) {
      c = c || {};
      var o = {}, pre = '第 ' + (i + 1) + ' 段', nm = String(c.name == null ? '' : c.name).trim();
      if (!nm) errors.push({ code: 'name', field: 'c' + i + '_name', message: pre + '没写种什么' });
      else if (nm.length > NAME_MAX) errors.push({ code: 'namelen', field: 'c' + i + '_name', message: pre + '的菜名超过 ' + NAME_MAX + ' 个字' });
      o.name = nm || pre;
      o.lay = c.lay === 'stag' ? 'stag' : c.lay === 'grid' ? 'grid' : null;
      if (!o.lay) errors.push({ code: 'lay', field: 'c' + i + '_lay', message: '「' + o.name + '」方格还是三角交错没选' });
      o.how = c.how === 'sow' ? 'sow' : c.how === 'plant' ? 'plant' : null;
      if (!o.how) errors.push({ code: 'how', field: 'c' + i + '_how', message: '「' + o.name + '」直播还是移栽没选' });
      var keys = ['len', 'r', 'p'].concat(o.how === 'plant' ? PLANT_KEYS : o.how === 'sow' ? SOW_KEYS : []);
      keys.forEach(function (k) { var x = chk(CFIELDS[k], 'c' + i + '_' + k, c[k], errors, '「' + o.name + '」'); if (x != null) o[k] = x; });
      if (o.k != null && Math.floor(o.k) !== o.k) errors.push({ code: 'kint', field: 'c' + i + '_k', message: '「' + o.name + '」每穴几粒要填整数，现在是 ' + num(o.k) });
      if (o.packN != null && Math.floor(o.packN) !== o.packN) errors.push({ code: 'packint', field: 'c' + i + '_packN', message: '「' + o.name + '」每袋几粒要填整数，现在是 ' + num(o.packN) });
      if (o.len != null && v.e != null && o.len - 2 * v.e < -EPS) errors.push({ code: 'short', field: 'c' + i + '_len', message: '「' + o.name + '」这段 ' + num(o.len) + ' cm 放不下两头各 ' + num(v.e) + ' cm 的边距' });
      if (o.len == null) sumOk = false; else sum += o.len;
      v.crops.push(o);
    });
    if (sumOk && v.L != null && sum > v.L + EPS) errors.push({ code: 'over', field: 'L', message: '几段加起来 ' + num(sum) + ' cm，比畦长 ' + num(v.L) + ' cm 多了 ' + num(sum - v.L) + ' cm' });
    v.used = sum;
    return { errors: errors, v: v };
  }

  /* 一维：长度 l 上从 0 开始每隔 p 放一棵，能放几棵（0 ≤ 位置 ≤ l） */
  function fit(l, p) { return l < -EPS ? 0 : Math.floor(l / p + EPS) + 1; }
  /* 三角交错：奇数行（第 2、4… 行）错开半个株距，从 p/2 开始 */
  function fitOff(l, p) { return fit(l - p / 2, p); }

  function evalCrop(v, c) {
    var w = v.B - 2 * v.e, l = c.len - 2 * v.e;
    var rows = fit(w, c.r), c0 = fit(l, c.p), c1 = c.lay === 'stag' ? fitOff(l, c.p) : c0;
    var nEven = Math.ceil(rows / 2), nOdd = Math.floor(rows / 2);
    var plants = nEven * c0 + nOdd * c1;
    /* 这段长度方向上没用上的尾巴：缩短这么多一棵不少 */
    var span = c.lay === 'stag' && rows > 1 && c1 > 0 ? Math.max((c0 - 1) * c.p, c.p / 2 + (c1 - 1) * c.p) : (c0 - 1) * c.p;
    var slackL = l - span, slackW = w - (rows - 1) * c.r;
    /* 最近两棵的距离：同一行相邻（p）、方格相邻两行（r）、交错相邻两行斜对角（√(r²+p²/4)）、交错隔一行同一列（2r） */
    var cand = [];
    if (c0 >= 2 || (rows >= 2 && c1 >= 2)) cand.push(c.p);
    if (c.lay === 'grid' && rows >= 2 && c0 >= 1) cand.push(c.r);
    if (c.lay === 'stag' && rows >= 2 && c0 >= 1 && c1 >= 1) cand.push(Math.sqrt(c.r * c.r + c.p * c.p / 4));
    if (c.lay === 'stag' && rows >= 3 && c0 >= 1) cand.push(2 * c.r);
    if (c.lay === 'stag' && rows >= 4 && c1 >= 1) cand.push(2 * c.r);
    var near = cand.length ? Math.min.apply(null, cand) : null;
    var o = { name: c.name, len: c.len, r: c.r, p: c.p, lay: c.lay, how: c.how, w: w, l: l, rows: rows, c0: c0, c1: c1, nEven: nEven, nOdd: nOdd,
      plants: plants, slackL: slackL, slackW: slackW, near: near };
    if (c.how === 'sow') {
      var q = Math.pow(1 - c.g / 100, c.k);
      o.k = c.k; o.g = c.g; o.packN = c.packN; o.packPrice = c.packPrice;
      o.seeds = plants * c.k; o.packs = Math.ceil(o.seeds / c.packN - EPS);
      o.emptyP = q; o.empty = plants * q; o.cost = o.packs * c.packPrice;
    } else {
      o.price = c.price;
      o.seedlings = Math.ceil(plants * (1 + v.spare / 100) - EPS); o.cost = o.seedlings * c.price;
    }
    return o;
  }

  /* 三角交错时把行距收到多少，最近两棵的距离仍不小于方格时的最近距离 D = min(行距, 株距)：
   * 斜邻距离 √(r'² + (p/2)²) ≥ D  →  r' = √(D² − p²/4)，向上取整到 1 cm。
   * 只在行距与株距相差不超过 20%（STAG_TOL，设计值）时给：两者接近说明每棵要的是一圈差不多大的地方，交错才省地；
   * 行距明显大于株距多半是留给走人、通风或培土的，不该替用户收掉。 */
  function stagRow(r, p) {
    if (Math.abs(r - p) > STAG_TOL * Math.max(r, p) + EPS) return null; /* 行距和株距差太多：行距是你特意留的，不替你收 */
    var D = Math.min(r, p); /* 差不超过 20% 时 D ≥ 0.8 × 株距 > 株距/2，根号里恒为正 */
    return Math.ceil(Math.sqrt(D * D - p * p / 4) - EPS);
  }

  function core(state) {
    var val = validate(state);
    if (val.errors.length) return { ok: false, errors: val.errors };
    var v = val.v;
    var rows = v.crops.map(function (c) { return evalCrop(v, c); });
    var T = { plants: 0, cost: 0, seeds: 0, packs: 0, seedlings: 0, empty: 0 };
    rows.forEach(function (r) {
      T.plants += r.plants; T.cost += r.cost;
      if (r.how === 'sow') { T.seeds += r.seeds; T.packs += r.packs; T.empty += r.empty; } else T.seedlings += r.seedlings;
    });
    T.unused = v.L - v.used;
    return { ok: true, v: v, rows: rows, T: T };
  }

  function actionsFor(state, o) {
    var acts = [], v = o.v;
    function tryPatch(kind, p, text, gate) {
      var o2 = compute(patch(state, p), true);
      if (!o2.ok) return;
      if (gate(o2)) acts.push({ kind: kind, patch: p, text: text, after: { plants: o2.T.plants, cost: o2.T.cost, empty: o2.T.empty, seeds: o2.T.seeds, packs: o2.T.packs } });
    }
    var more = function (o2) { return o2.T.plants > o.T.plants; };
    /* 1. 改三角交错（行距按「最近两棵距离不变」收） */
    o.rows.forEach(function (r, i) {
      if (r.lay !== 'grid') return;
      var r2 = stagRow(r.r, r.p);
      if (r2 == null) return;
      var cs = clone(state.crops); cs[i].lay = 'stag'; cs[i].r = num(r2);
      tryPatch('stag_' + i, { crops: cs }, '「' + r.name + '」改三角交错，行距 ' + num(r.r) + ' → ' + num(r2) + ' cm（斜对角两棵仍不近于 ' + num(Math.min(r.r, r.p)) + ' cm）', more);
    });
    /* 2. 边距收一点：取「再多一行 / 一列」的各个门槛里，比现在小、又不低于最少接受的最大那个，向下取整到 1 cm */
    var cands = [];
    o.rows.forEach(function (r, i) {
      var c = v.crops[i];
      cands.push((v.B - r.rows * c.r) / 2);
      cands.push((c.len - r.c0 * c.p) / 2);
      if (c.lay === 'stag') cands.push((c.len - (c.p / 2 + r.c1 * c.p)) / 2);
    });
    var best = null;
    cands.forEach(function (x) { var f = Math.floor(x + EPS); if (f < v.e - EPS && f >= v.eMin - EPS && (best == null || f > best)) best = f; });
    if (best != null) tryPatch('edge', { e: num(best) }, '边距从 ' + num(v.e) + ' 收到 ' + num(best) + ' cm', more);
    /* 3. 空着的长度给某一段：只差一点就能多一列的那段 */
    if (o.T.unused > EPS) {
      var pick = null;
      o.rows.forEach(function (r, i) {
        var c = v.crops[i], need = [r.c0 * c.p - r.l];
        if (c.lay === 'stag') need.push(c.p / 2 + r.c1 * c.p - r.l);
        need.forEach(function (d) {
          var dd = Math.ceil(d - EPS);
          if (dd > 0 && dd <= o.T.unused + EPS) {
            var cs = clone(state.crops); cs[i].len = num(c.len + dd);
            var o2 = compute(patch(state, { crops: cs }), true);
            if (o2.ok && o2.T.plants > o.T.plants && (!pick || o2.T.plants > pick.gain || (o2.T.plants === pick.gain && dd < pick.dd))) pick = { i: i, dd: dd, gain: o2.T.plants, cs: cs };
          }
        });
      });
      if (pick) tryPatch('unused', { crops: pick.cs }, '把畦尾空着的 ' + num(o.T.unused) + ' cm 里拿 ' + num(pick.dd) + ' cm 给「' + o.rows[pick.i].name + '」（这段 ' + num(v.crops[pick.i].len) + ' → ' + num(v.crops[pick.i].len + pick.dd) + ' cm）', more);
    }
    /* 4. 直播每穴多下一粒：可能空着的穴少下来（棵数不变，种子变多） */
    o.rows.forEach(function (r, i) {
      if (r.how !== 'sow' || r.empty < 1 - EPS || r.k >= CFIELDS.k.max) return;
      var cs = clone(state.crops); cs[i].k = num(r.k + 1);
      tryPatch('seed_' + i, { crops: cs }, '「' + r.name + '」每穴 ' + num(r.k) + ' → ' + num(r.k + 1) + ' 粒：可能空着的穴 ' + fmtV(r.empty, 1) + ' → ' + fmtV(r.plants * Math.pow(1 - r.g / 100, r.k + 1), 1), function (o2) { return o2.T.empty < o.T.empty - EPS; });
    });
    return acts;
  }

  function compute(state, noActions) {
    var o = core(state);
    if (!o.ok) return o;
    var v = o.v, W = [];
    o.rows.forEach(function (r) {
      if (r.slackL >= SLACK_WARN - EPS) W.push({ code: 'slack', message: '「' + r.name + '」这段最后一棵后面空着 ' + fmtV(r.slackL, 1) + ' cm：这段缩短 ' + fmtV(r.slackL, 1) + ' cm 一棵不少' });
      if (r.rows === 1 && v.B - 2 * v.e > EPS && r.r > v.B - 2 * v.e) W.push({ code: 'onerow', message: '「' + r.name + '」行距 ' + num(r.r) + ' cm 比畦面能用的宽 ' + fmtV(v.B - 2 * v.e, 1) + ' cm 还大，只排一行' });
      if (r.how === 'sow' && r.k > 1) W.push({ code: 'thin', message: '「' + r.name + '」每穴 ' + num(r.k) + ' 粒，出苗后每穴留一棵，其余间掉' });
    });
    if (o.T.unused > EPS) W.push({ code: 'unused', message: '畦尾还空着 ' + num(o.T.unused) + ' cm 没分给任何一段' });
    o.warnings = W;
    o.actions = noActions ? [] : actionsFor(state, o);
    return o;
  }
  function applyAction(state, a) { return patch(state, a.patch); }

  /* 俯视图上每一棵的位置（cm，原点在畦的左上角）；整体在可用区里居中 */
  function layout(o) {
    var v = o.v, pts = [], x0 = 0, segs = [];
    o.rows.forEach(function (r, i) {
      segs.push({ i: i, x: x0, len: r.len });
      var spanW = (r.rows - 1) * r.r, y0 = v.e + (r.w - spanW) / 2;
      var hasOdd = r.lay === 'stag' && r.rows > 1 && r.c1 > 0;
      var spanL = hasOdd ? Math.max((r.c0 - 1) * r.p, r.p / 2 + (r.c1 - 1) * r.p) : (r.c0 - 1) * r.p;
      var xs = x0 + v.e + (r.l - spanL) / 2;
      for (var j = 0; j < r.rows; j++) {
        var odd = j % 2 === 1, n = odd ? r.c1 : r.c0, off = odd && r.lay === 'stag' ? r.p / 2 : 0;
        for (var k = 0; k < n; k++) pts.push({ i: i, x: xs + off + k * r.p, y: y0 + j * r.r });
      }
      x0 += r.len;
    });
    return { pts: pts, segs: segs, L: v.L, B: v.B, used: x0 };
  }

  function layName(r) { return r.lay === 'stag' ? '三角交错' : '方格'; }
  function rowsText(r) {
    if (r.lay === 'stag' && r.rows > 1 && r.c1 !== r.c0) return r.rows + ' 行交错（单数行 ' + r.c0 + ' 棵、双数行 ' + r.c1 + ' 棵）';
    return r.rows + ' 行 × ' + r.c0 + ' 棵' + (r.lay === 'stag' && r.rows > 1 ? '（交错）' : '');
  }
  function buyText(r) {
    if (r.how === 'sow') return '直播每穴 ' + num(r.k) + ' 粒，要 ' + r.seeds + ' 粒 → ' + r.packs + ' 袋（每袋 ' + num(r.packN) + ' 粒）';
    return '移栽，买苗 ' + r.seedlings + ' 棵';
  }
  function csvCell(x) { var t = String(x == null ? '' : x); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }
  function toCSV(out, stamp) {
    var L = [['一畦几棵苗', '导出 ' + stamp, '默认场景为虚构示例']];
    if (!out.ok) { L.push(['还算不出来']); out.errors.forEach(function (e) { L.push([e.message]); }); return L.map(function (r) { return r.map(csvCell).join(','); }).join('\n') + '\n'; }
    var v = out.v, T = out.T;
    L.push(['畦', '长 ' + num(v.L) + ' cm', '宽 ' + num(v.B) + ' cm', '边距 ' + num(v.e) + ' cm', '空着 ' + num(T.unused) + ' cm']);
    L.push(['合计', T.plants + ' 棵', '种子 ' + T.seeds + ' 粒 / ' + T.packs + ' 袋', '买苗 ' + T.seedlings + ' 棵', '约 ' + fmtV(T.cost, 2) + ' 元']);
    L.push(['菜', '段长 cm', '行距 cm', '株距 cm', '排法', '行数', '单数行棵数', '双数行棵数', '棵数', '种法', '种子粒数', '袋数', '买苗棵数', '可能空穴', '花费 元']);
    out.rows.forEach(function (r) {
      L.push([r.name, num(r.len), num(r.r), num(r.p), layName(r), r.rows, r.c0, r.rows > 1 ? r.c1 : '', r.plants, r.how === 'sow' ? '直播' : '移栽',
        r.how === 'sow' ? r.seeds : '', r.how === 'sow' ? r.packs : '', r.how === 'plant' ? r.seedlings : '', r.how === 'sow' ? fmtV(r.empty, 1) : '', fmtV(r.cost, 2)]);
    });
    if (out.actions.length) { L.push([]); L.push(['改法']); out.actions.forEach(function (a) { L.push([a.text, '改完 ' + a.after.plants + ' 棵', '约 ' + fmtV(a.after.cost, 2) + ' 元']); }); }
    return L.map(function (r) { return r.map(csvCell).join(','); }).join('\n') + '\n';
  }
  function toMD(out, stamp) {
    var L = ['# 一畦几棵苗', '', '导出时间 ' + stamp + '。默认场景为虚构示例；边距、补苗比例、交错收行距的规则都是本页的设计值，行株距以种子袋和当地经验为准。', ''];
    if (!out.ok) { L.push('## 还算不出来', ''); out.errors.forEach(function (e) { L.push('- ' + e.message); }); return L.join('\n') + '\n'; }
    var v = out.v, T = out.T;
    L.push('## 合计', '', '- 畦 ' + num(v.L) + ' × ' + num(v.B) + ' cm，边距 ' + num(v.e) + ' cm' + (T.unused > EPS ? '，畦尾空着 ' + num(T.unused) + ' cm' : ''));
    L.push('- 一共 **' + T.plants + ' 棵**，约 **' + fmtV(T.cost, 2) + ' 元**（种子 ' + T.packs + ' 袋、买苗 ' + T.seedlings + ' 棵）', '');
    L.push('## 每一段', '');
    out.rows.forEach(function (r) {
      L.push('- ' + r.name + '（' + num(r.len) + ' cm，行距 ' + num(r.r) + ' × 株距 ' + num(r.p) + '，' + layName(r) + '）：' + rowsText(r) + '，共 ' + r.plants + ' 棵；' + buyText(r) + (r.how === 'sow' ? '，可能空 ' + fmtV(r.empty, 1) + ' 穴' : '') + '，约 ' + fmtV(r.cost, 2) + ' 元');
    });
    L.push('');
    if (out.actions.length) { L.push('## 改法（每条都回填重算过）', ''); out.actions.forEach(function (a) { L.push('- ' + a.text + ' → ' + a.after.plants + ' 棵，约 ' + fmtV(a.after.cost, 2) + ' 元'); }); L.push(''); }
    if (out.warnings.length) { L.push('## 提醒', ''); out.warnings.forEach(function (x) { L.push('- ' + x.message); }); L.push(''); }
    return L.join('\n') + '\n';
  }

  var API = {
    FIELDS: FIELDS, KEYS: KEYS, CFIELDS: CFIELDS, PRESETS: PRESETS, MAX_CROP: MAX_CROP, NAME_MAX: NAME_MAX, STAG_TOL: STAG_TOL,
    defaultState: defaultState, stateFromPreset: stateFromPreset, presetKey: presetKey, fmtV: fmtV, num: num, parseNum: parseNum,
    validate: validate, fit: fit, fitOff: fitOff, evalCrop: evalCrop, stagRow: stagRow, compute: compute, applyAction: applyAction,
    layout: layout, layName: layName, rowsText: rowsText, buyText: buyText, toCSV: toCSV, toMD: toMD
  };
  if (typeof module === 'object' && module.exports) module.exports = API;
  root.AppCore = API;
})(typeof window !== 'undefined' ? window : globalThis);
