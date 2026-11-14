/* 一畦几棵苗 · 核心测试。node --test tests/core.test.cjs
 * 锚点来自 evidence/手算锚点.py（Python Fraction，一棵一棵往前摆着数，不读 core.js）。
 * 最后一组把错误注入源码再跑同一批锚点，确认锚点够尖。 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../core.js');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'core.js'), 'utf8');
const RAND = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'evidence', '随机对拍.json'), 'utf8'));
const near = (a, b, tol) => Math.abs(a - b) <= (tol || 1e-9) * Math.max(1, Math.abs(b));
const S = (p) => Object.assign(C.defaultState(), p || {});
const crop = (p) => Object.assign({ name: 'a', len: '300', r: '30', p: '30', lay: 'grid', how: 'plant', k: '1', g: '80', packN: '100', packPrice: '1', price: '1' }, p || {});
function load(src) { const sb = { module: { exports: {} } }; sb.globalThis = sb; vm.runInNewContext(src, sb); return sb.module.exports; }
const randState = (R) => ({ L: R.st.L, B: R.st.B, e: R.st.e, eMin: '0', spare: R.st.spare, crops: R.st.crops.map((c) => Object.assign({}, c)) });

function anchors(M) {
  const o = M.compute(M.defaultState());
  if (!o.ok) return '默认算不出来 ' + JSON.stringify(o.errors);
  const exp = [[2, 4, 8], [4, 5, 20], [7, 12, 84], [2, 2, 4]];
  for (let i = 0; i < 4; i++) { const r = o.rows[i]; if (r.rows !== exp[i][0] || r.c0 !== exp[i][1] || r.plants !== exp[i][2]) return r.name + ' ' + [r.rows, r.c0, r.plants]; }
  if (o.rows[0].seedlings !== 9 || o.rows[3].seedlings !== 5) return '买苗 ' + o.rows[0].seedlings + ' ' + o.rows[3].seedlings;
  if (o.rows[1].seeds !== 60 || o.rows[2].seeds !== 168 || o.T.packs !== 2) return '种子 ' + o.rows[2].seeds;
  if (!near(o.rows[1].empty, 0.16) || !near(o.rows[2].empty, 7.56) || !near(o.T.empty, 7.72)) return '空穴 ' + o.T.empty;
  if (o.T.plants !== 116 || !near(o.T.cost, 27.5) || o.T.unused !== 30) return '合计 ' + JSON.stringify(o.T);
  const K = (k) => o.actions.filter((a) => a.kind === k)[0];
  const st = K('stag_1'); if (!st || st.patch.crops[1].r !== '22' || st.after.plants !== 121) return '生菜交错 ' + JSON.stringify(st && st.after);
  const sp = K('stag_3'); if (!sp || sp.patch.crops[3].r !== '35' || sp.after.plants !== 118 || !near(sp.after.cost, 29.9)) return '辣椒交错';
  if (K('stag_0') || K('stag_2')) return '行距与株距差太多也给了交错';
  const ed = K('edge'); if (!ed || ed.patch.e !== '12' || ed.after.plants !== 127) return '边距 ' + JSON.stringify(ed && ed.patch);
  const un = K('unused'); if (!un || un.patch.crops[2].len !== '126' || un.after.plants !== 123) return '空长 ' + JSON.stringify(un && un.patch);
  const sd = K('seed_2'); if (!sd || sd.patch.crops[2].k !== '3' || !near(sd.after.empty, 7.72 - 7.56 + 2.268)) return '多一粒 ' + (sd && sd.after.empty);
  if (K('seed_1')) return '生菜空穴不到 1 也给了多一粒';
  /* 交错双数行少一棵的锚点：可用长 90、株距 30 → 单数行 0/30/60/90 共 4 棵，双数行 15/45/75 共 3 棵 */
  const z = M.compute(S({ L: '120', B: '90', e: '15', crops: [crop({ len: '120', r: '30', p: '30', lay: 'stag' })] }));
  if (!z.ok || z.rows[0].rows !== 3 || z.rows[0].c0 !== 4 || z.rows[0].c1 !== 3 || z.rows[0].plants !== 11) return '交错 ' + (z.rows && [z.rows[0].rows, z.rows[0].c0, z.rows[0].c1, z.rows[0].plants]);
  /* 只有「畦宽方向再多一行」在起作用的收边距锚点（Python：边距 15 → 21 棵，11 → 28 棵） */
  const wq = M.compute(S({ L: '300', B: '100', crops: [crop({ len: '300', r: '26', p: '40' })] }));
  const we = wq.actions.filter((a) => a.kind === 'edge')[0];
  if (wq.T.plants !== 21 || !we || we.patch.e !== '11' || we.after.plants !== 28) return '宽门槛收边距 ' + JSON.stringify(we && we.patch) + ' ' + wq.T.plants;
  /* 空长平局：A、B 多一列都 +3 棵，A 差 20 cm、B 差 25 cm → 给 A（Python：18 → 21） */
  const tb = M.compute(S({ L: '225', B: '90', spare: '0', crops: [crop({ name: 'A', len: '100' }), crop({ name: 'B', len: '95' })] }));
  const tu = tb.actions.filter((a) => a.kind === 'unused')[0];
  if (tb.T.plants !== 18 || !tu || tu.patch.crops[0].len !== '120' || tu.after.plants !== 21) return '空长平局 ' + JSON.stringify(tu && tu.patch.crops);
  /* 补苗比例 25%：8 棵 → 10 棵；比例 10% 时 10 棵 → 11 */
  const y = M.compute(S({ spare: '25' })); if (y.rows[0].seedlings !== 10) return '补苗 25% ' + y.rows[0].seedlings;
  for (let k = 0; k < 80; k++) {
    const R = RAND[k], q = M.compute(randState(R), true);
    if (!q.ok) return '随机 ' + k + ' 算不出来 ' + JSON.stringify(q.errors);
    if (q.T.plants !== R.T.plants || q.T.seeds !== R.T.seeds || q.T.packs !== R.T.packs || q.T.seedlings !== R.T.seedlings || !near(q.T.cost, +R.T.cost, 1e-10)) return '随机 ' + k + ' ' + q.T.plants + ' vs ' + R.T.plants;
  }
  return null;
}

