/* Best-of-N at test time (PLACEHOLDER curve).
   Sample N paintings per prompt, keep the one each scorer ranks highest, grade the pick with the held-out grader.
   Random picking stays flat; a judge plateaus because its top scores tie; the verifier keeps improving with N.
   Lines draw in on first view; hover or drag to read a value. */
(function () {
  'use strict';
  const root = document.getElementById('fx-bon'); if (!root || !window.FX || !window.FIG) return;
  const { h, s, clamp, reduced, responsive, onVisible, tag } = FX;
  const P = FIG.placeholder.bestOfN, NS = P.n, Y0 = .70, Y1 = .81;
  const ARMS = [['random', 'Random', 'rand'], ['judge', 'Judge', 'j'], ['verifier', 'Verifier', 'v']];
  root.append(h('div', { class: 'fx-top' }, tag()));
  const chart = h('div', { class: 'fx-bn', role: 'img', 'aria-label': 'Placeholder chart: held-out score of the selected painting as the number of samples N grows from 1 to 32. Random stays at 0.72; the judge rises to about 0.755; the verifier rises to about 0.80.' });
  root.append(chart);
  let L = null, shown = reduced();

  function draw(W) {
    const narrow = W < 520, H = narrow ? 230 : 280, m = { l: 38, r: narrow ? 62 : 80, t: 28, b: 38 };
    const X = i => m.l + i / (NS.length - 1) * (W - m.l - m.r), Y = v => m.t + (1 - (v - Y0) / (Y1 - Y0)) * (H - m.t - m.b);
    chart.innerHTML = '';
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H });
    [.72, .76, .80].forEach(v => svg.append(s('line', { class: 'grid', x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }), s('text', { x: m.l - 8, y: Y(v) + 3.5, 'text-anchor': 'end' }, v.toFixed(2))));
    svg.append(s('text', { class: 'cap', x: m.l - 8, y: m.t - 14 }, 'Held-out score of the pick'));
    svg.append(s('line', { class: 'axis', x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b }));
    NS.forEach((n, i) => svg.append(s('text', { x: X(i), y: H - m.b + 17, 'text-anchor': 'middle' }, n)));
    svg.append(s('text', { class: 'cap', x: W - m.r, y: H - 2, 'text-anchor': 'end' }, 'Samples per prompt, N'));
    const path = a => P[a].map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join('');
    ARMS.forEach(([a, , c]) => svg.append(s('path', { class: (c === 'rand' ? 'rand' : 'fx-line ' + c) + ' draw', d: path(a) })));
    let ys = ARMS.map(([a]) => Y(P[a][NS.length - 1]));
    for (let i = 1; i < ys.length; i++) for (let j = 0; j < i; j++) if (Math.abs(ys[i] - ys[j]) < 15) ys[i] = ys[j] - 15;
    ARMS.forEach(([a, label, c], i) => svg.append(s('text', { class: 'end fade ' + (c === 'rand' ? '' : c), x: X(NS.length - 1) + 10, y: ys[i] + 4, style: c === 'rand' ? 'fill:var(--fg4)' : '' }, label)));
    const guide = s('line', { class: 'guide', y1: m.t, y2: H - m.b }), dv = s('circle', { class: 'dot-v', r: 4.5 }), dj = s('circle', { class: 'dot-j', r: 4.5 });
    const tv = s('text', { class: 'end v', style: 'font-size:12px' }), tj = s('text', { class: 'end j', style: 'font-size:12px' });
    svg.append(s('g', { class: 'hov', 'aria-hidden': 'true' }, guide, dv, dj, tv, tj));
    chart.append(svg);
    chart.querySelectorAll('.draw').forEach(p => p.style.setProperty('--len', p.getTotalLength()));
    if (shown) chart.classList.add('in');
    L = { X, Y, W, m, guide, dv, dj, tv, tj };
  }
  function focus(e) {
    if (!L) return; const b = chart.getBoundingClientRect(), i = clamp(Math.round((e.clientX - b.left - L.m.l) / (L.W - L.m.l - L.m.r) * (NS.length - 1)), 0, NS.length - 1), x = L.X(i);
    const v = P.verifier[i], j = P.judge[i];
    L.guide.setAttribute('x1', x); L.guide.setAttribute('x2', x);
    L.dv.setAttribute('cx', x); L.dv.setAttribute('cy', L.Y(v)); L.dj.setAttribute('cx', x); L.dj.setAttribute('cy', L.Y(j));
    const right = i >= NS.length - 2, dx = right ? -9 : 9, an = right ? 'end' : 'start';
    let yv = L.Y(v), yj = L.Y(j); if (yj - yv < 15) { yv = (yv + yj) / 2 - 7.5; yj = yv + 15 }
    [[L.tv, v, yv], [L.tj, j, yj]].forEach(([t, val, y]) => { t.setAttribute('x', x + dx); t.setAttribute('y', y + 4); t.setAttribute('text-anchor', an); t.textContent = val.toFixed(3) });
    chart.classList.add('focus');
  }
  chart.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || e.buttons) focus(e) });
  chart.addEventListener('pointerdown', focus);
  chart.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') chart.classList.remove('focus') });
  responsive(chart, draw);
  if (!reduced()) onVisible(chart, () => { shown = true; chart.classList.add('in') }, .4);
})();
