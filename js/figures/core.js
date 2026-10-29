/* Shared helpers for the post's figures (js/figures/*.js). No libraries. */
window.FX = (function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  function mk(isSvg, tag, a, kids) {
    const e = isSvg ? document.createElementNS(NS, tag) : document.createElement(tag);
    if (a) for (const k in a) {
      const v = a[k]; if (v == null || v === false) continue;
      if (k === 'class') e.setAttribute('class', v);
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') { for (const q in v) q.startsWith('--') ? e.style.setProperty(q, v[q]) : (e.style[q] = v[q]) }
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(9)) if (c != null && c !== false) e.append(typeof c === 'object' ? c : String(c));
    return e;
  }
  const h = (t, a, ...k) => mk(false, t, a, k);
  const s = (t, a, ...k) => mk(true, t, a, k);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => RM.matches;
  const ease = {
    out: t => 1 - Math.pow(1 - t, 3),
    inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  };

  /* Redraw at the element's width; only when the width actually changes. */
  function responsive(el, draw) {
    let w = 0;
    const go = () => { const nw = Math.round(el.getBoundingClientRect().width); if (nw > 0 && nw !== w) { w = nw; draw(nw) } };
    new ResizeObserver(() => requestAnimationFrame(go)).observe(el); go();
  }
  /* Call once when the element is first well into view. */
  function onVisible(el, cb, threshold) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.disconnect(); cb() } }), { threshold: threshold == null ? .35 : threshold });
    io.observe(el);
  }
  /* Track visibility continuously (for looping figures). */
  function watch(el, cb, threshold) {
    new IntersectionObserver(es => cb(es[es.length - 1].isIntersecting), { threshold: threshold == null ? .25 : threshold }).observe(el);
  }
  /* rAF tween: fn(t in 0..1). Returns a cancel function. */
  function tween(ms, fn, done) {
    let raf = 0, t0 = 0;
    const step = now => { if (!t0) t0 = now; const t = Math.min(1, (now - t0) / ms); fn(t); if (t < 1) raf = requestAnimationFrame(step); else if (done) done() };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const tag = text => h('span', { class: 'fx-tag', title: 'Not measured yet: replace with real data before publishing' }, text || 'placeholder data');
  const paint = (src, alt, a) => h('img', Object.assign({ class: 'fx-paint', src, alt: alt || '', width: 420, height: 420, loading: 'lazy', decoding: 'async' }, a || {}));
  /* pause / play icon button, styled like the cover's; with `label`, a small pill that also says "Pause" / "Play" */
  const PAUSE = 'M3.5 2h2.5v10H3.5zM8 2h2.5v10H8z', PLAY = 'M4 2l8 5-8 5z';
  function playButton(onClick, label) {
    const p = s('path', { d: PAUSE, fill: 'currentColor' }), t = label ? h('span', { 'aria-hidden': 'true' }, 'Pause') : null;
    const b = h('button', { type: 'button', class: 'fx-btn' + (label ? ' fx-btn-l' : ''), 'aria-label': 'Pause animation' }, s('svg', { viewBox: '0 0 14 14', 'aria-hidden': 'true' }, p), t);
    b.set = playing => { p.setAttribute('d', playing ? PAUSE : PLAY); b.setAttribute('aria-label', playing ? 'Pause animation' : 'Play animation'); if (t) t.textContent = playing ? 'Pause' : 'Play' };
    b.addEventListener('click', onClick);
    return b;
  }
  return { h, s, clamp, reduced, ease, responsive, onVisible, watch, tween, wait, tag, paint, playButton };
})();
