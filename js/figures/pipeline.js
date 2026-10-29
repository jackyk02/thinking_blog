/* RL training pipeline: one group of five real paintings goes through the loop.
   Prompt → Code (Inkling-Small writes p5.brush) → Render (the code becomes the painting) → Verify (Inkling-Small
   compares every pair, reads a score distribution, takes its expected value) → Normalise (reward minus the group
   mean) → Update (GRPO), then the updated policy writes the next group.
   Render: each sketch's lines light up in turn and dissolve as the washes they stand for bloom on the paper
   (js/painter.js), the five paintings a beat apart. The lines are schematic and the reveal is rebuilt from the
   finished image, not replayed from the sketch (we don't have these sketches). Paintings are real (step 250); the
   scores are PLACEHOLDER. Loops while visible; pause button; click a stage to hold it. Reduced motion: holds on Normalise. */
(function () {
  'use strict';
  const root = document.getElementById('fx-pipeline'); if (!root || !window.FX || !window.FIG) return;
  const { h, s, reduced, responsive, watch, paint, playButton, tag } = FX;
  const RM = reduced() || !window.Painter;
  const G = FIG.groups, PH = FIG.placeholder.pipeline;
  const GROUPS = ['pear', 'hydrangea'].map(k => ({ prompt: G[k].short, imgs: G[k].imgs, r: PH[k], name: k }));
  const STAGES = [['Prompt', ''], ['Code', 'Inkling-Small'], ['Render', ''], ['Verify', 'Inkling-Small'], ['Normalise', ''], ['Update', 'GRPO']];
  const DUR = [1100, 1500, 0, 2200, 1900, 1800]; // Render lasts as long as the paintings take
  const LINES = 8, SPEED = 1.2, STAGGER = .26;
  let st = 0, gi = 0, playing = !RM, visible = false, timer = 0, started = false, run = 0;

  // rail
  const items = STAGES.map(([n, sub], i) => h('li', { class: (i === 1 || i === 3 ? 'self ' : '') + (i === 3 ? 'acc' : '') },
    h('button', { type: 'button', 'aria-label': `${n}${sub ? ' (' + sub + ')' : ''}`, onclick() { hold(i) } }, h('span', { class: 'n' }, n), sub ? h('span', { class: 'sub' }, sub) : null)));
  const rail = h('ol', { class: 'fx-pl-rail' }, items);
  const wire = s('svg', { class: 'fx-pl-wire', 'aria-hidden': 'true' });
  const btn = playButton(() => {
    playing = !playing; btn.set(playing);
    slots.forEach(x => x.job && (playing ? x.job.resume() : x.job.pause()));
    if (playing) { if (st >= 5) st = -1; schedule(st === 2 ? 0 : 400) } else clearTimeout(timer);
  });
  btn.set(playing);
  if (RM) btn.style.visibility = 'hidden';
  const railWrap = h('div', { style: { position: 'relative', flex: '1', minWidth: '0' } }, wire, rail);
  const now = h('div', { class: 'fx-pl-now', 'aria-live': 'off' });
  const prompt = h('p', { class: 'fx-pl-prompt' });
  const arcs = s('svg', { class: 'fx-pl-arcs', 'aria-hidden': 'true' });
  // schematic code lines: widths per painting, so each sketch looks a little different
  const widths = Array.from({ length: 5 }, (_, i) => { const r = FX.rng(11 + i * 7); return Array.from({ length: LINES }, (_, j) => j === 0 || j === LINES - 1 ? .38 + .2 * r() : .4 + .48 * r()) });
  const slots = [0, 1, 2, 3, 4].map(i => {
    const bars = widths[i].map((w, j) => h('i', { style: { width: w * 100 + '%', marginLeft: (j && j < LINES - 1 ? 10 : 0) + '%', '--d': i * 70 + j * 75 + 'ms' } }));
    const code = h('div', { class: 'fx-pl-code', 'aria-hidden': 'true' }, bars);
    const img = paint(GROUPS[0].imgs[i], ''), cv = RM ? null : h('canvas', { 'aria-hidden': 'true' });
    const sq = h('div', { class: 'fx-pl-sq' + (RM ? ' done' : '') }, img, cv, code);
    const dist = h('div', { class: 'fx-pl-dist', 'aria-hidden': 'true' }, Array.from({ length: 12 }, (_, b) => h('i', { style: { '--d': i * 60 + b * 18 + 'ms' } })));
    const score = h('span', { class: 'fx-pl-score' }), bar = h('span', { class: 'bar' }), adv = h('div', { class: 'fx-pl-adv', 'aria-hidden': 'true' }, bar);
    return { el: h('div', { class: 'fx-pl-slot' }, sq, dist, score, adv), sq, img, cv, bars, dist, score, bar, adv, i, job: null };
  });
  const row = h('div', { class: 'fx-pl-row' }, slots.map(x => x.el));
  const mean = h('div', { class: 'fx-pl-mean', 'aria-hidden': 'true' });
  const body = h('div', { class: 'fx-pl-body' }, arcs, row, mean);
  root.append(h('div', { class: 'fx-top split' }, btn, tag()), h('div', { class: 'fx-pl-head' }, railWrap), now, prompt, body);
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'RL training loop: a text prompt; Inkling-Small writes five p5.brush sketches; each sketch renders into a painting; Inkling-Small, as the verifier, compares every pair and scores each painting; scores are centered within the group; GRPO updates the model, which writes the next group.');

  const prefetch = g => { if (!RM) GROUPS[g].imgs.forEach((src, i) => Painter.prefetch(src, slots[i].cv, 320)) };
  function fill(g) {
    const grp = GROUPS[g], m = grp.r.reduce((a, b) => a + b) / 5, adv = grp.r.map(v => v - m), mx = Math.max(...adv.map(Math.abs));
    prompt.textContent = `“${grp.prompt}”`;
    slots.forEach(x => {
      x.img.src = grp.imgs[x.i]; x.img.alt = `Painting ${'ABCDE'[x.i]}: ${grp.prompt}`;
      const r = grp.r[x.i];
      [...x.dist.children].forEach((b, k) => { const u = (k + .5) / 12; const v = Math.exp(-((u - r) ** 2) / (2 * .085 * .085)); b.style.setProperty('--h', (v < .05 ? 0 : v).toFixed(3)) });
      x.score.textContent = r.toFixed(2);
      const a = adv[x.i]; x.bar.className = 'bar ' + (a >= 0 ? 'up' : 'dn'); x.bar.style.setProperty('--d', x.i * 80 + 'ms'); x.bar._f = Math.abs(a) / mx;
    });
    sizeBars(); prefetch(g);
  }
  function sizeBars() { const half = (slots[0].adv.getBoundingClientRect().height || 60) / 2 - 3; slots.forEach(x => x.bar.style.height = Math.max(2, x.bar._f * half) + 'px') }

  /* ---- render: paint the five, code lines lighting up and dissolving with the layers they stand for ---- */
  function clearPaint() {
    slots.forEach(x => { if (x.job) { x.job.cancel(false); x.job = null } x.sq.classList.remove('paper', 'done'); x.bars.forEach(b => b.classList.remove('on', 'gone')) });
  }
  function finishPaint() {
    slots.forEach(x => { if (x.job) { x.job.cancel(true); x.job = null } x.sq.classList.remove('paper'); x.sq.classList.add('done') });
  }
  function startPaint() {
    clearPaint();
    const id = ++run, grp = GROUPS[gi];
    const jobs = slots.map(x => {
      x.sq.classList.add('paper');
      const job = x.job = Painter.paint(x.cv, grp.imgs[x.i], { max: 320, speed: SPEED, delay: .35 + x.i * STAGGER, onFrame: t => lines(x, job, t) });
      return job.done.then(() => { if (x.job === job) { x.job = null; x.sq.classList.add('done'); x.sq.classList.remove('paper') } });
    });
    // when all five are painted, the loop moves on (if it is playing)
    Promise.all(jobs).then(() => { if (id === run && st === 2) schedule(650) });
  }
  function lines(x, job, t) {
    const L = job.layers, n = L.length; if (!n) return;
    for (let j = 0; j < LINES; j++) {
      const a = Math.min(n - 1, Math.floor(j * n / LINES)), b = Math.max(a, Math.min(n - 1, Math.floor((j + 1) * n / LINES) - 1));
      const on = t >= L[a].t0, gone = t >= L[b].t1 - .15;
      const el = x.bars[j]; el.classList.toggle('on', on && !gone); el.classList.toggle('gone', gone);
    }
  }

  function layout() {
    // rail wire: base line through the stage dots, a progress line, and the loop from Update back to Code
    const rb = railWrap.getBoundingClientRect(), dots = items.map(li => { const b = li.firstChild.getBoundingClientRect(); return [b.left - rb.left + b.width / 2, b.top - rb.top + 4.5] });
    const y = dots[0][1], x0 = dots[0][0], x5 = dots[5][0], x1 = dots[1][0];
    wire.setAttribute('viewBox', `0 0 ${rb.width} ${rb.height}`);
    wire.innerHTML = '';
    wire.append(s('line', { class: 'base', x1: x0, x2: x5, y1: y, y2: y }));
    const prog = s('line', { class: 'prog', x1: x0, x2: x5, y1: y, y2: y, 'stroke-dasharray': x5 - x0, 'stroke-dashoffset': x5 - x0 });
    wire.append(prog);
    const top = y - 19;
    wire.append(s('path', { class: 'loop', d: `M${x5} ${y - 7}V${top + 6}Q${x5} ${top} ${x5 - 6} ${top}H${x1 + 6}Q${x1} ${top} ${x1} ${top + 6}V${y - 10}` }),
      s('path', { class: 'loop-head', d: `M${x1 - 3.5} ${y - 12}L${x1 + 3.5} ${y - 12}L${x1} ${y - 7}z` }));
    wire._prog = prog; wire._len = x5 - x0;
    // pairwise arcs: drawn in the band above the paintings
    const bb = body.getBoundingClientRect(), centers = slots.map(x => { const b = x.el.getBoundingClientRect(); return b.left - bb.left + b.width / 2 });
    const sq = slots[0].sq.getBoundingClientRect(), y0 = sq.top - bb.top - 4, span = centers[4] - centers[0];
    arcs.setAttribute('viewBox', `0 0 ${bb.width} ${Math.max(1, y0 + 2)}`); arcs.setAttribute('width', bb.width); arcs.setAttribute('height', Math.max(1, y0 + 2));
    arcs.innerHTML = ''; let n = 0;
    for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) {
      const xa = centers[a], xb = centers[b], pk = y0 - (6 + (xb - xa) / span * (y0 - 10)) * 2; // quadratic peak sits at half the control height
      const p = s('path', { d: `M${xa} ${y0}Q${(xa + xb) / 2} ${pk} ${xb} ${y0}` }); arcs.append(p);
      const len = p.getTotalLength(); p.style.strokeDasharray = len; p.style.setProperty('--len', len); p.style.setProperty('--d', n++ * 85 + 'ms');
    }
    // mean line through the middle of the advantage lane
    const ab = slots[0].adv.getBoundingClientRect(); mean.style.top = ab.top - bb.top + ab.height / 2 + 'px';
    sizeBars(); stageClasses(st, true);
  }

  function stageClasses(i, instant) {
    for (let k = 0; k < 6; k++) root.classList.toggle('st' + k, k === i);
    items.forEach((li, k) => { li.classList.toggle('on', k === i); li.classList.toggle('past', k < i) });
    if (wire._prog) { wire._prog.style.transition = instant ? 'none' : ''; wire._prog.setAttribute('stroke-dashoffset', wire._len * (1 - i / 5)) }
    now.textContent = STAGES[i][0] + (STAGES[i][1] ? ' · ' + STAGES[i][1] : '');
  }
  function show(i, instant) {
    st = i; stageClasses(i, instant);
    if (!RM) {
      if (i < 2) clearPaint();
      else if (i > 2) finishPaint();
    }
    if (i === 3 && !instant && !RM) { root.classList.remove('arcs'); void root.offsetWidth; root.classList.add('arcs') }
    else if (i !== 3) root.classList.remove('arcs');
    if (i === 4) prefetch((gi + 1) % GROUPS.length);
  }
  function next() {
    if (st >= 5) { // fade the finished group out, bring in the next one at the prompt
      body.classList.add('out');
      timer = setTimeout(() => { gi = (gi + 1) % GROUPS.length; show(0, true); fill(gi); body.classList.remove('out'); schedule(DUR[0]) }, 520);
      return;
    }
    show(st + 1);
    if (st === 2) startPaint(); else schedule(DUR[st]);
  }
  function schedule(delay) {
    clearTimeout(timer);
    if (!playing || !visible) return;
    if (st === 2 && slots.some(x => x.job)) return; // still painting: the paint's own promise moves on
    timer = setTimeout(next, delay);
  }
  function hold(i) {
    playing = false; btn.set(false); clearTimeout(timer);
    show(i);
    if (i === 2 && !RM) startPaint();
  }

  fill(0);
  responsive(root, layout);
  window.addEventListener('load', layout);
  if (RM) { show(4, true); return }
  show(0, true);
  watch(root, v => {
    visible = v;
    if (!v) { clearTimeout(timer); return }
    if (!started) { started = true; show(0, true) }
    schedule(st === 0 ? 700 : st === 2 ? 650 : DUR[st]);
  }, .35);
})();
