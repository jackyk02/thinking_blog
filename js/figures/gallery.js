/* More paintings over RL training: the prompts (each with its finished painting, small) beside one large painting,
   and a quiet scrubber for its training step.
   Autoplay: the current prompt's painting paints itself at step 100, holds, then repaints itself over that at 200,
   300 and 400 (brush mark by brush mark, like the cover: js/painter.js), then the next prompt starts on fresh paper.
   A hairline under the current prompt shows how far it has got. Any input (a prompt, the scrubber, the arrow keys)
   pauses the autoplay; the play button resumes it. Dragging the scrubber cross-fades between steps; a tap on a step
   repaints it. Only runs while in view. Reduced motion: no autoplay, step 400, changes without animation. */
(function () {
  'use strict';
  const root = document.getElementById('fx-gallery'); if (!root || !window.FX || !window.FIG) return;
  const { h, reduced, paint, clamp, tween, ease, playButton } = FX;
  const RM = reduced() || !window.Painter;
  const P = FIG.demos.more, STEPS = [100, 200, 300, 400], LAST = STEPS.length - 1;
  const HOLD = 1300, HOLD_LAST = 2600, SPEED0 = 1.05, SPEED = 1.25; // ms; painting speeds (first from paper, then repaints)
  const src = (pi, k) => `demos/${P[pi][1]}-iter${k + 1}.jpg`;
  let p = 0, pos = RM ? LAST : 0, cur = null, gen = 0, glide = null, auto = !RM, run = 0, vis = false;

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
  // steps: a hairline with four stops, and the autoplay button at its end
  const fill = h('span', { class: 'fill' }), knob = h('span', { class: 'knob' });
  const stops = STEPS.map((st, k) => h('span', { class: 'stop', style: { left: k / LAST * 100 + '%' } }, h('i'), h('b', {}, st)));
  const track = h('div', { class: 'track' }, fill, stops, knob);
  const scrub = h('div', { class: 'fx-ga-scrub', role: 'slider', tabindex: '0', 'aria-label': 'Training step', 'aria-valuemin': '100', 'aria-valuemax': '400' }, track);
  const btn = playButton(() => { if (auto) stopAuto(); else startAuto() });
  btn.classList.add('fx-ga-btn');
  if (RM) btn.style.display = 'none';
  btn.set(auto);
  root.append(h('div', { class: 'fx-ga' }, list, h('div', { class: 'fx-ga-stage' }, view, h('div', { class: 'fx-ga-ctl' }, scrub, btn))));

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
  // resolves true if it ran to the end
  function paintTo(k, fresh, speed) {
    stopGlide();
    const blank = view.classList.contains('blank'), was = finishPaint(), target = src(p, k); gen++;
    view.classList.remove('blank'); scrub.classList.add('glide'); pos = k; ui();
    if (RM) { show(k); return Promise.resolve(true) }
    const job = cur = Painter.paint(cv, target, { from: blank ? 'paper' : was ? cv : imA, wash: !!fresh, max: 420, speed: speed || SPEED });
    view.classList.add('painting');
    return job.done.then(ok => {
      if (cur !== job) return false;
      cur = null; show(k); dropCanvas(); return ok;
    });
  }
  // a pause that only counts while the figure is on screen
  function hold(ms, my) {
    return new Promise(res => {
      let left = ms, lastT = 0;
      const step = now => {
        if (run !== my) return res(false);
        if (vis) left -= lastT ? now - lastT : 0;
        lastT = now;
        if (left <= 0) res(true); else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
  // progress hairline under the current prompt: eases to `to` (0..1) over `secs`
  function progress(to, secs) {
    items.forEach((x, i) => { if (i !== p) { x.bar.style.transition = 'none'; x.bar.style.transform = 'scaleX(0)' } });
    const b = items[p].bar; b.style.transition = secs ? `transform ${secs}s linear` : 'none'; b.style.transform = `scaleX(${to})`;
  }
  function freezeProgress() { const b = items[p].bar, m = getComputedStyle(b).transform; b.style.transition = 'none'; b.style.transform = m === 'none' ? 'scaleX(0)' : m }

  async function autoplay(k0) {
    const my = ++run;
    for (let k = k0; ; k++) {
      if (k > LAST) { k = 0; p = (p + 1) % P.length; warm(p) }
      if (k === 0) warm((p + 1) % P.length);
      const fresh = k === 0;
      // the hairline moves through this step's share while it paints and holds
      progress(k / 4, 0);
      const est = (k === 0 ? 3.7 / SPEED0 : 3.7 / SPEED) + (k === LAST ? HOLD_LAST : HOLD) / 1000;
      requestAnimationFrame(() => { if (run === my) progress((k + 1) / 4, est) });
      if (!(await paintTo(k, fresh, k === 0 ? SPEED0 : SPEED)) || run !== my) return;
      if (!(await hold(k === LAST ? HOLD_LAST : HOLD, my))) return;
    }
  }
  function startAuto() {
    if (RM) return;
    auto = true; btn.set(true); root.classList.add('auto');
    // carry on from the step showing (a finished step 400 moves on to the next prompt)
    const k = Math.round(pos);
    autoplay(view.classList.contains('blank') ? 0 : k >= LAST ? LAST + 1 : k + 1);
  }
  function stopAuto() {
    if (!auto) return;
    auto = false; run++; btn.set(false); root.classList.remove('auto'); freezeProgress();
  }
  const warm = pi => { if (!RM) STEPS.forEach((_, k) => Painter.prefetch(src(pi, k), cv, 420)) };

  // a prompt: pauses the autoplay and paints that prompt at the step the scrubber shows
  function pick(i) {
    stopAuto();
    if (i === p && !cur && !view.classList.contains('blank')) return;
    finishPaint(); p = i; warm(i); items.forEach(x => { x.bar.style.transition = 'none'; x.bar.style.transform = 'scaleX(0)' });
    if (RM) { show(LAST); return }
    paintTo(Math.round(pos), true, 1.35);
  }

  // scrubber: dragging cross-fades between steps; a tap on a step repaints it. Either pauses the autoplay.
  let drag = null;
  const at = e => { const r = track.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1) * LAST };
  scrub.addEventListener('pointerdown', e => {
    if (e.button) return;
    stopAuto(); stopGlide(); finishPaint();
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
    if (d.moved) glideTo(Math.round(pos));
    else { const k = Math.round(at(e)); if (k !== Math.round(d.from) || view.classList.contains('blank')) paintTo(k) }
  });
  scrub.addEventListener('pointercancel', () => { if (drag) { drag = null; glideTo(Math.round(pos)) } });
  // a drag settles on the nearest step, fading the rest of the way
  function glideTo(k) {
    const x0 = pos; stopGlide();
    if (RM || x0 === k) { show(k); return }
    glide = tween(260, t => show(x0 + (k - x0) * ease.out(t)), () => { glide = null });
  }
  scrub.addEventListener('keydown', e => {
    const k = Math.round(pos), to = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? k + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? k - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? LAST : null;
    if (to == null) return;
    e.preventDefault(); stopAuto();
    const t = clamp(to, 0, LAST); if (t !== k || cur) paintTo(t);
  });

  show(pos);
  if (!RM) {
    // analyse the first prompt's steps as the figure approaches; start the autoplay when it is well in view
    const pre = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { pre.disconnect(); warm(p) } }, { rootMargin: '600px 0px' });
    pre.observe(view);
    FX.watch(view, v => { vis = v }, .2);
    FX.onVisible(view, () => { if (auto && run === 0) { root.classList.add('auto'); autoplay(0) } }, .5);
  }
})();
