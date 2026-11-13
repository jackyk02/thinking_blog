/* Why ties zero the learning signal (PLACEHOLDER scores).
   One group of five paintings scored by the judge and by the verifier. Each dot is a painting's reward,
   the dashed line is the group mean, and the bar between them is the advantage GRPO learns from.
   Judge: every painting gets the same score, every dot sits on the mean, no bars. Verifier: bars. */
(function () {
  'use strict';
  const root = document.getElementById('fx-grpo-tie'); if (!root || !window.FX || !window.FIG) return;
  const { h, s, reduced, responsive, onVisible, tag, paint } = FX;
  const grp = FIG.groups.pear, P = FIG.placeholder.grpo;
  const lanes = [
    { key: 'judge', label: 'Judge', cls: 'j', vals: P.judge, fmt: v => String(v), norm: v => v / 10 },
    { key: 'verifier', label: 'Verifier', cls: 'v', vals: P.verifier, fmt: v => v.toFixed(2), norm: v => v }
  ];
  lanes.forEach(l => { const r = l.vals.map(l.norm), m = r.reduce((a, b) => a + b) / r.length; l.adv = r.map(v => v - m) });
  const maxA = Math.max(...lanes.flatMap(l => l.adv.map(Math.abs)));

  root.append(h('div', { class: 'fx-top' }, tag()));
  const imgs = h('div', { class: 'imgs' }, grp.imgs.map((src, i) => paint(src, `Painting ${'ABCDE'[i]}: a coral pear`)));
  const grid = h('div', { class: 'fx-gr' }, h('div', { 'aria-hidden': 'true' }), imgs);
  lanes.forEach(l => { l.el = h('div', { class: 'lane' }); l.lbl = h('div', { class: 'lane-l fx-k ' + l.cls }, l.label); grid.append(l.lbl, l.el) });
  root.append(grid);
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', `Five paintings of one prompt. The judge scores all five ${P.judge[0]}, so every reward equals the group mean and every advantage is zero. The verifier's scores (${P.verifier.map(v => v.toFixed(2)).join(', ')}) differ, so each painting gets a positive or negative advantage.`);

  function draw(W) {
    const narrow = W < 560, w = imgs.getBoundingClientRect().width, gap = narrow ? 7 : 12, cw = (w - 4 * gap) / 5;
    const HV = narrow ? 82 : 96, midV = narrow ? 34 : 40, half = narrow ? 28 : 34, sc = half / maxA, bw = narrow ? 8 : 10;
    lanes.forEach(l => {
      l.el.innerHTML = '';
      // a lane with no advantages needs no room above or below its mean line
      const flat = l.adv.every(a => Math.abs(a) < 1e-9), mid = flat ? 14 : midV, H = flat ? 42 : HV;
      const svg = s('svg', { viewBox: `0 0 ${w} ${H}`, width: w, height: H, 'aria-hidden': 'true' });
      svg.append(s('line', { class: 'mean', x1: 0, x2: w, y1: mid, y2: mid }));
      const xs = l.adv.map((_, i) => i * (cw + gap) + cw / 2);
      if (l.adv.every(a => Math.abs(a) < 1e-9)) svg.append(s('line', { class: 'flat', x1: xs[0], x2: xs[4], y1: mid, y2: mid }));
      l.adv.forEach((a, i) => {
        const x = xs[i], y = mid - a * sc, d = i * 90 + 'ms';
        if (Math.abs(a) > 1e-9) svg.append(s('rect', { class: 'bar ' + (a > 0 ? 'up' : 'dn'), x: x - bw / 2, y: Math.min(y, mid), width: bw, height: Math.abs(mid - y), rx: 1.5, style: `fill:${a > 0 ? 'var(--fx-ver)' : 'var(--fx-jud)'};--d:${d}` }));
        svg.append(s('circle', { class: 'pt', cx: x, cy: y, r: 4.5, style: `fill:${l.cls === 'v' ? 'var(--fx-ver)' : 'var(--fx-jud)'};stroke:var(--bg);stroke-width:2;--d:${d}` }));
        svg.append(s('text', { class: 'sc', x, y: H - 4, 'text-anchor': 'middle' }, l.fmt(l.vals[i])));
      });
      l.el.append(svg);
      l.lbl.style.alignSelf = narrow ? '' : 'start'; l.lbl.style.marginTop = narrow ? '' : mid - 7 + 'px';
    });
  }
  responsive(grid, draw);
  const play = () => { grid.classList.add('s1'); setTimeout(() => grid.classList.add('s2'), reduced() ? 0 : 700); setTimeout(() => grid.classList.add('s3'), reduced() ? 0 : 1300) };
  if (reduced()) play(); else onVisible(grid, play, .5);
})();