test('A1 默认 + 改法 + 交错/补苗锚点与 Python Fraction 一致', () => { assert.equal(anchors(C), null); });

test('A2 随机 300 组与 Python 逐棵摆放对拍（行数、两种行的棵数、种子、袋数、苗数、空穴、花费）', () => {
  assert.equal(RAND.length, 300);
  let stag = 0, sow = 0;
  for (const R of RAND) {
    const z = C.compute(randState(R), true);
    assert.ok(z.ok, JSON.stringify(z.errors));
    assert.equal(z.T.plants, R.T.plants); assert.equal(z.T.seeds, R.T.seeds); assert.equal(z.T.packs, R.T.packs); assert.equal(z.T.seedlings, R.T.seedlings);
    assert.ok(near(z.T.cost, +R.T.cost, 1e-10)); assert.ok(near(z.T.empty, +R.T.empty, 1e-9));
    R.rows.forEach((r, i) => {
      const d = z.rows[i];
      assert.equal(d.rows, r.rows); assert.equal(d.c0, r.c0); assert.equal(d.plants, r.plants);
      if (d.rows > 1) assert.equal(d.c1, r.c1);
      if (d.lay === 'stag') stag++; if (d.how === 'sow') sow++;
    });
  }
  assert.ok(stag > 100 && sow > 100, '两种排法、两种种法都覆盖到：' + stag + ' ' + sow);
});

test('A3 最优性：多一行/多一棵就放不下；所有点都在可用区内、同段任两棵不近于最近距离', () => {
  for (const R of RAND.slice(0, 120)) {
    const z = C.compute(randState(R), true), v = z.v, lay = C.layout(z);
    z.rows.forEach((r, i) => {
      if (r.rows > 0) assert.ok((r.rows) * r.r > r.w + 1e-9, '再多一行放不下');
      if (r.c0 > 0) assert.ok(r.c0 * r.p > r.l + 1e-9, '再多一棵放不下');
      const P = lay.pts.filter((q) => q.i === i), x0 = lay.segs[i].x;
      assert.equal(P.length, r.plants);
      P.forEach((q) => { assert.ok(q.x >= x0 + v.e - 1e-9 && q.x <= x0 + r.len - v.e + 1e-9); assert.ok(q.y >= v.e - 1e-9 && q.y <= v.B - v.e + 1e-9); });
      if (P.length <= 60 && r.near != null) {
        let m = Infinity; for (let a = 0; a < P.length; a++) for (let b = a + 1; b < P.length; b++) m = Math.min(m, Math.hypot(P[a].x - P[b].x, P[a].y - P[b].y));
        if (P.length > 1) assert.ok(near(m, r.near, 1e-9), r.name + ' 最近 ' + m + ' vs ' + r.near);
      }
    });
  }
});

