/* More paintings over RL training: one painting, its training steps on a quiet scrubber, the prompts as thumbnails.
   On first view (and when a prompt is picked) the painting paints itself at step 100, then repaints itself at 200,
   300 and 400 with the watercolour reveal (js/figures/painter.js), a short pause between steps.
   Drag the scrubber to cross-fade between steps; tap a step or use the arrow keys to repaint it. Any input stops
   the playback. Reduced motion: step 400, and steps change without animation. */
(function () {
  'use strict';
  const root = document.getElementById('fx-gallery'); if (!root || !window.FX || !window.FIG) return;
  const { h, reduced, paint, clamp, tween, ease } = FX;
  const RM = reduced() || !FX.painter;
  const P = FIG.demos.more, STEPS = [100, 200, 300, 400], LAST = STEPS.length - 1;
  const src = (pi, k) => `demos/${P[pi][1]}-iter${k + 1}.jpg`;
  let p = 0, pos = RM ? LAST : 0, cur = null, seq = 0, gen = 0, glide = null;

  // the painting: two images for cross-fading while scrubbing, and a canvas for painting
  const imA = paint(src(0, pos), '', { loading: null }), imB = paint(src(0, pos), '', { loading: null, 'aria-hidden': 'true' }), cv = RM ? null : h('canvas', { 'aria-hidden': 'true' });
  imB.style.opacity = 0;
  const view = h('div', { class: 'fx-ga-view' + (RM ? '' : ' blank') }, imA, imB, cv);
  const name = h('p', { class: 'fx-ga-name' });
  // prompts: the finished painting of each, small
  const thumbs = P.map(([nm], i) => h('button', { type: 'button', 'aria-label': nm, title: nm, onclick() { pick(i) } }, paint(src(i, LAST), '', { 'aria-hidden': 'true' })));
  // steps: a hairline with four stops
  const fill = h('span', { class: 'fill' }), knob = h('span', { class: 'knob' });
  const stops = STEPS.map((st, k) => h('span', { class: 'stop', style: { left: k / LAST * 100 + '%' } }, h('i'), h('b', {}, st)));
  const track = h('div', { class: 'track' }, fill, stops, knob);
  const scrub = h('div', { class: 'fx-ga-scrub', role: 'slider', tabindex: '0', 'aria-label': 'Training step', 'aria-valuemin': '100', 'aria-valuemax': '400' }, track);
  root.append(h('div', { class: 'fx-ga' }, h('div', { class: 'fx-ga-prompts', role: 'group', 'aria-label': 'Prompt' }, thumbs), view, name, scrub));

  function ui() {
    const k = Math.round(pos);
    knob.style.left = fill.style.width = pos / LAST * 100 + '%';
    stops.forEach((s, j) => s.classList.toggle('on', j === k));
    scrub.setAttribute('aria-valuenow', STEPS[k]); scrub.setAttribute('aria-valuetext', `step ${STEPS[k]}`);
    thumbs.forEach((b, i) => b.setAttribute('aria-pressed', String(i === p)));
    name.textContent = P[p][0];
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
  // paint step k, over what is showing (or from blank paper); resolves true if it ran to the end
  function paintTo(k, fromPaper) {
    stopGlide();
    const was = finishPaint(), target = src(p, k); gen++;
    view.classList.remove('blank'); scrub.classList.add('glide'); pos = k; ui();
    if (RM) { show(k); return Promise.resolve(true) }
    const job = cur = FX.painter.paint(cv, target, { from: fromPaper ? 'paper' : was ? cv : imA, max: 420, speed: fromPaper ? 1 : 1.3 });
    view.classList.add('painting');
    return job.done.then(ok => {
      if (cur !== job) return false;
      cur = null; show(k); dropCanvas(); return ok;
    });
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function playSteps() {
    const my = ++seq;
    if (!(await paintTo(0, true)) || seq !== my) return;
    for (let k = 1; k <= LAST; k++) {
      await wait(900); if (seq !== my) return;
      if (!(await paintTo(k)) || seq !== my) return;
    }
  }
  const warm = pi => { if (!RM) STEPS.forEach((_, k) => FX.painter.prefetch(src(pi, k), cv, 420)) };
  function pick(i) {
    seq++; finishPaint(); p = i; warm(i);
    if (RM) { show(LAST); return }
    playSteps();
  }

  // scrubber: dragging cross-fades between steps; a tap on a step repaints it
  let drag = null;
  const at = e => { const r = track.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1) * LAST };
  scrub.addEventListener('pointerdown', e => {
    if (e.button) return;
    seq++; stopGlide(); finishPaint();
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
    e.preventDefault(); seq++;
    const t = clamp(to, 0, LAST); if (t !== k || cur) paintTo(t);
  });

  show(pos);
  if (!RM) {
    // analyse the first prompt's steps as the figure approaches; start painting when it is well in view
    const pre = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { pre.disconnect(); warm(p) } }, { rootMargin: '600px 0px' });
    pre.observe(view);
    FX.onVisible(view, () => { if (!cur && seq === 0) playSteps() }, .5);
  }
})();
