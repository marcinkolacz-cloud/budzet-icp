const KC=(()=>{
const PAL=["#1c1915","#1a8a4a","#c9a227","#3b6fb6","#c2563b","#7a5bb0","#2f9e9e","#b0477a","#8a8f3a","#a89f94"];
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const kfmt=v=>{const a=Math.abs(v);return (v<0?"-":"")+(a>=1e6?(a/1e6).toFixed(1)+"M":a>=1e3?(a/1e3).toFixed(a>=1e4?0:1)+"k":a.toFixed(a<10?2:0));};
function spark(v,w=90,h=26){
 if(!v||v.length<2)return "";const mn=Math.min(...v),mx=Math.max(...v),r=mx-mn||1,c=v[v.length-1]>=v[0]?"#1a8a4a":"#c23b3b";
 const pts=v.map((y,i)=>(i/(v.length-1)*w).toFixed(1)+","+(h-2-(y-mn)/r*(h-4)).toFixed(1)).join(" ");
 return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}
// items: [{label, value}] -> donut + legenda
function donut(items,center,sub){
 const tot=items.reduce((a,x)=>a+x.value,0);if(!(tot>0))return '<p class="note">Brak wartosci - odswiez ceny.</p>';
 const top=items.slice(0,9),rest=items.slice(9).reduce((a,x)=>a+x.value,0);if(rest>0)top.push({label:"Pozostale",value:rest});
 const R=70,r=48,C=90;let a0=-Math.PI/2,s=`<svg viewBox="0 0 180 180" style="width:180px;height:180px;flex:none" role="img" aria-label="Struktura portfela">`;
 top.forEach((x,i)=>{const f=x.value/tot,a1=a0+f*2*Math.PI-(top.length>1?0.012:0),lg=f>0.5?1:0;
  if(f>=0.9999){s+=`<circle cx="${C}" cy="${C}" r="${(R+r)/2}" fill="none" stroke="${PAL[i%10]}" stroke-width="${R-r}"/>`;}
  else{const p=(rad,ang)=>[C+rad*Math.cos(ang),C+rad*Math.sin(ang)].map(n=>n.toFixed(2)).join(" ");
   s+=`<path d="M${p(R,a0)} A${R} ${R} 0 ${lg} 1 ${p(R,a1)} L${p(r,a1)} A${r} ${r} 0 ${lg} 0 ${p(r,a0)}Z" fill="${PAL[i%10]}"><title>${esc(x.label)} ${(f*100).toFixed(1)}%</title></path>`;}
  a0+=f*2*Math.PI;});
 s+=`<text x="90" y="88" text-anchor="middle" font-size="15" font-weight="600" fill="#1c1915">${esc(center||"")}</text><text x="90" y="106" text-anchor="middle" font-size="10" fill="#7a736a">${esc(sub||"")}</text></svg>`;
 const lg=top.map((x,i)=>`<div class="lgi"><i style="background:${PAL[i%10]}"></i><span>${esc(x.label)}</span><b>${(x.value/tot*100).toFixed(1)}%</b></div>`).join("");
 return `<div class="donut">${s}<div class="lgl">${lg}</div></div>`;
}
// series: [{name,color,pts:[[x(Date ms),y]]}]
function line(series,opt={}){
 const W=Math.max(300,opt.w||760),H=opt.h||(W<500?200:240),L=W<500?40:52,Rr=12,T=12,B=26,all=series.flatMap(s=>s.pts);if(all.length<2)return '<p class="note">Za malo danych.</p>';
 const xs=all.map(p=>p[0]),ys=all.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs);let y0=Math.min(0,...ys),y1=Math.max(...ys);if(y1===y0)y1=y0+1;
 const X=x=>L+(x-x0)/(x1-x0||1)*(W-L-Rr),Y=y=>T+(1-(y-y0)/(y1-y0))*(H-T-B);
 let s=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="${esc(opt.label||"Wykres")}">`;
 for(let i=0;i<=4;i++){const v=y0+(y1-y0)*i/4,y=Y(v);s+=`<line x1="${L}" x2="${W-Rr}" y1="${y}" y2="${y}" stroke="#ece6dc"/><text x="${L-6}" y="${y+4}" text-anchor="end" font-size="10" fill="#7a736a">${kfmt(v)}</text>`;}
 const nx=W<500?2:4;for(let i=0;i<=nx;i++){const x=x0+(x1-x0)*i/nx;s+=`<text x="${X(x)}" y="${H-8}" text-anchor="${i===0?"start":i===nx?"end":"middle"}" font-size="10" fill="#7a736a">${new Date(x).toLocaleDateString("pl-PL",{day:"numeric",month:"short",year:x1-x0>300*864e5?"2-digit":undefined})}</text>`;}
 series.forEach(sr=>{const d=sr.pts.map((p,i)=>(i?"L":"M")+X(p[0]).toFixed(1)+" "+Y(p[1]).toFixed(1)).join("");
  if(sr.fill)s+=`<path d="${d}L${X(sr.pts[sr.pts.length-1][0]).toFixed(1)} ${Y(y0)}L${X(sr.pts[0][0]).toFixed(1)} ${Y(y0)}Z" fill="${sr.color}" opacity=".08"/>`;
  s+=`<path d="${d}" fill="none" stroke="${sr.color}" stroke-width="${sr.w||2}" ${sr.dash?'stroke-dasharray="5 4"':""} stroke-linejoin="round"/>`;});
 return s+"</svg>";
}
// items: [{label,value}] pionowe slupki (np. miesiace)
function bars(items,opt={}){
 if(!items.length)return '<p class="note">Brak danych.</p>';
 const W=Math.max(300,opt.w||760),H=opt.h||(W<500?170:200),L=W<500?40:52,T=10,B=26,vs=items.map(x=>x.value);let y0=Math.min(0,...vs),y1=Math.max(0,...vs);if(y1===y0)y1=1;
 const bw=(W-L-8)/items.length,Y=y=>T+(1-(y-y0)/(y1-y0))*(H-T-B);
 let s=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="${esc(opt.label||"Wykres slupkowy")}">`;
 for(let i=0;i<=4;i++){const v=y0+(y1-y0)*i/4;s+=`<line x1="${L}" x2="${W-8}" y1="${Y(v)}" y2="${Y(v)}" stroke="#ece6dc"/><text x="${L-6}" y="${Y(v)+4}" text-anchor="end" font-size="10" fill="#7a736a">${kfmt(v)}</text>`;}
 const step=Math.ceil(items.length/(W<500?5:12));
 items.forEach((x,i)=>{const y=Y(Math.max(0,x.value)),h=Math.abs(Y(x.value)-Y(0)),bx=L+i*bw+bw*.15;
  s+=`<rect x="${bx.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw*.7).toFixed(1)}" height="${Math.max(1,h).toFixed(1)}" rx="3" fill="${x.value>=0?(opt.color||"#1c1915"):"#c23b3b"}"><title>${esc(x.label)}: ${kfmt(x.value)}</title></rect>`;
  if(i%step===0)s+=`<text x="${(L+i*bw+bw/2).toFixed(1)}" y="${H-8}" text-anchor="middle" font-size="10" fill="#7a736a">${esc(x.label)}</text>`;});
 return s+"</svg>";
}
// poziome slupki zysk/strata
function hbars(items,fmt){
 if(!items.length)return '<p class="note">Brak danych.</p>';
 const mx=Math.max(...items.map(x=>Math.abs(x.value)))||1;
 return '<div class="hb">'+items.map(x=>`<div class="hbr"><span>${esc(x.label)}</span><div class="hbt"><div class="hbz"></div><i style="${x.value>=0?"left:50%":"right:50%"};width:${(Math.abs(x.value)/mx*50).toFixed(1)}%;background:${x.value>=0?"#1a8a4a":"#c23b3b"}"></i></div><b class="${x.value>=0?"pos":"neg"}">${fmt(x.value)}</b></div>`).join("")+"</div>";
}
const CSS=`.donut{display:flex;gap:18px;align-items:center;flex-wrap:wrap}.lgl{display:grid;gap:6px;flex:1;min-width:200px}
.lgi{display:grid;grid-template-columns:12px 1fr auto;gap:8px;align-items:center;font-size:13px}.lgi i{width:10px;height:10px;border-radius:3px}
.hb{display:grid;gap:6px}.hbr{display:grid;grid-template-columns:70px 1fr 110px;gap:10px;align-items:center;font-size:13px}.hbr b{text-align:right;font-weight:600}
.hbt{position:relative;height:12px;background:#f3efe8;border-radius:6px}.hbt i{position:absolute;top:0;bottom:0;border-radius:6px}.hbz{position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:#d6cfc4}
.coin{display:flex;align-items:center;gap:8px}.coin img{width:20px;height:20px;border-radius:50%}.coin small{display:block;color:var(--muted);font-size:11px}
.g2{display:grid;grid-template-columns:1.3fr 1fr;gap:12px}.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.g3>section{margin-top:12px}
@media (max-width:1100px){.g3{grid-template-columns:1fr 1fr}}@media (max-width:760px){.g3{grid-template-columns:1fr}.donut svg{width:150px!important;height:150px!important;margin:0 auto}.donut{justify-content:center}.lgl{min-width:0;width:100%;grid-template-columns:1fr 1fr;column-gap:14px}.hbr{grid-template-columns:52px 1fr 86px!important;font-size:12px}}.g2>section{margin-top:12px}
@media (max-width:800px){.g2{grid-template-columns:1fr}}
.pill{display:inline-block;padding:2px 8px;border-radius:999px;background:#f3efe8;color:var(--muted);font-size:11px}
.period button.on{background:var(--ink);color:#fff;border-color:var(--ink)}`;
const st=document.createElement("style");st.textContent=CSS;document.head.append(st);
return {spark,donut,line,bars,hbars,kfmt,esc,PAL};
})();
