/* Cover animation: flower.js runs line by line on the right while the painting builds up on the left.

   1. setup() runs the sketch with every brush call queued, each tagged with its source line.
   2. The queue then runs for real with p5's loop stopped, one draw call per task. p5.brush batches paint
      the same way it does in a one-shot run, so the last frame is the painting the code actually makes.
      After each call we read the canvas and p5.brush's mask buffers. When p5.brush composites a batch
      (on a colour change, or at the end), the change is split between the calls in that batch by how much
      each one added to the mask. That gives every call its own layer.
   3. Playback is a fixed timeline: each layer grows in from where the brush starts (a soft, slightly ragged
      wet edge; lines draw along their path). A 2D canvas shows the layers, and the code panel follows on the same clock. */
(function () {
  const host = document.getElementById('tk-canvas-host'); if (!host) return;
  const pre = document.getElementById('tk-pre'), bar = document.getElementById('tk-bar'), stepEl = document.getElementById('tk-step'),
        nameEl = document.getElementById('tk-layers'), btn = document.getElementById('tk-pause'), icon = document.getElementById('tk-pause-icon'),
        root = document.getElementById('tk-paint');
  if (typeof window.setup !== 'function' || !window.brush || !window.p5) { host.textContent = 'p5.brush failed to load'; return }

  const FILE = 'flower.js';
  const WRAP = ['pick', 'stroke', 'strokeWeight', 'noStroke', 'fill', 'noFill', 'bleed', 'fillTexture', 'hatch', 'noHatch', 'set', 'scaleBrushes',
                'field', 'noField', 'line', 'polygon', 'circle', 'rect', 'flowLine', 'spline', 'plot'];
  const DRAWS = new Set(['background', 'line', 'polygon', 'circle', 'rect', 'flowLine', 'spline', 'plot']);
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const label = c => c.name === 'background' ? 'background' : 'brush.' + c.name;

  // Which line of the sketch made this call (Chrome, Safari and Firefox stack formats)
  const SRC = new RegExp(FILE.replace(/\./g, '\\.') + ':(\\d+):\\d+');
  const lineOf = () => { const m = (new Error().stack || '').match(SRC); return m ? +m[1] : 0 };

  /* ---------------- capture ---------------- */
  const Q = [], ORIG = {}, graphics = [];
  let realBg, realCG, cv, W = 0, H = 0, N = 0, DENS = 1;
  const userSetup = window.setup;
  window.setup = function () {
    pixelDensity(Math.min(2, displayDensity()));
    realBg = window.background; realCG = window.createGraphics;
    // p5.brush.load() makes its mask buffers through the global createGraphics; keep hold of them
    window.createGraphics = function (...a) { const g = realCG.apply(this, a); graphics.push(g); return g };
    // With reduced motion the calls run straight through (a plain one-shot render); otherwise they are queued
    window.background = (...a) => { Q.push({ name: 'background', args: a, line: lineOf() }); if (REDUCE) realBg(...a) };
    WRAP.forEach(k => { if (typeof brush[k] === 'function') { ORIG[k] = brush[k]; brush[k] = (...a) => { Q.push({ name: k, args: a, line: lineOf() }); if (REDUCE) ORIG[k](...a) } } });
    userSetup();
    window.background = realBg; WRAP.forEach(k => { if (ORIG[k]) brush[k] = ORIG[k] });
    if (REDUCE) window.createGraphics = realCG;
    noLoop(); // no per-frame flushes: p5.brush only composites where the sketch itself would
    cv = document.getElementById('defaultCanvas0') || document.querySelector('canvas.p5Canvas');
    W = cv.width; H = cv.height; N = W * H; DENS = W / width;
    cv.style.display = 'none'; host.appendChild(cv);
    view.width = over.width = W; view.height = over.height = H;
    host.append(view, over);
    total = Q.filter(c => DRAWS.has(c.name)).length;
    stepEl.textContent = `call ${pad(0)} / ${total}`;
    setTimeout(REDUCE ? showStatic : precompute, 0);
  };

  const view = document.createElement('canvas'), over = document.createElement('canvas');
  view.className = 'tk-view'; over.className = 'tk-over'; view.setAttribute('aria-hidden', 'true'); over.setAttribute('aria-hidden', 'true');
  const vctx = view.getContext('2d'), octx = over.getContext('2d');
  let total = 0;
  const pad = n => String(n).padStart(String(total).length, '\u2007'); // figure space keeps the pill width steady

  /* ---------------- precompute: run the queue, split every composite into per-call layers ---------------- */
  const scratch = document.createElement('canvas'); let sctx;
  function readCanvas() {
    if (!sctx) { scratch.width = W; scratch.height = H; sctx = scratch.getContext('2d', { willReadFrequently: true }); sctx.globalCompositeOperation = 'copy' }
    sctx.drawImage(cv, 0, 0); return sctx.getImageData(0, 0, W, H).data;
  }
  const scratchA = document.createElement('canvas'); let actx;
  function readAlpha(g) {
    const out = new Uint8Array(N); if (!g) return out;
    // copy through our own canvas: reading p5.brush's buffers directly would push them onto the slow CPU path
    if (!actx) { scratchA.width = W; scratchA.height = H; actx = scratchA.getContext('2d', { willReadFrequently: true }); actx.globalCompositeOperation = 'copy' }
    actx.drawImage(g.elt || g.canvas, 0, 0); const d = actx.getImageData(0, 0, W, H).data;
    for (let i = 0, j = 3; i < N; i++, j += 4) out[i] = d[j];
    return out;
  }
  let masks = null; const cleared = [false, false, false];
  function findMasks() {
    // p5.brush.load() creates [fill mask (2D), image-brush mask (WEBGL), stroke mask (2D)]
    if (masks || graphics.length < 3) return;
    masks = graphics.slice(-3);
    masks.forEach((g, i) => { const c = g.clear.bind(g); g.clear = (...a) => { cleared[i] = true; return c(...a) } });
  }
  const runCall = c => c.name === 'background' ? realBg(...c.args) : ORIG[c.name](...c.args);

  const drawRecs = []; // one per draw call, in order: {call, layers: []}
  let C0 = null;

  function precompute() {
    findMasks();
    let qi = 0, prevC = readCanvas(), prevA0 = new Uint8Array(N), prevA2 = new Uint8Array(N), pending = [];
    C0 = prevC;
    const step = () => {
      cleared[0] = cleared[1] = cleared[2] = false;
      let call = null;
      while (qi < Q.length) { const c = Q[qi++]; runCall(c); findMasks(); if (DRAWS.has(c.name)) { call = c; break } }
      if (!call) { brush.reBlend(); window.createGraphics = realCG } // end of sketch: the flush p5.brush does after setup()
      const C = readCanvas(), A0 = readAlpha(masks && masks[0]), A2 = readAlpha(masks && masks[2]);
      const rec = call ? { call, layers: [] } : null; if (rec) drawRecs.push(rec);
      // what this call added to p5.brush's masks (its pending paint)
      let w = null;
      if (rec) {
        const b0 = cleared[0] ? null : prevA0, b2 = cleared[2] ? null : prevA2;
        for (let i = 0; i < N; i++) {
          const v = Math.max(0, A0[i] - (b0 ? b0[i] : 0)) + Math.max(0, A2[i] - (b2 ? b2[i] : 0));
          if (v) { (w || (w = new Uint8Array(N)))[i] = v > 255 ? 255 : v }
        }
      }
      if (changed(prevC, C)) {
        if (pending.length) emit(pending, prevC, C);
        else if (rec) emit([{ rec, w: null }], prevC, C); // painted straight onto the canvas (background)
        pending = [];
      }
      if (w) pending.push({ rec, w });
      prevC = C; prevA0 = A0; prevA2 = A2;
      if (call) setTimeout(step, 0);
      else finishPrecompute();
    };
    step();
  }
  function changed(a, b) { const x = new Uint32Array(a.buffer), y = new Uint32Array(b.buffer); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return true; return false }

  // A composite turned B into F. Share each changed pixel between the calls in the batch, in order.
  function emit(P, B, F) {
    const b = new Uint32Array(B.buffer), f = new Uint32Array(F.buffer), n = P.length, last = n - 1;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0, i = y * W; x < W; x++, i++) if (b[i] !== f[i]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
    if (x1 < 0) return;
    const bb = P.map(() => [W, H, -1, -1]);
    const grow = (k, x, y) => { const r = bb[k]; if (x < r[0]) r[0] = x; if (x > r[2]) r[2] = x; if (y < r[1]) r[1] = y; if (y > r[3]) r[3] = y };
    const wt = (k, i) => P[k].w ? P[k].w[i] : 1;
    for (let y = y0; y <= y1; y++) for (let x = x0, i = y * W + x0; x <= x1; x++, i++) {
      if (b[i] === f[i]) continue;
      let any = false; for (let k = 0; k < n; k++) if (wt(k, i)) { grow(k, x, y); any = true }
      if (!any) grow(last, x, y);
    }
    const L = bb.map((r, k) => {
      if (r[2] < 0) return null;
      const w = r[2] - r[0] + 1, h = r[3] - r[1] + 1;
      return { x: r[0], y: r[1], w, h, alpha: new Float32Array(w * h), rgba: new Uint8ClampedArray(w * h * 4), rec: P[k].rec };
    });
    for (let y = y0; y <= y1; y++) for (let x = x0, i = y * W + x0; x <= x1; x++, i++) {
      if (b[i] === f[i]) continue;
      let T = 0; for (let k = 0; k < n; k++) T += wt(k, i);
      let cum = 0;
      for (let k = 0; k < n; k++) {
        const v = T ? wt(k, i) : (k === last ? 1 : 0); if (!v) continue;
        const before = cum / (T || 1); cum += v; const after = cum / (T || 1);
        const l = L[k], j = (y - l.y) * l.w + (x - l.x);
        // alpha that takes "before" to "after" when drawn over what is already there; the last share is always 1
        l.alpha[j] = after >= 1 ? 1 : (after - before) / (1 - before);
        l.rgba[j * 4] = F[i * 4]; l.rgba[j * 4 + 1] = F[i * 4 + 1]; l.rgba[j * 4 + 2] = F[i * 4 + 2]; l.rgba[j * 4 + 3] = F[i * 4 + 3];
      }
    }
    L.forEach(l => { if (l) { shape(l); l.rec.layers.push(l) } });
  }

  // Reveal order for every pixel of a layer (0 = first): out from where the brush starts, along the path for lines
  const NG = 64, GRID = Float32Array.from({ length: NG * NG }, Math.random);
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, X0 = xi & 63, X1 = (xi + 1) & 63, Y0 = (yi & 63) * NG, Y1 = ((yi + 1) & 63) * NG;
    const a = GRID[Y0 + X0], b = GRID[Y0 + X1], c = GRID[Y1 + X0], d = GRID[Y1 + X1], sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  const px = (x, y) => [(x + width / 2) * DENS, (y + height / 2) * DENS]; // WEBGL sketches draw around the centre
  function shape(l) {
    const c = l.rec.call, a = c.args, name = c.name;
    let path = null, o = null;
    if (name === 'line') path = [px(a[0], a[1]), px(a[2], a[3])];
    else if (name === 'spline' && Array.isArray(a[0])) path = a[0].map(p => px(p[0], p[1]));
    else if (name === 'polygon' && Array.isArray(a[0]) && a[0][0]) o = px(a[0][0][0], a[0][0][1]);
    else if (name === 'circle' || name === 'rect' || name === 'flowLine' || name === 'plot') { const i = name === 'plot' ? 1 : 0; if (typeof a[i] === 'number') o = px(a[i], a[i + 1]) }
    const ord = new Float32Array(l.w * l.h);
    l.kind = name === 'background' ? 'fade' : path ? 'path' : 'wash';
    if (l.kind === 'fade') { l.order = ord; l.feather = 1; return }
    if (path) {
      // cumulative length along the path; order = how far along it the nearest point is
      const segs = []; let len = 0;
      for (let k = 1; k < path.length; k++) { const [ax, ay] = path[k - 1], [bx, by] = path[k], d = Math.hypot(bx - ax, by - ay); segs.push([ax, ay, bx - ax, by - ay, d, len]); len += d }
      for (let y = 0, j = 0; y < l.h; y++) for (let x = 0; x < l.w; x++, j++) {
        if (!l.alpha[j]) continue;
        const X = l.x + x, Y = l.y + y; let best = 1e9, at = 0;
        for (const [ax, ay, dx, dy, d, s0] of segs) {
          const t = d ? Math.max(0, Math.min(1, ((X - ax) * dx + (Y - ay) * dy) / (d * d))) : 0, ex = ax + dx * t - X, ey = ay + dy * t - Y, e = ex * ex + ey * ey;
          if (e < best) { best = e; at = s0 + d * t }
        }
        ord[j] = len ? at / len : 0;
      }
      l.feather = .1;
    } else {
      // a wash spreads out from the first point of the shape (or its middle) with a ragged wet edge
      if (!o || o[0] < l.x - l.w * .25 || o[0] > l.x + l.w * 1.25 || o[1] < l.y - l.h * .25 || o[1] > l.y + l.h * 1.25) o = [l.x + l.w / 2, l.y + l.h / 2];
      let max = 0;
      for (let y = 0, j = 0; y < l.h; y++) for (let x = 0; x < l.w; x++, j++) if (l.alpha[j]) { const d = Math.hypot(l.x + x - o[0], l.y + y - o[1]); ord[j] = d; if (d > max) max = d }
      const s = 1 / (14 * DENS);
      for (let y = 0, j = 0; y < l.h; y++) for (let x = 0; x < l.w; x++, j++) if (l.alpha[j]) {
        const X = (l.x + x) * s, Y = (l.y + y) * s, nz = .65 * vnoise(X, Y) + .35 * vnoise(X * 2.3 + 17, Y * 2.3 + 5);
        ord[j] = Math.min(1, .82 * ord[j] / (max || 1) + .18 * nz);
      }
      l.feather = .3;
    }
    l.order = ord;
  }

  /* ---------------- timeline ---------------- */
  const SET = .14, HOLD = 4.5, SLOT = { background: .7, circle: .65, polygon: .3, line: .7, spline: .7 }, REVEAL = { background: 1, circle: 1.1, polygon: .75, line: .9, spline: .9 };
  let CODE = [], lineEls = [], segs = [], layers = [], tPaint = 0, tLoop = 0;
  function passDur(ln) { const s = (CODE[ln - 1] || '').trim(); return !s ? .04 : s.startsWith('//') ? .12 : s === '}' ? .07 : .1 }
  function buildTimeline() {
    segs = []; layers = []; let t = 0, cur = 0, di = 0, lastEnd = 0;
    const passTo = to => { for (let ln = cur + 1; ln < to; ln++) { const d = passDur(ln); segs.push({ t0: t, line: ln }); t += d } };
    for (const c of Q) {
      const ln = c.line || cur;
      if (ln > cur + 1) passTo(ln);
      cur = Math.max(cur, ln);
      if (DRAWS.has(c.name)) {
        const rec = drawRecs[di++], has = rec && rec.layers.length;
        segs.push({ t0: t, line: ln, draw: rec, k: di });
        if (has) for (const l of rec.layers) {
          l.t0 = t; l.t1 = Math.max(t + (REVEAL[c.name] || .9), lastEnd + .01); lastEnd = l.t1; // finish in order
          l.ease = l.kind === 'path' ? inOut : l.kind === 'fade' ? smooth : easeOut; layers.push(l);
        }
        t += has ? (SLOT[c.name] || .5) : .25;
      } else { segs.push({ t0: t, line: ln }); t += SET }
    }
    passTo(CODE.length + 1);
    tPaint = Math.max(t, lastEnd); tLoop = tPaint + HOLD;
  }
  const easeOut = t => 1 - Math.pow(1 - t, 2.2), inOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, smooth = t => t * t * (3 - 2 * t);

  /* ---------------- playback ---------------- */
  let hlH = '', barP = -1;
  const setBar = p => { p = Math.max(0, Math.min(1, p)); if (Math.abs(p - barP) < 1e-4) return; barP = p; bar.style.clipPath = `inset(0 ${((1 - p) * 100).toFixed(2)}% 0 0 round 2px)` };
  let settled, work, T = 0, si = -1, li = 0, runUpTo = 0, onLine = -1, lastName = '';
  // critically damped springs (time based, so motion is the same at any frame rate)
  const springs = { scroll: { x: 0, v: 0, w: 7 }, top: { x: 0, v: 0, w: 16 }, h: { x: 0, v: 0, w: 16 }, prog: { x: 0, v: 0, w: 9 } };
  function spring(s, target, dt) { const f = 1 + 2 * dt * s.w, oo = s.w * s.w, hoo = dt * oo, det = 1 / (f + dt * hoo); s.x = (f * s.x + dt * s.v + dt * hoo * target) * det; s.v = (s.v + hoo * (target - s.x)) * det; /* see Ryan Juckett, damped springs */ }

  function apply(l, prog, dst) {
    const { x, y, w, h, alpha, rgba, order, feather } = l, s = prog * (1 + feather), inv = 1 / feather;
    for (let r = 0, i = 0; r < h; r++) for (let c = 0, o = ((y + r) * W + x) * 4; c < w; c++, i++, o += 4) {
      const al = alpha[i]; if (!al) continue;
      let g = (s - order[i]) * inv; if (g <= 0) continue; g = g >= 1 ? 1 : g * g * (3 - 2 * g);
      const a = al * g, j = i * 4;
      if (dst[o + 3] === 0) { dst[o] = rgba[j]; dst[o + 1] = rgba[j + 1]; dst[o + 2] = rgba[j + 2]; dst[o + 3] = rgba[j + 3] * a }
      else { dst[o] += (rgba[j] - dst[o]) * a; dst[o + 1] += (rgba[j + 1] - dst[o + 1]) * a; dst[o + 2] += (rgba[j + 2] - dst[o + 2]) * a; dst[o + 3] += (rgba[j + 3] - dst[o + 3]) * a }
    }
  }
  function paintCanvas() {
    // commit finished layers (in order), then draw the ones in flight over the settled image
    let rx0 = W, ry0 = H, rx1 = 0, ry1 = 0; const dirty = l => { rx0 = Math.min(rx0, l.x); ry0 = Math.min(ry0, l.y); rx1 = Math.max(rx1, l.x + l.w); ry1 = Math.max(ry1, l.y + l.h) };
    while (li < layers.length && layers[li].t1 <= T) {
      const l = layers[li++];
      apply(l, 1e9, settled); dirty(l); // the last share of every pixel is 1, so this lands exactly on the composite
      if (l.kind === 'fade') over.style.opacity = 0;
    }
    const live = [];
    for (let k = li; k < layers.length && layers[k].t0 <= T; k++) live.push(layers[k]);
    for (const l of live) {
      const p = l.ease(Math.min(1, (T - l.t0) / (l.t1 - l.t0)));
      if (l.kind === 'fade') { if (!l.shown) { octx.putImageData(l.img || (l.img = new ImageData(l.rgba, l.w, l.h)), l.x, l.y); l.shown = true } over.style.opacity = p }
      else dirty(l);
    }
    if (rx1 <= rx0) return;
    const d = work.data;
    for (let y = ry0; y < ry1; y++) d.set(settled.subarray((y * W + rx0) * 4, (y * W + rx1) * 4), (y * W + rx0) * 4);
    for (const l of live) if (l.kind !== 'fade') apply(l, l.ease(Math.min(1, (T - l.t0) / (l.t1 - l.t0))), d);
    vctx.putImageData(work, 0, 0, rx0, ry0, rx1 - rx0, ry1 - ry0);
  }

  let tops = [], hs = [], viewH = 0, maxScroll = 0;
  function measure() {
    if (!lineEls.length) return;
    tops = lineEls.map(e => e.offsetTop); hs = lineEls.map(e => e.offsetHeight);
    const cs = getComputedStyle(pre); viewH = pre.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    maxScroll = Math.max(0, code.offsetHeight - viewH);
  }
  function enterSeg(s) {
    const ln = Math.min(s.line, lineEls.length);
    if (ln > runUpTo) { for (let k = runUpTo; k < ln; k++) lineEls[k] && lineEls[k].classList.add('is-run'); runUpTo = ln }
    if (ln !== onLine) { lineEls[onLine - 1]?.classList.remove('on'); lineEls[ln - 1]?.classList.add('on'); onLine = ln }
    if (s.draw) {
      stepEl.textContent = `call ${pad(s.k)} / ${total}`;
      const nm = label(s.draw.call); if (nm !== lastName) { nameEl.textContent = nm; lastName = nm }
    }
  }
  function tick(dt) {
    while (si + 1 < segs.length && segs[si + 1].t0 <= T) enterSeg(segs[++si]);
    paintCanvas();
    // code panel: highlight bar and scroll ease toward the current line
    const k = Math.max(0, onLine - 1);
    if (tops.length) {
      spring(springs.top, tops[k], dt); spring(springs.h, hs[k], dt);
      spring(springs.scroll, Math.max(0, Math.min(maxScroll, tops[k] + hs[k] / 2 - viewH * .42)), dt);
      hl.style.transform = `translate3d(0,${springs.top.x.toFixed(2)}px,0)`;
      const hh = Math.max(0, springs.h.x).toFixed(1); if (hh !== hlH) { hl.style.height = hh + 'px'; hlH = hh }
      code.style.transform = `translate3d(0,${(-springs.scroll.x).toFixed(2)}px,0)`;
    }
    spring(springs.prog, Math.min(1, T / tPaint), dt);
    setBar(springs.prog.x);
  }
  function restart() {
    // hold is over: lines settle back, the scroll eases to the top and the background call washes paper over the
    // finished painting (a cross-fade), then everything plays again from the stored layers
    T -= tLoop; si = -1; li = 0; runUpTo = 0;
    for (const l of layers) l.shown = false;
    lineEls.forEach(e => e.classList.remove('is-run'));
    if (!layers.length || layers[0].kind !== 'fade') { settled.set(C0); work.data.set(C0); vctx.putImageData(work, 0, 0) }
  }

  let raf = 0, last = 0, ready = false, inView = false, paused = false;
  function frame(ts) {
    raf = 0; if (!ready || paused || !inView) return;
    const dt = last ? Math.min(.05, (ts - last) / 1000) : 0; last = ts;
    T += dt; if (T >= tLoop) restart();
    tick(dt);
    raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && ready && !paused && inView) { last = 0; raf = requestAnimationFrame(frame) } }

  /* ---------------- code panel ---------------- */
  const code = document.createElement('div'), hl = document.createElement('div');
  code.className = 'tk-code'; hl.className = 'tk-hl'; code.appendChild(hl);
  pre.appendChild(code);
  const RX = /(\/\/.*$)|("[^"]*")|\b(function|let|for|const)\b|\b(\d+(?:\.\d+)?)\b|([A-Za-z_]\w*)(?=\()/g;
  function tokens(src) {
    const out = []; let i = 0, m; RX.lastIndex = 0;
    while ((m = RX.exec(src))) { if (m.index > i) out.push(['', src.slice(i, m.index)]); out.push([m[1] ? 'com' : m[2] ? 'str' : m[3] ? 'kw' : m[4] ? 'num' : 'fn', m[0]]); i = m.index + m[0].length }
    if (i < src.length) out.push(['', src.slice(i)]); return out;
  }
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const html = src => tokens(src).map(([c, t]) => c ? `<span class="tk-${c}">${esc(t)}</span>` : esc(t)).join('') || '\u200b';
  const codeReady = fetch(FILE, { cache: 'no-store' }).then(r => r.ok ? r.text() : Promise.reject()).then(t => {
    CODE = t.replace(/\s+$/, '').split('\n');
    code.insertAdjacentHTML('beforeend', CODE.map((l, i) => `<span class="tk-line" data-n="${i + 1}"><span class="tk-c">${html(l)}</span></span>`).join(''));
    lineEls = [...code.querySelectorAll('.tk-line')];
  }).catch(() => { code.insertAdjacentHTML('beforeend', `<span class="tk-line"><span class="tk-c tk-com">// could not load ${FILE}</span></span>`) });

  // the name pill is as wide as its longest label, so it never changes width mid-animation
  function sizePills() {
    const names = [...new Set(Q.filter(c => DRAWS.has(c.name)).map(label))]; if (!names.length) return;
    const keep = nameEl.textContent; let max = 0;
    for (const n of names) { nameEl.textContent = n; max = Math.max(max, nameEl.getBoundingClientRect().width) }
    nameEl.textContent = keep; nameEl.style.minWidth = Math.ceil(max) + 'px';
  }

  function finishPrecompute() {
    settled = C0.slice(); work = new ImageData(W, H); work.data.set(C0); vctx.putImageData(work, 0, 0);
    Promise.all([codeReady, document.fonts ? document.fonts.ready : 0]).then(() => {
      buildTimeline(); sizePills(); measure();
      new ResizeObserver(measure).observe(pre);
      hl.style.opacity = 1; ready = true; kick();
    });
  }
  function showStatic() {
    // reduced motion: the finished painting (rendered in one go by setup) and the whole file, no movement
    vctx.drawImage(cv, 0, 0);
    codeReady.then(() => {
      lineEls.forEach(e => e.classList.add('is-run'));
      stepEl.textContent = `call ${total} / ${total}`; const d = Q.filter(c => DRAWS.has(c.name)); if (d.length) nameEl.textContent = label(d[d.length - 1]);
      setBar(1); btn.disabled = true;
    });
  }

  btn.addEventListener('click', () => {
    paused = !paused; btn.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
    icon.setAttribute('d', paused ? 'M4 2l8 5-8 5z' : 'M3.5 2h2.5v10H3.5zM8 2h2.5v10H8z'); kick();
  });
  new IntersectionObserver(es => es.forEach(en => { inView = en.isIntersecting; kick() }), { threshold: .15 }).observe(root);
})();
