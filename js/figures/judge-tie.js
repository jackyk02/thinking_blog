/* Limitations of LLM-as-a-Judge: the two daisies, with what each scorer sees underneath.
   Judge: all probability on one token, the same token for both paintings ("="). Verifier: a distribution
   over 20 score tokens whose expected values differ ("<"). Plays once on first view. */
(function () {
  'use strict';
  const root = document.getElementById('fx-judge-tie'); if (!root || !window.FX || !window.FIG) return;
  const { h, s, reduced, responsive, onVisible, paint, tag } = FX;
  const P = FIG.placeholder.daisies, GJ = P.judgeLevels, GV = 20;
  const dist = (mu, sd, G) => { const p = []; for (let g = 0; g < G; g++) { const u = g / (G - 1); p.push(Math.exp(-((u - mu) ** 2) / (2 * sd * sd))) } const z = p.reduce((a, b) => a + b); return p.map(v => v / z) };
  const V = P.verifier.map(d => dist(d.mu, d.sd, GV));
  const EV = V.map(p => p.reduce((t, v, g) => t + v * (g + 1), 0)); // expected score on the 1–20 scale
  const vmax = Math.max(...V.flat());

  const hists = [];
  const hist = (kind, i) => { const el = h('div', { class: 'hist ' + kind }); hists.push({ el, kind, i }); return el };
  const num = t => h('span', { class: 'num' }, t);
  const mid = (label, sym, cls) => h('div', { class: 'mid' }, h('span', { class: 'fx-k' }, label), h('span', { class: 'sym ' + cls, 'aria-hidden': 'true' }, sym));
  const grid = h('div', { class: 'fx-jt' },
    paint('1.jpg', 'A loose pink watercolor daisy with a pale yellow center and a small green leaf'), h('div'), paint('2.jpg', 'A fuller, more saturated crimson watercolor daisy with layered petals and a golden center'),
    h('div', {}, hist('j', 0), num(String(P.judge[0]))), mid('Judge', '=', 'j'), h('div', {}, hist('j', 1), num(String(P.judge[1]))),
    h('div', {}, hist('v', 0), num(EV[0].toFixed(1))), mid('Verifier', '<', 'v'), h('div', {}, hist('v', 1), num(EV[1].toFixed(1))));
  root.append(h('div', { class: 'fx-top' }, tag()), grid);
  grid.setAttribute('role', 'img');
  grid.setAttribute('aria-label', `Two daisies. The judge gives both a ${P.judge[0]}: a single score token, identical for both. The verifier's probability over 20 score tokens differs: expected scores ${EV[0].toFixed(1)} and ${EV[1].toFixed(1)}.`);

  function draw(W) {
    const H = 46, base = 40;
    hists.forEach(({ el, kind, i }) => {
      el.innerHTML = '';
      const w = el.getBoundingClientRect().width || W / 3; const G = kind === 'j' ? GJ : GV, bw = w / G;
      const svg = s('svg', { viewBox: `0 0 ${w} ${H}`, width: w, height: H, 'aria-hidden': 'true' });
      svg.append(s('line', { class: 'axis', x1: 0, x2: w, y1: base + .5, y2: base + .5 }));
      for (let g = 0; g < G; g++) {
        const p = kind === 'j' ? (g + 1 === P.judge[i] ? 1 : 0) : V[i][g] / vmax;
        const hh = p * (base - 4);
        if (hh < .6) { svg.append(s('rect', { x: g * bw + 1, y: base - 1, width: Math.max(1, bw - 2), height: 1, style: 'fill:var(--rule)' })); continue }
        svg.append(s('rect', { x: g * bw + (kind === 'j' ? 2 : 1), y: base - hh, width: Math.max(1, bw - (kind === 'j' ? 4 : 2)), height: hh, rx: 1,
          style: `fill:${kind === 'j' ? 'var(--fx-jud)' : 'color-mix(in srgb,var(--fx-ver) 78%,transparent)'};--d:${kind === 'v' ? 40 + g * 22 : 0}ms` }));
      }
      if (kind === 'v') { const x = (EV[i] - .5) / G * w; svg.append(s('line', { class: 'ev', x1: x, x2: x, y1: 2, y2: base + 4 })) }
      el.append(svg);
    });
  }
  responsive(grid, draw);
  const play = () => { grid.classList.add('s1'); setTimeout(() => grid.classList.add('s2'), reduced() ? 0 : 1100) };
  if (reduced()) play(); else onVisible(grid, play, .5);
})();
