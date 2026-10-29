/* Limitations of LLM-as-a-Judge, told with the paintings (PLACEHOLDER scores).
   Four daisies from one prompt. Judge: they drop onto its 10-level scale into one pile at 5 (all its probability
   on one token, the same token for each). Verifier: the same paintings come down from that pile and slide apart
   along its 20-token scale to their expected scores, each with its distribution as a soft glow.
   Plays once on first view; hover, tap or Enter replays. Reduced motion: the final state. */
(function () {
  'use strict';
  const root = document.getElementById('fx-judge-tie'); if (!root || !window.FX || !window.FIG) return;
  const { h, s, reduced, responsive, onVisible, paint, tag } = FX;
  const P = FIG.placeholder.daisies, GJ = P.judgeLevels, GV = 20, N = P.imgs.length;
  const gauss = (u, d) => Math.exp(-((u - d.mu) ** 2) / (2 * d.sd * d.sd));
  // expected score on the 1–20 scale, from the same discretised distribution the verifier would read
  const EV = P.verifier.map(d => { let z = 0, e = 0; for (let g = 0; g < GV; g++) { const p = gauss(g / (GV - 1), d); z += p; e += p * (g + 1) } return e / z });
  const uJ = (P.judge[0] - 1) / (GJ - 1), uV = EV.map(v => (v - 1) / (GV - 1));
  const FAN = [[-7, -4], [-2, -1.5], [3, 1.5], [8, 4]]; // the pile: small offsets (px) and turns (deg)
  const order = EV.map((v, i) => i).sort((a, b) => EV[a] - EV[b]);

  const svg = s('svg', { class: 'fx-jt-svg', 'aria-hidden': 'true' });
  const pile = P.imgs.map((src, i) => paint(src, '', { class: 'fx-paint fx-jt-p j', 'aria-hidden': 'true' }));
  const spread = P.imgs.map((src, i) => paint(src, '', { class: 'fx-paint fx-jt-p v', 'aria-hidden': 'true' }));
  const lj = h('span', { class: 'fx-k fx-jt-l j' }, 'Judge'), lv = h('span', { class: 'fx-k fx-jt-l v' }, 'Verifier');
  const stage = h('div', { class: 'fx-jt', tabindex: '0', role: 'img' }, svg, lj, lv, pile, spread);
  stage.setAttribute('aria-label', `Four watercolor daisies from one prompt. The judge gives all four a ${P.judge[0]} on its ${GJ}-level scale, so they land in one pile. ` +
    `The verifier's score distributions over ${GV} tokens spread the same four paintings apart, with expected scores ${order.map(i => EV[i].toFixed(1)).join(', ')}. Press Enter to replay.`);
  root.append(h('div', { class: 'fx-top' }, tag()), stage);

  function layout(W) {
    const narrow = W < 520, T = narrow ? 42 : 76, D = narrow ? 22 : 30, gap = narrow ? 26 : 34;
    const X = u => u * W, laneH = T + 8 + D + 20;
    const lanes = [{ top: 0, l: lj }, { top: laneH + gap, l: lv }];
    const H = laneH * 2 + gap; stage.style.height = H + 'px';
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.innerHTML = '';
    svg.append(s('defs', {}, s('linearGradient', { id: 'fx-jt-glow', x1: 0, y1: 0, x2: 0, y2: 1 },
      s('stop', { offset: 0, style: 'stop-color:var(--fx-ver);stop-opacity:.34' }), s('stop', { offset: 1, style: 'stop-color:var(--fx-ver);stop-opacity:.02' }))));
    lanes.forEach((ln, k) => {
      const base = ln.top + T + 8 + D, G = k ? GV : GJ;
      ln.base = base;
      Object.assign(ln.l.style, { top: ln.top + T / 2 + 'px' });
      // the scale: a hairline, one small tick per score token (10 for the judge, 20 for the verifier), the ends labelled
      svg.append(s('line', { class: 'axis', x1: 0, x2: W, y1: base + .5, y2: base + .5 }));
      for (let g = 0; g < G; g++) { const x = X(g / (G - 1)); svg.append(s('line', { class: 'tick', x1: x, x2: x, y1: base + 1, y2: base + 4 })) }
      svg.append(s('text', { x: 0, y: base + 17 }, '1'), s('text', { x: W, y: base + 17, 'text-anchor': 'end' }, String(G)));
    });
    // judge: every painting puts all its probability on the same token
    const xj = X(uJ), bj = lanes[0].base, bw = Math.max(4, W / (GJ - 1) * .16);
    svg.append(s('rect', { class: 'spike', x: xj - bw / 2, y: bj - D, width: bw, height: D, rx: 1 }));
    svg.append(s('text', { class: 'at', x: xj, y: bj + 17, 'text-anchor': 'middle' }, String(P.judge[0])));
    // verifier: a soft distribution under each painting, and its expected score on the scale
    const bv = lanes[1].base, pk = Math.max(...P.verifier.map(d => gauss(d.mu, d)));
    P.verifier.forEach((d, i) => {
      let path = `M0 ${bv}`;
      for (let k = 0; k <= 120; k++) { const u = k / 120; path += `L${X(u).toFixed(1)} ${(bv - gauss(u, d) / pk * D).toFixed(1)}` }
      const r = order.indexOf(i);
      svg.append(s('path', { class: 'glow', d: path + `L${W} ${bv}Z`, style: `--d:${r * 110}ms` }));
      svg.append(s('circle', { class: 'ev', cx: X(uV[i]), cy: bv + .5, r: narrow ? 2.5 : 3, style: `--d:${r * 110}ms` }));
    });
    // paintings: the judge's pile, and the verifier's copies, which start on that pile and end at their own score
    const lift = lanes[1].top - lanes[0].top;
    pile.forEach((im, i) => {
      const r = order.indexOf(i);
      Object.assign(im.style, { left: xj - T / 2 + 'px', top: lanes[0].top + 'px', width: T + 'px', height: T + 'px', zIndex: r + 1 });
      im.style.setProperty('--dx', FAN[r][0] * (narrow ? .6 : 1) + 'px'); im.style.setProperty('--r', FAN[r][1] + 'deg'); im.style.setProperty('--d', r * 120 + 'ms');
    });
    spread.forEach((im, i) => {
      const r = order.indexOf(i);
      Object.assign(im.style, { left: xj - T / 2 + 'px', top: lanes[1].top + 'px', width: T + 'px', height: T + 'px', zIndex: r + 1 });
      im.style.setProperty('--dx', FAN[r][0] * (narrow ? .6 : 1) + 'px'); im.style.setProperty('--r', FAN[r][1] + 'deg');
      im.style.setProperty('--tx', X(uV[i]) - xj + 'px'); im.style.setProperty('--lift', -lift + 'px'); im.style.setProperty('--d', r * 70 + 'ms'); im.style.setProperty('--d2', r * 110 + 'ms');
    });
  }

  // s1: the pile lands; s2: the copies come down from it; s3: they slide apart and the glows come up
  let timers = [], busy = false;
  function play() {
    timers.forEach(clearTimeout); timers = [];
    if (reduced()) { stage.classList.add('s1', 's2', 's3'); return }
    busy = true;
    stage.classList.add('reset'); stage.classList.remove('s1', 's2', 's3'); void stage.offsetWidth; stage.classList.remove('reset');
    timers.push(setTimeout(() => stage.classList.add('s1'), 60), setTimeout(() => stage.classList.add('s2'), 1350),
      setTimeout(() => stage.classList.add('s3'), 2150), setTimeout(() => { busy = false }, 3800));
  }
  let seen = false;
  const replay = () => { if (seen && !busy) play() };
  stage.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') replay() });
  stage.addEventListener('click', replay);
  stage.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (seen) play() } });

  responsive(stage, layout);
  if (reduced()) { seen = true; play() }
  else onVisible(stage, () => { seen = true; play() }, .55);
})();
