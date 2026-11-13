/* More paintings over RL training, on Jacky's grid: a TRAINING STEP axis (100 → 400) over six rows of prompts, one
   painting per step. Every cell starts as blank paper. When the grid comes into view the cells paint themselves one
   by one, column by column (step 100 down the prompts, then 200, …), with the shared painter (js/painter.js): a few
   at a time, a beat apart, and only cells that are on screen. A click on a step finishes its column (the paintings
   left in it play through quickly); a click on an unfinished cell finishes that one. A finished cell shows the image
   itself and lets its canvas go. Reduced motion: every painting, still. */
(function () {
  'use strict';
  const root = document.getElementById('fx-gallery'); if (!root || !window.FX || !window.FIG) return;
  const { h, reduced, paint, watch } = FX;
  const RM = reduced() || !window.Painter;
  const P = FIG.demos.more, STEPS = [100, 200, 300, 400];
  // a new cell starts GAP s after the last one (plus COL at a new column), with at most MAXC painting at once
  const GAP = .55, COL = .6, SPEED = 1.45, MAXC = 3, HURRY = .75;
  const src = (pi, k) => `demos/${P[pi][1]}-iter${k + 1}.jpg`;

  const grid = h('div', { class: 'fx-gg' });
  const steps = STEPS.map((st, k) => RM ? h('span', {}, String(st)) : h('button', {
    type: 'button', title: `Finish step ${st}`, 'aria-label': `Finish painting the step ${st} column`,
    onclick() { finishCol(k) }, onmouseenter() { aim(k) }, onmouseleave() { delete grid.dataset.hk },
    onfocus() { aim(k) }, onblur() { delete grid.dataset.hk }
  }, String(st)));
  grid.append(h('div', { class: 'fx-gg-axis' }, h('span', { class: 'fx-k' }, 'Training step'), h('div', { class: 'fx-gg-steps' }, steps)));
  const cells = [];
  P.forEach(([name], pi) => {
    const row = STEPS.map((st, k) => {
      const im = paint(src(pi, k), `${name}, step ${st}`, RM ? null : { loading: null });
      const cv = RM ? null : h('canvas', { 'aria-hidden': 'true' });
      const el = h('div', { class: 'fx-gg-cell' + (RM ? ' done' : ''), 'data-k': k }, im, cv);
      const c = { el, im, cv, pi, k, st: RM ? 'done' : 'idle', job: null, vis: false, rushed: false };
      if (!RM) el.addEventListener('click', () => finishCell(c));
      cells.push(c);
      return el;
    });
    grid.append(h('div', { class: 'fx-gg-row' }, h('span', { class: 'fx-gg-p' }, name), h('div', { class: 'fx-gg-cells' }, row)));
  });
  root.append(grid);
  if (RM) return;
  cells.sort((a, b) => a.k - b.k || a.pi - b.pi); // painting order: column by column

  /* ---- one cell ---- */
  function start(c, rush) {
    c.st = 'painting'; c.el.classList.add('painting');
    const job = c.job = Painter.paint(c.cv, src(c.pi, c.k), { max: 320, speed: SPEED });
    if (rush) { c.rushed = true; job.hurry(rush) }
    job.done.then(() => { if (c.job === job) finish(c) });
    ahead();
  }
  // the image itself takes over from the canvas (same picture), and the canvas is let go
  function finish(c) {
    if (c.st === 'done') return;
    c.st = 'done'; c.job = null;
    (c.im.decode ? c.im.decode() : Promise.resolve()).catch(() => {}).then(() => {
      c.el.classList.add('done'); c.el.classList.remove('painting');
      requestAnimationFrame(() => { c.cv.width = c.cv.height = 0 });
      colState(c.k);
    });
    kick();
  }
  function finishCell(c) {
    if (c.st === 'done') return;
    if (!c.vis) { if (c.job) c.job.cancel(false); finish(c); return } // off screen: no need to watch it paint
    if (c.st === 'painting') { c.rushed = true; c.job.hurry(HURRY); return }
    start(c, HURRY);
    // if its brush marks are not worked out yet, the painting fades in instead of keeping the click waiting
    const job = c.job; let ready = false; job.ready.then(() => { ready = true }, () => {});
    setTimeout(() => { if (!ready && c.job === job) { job.cancel(false); finish(c) } }, 650);
  }
  // pointing at a step: its column's cells are marked, and their brush marks are worked out first
  function aim(k) {
    grid.dataset.hk = k;
    cells.filter(c => c.k === k && c.st === 'idle' && c.vis).reverse().forEach(c => Painter.prefetch(src(c.pi, c.k), c.cv, 320, true));
  }
  function finishCol(k) {
    cells.filter(c => c.k === k && c.st !== 'done').forEach((c, i) => setTimeout(() => finishCell(c), i * 70));
  }
  const colState = k => steps[k].classList.toggle('full', cells.every(c => c.k !== k || c.st === 'done'));
  // work out the next few paintings' brush marks (in the worker) before they are needed
  function ahead() { cells.filter(c => c.st === 'idle').slice(0, 3).forEach(c => Painter.prefetch(src(c.pi, c.k), c.cv, 320)) }

  /* ---- the sequence: only while the grid is on screen; only cells that are on screen ---- */
  let vis = false, clock = 0, lastAt = -1e9, lastK = -1, raf = 0, prev = 0;
  function loop(ts) {
    raf = 0;
    const dt = prev ? Math.min(.05, (ts - prev) / 1000) : 0; prev = ts;
    clock += dt;
    const busy = cells.filter(c => c.st === 'painting' && c.vis && !c.rushed).length;
    if (busy < MAXC) {
      const c = cells.find(c => c.st === 'idle' && c.vis);
      if (c && clock - lastAt >= GAP + (lastK >= 0 && c.k !== lastK ? COL : 0)) { start(c); lastAt = clock; lastK = c.k }
    }
    if (vis && cells.some(c => c.st === 'idle')) raf = requestAnimationFrame(loop); else prev = 0;
  }
  function kick() { if (!raf && vis && cells.some(c => c.st === 'idle')) { prev = 0; raf = requestAnimationFrame(loop) } }

  const io = new IntersectionObserver(es => es.forEach(e => { const c = e.target.__c; if (c) c.vis = e.isIntersecting }), { threshold: .4 });
  cells.forEach(c => { c.el.__c = c; io.observe(c.el) });
  // the first column's marks are worked out as the figure approaches
  const pre = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { pre.disconnect(); ahead() } }, { rootMargin: '700px 0px' });
  pre.observe(grid);
  watch(grid, v => {
    if (v && !vis && lastK < 0) lastAt = clock - GAP + .35; // the first cell starts a moment after the grid arrives
    vis = v; kick();
  }, .12);
})();
