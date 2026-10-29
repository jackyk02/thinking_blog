/* More paintings over RL training, as a prompt picker: one painting at full size, its four training steps
   underneath, and the prompts beside it. On first view the steps play 100 → 400 once; picking a prompt replays
   them. Click a step (or use ← →) to hold it. Reduced motion: shows step 400, no playback. */
(function () {
  'use strict';
  const root = document.getElementById('fx-gallery'); if (!root || !window.FX || !window.FIG) return;
  const { h, reduced, onVisible, paint } = FX;
  const P = FIG.demos.more, STEPS = [100, 200, 300, 400];
  const src = (slug, k) => `demos/${slug}-iter${k + 1}.jpg`;
  let p = 0, k = reduced() ? 3 : 0, front = 0, timer = 0;

  const views = [paint(src(P[0][1], k), ''), paint(src(P[0][1], k), '')];
  views[1].style.opacity = 0; views.forEach(v => v.removeAttribute('loading'));
  const view = h('div', { class: 'fx-ga-view' }, views);
  const prompts = P.map(([name], i) => h('li', {}, h('button', { type: 'button', 'aria-pressed': String(i === p), onclick() { pick(i) } }, name)));
  const thumbs = STEPS.map((st, j) => h('button', { type: 'button', 'aria-pressed': String(j === k), 'aria-label': `Step ${st}`, onclick() { stop(); setStep(j) } }, paint(src(P[0][1], j), ''), h('span', {}, st)));
  const strip = h('div', { class: 'fx-ga-strip', role: 'group', 'aria-label': 'Training step' }, thumbs);
  const side = h('div', { class: 'fx-ga-side' }, h('ul', { class: 'fx-ga-prompts', role: 'group', 'aria-label': 'Prompt' }, prompts), strip);
  const wrap = h('div', { class: 'fx-ga', tabindex: '0', 'aria-label': 'Paintings over RL training. Left and right arrow keys change the step.' }, view, side);
  root.append(wrap);

  function render() {
    const [name, slug] = P[p], next = views[1 - front];
    next.src = src(slug, k); next.alt = `${name}, step ${STEPS[k]}`;
    const swap = () => { next.style.opacity = 1; views[front].style.opacity = 0; front = 1 - front };
    if (next.complete && next.naturalWidth) swap(); else next.onload = () => { next.onload = null; swap() };
    prompts.forEach((li, i) => li.firstChild.setAttribute('aria-pressed', String(i === p)));
    thumbs.forEach((b, j) => { b.setAttribute('aria-pressed', String(j === k)); const im = b.firstChild; if (im.dataset.slug !== slug) { im.src = src(slug, j); im.alt = `${name}, step ${STEPS[j]}`; im.dataset.slug = slug } });
  }
  function setStep(j) { k = j; render() }
  function stop() { clearTimeout(timer); timer = 0 }
  function playSteps(from) {
    stop(); if (reduced()) { setStep(3); return }
    setStep(from);
    const tick = () => { if (k < 3) { setStep(k + 1); timer = setTimeout(tick, 1100) } else timer = 0 };
    timer = setTimeout(tick, 1100);
  }
  function pick(i) { p = i; playSteps(0) }
  wrap.addEventListener('keydown', e => {
    if (e.target.closest('.fx-ga-prompts')) return;
    if (e.key === 'ArrowRight') { stop(); setStep(Math.min(3, k + 1)); e.preventDefault() }
    if (e.key === 'ArrowLeft') { stop(); setStep(Math.max(0, k - 1)); e.preventDefault() }
  });
  render();
  if (!reduced()) onVisible(wrap, () => playSteps(0), .5);
})();
