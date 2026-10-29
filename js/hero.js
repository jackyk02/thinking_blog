/* Cover animation: flower.js runs line by line on the right while the painting builds up on the left.

   The layer capture and replay live in js/painter.js (shared with the figures):
   1. setup() runs the sketch with every brush call queued, each tagged with its source line.
   2. The queue then runs for real, one draw call at a time; every call gets its own layer, so the last frame is the
      painting the code actually makes.
   3. Playback is a fixed timeline: each layer grows in from where the brush starts (a soft, slightly ragged wet edge;
      lines draw along their path). The code panel follows on the same clock. This file keeps the cover's own parts:
      the code panel, the pills, the pace and the loop. */
(function () {
  const host = document.getElementById('tk-canvas-host'); if (!host) return;
  const pre = document.getElementById('tk-pre'), bar = document.getElementById('tk-bar'), stepEl = document.getElementById('tk-step'),
        nameEl = document.getElementById('tk-layers'), btn = document.getElementById('tk-pause'), icon = document.getElementById('tk-pause-icon'),
        root = document.getElementById('tk-paint');
  if (typeof window.setup !== 'function' || !window.brush || !window.p5 || !window.Painter) { host.textContent = 'p5.brush failed to load'; return }

  const FILE = 'flower.js';
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const label = c => c.name === 'background' ? 'background' : 'brush.' + c.name;
  // pace: every duration of the original timeline × K (the loop was ~21.7 s, now ~15.5 s), then the finished painting holds
  const K = .7, HOLD = 3.5;

  const view = document.createElement('canvas'), over = document.createElement('canvas');
  view.className = 'tk-view'; over.className = 'tk-over'; view.setAttribute('aria-hidden', 'true'); over.setAttribute('aria-hidden', 'true');
  let total = 0;
  const pad = n => String(n).padStart(String(total).length, ' '); // figure space keeps the pill width steady

  /* ---------------- capture (js/painter.js) ---------------- */
  let cap = null, R = null;
  const captured = Painter.capture(window, FILE, {
    reduce: REDUCE,
    onSetup(info) {
      const cv = info.cv;
      cv.style.display = 'none'; host.appendChild(cv);
      view.width = over.width = info.W; view.height = over.height = info.H;
      host.append(view, over);
      total = info.total;
      stepEl.textContent = `call ${pad(0)} / ${total}`;
    }
  });
  captured.then(c => { cap = c; if (c.static) showStatic(); else finishPrecompute() }, () => { host.textContent = 'p5.brush failed to load' });

  /* ---------------- timeline ---------------- */
  let CODE = [], lineEls = [], segs = [], tPaint = 0, tLoop = 0;
  function passDur(ln) { const s = (CODE[ln - 1] || '').trim(); return !s ? .04 : s.startsWith('//') ? .12 : s === '}' ? .07 : .1 }

  /* ---------------- playback ---------------- */
  let hlH = '', barP = -1;
  const setBar = p => { p = Math.max(0, Math.min(1, p)); if (Math.abs(p - barP) < 1e-4) return; barP = p; bar.style.clipPath = `inset(0 ${((1 - p) * 100).toFixed(2)}% 0 0 round 2px)` };
  let T = 0, si = -1, runUpTo = 0, onLine = -1, lastName = '';
  // critically damped springs (time based, so motion is the same at any frame rate)
  const springs = { scroll: { x: 0, v: 0, w: 7 }, top: { x: 0, v: 0, w: 16 }, h: { x: 0, v: 0, w: 16 }, prog: { x: 0, v: 0, w: 9 } };
  function spring(s, target, dt) { const f = 1 + 2 * dt * s.w, oo = s.w * s.w, hoo = dt * oo, det = 1 / (f + dt * hoo); s.x = (f * s.x + dt * s.v + dt * hoo * target) * det; s.v = (s.v + hoo * (target - s.x)) * det; /* see Ryan Juckett, damped springs */ }

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
    R.render(T);
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
    T -= tLoop; si = -1; runUpTo = 0;
    lineEls.forEach(e => e.classList.remove('is-run'));
    R.reset(cap.C0, R.layers.length && R.layers[0].kind === 'fade');
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
  const html = src => tokens(src).map(([c, t]) => c ? `<span class="tk-${c}">${esc(t)}</span>` : esc(t)).join('') || '​';
  const codeReady = fetch(FILE, { cache: 'no-store' }).then(r => r.ok ? r.text() : Promise.reject()).then(t => {
    CODE = t.replace(/\s+$/, '').split('\n');
    code.insertAdjacentHTML('beforeend', CODE.map((l, i) => `<span class="tk-line" data-n="${i + 1}"><span class="tk-c">${html(l)}</span></span>`).join(''));
    lineEls = [...code.querySelectorAll('.tk-line')];
  }).catch(() => { code.insertAdjacentHTML('beforeend', `<span class="tk-line"><span class="tk-c tk-com">// could not load ${FILE}</span></span>`) });

  // the name pill is as wide as its longest label, so it never changes width mid-animation
  function sizePills() {
    const names = [...new Set(cap.Q.filter(c => Painter.DRAWS.has(c.name)).map(label))]; if (!names.length) return;
    const keep = nameEl.textContent; let max = 0;
    for (const n of names) { nameEl.textContent = n; max = Math.max(max, nameEl.getBoundingClientRect().width) }
    nameEl.textContent = keep; nameEl.style.minWidth = Math.ceil(max) + 'px';
  }

  function finishPrecompute() {
    R = Painter.Renderer(view.getContext('2d'), cap.W, cap.H, cap.C0, over);
    Promise.all([codeReady, document.fonts ? document.fonts.ready : 0]).then(() => {
      const tl = Painter.timeline(cap, { k: K, pass: passDur, lines: CODE.length });
      segs = tl.segs; R.layers = tl.layers; tPaint = tl.tPaint; tLoop = tPaint + HOLD;
      sizePills(); measure();
      new ResizeObserver(measure).observe(pre);
      hl.style.opacity = 1; ready = true; kick();
    });
  }
  function showStatic() {
    // reduced motion: the finished painting (rendered in one go by setup) and the whole file, no movement
    view.getContext('2d').drawImage(cap.cv, 0, 0);
    codeReady.then(() => {
      lineEls.forEach(e => e.classList.add('is-run'));
      stepEl.textContent = `call ${total} / ${total}`; const d = cap.Q.filter(c => Painter.DRAWS.has(c.name)); if (d.length) nameEl.textContent = label(d[d.length - 1]);
      setBar(1); btn.disabled = true;
    });
  }

  btn.addEventListener('click', () => {
    paused = !paused; btn.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
    icon.setAttribute('d', paused ? 'M4 2l8 5-8 5z' : 'M3.5 2h2.5v10H3.5zM8 2h2.5v10H8z'); kick();
  });
  new IntersectionObserver(es => es.forEach(en => { inView = en.isIntersecting; kick() }), { threshold: .15 }).observe(root);
})();