test('A4 阈值两侧：可用宽正好整除 / 少 1 mm；边距与段长的门槛', () => {
  const one = (p, c) => C.compute(S(Object.assign({ L: '300', B: '90', e: '15', crops: [crop(c)] }, p)));
  /* 可用宽 60，行距 30 → 3 行；行距 30.1 → 2 行 */
  assert.equal(one({}, { r: '30' }).rows[0].rows, 3);
  assert.equal(one({}, { r: '30.1' }).rows[0].rows, 2);
  /* 可用长 270，株距 30 → 10 棵；27.1 → 10 棵（9×27.1=243.9），27 → 11 */
  assert.equal(one({}, { p: '30' }).rows[0].c0, 10);
  assert.equal(one({}, { p: '27' }).rows[0].c0, 11);
  assert.equal(one({}, { p: '27.01' }).rows[0].c0, 10);
  /* 段长正好两头边距 → 1 列；少 1 cm 报错 */
  assert.equal(one({}, { len: '30' }).rows[0].c0, 1);
  assert.equal(one({}, { len: '29' }).errors[0].code, 'short');
  /* 畦宽正好两边边距 → 1 行 */
  assert.equal(one({ B: '30' }, {}).rows[0].rows, 1);
  assert.equal(one({ B: '29' }, {}).errors[0].code, 'narrow');
  /* 交错：可用长 = p/2 正好双数行 1 棵；少一点 0 棵 */
  const s = (len) => C.compute(S({ L: '300', B: '90', e: '0', eMin: '0', crops: [crop({ len: len, r: '30', p: '30', lay: 'stag' })] })).rows[0];
  assert.equal(s('15').c1, 1); assert.equal(s('14.9').c1, 0); assert.equal(s('14.9').plants, 2); /* 4 行：单数行各 1 棵、双数行 0 棵 */
});

test('A5 交错收行距规则：最近距离不变、行距株距差 20% 以上不给', () => {
  assert.equal(C.stagRow(25, 25), 22); /* √(625 − 156.25) = 21.65 → 22 */
  assert.equal(C.stagRow(50, 40), 35); /* D = 40，√(1600 − 400) = 34.64 → 35 */
  assert.equal(C.stagRow(48, 40), 35);
  assert.equal(C.stagRow(60, 45), null); /* 差 25% */
  assert.equal(C.stagRow(15, 8), null);
  for (let r = 5; r <= 100; r += 1) for (let p = 5; p <= 100; p += 3) {
    const r2 = C.stagRow(r, p); if (r2 == null) continue;
    const D = Math.min(r, p);
    assert.ok(Math.hypot(r2, p / 2) >= D - 1e-9, r + ',' + p);
    assert.ok(r2 - 1 < 1 || Math.hypot(r2 - 1, p / 2) < D, '向上取整到 1 cm 是最小的整数');
  }
});

test('A6 改法回填：每条点进去后结果就是 after；加棵数的改法真的多了，多一粒的改法空穴真的少了', () => {
  for (const k of ['default', 'one', 'narrow']) {
    const s = C.stateFromPreset(k), o = C.compute(s);
    assert.ok(o.actions.length >= 1, k);
    o.actions.forEach((a) => {
      const o2 = C.compute(C.applyAction(s, a));
      assert.ok(o2.ok); assert.equal(o2.T.plants, a.after.plants); assert.ok(near(o2.T.cost, a.after.cost)); assert.ok(near(o2.T.empty, a.after.empty));
      if (a.kind.indexOf('seed_') === 0) { assert.equal(o2.T.plants, o.T.plants); assert.ok(o2.T.empty < o.T.empty); }
      else assert.ok(o2.T.plants > o.T.plants, a.text);
      if (a.kind === 'edge') assert.ok(+o2.v.e >= o.v.eMin);
      if (a.kind === 'unused') assert.ok(o2.v.used <= o2.v.L + 1e-9);
    });
  }
  /* 边距最少接受 = 边距：不给收边距 */
  assert.equal(C.compute(S({ eMin: '15' })).actions.filter((a) => a.kind === 'edge').length, 0);
  /* 没有空长：不给分空长 */
  assert.equal(C.compute(S({ L: '570' })).actions.filter((a) => a.kind === 'unused').length, 0);
});

