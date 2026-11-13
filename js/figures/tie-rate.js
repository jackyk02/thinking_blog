/* Tie rate over training (from the runs' metrics.jsonl, 20-step moving average). Moved unchanged from index.html;
   data now in js/figures/data.js. Uses the page's shared #tip tooltip and the .chart reveal. */
(function(){
  const el=document.getElementById('tie-chart');if(!el||!window.FIG)return;const tip=document.getElementById('tip');
  const D=FIG.tieRate; // [step, share of groups with a tied top score], js/figures/data.js
  const ARMS=[['verifier','Verifier','ver'],['judge','Judge','jud']];
  const W=720,H=320,m={l:34,r:86,t:30,b:40},X1=300,Y1=.5;
  const x=v=>m.l+v/X1*(W-m.l-m.r),y=v=>m.t+(1-v/Y1)*(H-m.t-m.b);
  const path=pts=>pts.map(([a,b],i)=>(i?'L':'M')+x(a).toFixed(1)+' '+y(b).toFixed(1)).join('');
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart: share of groups with a tied top score. The judge rises from about 27 percent early in training to about 39 percent by step 286; the verifier stays at zero.">`;
  [0,.2,.4].forEach(v=>s+=`<line class="grid" x1="${m.l}" x2="${W-m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l-8}" y="${y(v)+4}" text-anchor="end">${Math.round(v*100)}%</text>`);
  s+=`<text class="cap" x="${m.l-8}" y="${m.t-16}">Groups with a tied top score</text>`;
  [0,100,200,300].forEach(v=>s+=`<text x="${x(v)}" y="${H-m.b+18}" text-anchor="middle">${v}</text>`);
  s+=`<line class="axis" x1="${m.l}" x2="${W-m.r}" y1="${H-m.b}" y2="${H-m.b}"/><text class="cap" x="${W-m.r}" y="${H-4}" text-anchor="end">Training step</text>`;
  ARMS.forEach(([arm,,c])=>s+=`<path class="mean s-${c} draw" d="${path(D[arm])}"/>`);
  ARMS.forEach(([arm,label,c])=>{const last=D[arm][D[arm].length-1];
    s+=`<text class="end-lbl end-${c} fade" x="${x(last[0])+8}" y="${y(last[1])+4}">${label}</text>`});
  s+=`<line class="guide" x1="0" x2="0" y1="${m.t}" y2="${H-m.b}"/><circle class="dot ver" r="4"/><circle class="dot jud" r="4"/>`;
  s+=`<rect class="hit" x="${m.l}" y="${m.t}" width="${W-m.l-m.r}" height="${H-m.t-m.b}" fill="transparent"/></svg>`;
  el.innerHTML=s;
  el.querySelectorAll('.draw').forEach(p=>p.style.setProperty('--len',p.getTotalLength()));
  const svg=el.querySelector('svg'),hit=el.querySelector('.hit'),guide=el.querySelector('.guide'),dv=el.querySelector('.dot.ver'),dj=el.querySelector('.dot.jud');
  const at=(arm,k)=>{const p=D[arm].find(q=>q[0]===k);return p?p[1]:null};
  hit.addEventListener('mousemove',e=>{const b=svg.getBoundingClientRect(),sx=(e.clientX-b.left)/b.width*W;
    const k=Math.max(0,Math.min(D.judge[D.judge.length-1][0],Math.round((sx-m.l)/(W-m.l-m.r)*X1)));
    const j=at('judge',k),v=at('verifier',k);
    guide.setAttribute('x1',x(k));guide.setAttribute('x2',x(k));guide.style.opacity=1;
    if(j!=null){dj.setAttribute('cx',x(k));dj.setAttribute('cy',y(j));dj.style.opacity=1}else dj.style.opacity=0;
    if(v!=null){dv.setAttribute('cx',x(k));dv.setAttribute('cy',y(v));dv.style.opacity=1}else dv.style.opacity=0;
    tip.textContent=`Step ${k} · judge ${j!=null?Math.round(j*100)+'%':'–'} · verifier ${v!=null?Math.round(v*100)+'%':'–'}`;
    tip.style.left=e.clientX+12+'px';tip.style.top=e.clientY-30+'px';tip.style.opacity=1});
  hit.addEventListener('mouseleave',()=>{guide.style.opacity=dv.style.opacity=dj.style.opacity=tip.style.opacity=0});
})();
