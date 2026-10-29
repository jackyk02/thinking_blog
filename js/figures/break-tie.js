/* How LLM-as-a-Verifier breaks ties (SIMULATED).
   Five paintings from one group, each with its reward (dot) and how far that reward moves when re-scored (band).
   Start: a judge reads one score token on a 10-point scale, so four paintings land on the same value (grey line).
   Turning on each verifier dimension spreads them apart: Granularity reads 20 score tokens as an expected value,
   Repeats averages K = 4 calls, Criteria averages C = 3 criteria. Plays G → K → C once on first view. */
(function () {
  'use strict';
  const root = document.getElementById('fx-break-tie'); if (!root || !window.FX || !window.FIG) return;
  const { h, s, reduced, responsive, onVisible, wait, tag, paint, rng, gauss, clamp } = FX;
  const S = FIG.sim, Q = S.quality, imgs = FIG.groups.pear.imgs, R0 = .3, R1 = .9, N = 300;
  const DIMS = [['g', 'Granularity', 'G'], ['k', 'Repeats', 'K'], ['c', 'Criteria', 'C']];
  let cfg = { g: false, k: false, c: false };

  /* one verifier/judge reading of painting q under cfg */
  function dist(mu, G) { const p = []; let z = 0; for (let g = 0; g < G; g++) { const u = g / (G - 1), w = Math.exp(-((u - mu) ** 2) / (2 * S.spread * S.spread)); p.push(w); z += w } return p.map(v => v / z) }
  function once(q, r) {
    const G = cfg.g ? S.full.G : S.base.G, K = cfg.k ? S.full.K : S.base.K, C = cfg.c ? S.full.C : S.base.C; let tot = 0;
    for (let c = 0; c < C; c++) for (let k = 0; k < K; k++) {
      const p = dist(clamp(q[c] + gauss(r) * S.noise, 0, 1), G); let v;
      if (cfg.g) { v = 0; for (let g = 0; g < G; g++) v += p[g] * g / (G - 1) }      // expected score over G tokens
      else { let x = r(), g = 0; while (g < G - 1 && (x -= p[g]) > 0) g++; v = g / (G - 1) } // one sampled token
      tot += v;
    }
    return tot / (C * K);
  }
  const cache = {};
  function stats() {
    const key = (cfg.g ? 1 : 0) + (cfg.k ? 2 : 0) + (cfg.c ? 4 : 0);
    if (cache[key]) return cache[key];
    const r = rng(1009 + key * 7919);
    const q = (a, p) => a[Math.floor(p * (a.length - 1))];
    return cache[key] = Q.map(qq => { const a = Array.from({ length: N }, () => once(qq, r)).sort((x, y) => x - y); return { med: q(a, .5), lo: q(a, .1), hi: q(a, .9) } });
  }

  // controls
  const pills = DIMS.map(([k, label, sym]) => h('button', { type: 'button', class: 'fx-pill', 'aria-pressed': 'false', onclick() { stopAuto(); set(k, !cfg[k]) } }, label, h('i', {}, sym)));
  root.append(h('div', { class: 'fx-top split' }, h('div', { class: 'fx-bt-ctrl', role: 'group', 'aria-label': 'Verifier dimensions' }, pills), tag('simulated')));
  const body = h('div', { class: 'fx-bt' }), axis = h('div', { class: 'fx-bt-axis', 'aria-hidden': 'true' });
  root.append(body, axis);
  const live = h('p', { class: 'fx-k', 'aria-live': 'polite', style: { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' } });
  root.append(live);

  const rows = imgs.map((src, i) => h('div', { class: 'fx-bt-row' }, paint(src, `Painting ${'ABCDE'[i]} of the group: a coral pear`)));
  body.append(...rows);
  const over = h('div', { style: { position: 'absolute', top: 0, bottom: 0, right: 0 } });
  const bands = Q.map(() => over.appendChild(h('div', { class: 'fx-bt-band' })));
  const dots = Q.map(() => over.appendChild(h('div', { class: 'fx-bt-dot' })));
  body.append(over);
  let L = null, ties = [];

  function layout(W) {
    const narrow = W < 520, th = narrow ? 34 : 44, gap = narrow ? 8 : 10, rowH = th + gap, x0 = th + (narrow ? 14 : 22), tw = W - x0 - (narrow ? 6 : 12);
    rows.forEach(r => { r.style.height = rowH + 'px'; const im = r.firstChild; im.style.width = im.style.height = th + 'px' });
    Object.assign(over.style, { left: x0 + 'px', width: tw + 'px' });
    const X = v => (v - R0) / (R1 - R0) * tw;
    // score-token levels: 10 for the judge, 20 once granularity is on
    const old = body.querySelector('svg.grid-layer'); if (old) old.remove();
    const H = rowH * rows.length, gl = s('svg', { class: 'grid-layer', width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    const lv = G => s('g', { class: 'lvl', 'data-g': G }, ...Array.from({ length: G }, (_, g) => g / (G - 1)).filter(v => v > R0 && v < R1).map(v => s('line', { x1: x0 + X(v), x2: x0 + X(v), y1: 2, y2: H - gap / 2, 'stroke-dasharray': G === S.base.G ? '2 3' : '1 4' })));
    gl.append(lv(S.base.G), lv(S.full.G)); body.prepend(gl);
    axis.innerHTML = '';
    const ah = narrow ? 40 : 30, ax = s('svg', { width: W, height: ah, viewBox: `0 0 ${W} ${ah}` });
    axis.style.height = ah + 'px';
    ax.append(s('line', { class: 'axis', x1: x0, x2: x0 + tw, y1: 4, y2: 4 }));
    [.4, .6, .8].forEach(v => ax.append(s('line', { class: 'axis', x1: x0 + X(v), x2: x0 + X(v), y1: 4, y2: 8 }), s('text', { x: x0 + X(v), y: 20, 'text-anchor': 'middle' }, v.toFixed(1))));
    ax.append(s('text', { class: 'cap', x: x0 + tw, y: narrow ? 36 : 20, 'text-anchor': 'end' }, 'Reward'));
    axis.append(ax);
    L = { X, rowH, H, gl };
    render(true);
  }

  function render(instant) {
    if (!L) return;
    const st = stats(), { X, rowH } = L;
    if (instant) [...bands, ...dots].forEach(e => e.style.transition = 'none');
    st.forEach((p, i) => {
      Object.assign(bands[i].style, { left: X(p.lo) - 4 + 'px', width: Math.max(8, X(p.hi) - X(p.lo) + 8) + 'px', top: i * rowH + rowH / 2 - 4 + 'px', marginTop: '0' });
      Object.assign(dots[i].style, { left: X(p.med) + 'px', top: i * rowH + rowH / 2 + 'px', marginTop: '-5.5px' });
    });
    if (instant) requestAnimationFrame(() => [...bands, ...dots].forEach(e => e.style.transition = ''));
    // exact ties: same reward → grey dots joined by a line
    const groups = {}; st.forEach((p, i) => { const k = p.med.toFixed(6); (groups[k] = groups[k] || []).push(i) });
    ties.forEach(t => { t.style.opacity = 0; setTimeout(() => t.remove(), 500) }); ties = [];
    const tied = new Set();
    Object.values(groups).filter(g => g.length > 1).forEach(g => {
      g.forEach(i => tied.add(i));
      const a = Math.min(...g), b = Math.max(...g), x = X(st[g[0]].med);
      const t = h('div', { class: 'fx-bt-tie', style: { left: x - .75 + 'px', top: a * rowH + rowH / 2 + 'px', height: (b - a) * rowH + 'px', opacity: 0 } });
      over.insertBefore(t, dots[0]); ties.push(t); requestAnimationFrame(() => requestAnimationFrame(() => t.style.opacity = 1));
    });
    dots.forEach((d, i) => d.classList.toggle('tied', tied.has(i)));
    [...L.gl.querySelectorAll('.lvl')].forEach(g => g.style.opacity = (+g.dataset.g === (cfg.g ? S.full.G : S.base.G)) ? 1 : 0);
    const nt = Object.values(groups).filter(g => g.length > 1).reduce((t, g) => t + g.length * (g.length - 1) / 2, 0);
    live.textContent = `${DIMS.filter(d => cfg[d[0]]).map(d => d[1]).join(', ') || 'Judge, one score token'}: ${nt ? nt + ' tied pairs' : 'no ties'}.`;
  }
  function set(k, on) { cfg[k] = on; pills.forEach((p, i) => p.setAttribute('aria-pressed', String(cfg[DIMS[i][0]]))); render(false) }

  let auto = false;
  function stopAuto() { auto = false }
  async function play() {
    auto = true;
    for (const [k] of DIMS) { await wait(k === 'g' ? 1000 : 1800); if (!auto) return; set(k, true) }
    auto = false;
  }
  if (reduced()) { DIMS.forEach(([k]) => cfg[k] = true); pills.forEach(p => p.setAttribute('aria-pressed', 'true')) }
  responsive(body, layout);
  if (!reduced()) onVisible(body, play, .6);
})();