test('A7 种法：直播的袋数向上取整、空穴按 (1−发芽率)^每穴粒数；移栽的补苗向上取整', () => {
  const sw = (p) => C.compute(S({ L: '300', B: '90', e: '15', crops: [crop(Object.assign({ how: 'sow' }, p))] })).rows[0];
  /* 3 行 × 10 棵 = 30 棵 × 每穴 2 = 60 粒；每袋 60 正好 1 袋、59 → 2 袋 */
  assert.equal(sw({ k: '2', packN: '60' }).packs, 1); assert.equal(sw({ k: '2', packN: '59' }).packs, 2);
  assert.ok(near(sw({ k: '2', g: '90' }).empty, 30 * 0.01));
  const pl = (sp) => C.compute(S({ L: '300', B: '90', e: '15', spare: sp, crops: [crop()] })).rows[0].seedlings;
  assert.equal(pl('0'), 30); assert.equal(pl('10'), 33); assert.equal(pl('11'), 34); /* 33.3 → 34 */
});

test('A8 非法输入：空、非数字、越界、整数、名字、排法、段数、超长', () => {
  const e = (p) => C.compute(S(p)).errors || [];
  assert.ok(e({ L: '' })[0].message.indexOf('没填') > 0);
  assert.ok(e({ B: 'abc' })[0].message.indexOf('「abc」不是数字') > 0);
  assert.equal(e({ spare: '-1' })[0].code, 'range');
  assert.equal(e({ eMin: '20' })[0].code, 'eMin');
  assert.equal(e({ crops: [] })[0].code, 'nocrop');
  assert.equal(e({ crops: Array.from({ length: 7 }, () => crop({ len: '50' })) })[0].code, 'manycrop');
  const c = (p) => e({ crops: [crop(Object.assign({ name: '番茄' }, p))] });
  assert.equal(c({ name: ' ' })[0].code, 'name');
  assert.equal(c({ name: 'x'.repeat(13) })[0].code, 'namelen');
  assert.equal(c({ lay: 'x' })[0].code, 'lay');
  assert.equal(c({ how: '' })[0].code, 'how');
  assert.equal(c({ how: 'sow', k: '1.5' })[0].code, 'kint');
  assert.equal(c({ how: 'sow', packN: '9.5' })[0].code, 'packint');
  assert.ok(c({ r: '1e3' })[0].message.indexOf('「番茄」行距 cm「1e3」不是数字') === 0);
  assert.equal(c({ len: '700' })[0].code, 'over');
  assert.ok(c({ len: '700' })[0].message.indexOf('多了 100 cm') > 0);
  /* 移栽时不检查种子字段 */
  assert.equal(c({ how: 'plant', packN: 'x' }).length, 0);
  assert.equal(C.compute(null).ok, false);
});

test('A9 提醒：尾巴空、只排一行、畦尾空着；最少 1 棵', () => {
  const o = C.compute(C.defaultState()), msg = o.warnings.map((x) => x.message).join('\n');
  assert.ok(msg.indexOf('「番茄」这段最后一棵后面空着 35.0 cm') >= 0);
  assert.ok(msg.indexOf('「菠菜」这段最后一棵后面空着') < 0, '2 cm 不到提醒门槛');
  assert.ok(msg.indexOf('畦尾还空着 30 cm') >= 0);
  const n = C.compute(C.stateFromPreset('narrow'));
  assert.ok(n.warnings.some((x) => x.code === 'onerow'));
  /* 「一棵都排不下」在输入范围内到不了（可用宽、可用长都 ≥ 0，所以至少 1 行 1 棵），已删掉这条提醒；这里钉住「至少 1 棵」 */
  const z = C.compute(S({ L: '300', B: '30', e: '15', crops: [crop({ len: '30', p: '200', r: '200', lay: 'stag' })] }));
  assert.ok(z.ok && z.rows[0].plants === 1 && z.rows[0].near === null);
});

