/* Watercolour reveal for a finished painting, shared by the training, pipeline and results figures.

   The cover (js/hero.js) replays the real p5.brush sketch. We don't have the sketches for these paintings, so this
   rebuilds a reveal from the image itself, with the cover's layer model: every layer has a bounding box, a per-pixel
   alpha and a per-pixel reveal order, and grows in with a soft, slightly ragged wet edge (same easing and feathering).
     1. The image is split into colour regions: k-means on a blurred copy, a mode filter, then connected regions.
     2. Each region is a wash of the blurred image. It blooms out from its deepest interior point, and a large region
        along the top is pulled down like a sky wash. Lights go first and darks last, as in watercolour.
     3. A last layer sharpens everything to the real image, so the final frame is exactly the image.
   With the sketches, the cover's capture step could produce real layers for the same playback.

   FX.painter.paint(canvas, src, { from, speed, max, onFrame }) → job { ready, done, total, layers, pause(), resume(), cancel() }
     from: 'paper' (default) or an <img>/<canvas> to repaint over. done resolves true when finished, false if cancelled.
   One shared rAF loop drives every job on the page, and a job that is off screen does not advance. */
window.FX = window.FX || {};
FX.painter = (function () {
  'use strict';
  const yieldNow = () => new Promise(r => setTimeout(r, 0));

  /* ---------- noise, as in js/hero.js but seeded so every visit paints the same way ---------- */
  const NG = 64; let sd = 1234567;
  const rnd = () => (sd = sd * 16807 % 2147483647) / 2147483647;
  const GRID = Float32Array.from({ length: NG * NG }, rnd);
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, X0 = xi & 63, X1 = (xi + 1) & 63, Y0 = (yi & 63) * NG, Y1 = ((yi + 1) & 63) * NG;
    const a = GRID[Y0 + X0], b = GRID[Y0 + X1], c = GRID[Y1 + X0], d = GRID[Y1 + X1], sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  /* ---------- colour ---------- */
  const LIN = Float32Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4) });
  const fl = t => t > .008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  function lab(r, g, b, out, o) {
    const R = LIN[r], G = LIN[g], B = LIN[b];
    const x = fl((.4124 * R + .3576 * G + .1805 * B) / .9505), y = fl(.2126 * R + .7152 * G + .0722 * B), z = fl((.0193 * R + .1192 * G + .9505 * B) / 1.089);
    out[o] = 116 * y - 16; out[o + 1] = 500 * (x - y); out[o + 2] = 200 * (y - z);
  }

  /* ---------- analysis ---------- */
  // three box-blur passes ≈ a gaussian; RGB only (alpha is always 255 here)
  function blur(src, S, r) {
    let a = Float32Array.from(src), b = new Float32Array(a.length);
    const pass = (from, to, horiz) => {
      const n = 2 * r + 1;
      for (let line = 0; line < S; line++) for (let ch = 0; ch < 3; ch++) {
        const at = k => horiz ? (line * S + k) * 4 + ch : (k * S + line) * 4 + ch;
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += from[at(Math.min(S - 1, Math.max(0, k)))];
        for (let k = 0; k < S; k++) {
          to[at(k)] = acc / n;
          acc += from[at(Math.min(S - 1, k + r + 1))] - from[at(Math.max(0, k - r))];
        }
      }
    };
    for (let p = 0; p < 3; p++) { pass(a, b, true); pass(b, a, false) }
    const out = new Uint8ClampedArray(src.length);
    for (let i = 0; i < out.length; i += 4) { out[i] = a[i]; out[i + 1] = a[i + 1]; out[i + 2] = a[i + 2]; out[i + 3] = 255 }
    return out;
  }
  // paper: the lightest third of the border; a painting with no paper showing starts on a light neutral sheet
  function paperOf(I, S) {
    const px = [], m = Math.max(2, Math.round(S * .03));
    for (let y = 0; y < S; y += 2) for (let x = 0; x < S; x += 2) if (x < m || y < m || x >= S - m || y >= S - m) { const o = (y * S + x) * 4; px.push([I[o], I[o + 1], I[o + 2], I[o] * .3 + I[o + 1] * .59 + I[o + 2] * .11]) }
    px.sort((a, b) => b[3] - a[3]);
    const top = px.slice(0, Math.max(1, px.length / 3 | 0)), c = [0, 1, 2].map(k => top.reduce((t, p) => t + p[k], 0) / top.length);
    const lum = c[0] * .3 + c[1] * .59 + c[2] * .11, base = [245, 242, 235], w = lum >= 215 ? 0 : .7;
    return c.map((v, k) => Math.round(v + (base[k] - v) * w));
  }
  function kmeans(P, n, K) {
    // farthest-point start (deterministic; small distinct colours such as stems get their own cluster), then Lloyd
    const C = new Float32Array(K * 3), lbl = new Uint8Array(n), dmin = new Float32Array(n).fill(1e9);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) C[k] += P[i * 3 + k] / n;
    for (let c = 1; c < K; c++) {
      let best = 0, bi = 0;
      for (let i = 0; i < n; i++) {
        const o = i * 3, q = (c - 1) * 3, d = (P[o] - C[q]) ** 2 + (P[o + 1] - C[q + 1]) ** 2 + (P[o + 2] - C[q + 2]) ** 2;
        if (d < dmin[i]) dmin[i] = d; if (dmin[i] > best) { best = dmin[i]; bi = i }
      }
      C[c * 3] = P[bi * 3]; C[c * 3 + 1] = P[bi * 3 + 1]; C[c * 3 + 2] = P[bi * 3 + 2];
    }
    const sum = new Float64Array(K * 3), cnt = new Uint32Array(K);
    for (let it = 0; it < 10; it++) {
      sum.fill(0); cnt.fill(0);
      for (let i = 0; i < n; i++) {
        const o = i * 3; let best = 1e12, bk = 0;
        for (let k = 0; k < K; k++) { const q = k * 3, d = (P[o] - C[q]) ** 2 + (P[o + 1] - C[q + 1]) ** 2 + (P[o + 2] - C[q + 2]) ** 2; if (d < best) { best = d; bk = k } }
        lbl[i] = bk; cnt[bk]++; sum[bk * 3] += P[o]; sum[bk * 3 + 1] += P[o + 1]; sum[bk * 3 + 2] += P[o + 2];
      }
      for (let k = 0; k < K; k++) if (cnt[k]) for (let j = 0; j < 3; j++) C[k * 3 + j] = sum[k * 3 + j] / cnt[k];
    }
    return { C, lbl, cnt };
  }
  // 3×3 mode filter: drop single-cell speckle so regions read as washes
  function mode(L, G) {
    const out = Int16Array.from(L), cnt = new Map();
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      cnt.clear(); let best = L[y * G + x], bn = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= G || Y >= G) continue;
        const v = L[Y * G + X], c = (cnt.get(v) || 0) + 1; cnt.set(v, c); if (c > bn) { bn = c; best = v }
      }
      if ((cnt.get(L[y * G + x]) || 0) < 3) out[y * G + x] = best;
    }
    return out;
  }

  // connected regions (4-neighbour) of a label grid, with each cell's distance to its region's edge (chamfer)
  function regions(L, G) {
    const n = G * G, dt = new Float32Array(n), seen = new Uint8Array(n), stack = new Int32Array(n), comps = [];
    for (let c = 0; c < n; c++) {
      if (L[c] < 0) continue; const x = c % G, v = L[c];
      dt[c] = (x > 0 && L[c - 1] !== v) || (x < G - 1 && L[c + 1] !== v) || (c >= G && L[c - G] !== v) || (c < n - G && L[c + G] !== v) ? 1 : 1e6;
    }
    const relax = (c, nb, w) => { if (L[nb] === L[c] && dt[nb] + w < dt[c]) dt[c] = dt[nb] + w };
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) { const c = y * G + x; if (L[c] < 0) continue; if (x) relax(c, c - 1, 1); if (y) { relax(c, c - G, 1); if (x) relax(c, c - G - 1, 1.41); if (x < G - 1) relax(c, c - G + 1, 1.41) } }
    for (let y = G - 1; y >= 0; y--) for (let x = G - 1; x >= 0; x--) { const c = y * G + x; if (L[c] < 0) continue; if (x < G - 1) relax(c, c + 1, 1); if (y < G - 1) { relax(c, c + G, 1); if (x < G - 1) relax(c, c + G + 1, 1.41); if (x) relax(c, c + G - 1, 1.41) } }
    for (let s = 0; s < n; s++) {
      if (seen[s] || L[s] < 0) continue;
      const lb = L[s]; let sp = 0, x0 = G, y0 = G, x1 = -1, y1 = -1, depth = 0, deep = s; const cells = [];
      stack[sp++] = s; seen[s] = 1;
      while (sp) {
        const c = stack[--sp], x = c % G, y = c / G | 0; cells.push(c);
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (dt[c] > depth) { depth = dt[c]; deep = c }
        if (x > 0 && !seen[c - 1] && L[c - 1] === lb) { seen[c - 1] = 1; stack[sp++] = c - 1 }
        if (x < G - 1 && !seen[c + 1] && L[c + 1] === lb) { seen[c + 1] = 1; stack[sp++] = c + 1 }
        if (y > 0 && !seen[c - G] && L[c - G] === lb) { seen[c - G] = 1; stack[sp++] = c - G }
        if (y < G - 1 && !seen[c + G] && L[c + G] === lb) { seen[c + G] = 1; stack[sp++] = c + G }
      }
      comps.push({ cells, lb, x0, y0, x1, y1, depth, deep, area: cells.length / n });
    }
    return { comps, dt };
  }

  async function analyse(im, S) {
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.imageSmoothingQuality = 'high'; cx.drawImage(im, 0, 0, S, S);
    const I = cx.getImageData(0, 0, S, S).data;
    const B = blur(I, S, Math.max(2, Math.round(S / 60)));
    const paper = paperOf(I, S);
    await yieldNow();

    // colour regions on a coarse grid, clustered on a lightly blurred copy (the wash copy smears edges into rims)
    const G = Math.min(96, S), f = S / G, n = G * G, P = new Float32Array(n * 3), Bl = blur(I, S, Math.max(1, Math.round(S / 180)));
    for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
      const o = (Math.min(S - 1, (gy + .5) * f | 0) * S + Math.min(S - 1, (gx + .5) * f | 0)) * 4;
      lab(Bl[o], Bl[o + 1], Bl[o + 2], P, (gy * G + gx) * 3);
    }
    const K = 7, km = kmeans(P, n, K), pl = new Float32Array(3); lab(paper[0], paper[1], paper[2], pl, 0);
    const isPaper = k => Math.hypot(km.C[k * 3] - pl[0], km.C[k * 3 + 1] - pl[1], km.C[k * 3 + 2] - pl[2]) < 7;
    let L = Int16Array.from(km.lbl, k => isPaper(k) ? -1 : k);
    L = mode(mode(L, G), G);
    await yieldNow();

    // thin regions (edge rims, transition bands) join the neighbouring region they touch most, so they don't paint as outlines
    let R = regions(L, G);
    for (let pass = 0; pass < 2; pass++) {
      let changed = false;
      for (const c of R.comps) {
        if (c.depth > 2.2) continue;
        const votes = new Map(), set = new Set(c.cells);
        for (const cell of c.cells) {
          const x = cell % G;
          for (const nb of [x > 0 ? cell - 1 : -1, x < G - 1 ? cell + 1 : -1, cell - G, cell + G]) {
            if (nb < 0 || nb >= n || set.has(nb)) continue; const v = L[nb]; if (v >= 0) votes.set(v, (votes.get(v) || 0) + 1);
          }
        }
        let best = -1, bn = 0; votes.forEach((k, v) => { if (k > bn) { bn = k; best = v } });
        if (best >= 0 && bn >= c.cells.length * .15) { for (const cell of c.cells) L[cell] = best; changed = true }
      }
      if (!changed) break;
      R = regions(L, G);
    }
    // the largest regions become washes; every other painted cell joins the nearest wash (so nothing waits on bare paper)
    const washes = R.comps.filter(c => c.area >= .0025).sort((a, b) => b.area - a.area).slice(0, 16);
    const own = new Int16Array(n).fill(-1), q = new Int32Array(n); let qh = 0, qt = 0;
    washes.forEach((c, i) => { for (const cell of c.cells) { own[cell] = i; q[qt++] = cell } c.cells = [] });
    while (qh < qt) {
      const c = q[qh++], x = c % G;
      for (const nb of [x > 0 ? c - 1 : -1, x < G - 1 ? c + 1 : -1, c - G, c + G]) if (nb >= 0 && nb < n && own[nb] < 0 && L[nb] >= 0) { own[nb] = own[c]; q[qt++] = nb }
    }
    for (let c = 0; c < n; c++) if (own[c] >= 0) { const w = washes[own[c]], x = c % G, y = c / G | 0; w.cells.push(c); if (x < w.x0) w.x0 = x; if (x > w.x1) w.x1 = x; if (y < w.y0) w.y0 = y; if (y > w.y1) w.y1 = y }
    // lights first, as in watercolour, then larger before smaller
    washes.forEach(c => { c.light = km.C[c.lb * 3] });
    washes.sort((a, b) => (b.light - a.light) || (b.area - a.area));

    const layers = [];
    for (const c of washes) { layers.push(washLayer(c, G, f, S)); await yieldNow() }
    // sharpen to the real image: soft random patches, slightly earlier in the middle
    const ord = new Float32Array(S * S), s1 = 1 / (16 * S / 420), half = S / 2;
    for (let y = 0, j = 0; y < S; y++) for (let x = 0; x < S; x++, j++) {
      const nz = .65 * vnoise(x * s1 + 31, y * s1 + 7) + .35 * vnoise(x * s1 * 2.3 + 3, y * s1 * 2.3 + 41);
      ord[j] = Math.min(1, .7 * nz + .3 * Math.hypot(x - half, y - half) / (half * 1.42));
    }
    const detail = { x: 0, y: 0, w: S, h: S, alpha: null, order: ord, feather: .5, src: 'I', kind: 'detail' };

    // timeline (seconds at speed 1): washes overlap and finish in order, the sharpening pass overlaps the last ones
    const slot = Math.max(.17, Math.min(.42, 2.1 / Math.max(1, layers.length)));
    let t = 0, end = 0;
    for (const l of layers) { l.t0 = t; l.t1 = Math.max(t + .5 + 1.1 * Math.sqrt(l.area), end + .02); end = l.t1; t += slot }
    detail.t0 = Math.max(.25, end - .55); detail.t1 = Math.max(detail.t0 + 1.25, end + .02);
    layers.push(detail);
    return { S, I, B, paper, layers, total: detail.t1 };
  }

  function washLayer(c, G, f, S) {
    const gx0 = Math.max(0, c.x0 - 1), gy0 = Math.max(0, c.y0 - 1), gx1 = Math.min(G - 1, c.x1 + 1), gy1 = Math.min(G - 1, c.y1 + 1);
    const gw = gx1 - gx0 + 1, gh = gy1 - gy0 + 1, m = new Float32Array(gw * gh);
    for (const cell of c.cells) m[((cell / G | 0) - gy0) * gw + (cell % G - gx0)] = 1;
    // soften the cell mask once (3×3), then sample it bilinearly at full resolution
    const ms = new Float32Array(gw * gh);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      let a = 0, k = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < gw && Y < gh) a += m[Y * gw + X]; k++ }
      ms[y * gw + x] = a / k;
    }
    // where the brush lands: the cell deepest inside the region
    const sx = (c.deep % G + .5) * f, sy = ((c.deep / G | 0) + .5) * f;
    const sky = c.area > .28 && c.y0 <= 1; // a big region along the top: pulled down like a sky wash

    const x0 = Math.floor(gx0 * f), y0 = Math.floor(gy0 * f), x1 = Math.min(S, Math.ceil((gx1 + 1) * f)), y1 = Math.min(S, Math.ceil((gy1 + 1) * f));
    const w = x1 - x0, h = y1 - y0, alpha = new Uint8Array(w * h), order = new Float32Array(w * h);
    let max = 0;
    for (let y = 0, j = 0; y < h; y++) {
      const v = (y0 + y + .5) / f - .5 - gy0, vi = Math.max(0, Math.min(gh - 2, Math.floor(v))), fv = Math.max(0, Math.min(1, v - vi));
      for (let x = 0; x < w; x++, j++) {
        const u = (x0 + x + .5) / f - .5 - gx0, ui = Math.max(0, Math.min(gw - 2, Math.floor(u))), fu = Math.max(0, Math.min(1, u - ui));
        const a00 = ms[vi * gw + ui], a10 = ms[vi * gw + ui + 1], a01 = ms[(vi + 1) * gw + ui], a11 = ms[(vi + 1) * gw + ui + 1];
        let a = (a00 * (1 - fu) + a10 * fu) * (1 - fv) + (a01 * (1 - fu) + a11 * fu) * fv;
        a = a <= .04 ? 0 : a >= .5 ? 1 : (a - .04) / .46; a = a * a * (3 - 2 * a);
        if (!a) continue;
        alpha[j] = Math.round(a * 255);
        const d = sky ? y : Math.hypot(x0 + x - sx, y0 + y - sy); order[j] = d; if (d > max) max = d;
      }
    }
    const s = 1 / (14 * S / 420), wN = sky ? .22 : .18;
    for (let y = 0, j = 0; y < h; y++) for (let x = 0; x < w; x++, j++) if (alpha[j]) {
      const X = (x0 + x) * s, Y = (y0 + y) * s, nz = .65 * vnoise(X, Y) + .35 * vnoise(X * 2.3 + 17, Y * 2.3 + 5);
      order[j] = Math.min(1, (1 - wN) * order[j] / (max || 1) + wN * nz);
    }
    return { x: x0, y: y0, w, h, alpha, order, feather: sky ? .25 : .3, src: 'B', wet: .1, area: c.area, kind: sky ? 'sky' : 'wash' };
  }

  /* ---------- caches: decoded images and analyses (LRU), analysed one at a time ---------- */
  const imgs = new Map();
  function load(src) {
    if (!imgs.has(src)) { const im = new Image(); im.decoding = 'async'; im.src = src; imgs.set(src, im.decode().then(() => im)) }
    return imgs.get(src);
  }
  const cache = new Map(), MAXC = 16; let chain = Promise.resolve();
  function analysis(src, S) {
    const key = src + '|' + S; let a = cache.get(key);
    if (a) { cache.delete(key); cache.set(key, a); return a }
    a = chain = chain.then(() => load(src)).then(im => analyse(im, S));
    a.catch(() => cache.delete(key));
    cache.set(key, a); while (cache.size > MAXC) cache.delete(cache.keys().next().value);
    return a;
  }
  const resFor = (el, max) => Math.round(Math.min(max || 420, Math.max(96, (el.getBoundingClientRect().width || 160) * Math.min(2, window.devicePixelRatio || 1))));
  const prefetch = (src, el, max) => analysis(src, typeof el === 'number' ? el : resFor(el, max));

  /* ---------- playback ---------- */
  function apply(l, prog, dst, src, S) {
    const { x, y, w, h, alpha, order, feather } = l, wet = l.wet || 0, s = prog * (1 + feather), inv = 1 / feather;
    for (let r = 0, i = 0; r < h; r++) for (let c = 0, o = ((y + r) * S + x) * 4; c < w; c++, i++, o += 4) {
      const al = alpha ? alpha[i] : 255; if (!al) continue;
      let g = (s - order[i]) * inv; if (g <= 0) continue;
      let k = 1;
      if (g >= 1) g = 1; else { g = g * g * (3 - 2 * g); if (wet) k = 1 - wet * 4 * g * (1 - g) } // pigment pools at the moving edge
      const a = al * g / 255;
      dst[o] += (src[o] * k - dst[o]) * a; dst[o + 1] += (src[o + 1] * k - dst[o + 1]) * a; dst[o + 2] += (src[o + 2] * k - dst[o + 2]) * a; dst[o + 3] += (255 - dst[o + 3]) * a;
    }
  }
  const easeOut = t => 1 - Math.pow(1 - t, 2.2), smooth = t => t * t * (3 - 2 * t);

  const jobs = new Set(); let raf = 0, last = 0;
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { e.target.__pvVis = e.isIntersecting; if (e.isIntersecting) kick() }), { rootMargin: '40px' }) : null;
  function loop(ts) {
    const dt = last ? Math.min(.05, (ts - last) / 1000) : 0; last = ts;
    for (const j of [...jobs]) if (j.canvas.__pvVis !== false) j._tick(dt);
    raf = jobs.size ? requestAnimationFrame(loop) : (last = 0, 0);
  }
  function kick() { if (!raf && jobs.size) { last = 0; raf = requestAnimationFrame(loop) } }

  function paint(canvas, src, o) {
    o = o || {};
    const S = o.res || resFor(canvas, o.max), speed = o.speed || 1, ctx = canvas.getContext('2d');
    if (canvas.width !== S) canvas.width = S; if (canvas.height !== S) canvas.height = S;
    // first frame: the sheet of paper, or whatever is being painted over
    const from = o.from && o.from !== 'paper' ? o.from : null;
    const fillPaper = p => { ctx.fillStyle = `rgb(${p})`; ctx.fillRect(0, 0, S, S) };
    if (from) { ctx.clearRect(0, 0, S, S); try { ctx.drawImage(from, 0, 0, S, S) } catch (e) { fillPaper([245, 242, 235]) } } else fillPaper([245, 242, 235]);

    let A = null, settled = null, work = null, li = 0, T = 0, resolve, finished = false;
    const job = { canvas, src, S, paused: false, total: 0, layers: [] };
    job.done = new Promise(r => { resolve = r });
    const end = ok => { if (finished) return; finished = true; jobs.delete(job); if (io) io.unobserve(canvas); settled = work = null; resolve(ok) };
    job.ready = analysis(src, S).then(a => {
      if (finished) return a;
      A = a; job.total = a.total / speed; job.layers = a.layers.map(l => ({ t0: l.t0 / speed, t1: l.t1 / speed, kind: l.kind }));
      if (!from) fillPaper(a.paper);
      settled = new Uint8ClampedArray(ctx.getImageData(0, 0, S, S).data); work = new ImageData(S, S); work.data.set(settled);
      if (o.delay) T = -o.delay;
      jobs.add(job); if (io) { canvas.__pvVis = undefined; io.observe(canvas) } kick();
      return a;
    }, () => { end(false) });

    job._tick = dt => {
      if (job.paused || !A || finished) return;
      T += dt * speed; if (T < 0) return;
      const L = A.layers, srcOf = l => l.src === 'I' ? A.I : A.B, d = work.data;
      let rx0 = S, ry0 = S, rx1 = 0, ry1 = 0;
      const dirty = l => { if (l.x < rx0) rx0 = l.x; if (l.y < ry0) ry0 = l.y; if (l.x + l.w > rx1) rx1 = l.x + l.w; if (l.y + l.h > ry1) ry1 = l.y + l.h };
      while (li < L.length && L[li].t1 <= T) { const l = L[li++]; apply(l, 1e9, settled, srcOf(l), S); dirty(l) }
      const live = []; for (let k = li; k < L.length && L[k].t0 <= T; k++) { live.push(L[k]); dirty(L[k]) }
      if (rx1 > rx0) {
        for (let y = ry0; y < ry1; y++) d.set(settled.subarray((y * S + rx0) * 4, (y * S + rx1) * 4), (y * S + rx0) * 4);
        for (const l of live) { const p = Math.min(1, (T - l.t0) / (l.t1 - l.t0)); apply(l, l.kind === 'detail' ? smooth(p) : easeOut(p), d, srcOf(l), S) }
        ctx.putImageData(work, 0, 0, rx0, ry0, rx1 - rx0, ry1 - ry0);
      }
      if (o.onFrame) o.onFrame(T * speed, job);
      if (li >= L.length) end(true);
    };
    job.time = () => T;
    job.pause = () => { job.paused = true };
    job.resume = () => { job.paused = false; kick() };
    // cancel(true) jumps to the finished painting; cancel(false) leaves the canvas as it is
    job.cancel = toEnd => {
      if (finished) return;
      if (toEnd && A) ctx.putImageData(new ImageData(new Uint8ClampedArray(A.I), S, S), 0, 0);
      else if (toEnd) load(src).then(im => ctx.drawImage(im, 0, 0, S, S)).catch(() => {});
      end(false);
    };
    return job;
  }

  return { paint, prefetch, load, resFor };
})();
