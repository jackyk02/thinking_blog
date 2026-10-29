/* More paintings over RL training: the prompts (each with its finished painting, small) beside one large painting,
   and a quiet scrubber for its training step.
   Autoplay is on by default and keeps going: the current prompt's painting paints itself at step 100, holds, then
   repaints itself over that at 200, 300 and 400 (brush mark by brush mark, like the cover: js/painter.js), then the
   next prompt starts on fresh paper, and so on round the six. A hairline under the current prompt shows how far it
   has got. Picking a prompt jumps to it and plays it from step 100. A tap on a step (or the arrow keys) paints that
   step and carries on from there; dragging the scrubber cross-fades between steps, and the autoplay waits a moment on
   the step it settles on, then carries on. Only the Pause button stops it (and Play resumes it; a prompt also plays).
   Only runs while in view. Reduced motion: no autoplay, step 400, changes without animation. */
(function () {
  'use strict';
  const root = document.getElementById('fx-gallery'); if (!root || !window.FX || !window.FIG) return;
  const { h, reduced, paint, clamp, tween, ease, playButton } = FX;
  const RM = reduced() || !window.Painter;
  const P = FIG.demos.more, STEPS = [100, 200, 300, 400], LAST = STEPS.length - 1;
  const HOLD = 1300, HOLD_LAST = 2600, HOLD_SCRUB = 2400, SPEED0 = 1.05, SPEED = 1.25; // ms; painting speeds (from paper, then repaints)
  const src = (pi, k) => `demos/${P[pi][1]}-iter${k + 1}.jpg`;
  let p = 0, pos = RM ? LAST : 0, cur = null, gen = 0, glide = null, auto = !RM, run = 0, loopId = -1, vis = false, seg = null;

  // the painting: two images for cross-fading while scrubbing, and a canvas for painting
  const imA = paint(src(0, pos), '', { loading: null }), imB = paint(src(0, pos), '', { loading: null, 'aria-hidden': 'true' }), cv = RM ? null : h('canvas', { 'aria-hidden': 'true' });
  imB.style.opacity = 0;
  const view = h('div', { class: 'fx-ga-view' + (RM ? '' : ' blank') }, imA, imB, cv);
  // the prompts: thumbnail and text together; the current one carries a progress hairline
  const items = P.map(([nm], i) => {
    const prog = h('span', { class: 'fx-ga-prog', 'aria-hidden': 'true' }, h('i'));
    const b = h('button', { type: 'button', onclick() { pick(i) } }, paint(src(i, LAST), '', { 'aria-hidden': 'true' }), h('span', { class: 't' }, nm), prog);
    return { b, bar: prog.firstChild };
  });
  const list = h('div', { class: 'fx-ga-list', role: 'group', 'aria-label': 'Prompt' }, items.map(x => x.b));
  // steps: a hairline with four stops, and the Pause / Play button at its end
  const fill = h('span', { class: 'fill' }), knob = h('span', { class: 'knob' });
  const stops = STEPS.map((st, k) => h('span', { class: 'stop', style: { left: k / LAST * 100 + '%' } }, h('i'), h('b', {}, st)));
  const track = h('div', { class: 'track' }, fill, stops, knob);
  const scrub = h('div', { class: 'fx-ga-scrub', role: 'slider', tabindex: '0', 'aria-label': 'Training step', 'aria-valuemin': '100', 'aria-valuemax': '400' }, track);
  const btn = playButton(() => { if (auto) setAuto(false); else { setAuto(true); if (loopId !== run) fromHere() } }, true);
  btn.classList.add('fx-ga-btn');
  if (RM) btn.style.display = 'none';
  btn.set(auto);
  const wrap = h('div', { class: 'fx-ga' }, list, h('div', { class: 'fx-ga-stage' }, view, h('div', { class: 'fx-ga-ctl' }, scrub, btn)));
  root.append(wrap);

  function ui() {
    const k = Math.round(pos);
    knob.style.left = fill.style.width = pos / LAST * 100 + '%';
    stops.forEach((s, j) => s.classList.toggle('on', j === k));
    scrub.setAttribute('aria-valuenow', STEPS[k]); scrub.setAttribute('aria-valuetext', `step ${STEPS[k]}`);
    items.forEach((x, i) => x.b.setAttribute('aria-pressed', String(i === p)));
    imA.alt = `${P[p][0]}, step ${STEPS[k]}`;
  }
  // a still frame at a (possibly fractional) step: the lower step, with the upper one faded in over it
  function show(x) {
    pos = clamp(x, 0, LAST);
    const a = Math.floor(pos), b = Math.min(LAST, a + 1), f = pos - a;
    if (imA.getAttribute('src') !== src(p, a)) imA.src = src(p, a);
    if (imB.getAttribute('src') !== src(p, b)) imB.src = src(p, b);
    imB.style.opacity = f; ui();
  }
  // the canvas goes away once the image under it shows the same painting
  function dropCanvas() {
    const g = gen;
    (imA.decode ? imA.decode() : Promise.resolve()).catch(() => {}).then(() => { if (g === gen && !cur) view.classList.remove('painting') });
  }
  // finish a paint in progress at once; returns true if there was one (the canvas then holds its finished painting)
  function finishPaint() {
    if (!cur) return false;
    const j = cur; cur = null; j.cancel(true); show(Math.round(pos)); dropCanvas();
    return true;
  }
  function stopGlide() { if (glide) { glide(); glide = null } }
  // paint step k over what is showing, or as a new painting (paper washed over what is showing, or a blank sheet);
  // resolves true if it ran to the end. A paint started while paused waits for Play.
  function paintTo(k, fresh, speed) {
    stopGlide();
    const blank = view.classList.contains('blank'), was = finishPaint(), target = src(p, k); gen++;
    view.classList.remove('blank'); scrub.classList.add('glide'); pos = k; ui();
    if (RM) { show(k); return Promise.resolve(true) }
    const job = cur = Painter.paint(cv, target, { from: blank ? 'paper' : was ? cv : imA, wash: !!fresh, max: 420, speed: speed || SPEED, onFrame: bar });
    view.classList.add('painting');
    return job.done.then(ok => {
      if (cur !== job) return false;
      cur = null; show(k); dropCanvas(); return ok;
    });
  }

  /* ---- the hairline under the current prompt: a quarter per step, filled as that step paints and holds ---- */
  function bar() {
    if (!seg || seg.run !== run || RM) return;
    const j = seg.job, pt = j && j.total ? j.total * 1000 : seg.est, done = j ? Math.min(pt, (j.total ? j.time() : 0) * 1000) : pt;
    const f = clamp((Math.max(0, done) + seg.held) / Math.max(1, pt + seg.hold), 0, 1);
    items[p].bar.style.transform = `scaleX(${((seg.k + f) / 4).toFixed(4)})`;
  }
  function clearBars() { items.forEach(x => { x.bar.style.transform = 'scaleX(0)' }) }
  // a pause that only counts while the figure is on screen and playing
  function hold(ms, my) {
    const sg = seg;
    return new Promise(res => {
      let lastT = 0;
      const step = now => {
        if (run !== my) return res(false);
        if (lastT && vis && auto) sg.held += Math.min(100, now - lastT);
        lastT = now; bar();
        if (sg.held >= ms) res(true); else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  /* ---- the autoplay: from step k0 of the current prompt, on through the steps and round the prompts.
     o.shown: step k0 is already showing (after a drag), so it only holds, for o.hold ms. ---- */
  async function autoplay(k0, o) {
    o = o || {};
    const my = loopId = ++run;
    for (let k = k0; ; k++) {
      if (k > LAST) { k = 0; p = (p + 1) % P.length; clearBars() }
      if (k === 0) warm((p + 1) % P.length);
      const ms = o.hold || (k === LAST ? HOLD_LAST : HOLD);
      seg = { run: my, k, job: null, est: o.shown ? 0 : (k === 0 ? 3.7 / SPEED0 : 3.7 / SPEED) * 1000, hold: ms, held: 0 };
      if (!o.shown) {
        // a new prompt, or a step back, starts on fresh paper; a step forward repaints over the one before
        const fresh = k === 0 || o.back, pr = paintTo(k, fresh, k === 0 ? SPEED0 : SPEED);
        seg.job = cur; if (!auto && cur) cur.pause();
        if (!(await pr) || run !== my) return;
      }
      o = {};
      if (!(await hold(ms, my))) return;
    }
  }
  // carry on from the step showing (a finished step 400 moves on to the next prompt)
  function fromHere() {
    const k = Math.round(pos);
    autoplay(view.classList.contains('blank') ? 0 : k + 1);
  }
  function setAuto(on) {
    auto = on; btn.set(on); root.classList.toggle('paused', !on);
    if (cur) on ? cur.resume() : cur.pause();
  }
  // a manual move: cancels the running loop; with autoplay on, the loop starts again from that step
  function goTo(k) {
    const back = k < Math.round(pos), same = k === Math.round(pos) && !cur && !view.classList.contains('blank');
    run++; stopGlide();
    if (auto) autoplay(k, same ? { shown: true, hold: HOLD_SCRUB } : { back });
    else if (k !== Math.round(pos) || cur || view.classList.contains('blank')) paintTo(k, back);
  }
  const warm = pi => { if (!RM) STEPS.forEach((_, k) => Painter.prefetch(src(pi, k), cv, 420)) };

  // a prompt: jumps to it and plays it from step 100 (it also turns a paused autoplay back on)
  function pick(i) {
    run++; stopGlide(); finishPaint();
    p = i; warm(i); clearBars();
    if (RM) { show(LAST); return }
    setAuto(true); autoplay(0);
  }

  // scrubber: dragging cross-fades between steps; a tap on a step paints it
  let drag = null;
  const at = e => { const r = track.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1) * LAST };
  scrub.addEventListener('pointerdown', e => {
    if (e.button) return;
    run++; stopGlide(); finishPaint();
    drag = { x: e.clientX, moved: false, from: pos };
    try { scrub.setPointerCapture(e.pointerId) } catch (er) { /* synthetic events */ }
  });
  scrub.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientX - drag.x) < 4) return;
    drag.moved = true; view.classList.remove('blank'); scrub.classList.remove('glide'); show(at(e));
  });
  scrub.addEventListener('pointerup', e => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.moved) settle(Math.round(pos));
    else goTo(Math.round(at(e)));
  });
  scrub.addEventListener('pointercancel', () => { if (drag) { drag = null; settle(Math.round(pos)) } });
  // a drag settles on the nearest step, fading the rest of the way; the autoplay waits there a moment, then carries on
  function settle(k) {
    const x0 = pos; stopGlide();
    if (RM || x0 === k) show(k);
    else glide = tween(260, t => show(x0 + (k - x0) * ease.out(t)), () => { glide = null });
    if (auto && !RM) { items.forEach((x, i) => { if (i !== p) x.bar.style.transform = 'scaleX(0)' }); autoplay(k, { shown: true, hold: HOLD_SCRUB }) }
  }
  scrub.addEventListener('keydown', e => {
    const k = Math.round(pos), to = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? k + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? k - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? LAST : null;
    if (to == null) return;
    e.preventDefault();
    goTo(clamp(to, 0, LAST));
  });

  show(pos);
  if (!RM) {
    // analyse the first prompt's steps as the figure approaches; start the autoplay when it is well in view
    const pre = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { pre.disconnect(); warm(p) } }, { rootMargin: '600px 0px' });
    pre.observe(view);
    FX.watch(view, v => { vis = v }, .2);
    FX.onVisible(view, () => { if (run !== 0) return; if (auto) autoplay(0); else { view.classList.remove('blank'); show(pos) } }, .5);
  }
})();