test('A10 导出与俯视图：CSV/MD 用同一次 out；点数等于棵数', () => {
  const o = C.compute(C.defaultState()), csv = C.toCSV(o, 'T'), md = C.toMD(o, 'T');
  assert.ok(csv.indexOf('菠菜,120,15,8,方格,7,12,12,84,直播,168,1,,7.6,5.00') > 0, csv);
  assert.ok(csv.indexOf('合计,116 棵,种子 228 粒 / 2 袋,买苗 14 棵,约 27.50 元') > 0);
  assert.ok(md.indexOf('一共 **116 棵**，约 **27.50 元**') > 0 && md.indexOf('- 番茄（200 cm，行距 60 × 株距 45，方格）：2 行 × 4 棵，共 8 棵；移栽，买苗 9 棵，约 13.50 元') >= 0, md);
  assert.ok(md.indexOf('「生菜」改三角交错，行距 25 → 22 cm') >= 0);
  assert.equal(C.layout(o).pts.length, 116);
  const bad = C.compute(S({ B: 'x' }));
  assert.ok(C.toCSV(bad, 'T').indexOf('还算不出来') > 0 && C.toMD(bad, 'T').indexOf('还算不出来') > 0);
  assert.equal(C.presetKey(C.defaultState()), 'default'); assert.equal(C.presetKey(C.stateFromPreset('narrow')), 'narrow'); assert.equal(C.presetKey(S({ e: '14' })), null);
  const q = C.compute(S({ crops: [crop({ name: 'a,"b"' })] }));
  assert.ok(C.toCSV(q, 'T').indexOf('"a,""b"""') > 0);
  const st = C.compute(C.stateFromPreset('one')), z1 = C.compute(C.applyAction(C.stateFromPreset('one'), st.actions[0])).rows[0];
  assert.equal(C.rowsText(z1), '4 行 × 11 棵（交错）'); assert.equal(z1.plants, 44);
  const z2 = C.compute(S({ L: '120', B: '90', e: '15', crops: [crop({ len: '120', r: '30', p: '30', lay: 'stag' })] })).rows[0];
  assert.equal(C.rowsText(z2), '3 行交错（单数行 4 棵、双数行 3 棵）');
});

test('A11 注入错误：每个错误都让锚点不通过（锚点够尖）', () => {
  const muts = [
    ['可用宽只扣一边边距', 'var w = v.B - 2 * v.e', 'var w = v.B - v.e'],
    ['可用长不扣边距', 'l = c.len - 2 * v.e', 'l = c.len'],
    ['一维少算第一棵', 'Math.floor(l / p + EPS) + 1', 'Math.floor(l / p + EPS)'],
    ['交错双数行不错开', 'function fitOff(l, p) { return fit(l - p / 2, p); }', 'function fitOff(l, p) { return fit(l, p); }'],
    ['单双数行数互换', 'var nEven = Math.ceil(rows / 2), nOdd = Math.floor(rows / 2)', 'var nEven = Math.floor(rows / 2), nOdd = Math.ceil(rows / 2)'],
    ['种子没乘每穴粒数', 'o.seeds = plants * c.k', 'o.seeds = plants'],
    ['袋数向下取整', 'Math.ceil(o.seeds / c.packN - EPS)', 'Math.floor(o.seeds / c.packN + EPS)'],
    ['空穴概率没取 k 次方', 'Math.pow(1 - c.g / 100, c.k)', '(1 - c.g / 100)'],
    ['补苗比例没除 100', 'plants * (1 + v.spare / 100)', 'plants * (1 + v.spare)'],
    ['补苗向下取整', 'Math.ceil(plants * (1 + v.spare / 100) - EPS)', 'Math.floor(plants * (1 + v.spare / 100) + EPS)'],
    ['交错收行距用勾股和', 'Math.sqrt(D * D - p * p / 4)', 'Math.sqrt(D * D + p * p / 4)'],
    ['交错收行距向下取整', 'Math.ceil(Math.sqrt(D * D - p * p / 4) - EPS)', 'Math.floor(Math.sqrt(D * D - p * p / 4) + EPS)'],
    ['交错不看行株距差', 'if (Math.abs(r - p) > STAG_TOL * Math.max(r, p) + EPS) return null;', ''],
    ['边距门槛用行数 −1', 'cands.push((v.B - r.rows * c.r) / 2)', 'cands.push((v.B - (r.rows - 1) * c.r) / 2)'],
    ['边距取最小门槛', '(best == null || f > best)', '(best == null || f < best)'],
    ['空长选最大的', 'dd < pick.dd', 'dd > pick.dd'],
    ['空穴门槛 1 改成 0', 'r.empty < 1 - EPS', 'r.empty < 0'],
    ['花费没算苗价', 'o.cost = o.seedlings * c.price', 'o.cost = 0'],
    ['空长没算进合计', 'T.unused = v.L - v.used', 'T.unused = 0']
  ];
  const caught = [];
  for (const [name, a, b] of muts) {
    assert.ok(SRC.indexOf(a) >= 0, '注入点不存在：' + name);
    let r; try { r = anchors(load(SRC.split(a).join(b))); } catch (e) { r = '抛错 ' + e.message; }
    assert.notEqual(r, null, '没抓到：' + name);
    caught.push(name + ' → ' + r);
  }
  fs.writeFileSync(path.join(__dirname, '..', '..', 'evidence', '注入测试明细.txt'), caught.join('\n') + '\n');
  assert.equal(caught.length, muts.length);
});
