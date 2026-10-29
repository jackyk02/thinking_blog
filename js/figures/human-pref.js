/* Agreement with human preference (PLACEHOLDER numbers).
   100 human-voted painting pairs per scorer. Filled square: the scorer picks the humans' winner.
   Half-filled: the judge tied the pair (counts as half). Empty: it picks the other painting. */
(function () {
  'use strict';
  const root = document.getElementById('fx-human'); if (!root || !window.FX || !window.FIG) return;
  const { h, reduced, onVisible, tween, ease, tag } = FX;
  const P = FIG.placeholder.human;
  const cols = [['Judge', 'j', 'var(--fx-jud)', P.judge], ['Verifier', 'v', 'var(--fx-ver)', P.verifier]];
  root.append(h('div', { class: 'fx-top' }, tag()));
  const wrap = h('div', { class: 'fx-hp' });
  const nums = [];
  cols.forEach(([label, cls, c, d]) => {
    const pct = d.agree + d.tie / 2, b = h('b', { class: cls }, reduced() ? pct + '%' : '0%'); nums.push([b, pct]);
    const cells = Array.from({ length: 100 }, (_, i) => h('i', { class: i < d.agree ? 'a' : i < d.agree + d.tie ? 't' : '', style: { '--c': c, '--d': (reduced() ? 0 : i * 9) + 'ms' } }));
    wrap.append(h('div', { role: 'img', 'aria-label': `${label}: agrees with the human winner on ${d.agree} of 100 pairs${d.tie ? `, ties ${d.tie}` : ''}; ${pct}% counting ties as half. Placeholder numbers.` },
      h('div', { class: 'fx-hp-h' }, h('span', { class: 'fx-k ' + cls }, label), b), h('div', { class: 'fx-hp-grid', 'aria-hidden': 'true' }, cells)));
  });
  root.append(wrap);
  const play = () => { wrap.classList.add('in'); if (!reduced()) tween(1100, t => nums.forEach(([b, v]) => b.textContent = Math.round(ease.out(t) * v) + '%')) };
  if (reduced()) play(); else onVisible(wrap, play, .5);
})();
