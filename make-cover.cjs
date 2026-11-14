/* 封面 cover.svg（1200×1200），棵数与点位全部来自 core.js 默认场景的同一次 compute / layout；再用浏览器截成 cover.png。
 * 字体名用单引号（SVG 是 XML，裸双引号会让整张图变错误页，批次 64 踩过）。 */
const fs = require('node:fs');
const A = require('./core.js');
const o = A.compute(A.defaultState());
if (!o.ok) throw new Error('默认场景算不出来');
const lay = A.layout(o);
const F = "-apple-system,'PingFang SC','Microsoft YaHei',sans-serif", M = 'ui-monospace,Menlo,Consolas,monospace';
const COL = ['#c0533a', '#5e9e3f', '#2f7d6d', '#d08a1e'];
const L = 120, Wd = 960, sc = Wd / lay.L, top = 540, h = lay.B * sc;
let g = `<rect x="${L}" y="${top}" width="${Wd}" height="${h.toFixed(1)}" rx="10" fill="#c7a984" stroke="#8a6a4a" stroke-width="3"/>`;
g += `<rect x="${(L + lay.used * sc).toFixed(1)}" y="${top}" width="${((lay.L - lay.used) * sc).toFixed(1)}" height="${h.toFixed(1)}" fill="#e6dccb"/>`;
lay.segs.forEach((s, k) => {
  const x = L + s.x * sc, r = o.rows[s.i];
  if (k) g += `<line x1="${x.toFixed(1)}" y1="${top - 6}" x2="${x.toFixed(1)}" y2="${(top + h + 6).toFixed(1)}" stroke="#fff" stroke-width="3" stroke-dasharray="8 6"/>`;
  g += `<text x="${(x + 4).toFixed(1)}" y="${top - 16}" font-family="${F}" font-size="30" font-weight="700" fill="${COL[s.i]}">${r.name} ${r.plants}</text>`;
});
const rad = o.rows.map((r) => Math.max(2, Math.min(18, (r.near || Math.min(r.r, r.p)) * sc * 0.36)));
lay.pts.forEach((q) => { g += `<circle cx="${(L + q.x * sc).toFixed(1)}" cy="${(top + q.y * sc).toFixed(1)}" r="${rad[q.i].toFixed(1)}" fill="${COL[q.i]}" stroke="#fff" stroke-width="${rad[q.i] > 5 ? 2 : 0.8}"/>`; });
const adds = o.actions.filter((a) => a.kind.indexOf('seed_') !== 0).slice(0, 4);
let acts = `<text x="${L}" y="${(top + h + 112).toFixed(1)}" font-family="${F}" font-size="36" font-weight="700" fill="#1f251c">只改一项，能多种几棵</text>`;
adds.forEach((a, k) => {
  const y = top + h + 170 + k * 60;
  const t = a.kind === 'edge' ? a.text : a.kind === 'unused' ? '畦尾空长拿 ' + (+a.patch.crops.find((c, i) => c.len !== A.defaultState().crops[i].len).len - o.v.crops.find((c, i) => String(c.len) !== a.patch.crops[i].len).len) + ' cm 给「' + o.rows[a.patch.crops.findIndex((c, i) => c.len !== A.defaultState().crops[i].len)].name + '」' : a.text.replace(/（.*）$/, '');
  acts += `<rect x="${L}" y="${y - 40}" width="${Wd}" height="52" rx="10" fill="#e7f0df"/>` +
    `<text x="${L + 20}" y="${y - 4}" font-family="${F}" font-size="28" fill="#2b4a1f">${t}</text>` +
    `<text x="${L + Wd - 20}" y="${y - 4}" text-anchor="end" font-family="${M}" font-size="28" font-weight="700" fill="#3f6b2f">${a.after.plants} 棵 +${a.after.plants - o.T.plants}</text>`;
});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <rect width="1200" height="1200" fill="#f1f3ec"/>
  <rect x="60" y="60" width="1080" height="1080" rx="24" fill="#ffffff"/>
  <text x="${L}" y="210" font-family="${F}" font-size="112" font-weight="700" fill="#1f251c">一畦几棵苗</text>
  <text x="${L}" y="282" font-family="${F}" font-size="36" fill="#7f8876">一棵一棵摆好再数：留边、交错、空着的那截都算进去</text>
  <rect x="${L}" y="330" width="${Wd}" height="150" rx="14" fill="#e7f0df"/>
  <text x="${L + 36}" y="372" font-family="${F}" font-size="28" fill="#4f5848">一共种</text>
  <text x="${L + 36}" y="458" font-family="${F}" font-size="96" font-weight="700" fill="#3f6b2f">${o.T.plants}<tspan font-size="40"> 棵</tspan></text>
  <text x="${L + 400}" y="390" font-family="${F}" font-size="34" fill="#4f5848">种子 ${o.T.packs} 袋 · 买苗 ${o.T.seedlings} 棵</text>
  <text x="${L + 400}" y="446" font-family="${F}" font-size="34" fill="#4f5848">改三角交错 / 收边距 / 补空长</text>
  ${g}
  ${acts}
  <text x="${L}" y="${(top + h + 48).toFixed(1)}" font-family="${F}" font-size="26" fill="#7f8876">虚构示例：畦 ${A.num(o.v.L)} × ${A.num(o.v.B)} cm · 边距 ${A.num(o.v.e)} cm · 每个点是一棵，按比例画</text>
</svg>`;
fs.writeFileSync('cover.svg', svg);
console.log('cover.svg', svg.length);
