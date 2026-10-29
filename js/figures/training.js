/* Painting quality over RL training.
   Each column of paintings sits directly above its training step on the chart's x-axis.
   First view: both curves draw left to right and each column fades in as the curves reach it.
   Hover, drag or use the arrow keys to light one step and read both curves there. */
(function () {
  'use strict';
  const root = document.getElementById('fx-training'); if (!root || !window.FX || !window.FIG) return;
  const { h, s, clamp, reduced, ease, responsive, onVisible, tween, paint } = FX;
  const D = FIG, ROWS = D.demos.top, ST = [100, 200, 300, 400], X1 = 500, Y0 = .5, Y1 = .78;
  const meanOf = arm => {
    const sd = D.heldout.seeds[arm], maps = sd.map(x => new Map(x));
    return sd[1].map(p => p[0]).filter(k => maps.every(m => m.has(k))).map(k => [k, maps.reduce((t, m) => t + m.get(k), 0) / maps.length]);
  };
  const M = { verifier: meanOf('verifier').concat(D.heldout.after.verifier), judge: meanOf('judge').concat(D.heldout.after.judge) };
  const near = (arr, k) => arr.reduce((b, p) => Math.abs(p[0] - k) < Math.abs(b[0] - k) ? p : b, arr[0]);

  // paintings and row labels are made once and only repositioned on resize
  const imgs = [], labels = [];
  ROWS.forEach(([name, slug], ri) => {
    labels.push(root.appendChild(h('div', { class: 'fx-tr-lbl', 'aria-hidden': 'true' }, name)));
    ST.forEach((st, k) => imgs.push(Object.assign(root.appendChild(paint(`demos/${slug}-iter${k + 1}.jpg`, `${name}, step ${st}`, { class: 'fx-paint fx-tr-img' })), { _k: k, _r: ri })));
  });
  root.setAttribute('tabindex', '0');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Paintings at training steps 100, 200, 300 and 400, placed above the held-out score curves. Arrow keys move between steps.');

  let progress = reduced() ? 1 : 0, L = null, focusK = null;

  function layout(W) {
    const narrow = W < 560;
    const m = { l: narrow ? 30 : 38, r: narrow ? 56 : 86, t: 30, b: 36 };
    const pw = W - m.l - m.r, X = v => m.l + v / X1 * pw, col = pw / 5;
    const size = Math.floor(Math.min(col - (narrow ? 6 : 14), 132));
    const labH = narrow ? 20 : 0, gap = narrow ? 10 : 12, rowH = labH + size + gap;
    const top = ROWS.length * rowH + (narrow ? 0 : 4), ch = narrow ? 210 : 260, H = top + ch;
    const Y = v => top + m.t + (1 - (v - Y0) / (Y1 - Y0)) * (ch - m.t - m.b), yAx = Y(Y0);
    root.style.height = H + 'px';

    imgs.forEach(im => Object.assign(im.style, { left: X(ST[im._k]) - size / 2 + 'px', top: im._r * rowH + labH + 'px', width: size + 'px', height: size + 'px' }));
    labels.forEach((lb, ri) => {
      lb.classList.toggle('top', narrow);
      if (narrow) Object.assign(lb.style, { left: X(100) - size / 2 + 'px', top: ri * rowH + 'px', width: '' });
      else Object.assign(lb.style, { left: '0px', top: ri * rowH + size / 2 + 'px', width: Math.max(60, X(100) - size / 2 - 16) + 'px' });
    });

    const old = root.querySelector('svg'); if (old) old.remove();
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true' });
    const cols = ST.map(st => s('line', { class: 'col', x1: X(st), x2: X(st), y1: ROWS.length * rowH - gap + 6, y2: yAx }));
    svg.append(...cols);
    [.6, .7].forEach(v => svg.append(s('line', { class: 'grid', x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) })));
    [.5, .6, .7].forEach(v => svg.append(s('text', { x: m.l - 8, y: Y(v) + 3.5, 'text-anchor': 'end' }, v.toFixed(1))));
    svg.append(s('text', { class: 'cap', x: m.l - 8, y: top + m.t - 14 }, 'Held-out score'));
    svg.append(s('line', { class: 'axis', x1: m.l, x2: W - m.r, y1: yAx, y2: yAx }));
    [0, 100, 200, 300, 400, 500].forEach(v => svg.append(s('text', { x: X(v), y: yAx + 17, 'text-anchor': 'middle' }, v)));
    svg.append(s('text', { class: 'cap', x: W - m.r, y: H - 2, 'text-anchor': 'end' }, 'Training step'));

    // curves, revealed by a clip that grows with the drawing progress (so columns appear exactly as the curves reach them)
    const cid = 'fx-tr-clip-' + W, clip = s('rect', { x: 0, y: 0, width: 0, height: H });
    svg.append(s('defs', {}, s('clipPath', { id: cid }, clip)));
    const path = pts => pts.map(([a, b], i) => (i ? 'L' : 'M') + X(a).toFixed(1) + ' ' + Y(b).toFixed(1)).join('');
    svg.append(s('g', { 'clip-path': `url(#${cid})` }, s('path', { class: 'fx-line j', d: path(M.judge) }), s('path', { class: 'fx-line v', d: path(M.verifier) })));

    // end labels and the gap bracket (as in the original chart)
    const vE = M.verifier[M.verifier.length - 1][1], jE = M.judge[M.judge.length - 1][1];
    let yv = Y(vE), yj = Y(jE); if (yj - yv < 34) { const c = (yv + yj) / 2; yv = c - 17; yj = c + 17 }
    const ex = X(X1) + (narrow ? 8 : 14), bx = X(X1) + (narrow ? 4 : 7), fs = narrow ? 12 : 13;
    const ends = [
      s('text', { class: 'end v fade', x: ex, y: yv + 4, style: `font-size:${fs}px` }, 'Verifier'),
      s('text', { class: 'end j fade', x: ex, y: yj + 4, style: `font-size:${fs}px` }, 'Judge'),
      s('path', { class: 'gap fade', d: `M${bx - 3} ${Y(vE)}H${bx}V${Y(jE)}H${bx - 3}` }),
      s('text', { class: 'end v fade', x: ex, y: (yv + yj) / 2 + 4, style: `font-size:${fs - 1}px;font-weight:600` }, `+${Math.round((vE - jE) * 100)}%`)
    ];
    svg.append(...ends);

    // hover read-out
    const guide = s('line', { class: 'guide', y1: top + m.t - 6, y2: yAx }), dv = s('circle', { class: 'dot-v', r: 4.5 }), dj = s('circle', { class: 'dot-j', r: 4.5 });
    const tv = s('text', { class: 'val v' }), tj = s('text', { class: 'val j' });
    svg.append(s('g', { class: 'hov' }, guide, dv, dj, tv, tj));
    root.prepend(svg);

    L = { W, m, X, Y, yAx, top, clip, ends, guide, dv, dj, tv, tj, narrow };
    setProgress(progress);
    if (focusK != null) focusStep(ST[focusK]);
  }

  function setProgress(p) {
    progress = p; if (!L) return;
    const xs = L.X(p * X1);
    L.clip.setAttribute('width', p >= 1 ? L.W : Math.max(0, xs + 1));
    imgs.forEach(im => im.classList.toggle('in', p * X1 >= ST[im._k] - 12));
    L.ends.forEach(e => e.classList.toggle('in', p >= .985));
  }

  function focusStep(step) {
    if (!L) return;
    step = clamp(step, 0, X1);
    const k = ST.reduce((b, st, i) => Math.abs(st - step) < Math.abs(ST[b] - step) ? i : b, 0);
    focusK = k;
    root.classList.add('focus');
    imgs.forEach(im => im.classList.toggle('on', im._k === k));
    const v = near(M.verifier, step), j = near(M.judge, v[0]), x = L.X(v[0]);
    L.guide.setAttribute('x1', x); L.guide.setAttribute('x2', x);
    L.dv.setAttribute('cx', x); L.dv.setAttribute('cy', L.Y(v[1]));
    L.dj.setAttribute('cx', x); L.dj.setAttribute('cy', L.Y(j[1]));
    let yv = L.Y(v[1]), yj = L.Y(j[1]); if (Math.abs(yj - yv) < 15) { const c = (yv + yj) / 2, sg = yj >= yv ? 1 : -1; yv = c - 7.5 * sg; yj = c + 7.5 * sg }
    const right = x > L.W - L.m.r - 60, anchor = right ? 'end' : 'start', dx = right ? -9 : 9;
    [[L.tv, v[1], yv], [L.tj, j[1], yj]].forEach(([t, val, yy]) => { t.setAttribute('x', x + dx); t.setAttribute('y', yy + 4); t.setAttribute('text-anchor', anchor); t.textContent = val.toFixed(3) });
    L.tv.textContent = v[1].toFixed(3) + (v[0] > 400 ? ' · 2 seeds' : '');
  }
  function clearFocus() {
    focusK = null; root.classList.remove('focus');
    imgs.forEach(im => im.classList.remove('on'));
  }
  const stepAt = e => { const b = root.getBoundingClientRect(); return (e.clientX - b.left - L.m.l) / (L.W - L.m.l - L.m.r) * X1 };
  root.addEventListener('pointermove', e => { if (L && (e.pointerType === 'mouse' || e.buttons)) focusStep(stepAt(e)) });
  root.addEventListener('pointerdown', e => { if (L) focusStep(stepAt(e)) });
  root.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') clearFocus() });
  root.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const k = focusK == null ? (e.key === 'ArrowRight' ? 0 : 3) : clamp(focusK + (e.key === 'ArrowRight' ? 1 : -1), 0, 3); focusStep(ST[k]); e.preventDefault() }
    else if (e.key === 'Escape') clearFocus();
  });
  root.addEventListener('blur', clearFocus);
  document.addEventListener('pointerdown', e => { if (focusK != null && !root.contains(e.target)) clearFocus() });

  responsive(root, layout);
  onVisible(root, () => { if (reduced()) setProgress(1); else tween(2400, t => setProgress(ease.inOut(t))) }, .3);
})();
