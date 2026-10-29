/* Limitations of LLM-as-a-Judge, told with the paintings (PLACEHOLDER scores).
   Four daisies from one prompt, in two rows that share their columns (ordered by the verifier's score), so the eye
   compares each painting straight down.
   Judge row: under each painting, the judge's scale (10 levels) with all of its weight on one level, and the score:
   the same 5 four times, joined by a hairline (a tie, as in the "break the tie" figure).
   Verifier row: under each painting, its own distribution over the 20 score tokens, its expected score marked.
   First view: the judge row lands at once, identical; then the verifier's marks leave that same spot and slide apart
   to their own scores while their distributions rise. Hover, tap or Enter replays. Reduced motion: the final state. */
(function () {
  'use strict';
  const root = document.getElementById('fx-judge-tie'); if (!root || !window.FX || !window.FIG) return;
  const { h, s, clamp, reduced, responsive, onVisible, tween, ease, paint, tag } = FX;
  const P = FIG.placeholder.daisies, GJ = P.judgeLevels, GV = 20;
  const gauss = (u, d) => Math.exp(-((u - d.mu) ** 2) / (2 * d.sd * d.sd));
  // the verifier's probabilities for its 20 score tokens (placeholder: a discretised bell), and the expected score 1–20
  const DV = P.verifier.map(d => { const w = Array.from({ length: GV }, (_, g) => gauss(g / (GV - 1), d)), z = w.reduce((a, b) => a + b); return w.map(v => v / z) });
  const EV = DV.map(p => p.reduce((e, v, g) => e + v * (g + 1), 0)), PMAX = Math.max(...DV.flat());
  const order = EV.map((_, i) => i).sort((a, b) => EV[a] - EV[b]);
  const SLIDE = 1150, STAG = 110; // ms: the verifier marks' slide, and the beat between columns
  const RM = reduced() || !window.Painter;

  const rows = [
    { cls: 'j', label: 'Judge', G: GJ, p: i => Array.from({ length: GJ }, (_, g) => g === P.judge[i] - 1 ? 1 : 0), m: i => P.judge[i], fmt: v => String(Math.round(v)) },
    { cls: 'v', label: 'Verifier', G: GV, p: i => DV[i], m: i => EV[i], fmt: v => v.toFixed(1) }
  ];
  const stage = h('div', { class: 'fx-jt', tabindex: '0', role: 'img' });
  rows.forEach(r => {
    r.lab = stage.appendChild(h('span', { class: 'fx-k fx-jt-l ' + r.cls }, r.label));
    r.cells = order.map((i, c) => {
      const svg = s('svg', { class: 'fx-jt-h', 'aria-hidden': 'true' });
      // each painting is a frame like the training figure's: the finished image, and a canvas that paints it the first time
      const src = P.imgs[i], cv = RM ? null : h('canvas', { 'aria-hidden': 'true' });
      const fr = h('div', { class: 'fx-pv fx-jt-p' + (RM ? ' done' : '') }, paint(src, '', { 'aria-hidden': 'true' }), cv);
      const el = stage.appendChild(h('div', { class: 'fx-jt-c ' + r.cls, style: { '--c': c } }, fr, svg));
      return { el, svg, i, c, txt: null, fr, cv, src };
    });
  });
  stage.setAttribute('aria-label', `Four watercolor daisies from one prompt. The judge gives all four the same score, ${P.judge[0]} of ${GJ}. ` +
    `The verifier's distributions over ${GV} score tokens differ, with expected scores ${order.map(i => EV[i].toFixed(1)).join(', ')}. Press Enter to replay.`);
  root.append(h('div', { class: 'fx-top' }, tag()), stage);

  // where the judge's score sits in a cell (token centres: (g − ½) of G slots); the verifier's marks start there
  const xOf = (m, G, cw) => (m - .5) / G * cw;
  function draw() {
    const c0 = rows[0].cells[0].el.getBoundingClientRect(), c1 = rows[0].cells[1].el.getBoundingClientRect(), cw = c0.width; if (!cw) return;
    const narrow = cw < 110, HB = narrow ? 22 : 30, fs = narrow ? 13 : 15, ty = HB + (narrow ? 22 : 24), H = ty + 5, pitch = c1.left - c0.left;
    const x0 = xOf(P.judge[0], GJ, cw), stacked = rows[0].lab.getBoundingClientRect().width > 100; // labels above the rows (phones)
    rows.forEach((r, ri) => {
      r.lab.style.marginTop = stacked ? '' : Math.round(cw / 2 - 7) + 'px';
      r.cells.forEach(cell => {
        const { svg, i, c } = cell, G = r.G, slot = cw / G, bw = Math.max(1.6, slot * (ri ? .64 : .5)), p = r.p(i), m = r.m(i), xm = xOf(m, G, cw);
        svg.setAttribute('viewBox', `0 0 ${cw} ${H}`); svg.setAttribute('width', cw); svg.setAttribute('height', H);
        svg.innerHTML = '';
        // the scale: a short segment per score level (10 for the judge, 20 for the verifier); the ends labelled once
        for (let g = 0; g < G; g++) svg.append(s('line', { class: 'slot', x1: g * slot + .8, x2: (g + 1) * slot - .8, y1: HB + .5, y2: HB + .5 }));
        if (c === 0) svg.append(s('text', { class: 'end', x: 0, y: HB + 11 }, '1'), s('text', { class: 'end', x: cw, y: HB + 11, 'text-anchor': 'end' }, String(G)));
        // the distribution: the judge's one bar, or the verifier's bars rising outward from the expected score
        p.forEach((v, g) => {
          if (v < .004) return;
          const bh = v / (ri ? PMAX : 1) * HB, d = ri ? c * STAG + 380 + Math.abs(g + 1 - m) * 26 : 380;
          svg.append(s('rect', { class: 'bar', x: (g + .5) * slot - bw / 2, y: HB - bh, width: bw, height: bh, rx: .8, style: `--d:${Math.round(d)}ms` }));
        });
        // the score: a dot on the scale and its value under it; the verifier's start at the judge's spot
        const tx = clamp(xm, fs, cw - fs), d = `--d:${ri ? c * STAG : 0}ms`;
        cell.txt = s('text', { class: 'mk val', x: tx, y: ty, 'text-anchor': 'middle', style: `--dx:${(ri ? x0 - tx : 0).toFixed(1)}px;${d}` }, r.fmt(ri && !stage.classList.contains('s3') ? m0() : m));
        svg.append(s('circle', { class: 'mk dot', cx: xm, cy: HB + .5, r: narrow ? 2.6 : 3.2, style: `--dx:${(ri ? x0 - xm : 0).toFixed(1)}px;${d}` }), cell.txt);
        // the judge's four 5s, joined: a tie
        if (!ri && c < 3) { const gp = fs * .62; svg.append(s('line', { class: 'tie', x1: tx + gp, x2: tx + pitch - gp, y1: ty - fs * .36, y2: ty - fs * .36 })) }
      });
    });
  }
  // the verifier's readouts count from the judge's spot (its 5 on the 20-token scale) to their own scores
  const m0 = () => (P.judge[0] - .5) / GJ * GV + .5;
  let count = null;
  function countUp() {
    if (count) count();
    const cells = rows[1].cells, total = SLIDE + STAG * (cells.length - 1);
    count = tween(total, t => cells.forEach(cell => {
      const k = clamp((t * total - cell.c * STAG) / SLIDE, 0, 1), a = m0(), b = EV[cell.i];
      if (cell.txt) cell.txt.textContent = (a + (b - a) * ease.inOut(k)).toFixed(1);
    }), () => { count = null });
  }

  // s1: the judge row lands; s2: the verifier's paintings and marks appear at the judge's spot; s3: they slide apart
  let timers = [], busy = false, seen = false, painted = RM;
  // first view: each row's frames show blank paper and the paintings paint themselves, column by column, like the
  // training figure (js/painter.js); the judge's scores land once its row is painted, then the verifier's row paints
  const paintRow = (r, speed, step) => Promise.all(r.cells.map(cell => {
    const job = Painter.paint(cell.cv, cell.src, { speed, delay: cell.c * step });
    return job.done.then(() => Painter.load(cell.src)).catch(() => {}).then(() => cell.fr.classList.add('done'));
  }));
  function firstPlay() {
    busy = true;
    stage.classList.add('reset'); stage.classList.remove('f1', 'f2', 's1', 's2', 's3'); draw(); void stage.offsetWidth; stage.classList.remove('reset');
    stage.classList.add('f1');
    paintRow(rows[0], 1.5, .32)
      .then(() => { stage.classList.add('s1'); return new Promise(res => timers.push(setTimeout(res, 1100))) })
      .then(() => { stage.classList.add('f2'); return paintRow(rows[1], 2, .22) })
      .then(() => {
        painted = true; stage.classList.add('s2');
        timers.push(setTimeout(() => { stage.classList.add('s3'); countUp() }, 600), setTimeout(() => { busy = false }, 2600));
      });
  }
  function play() {
    if (!painted) return firstPlay();
    timers.forEach(clearTimeout); timers = []; if (count) { count(); count = null }
    if (reduced()) { stage.classList.add('s1', 's2', 's3'); draw(); return }
    busy = true;
    stage.classList.add('reset'); stage.classList.remove('s1', 's2', 's3'); draw(); void stage.offsetWidth; stage.classList.remove('reset');
    timers.push(setTimeout(() => stage.classList.add('s1'), 60), setTimeout(() => stage.classList.add('s2'), 1500),
      setTimeout(() => { stage.classList.add('s3'); countUp() }, 2100), setTimeout(() => { busy = false }, 4000));
  }
  const replay = () => { if (seen && !busy) play() };
  stage.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') replay() });
  stage.addEventListener('click', replay);
  stage.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (seen) play() } });

  responsive(stage, draw);
  if (!RM) {
    const pre = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { pre.disconnect(); rows[0].cells.forEach(cell => Painter.prefetch(cell.src, cell.cv)) } }, { rootMargin: '700px 0px' });
    pre.observe(stage);
  }
  if (reduced()) { seen = true; play() }
  else onVisible(stage, () => { seen = true; play() }, .45);
})();
