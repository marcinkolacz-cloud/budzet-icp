/* Kalendarz: rdzen danych (window.CAL) + przypominajka w gornej belce. Ladowany przez theme.js na kazdej stronie. */
;(function(){
if(window.CAL)return;
var KEY="kalendarz-v1",COL=["#4f46e5","#0f766e","#b45309","#be185d","#2563eb","#7a736a"];
var iso=function(d){return d.toLocaleDateString("sv")};
var P=function(s){var a=s.split("-");return new Date(+a[0],a[1]-1,+a[2])};
var add=function(s,n){var d=P(s);d.setDate(d.getDate()+n);return iso(d)};
var diff=function(a,b){return Math.round((P(b)-P(a))/864e5)};
var today=function(){return iso(new Date())};
var nowHM=function(){var d=new Date();return ("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2)};
function load(){try{var o=JSON.parse(localStorage.getItem(KEY)||"null");if(o&&Array.isArray(o.ev))return o}catch(e){}return {v:1,ev:[]}}
function save(o){try{localStorage.setItem(KEY,JSON.stringify(o))}catch(e){}dispatchEvent(new Event("cal-change"))}
function occ(e,from,to){
 var out=[],ex=e.ex||{},end=e.ru&&e.ru<to?e.ru:to,g=0,d;if(e.d>end)return out;
 function push(x){if(x>=from&&x<=end&&!ex[x])out.push(x)}
 if(!e.r){push(e.d);return out}
 if(e.r==="d"){d=e.d<from?from:e.d;while(d<=end&&g++<1000){push(d);d=add(d,1)}return out}
 if(e.r==="w"){d=e.d;if(d<from)d=add(d,Math.floor(diff(d,from)/7)*7);while(d<=end&&g++<300){push(d);d=add(d,7)}return out}
 var b=P(e.d),day=b.getDate(),y=b.getFullYear(),m=b.getMonth(),F=P(from);
 if(e.r==="m"){var k=(F.getFullYear()-y)*12+F.getMonth()-m-1;if(k>0)m+=k}else{var k2=F.getFullYear()-y-1;if(k2>0)y+=k2}
 while(g++<400){var dt=new Date(y,m,day);if(dt.getDate()===day){var s=iso(dt);if(s>end)break;push(s)}else if(iso(new Date(y,m,1))>end)break;if(e.r==="m")m++;else y++}
 return out;
}
function done(e,d){return !!(e.done&&e.done[d])}
function list(from,to,o){o=o||load();var r=[];o.ev.forEach(function(e){occ(e,from,to).forEach(function(d){r.push({e:e,d:d,done:done(e,d)})})});
 return r.sort(function(a,b){return a.d<b.d?-1:a.d>b.d?1:((a.e.ad||!a.e.s?"":a.e.s)<(b.e.ad||!b.e.s?"":b.e.s)?-1:1)})}
function overdue(o){var t=today();return list(add(t,-60),add(t,-1),o).filter(function(x){return x.e.k==="t"&&!x.done})}
function toggle(id,d){var o=load(),e=o.ev.find(function(x){return x.id===id});if(!e)return;e.done=e.done||{};if(e.done[d])delete e.done[d];else e.done[d]=1;save(o)}
var WD=["nd","pn","wt","sr","cz","pt","so"];
function dayLabel(d){var t=today(),n=diff(t,d);if(n===0)return "Dzis";if(n===1)return "Jutro";if(n===-1)return "Wczoraj";var x=P(d);return WD[x.getDay()]+" "+("0"+x.getDate()).slice(-2)+"."+("0"+(x.getMonth()+1)).slice(-2)}
function timeLabel(e){return e.ad||!e.s?"":e.s+(e.e?"–"+e.e:"")}
function upcoming(days){var t=today(),o=load(),hm=nowHM();
 var L=list(t,add(t,days||7),o).filter(function(x){if(x.done)return false;if(x.d===t&&!x.e.ad&&x.e.s&&x.e.k!=="t"){var end=x.e.e||x.e.s;if(end<hm)return false}return true});
 return {od:overdue(o),up:L}}
window.CAL={KEY:KEY,COL:COL,load:load,save:save,occ:occ,list:list,overdue:overdue,toggle:toggle,iso:iso,P:P,add:add,diff:diff,today:today,dayLabel:dayLabel,timeLabel:timeLabel,upcoming:upcoming,nowHM:nowHM};

/* ---- UI w gornej belce ---- */
var css=".thm>button.calp{width:auto;display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 12px 0 10px}.calp{display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 12px 0 10px;border-radius:999px;max-width:320px;font-size:12.5px;white-space:nowrap}"+
".calp svg{width:16px;height:16px;flex:none}.calp .tx{overflow:hidden;text-overflow:ellipsis;color:var(--muted)}.calp .tx b{color:var(--ink);font-weight:600}"+
".calp .bd{min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--acc);color:var(--acc-ink);font-size:11px;font-weight:700;display:grid;place-items:center}"+
".calp .bd.w{background:var(--neg);color:#fff}.calp.now{border-color:color-mix(in srgb,var(--acc) 45%,var(--line))}"+
".calp.now .dot{width:7px;height:7px;border-radius:50%;background:var(--pos);box-shadow:0 0 0 3px color-mix(in srgb,var(--pos) 25%,transparent);animation:calpu 1.6s infinite}"+
"@keyframes calpu{50%{box-shadow:0 0 0 6px transparent}}@media (prefers-reduced-motion:reduce){.calp.now .dot{animation:none}}"+
"@media (max-width:900px){.calp .tx{display:none}.thm>button.calp{padding:0 9px}}"+
".calq{position:fixed;z-index:9998;width:min(360px,calc(100vw - 16px));max-height:min(70vh,520px);overflow:auto;background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:0 16px 40px #0002;padding:6px}"+
".calq h4{margin:0;padding:10px 10px 4px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}.calq h4.w{color:var(--neg)}"+
".calq a.it{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:8px 10px;border-radius:10px;color:var(--ink);text-decoration:none}.calq a.it:hover{background:var(--field)}"+
".calq .cd{width:8px;height:8px;border-radius:50%}.calq .ck{width:16px;height:16px;border-radius:5px;border:1.5px solid var(--c);display:grid;place-items:center;cursor:pointer;background:transparent;padding:0}"+
".calq .ck:hover{background:color-mix(in srgb,var(--c) 18%,transparent)}.calq .tm{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}.calq .tt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}"+
".calq .em{padding:22px 10px;text-align:center;color:var(--muted);font-size:13px}.calq .ft{display:flex;gap:6px;padding:8px 6px 4px;border-top:1px solid var(--line);margin-top:6px;position:sticky;bottom:-6px;background:var(--card)}"+
".calq .ft a{flex:1;text-align:center;padding:7px 10px;border-radius:999px;border:1px solid var(--line);font-size:12.5px;color:var(--ink);text-decoration:none}.calq .ft a.pr{background:var(--acc);color:var(--acc-ink);border-color:var(--acc)}";
var ICO='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>';
var btn,pop,tx,bd;
function el(t,c,txt){var e=document.createElement(t);if(c)e.className=c;if(txt!=null)e.textContent=txt;return e}
function link(x){return "kalendarz.html#e="+encodeURIComponent(x.e.id)+"&d="+x.d}
function paint(){if(!btn)return;var u=upcoming(7),t=today(),hm=nowHM(),n=u.up.length+u.od.length;
 var cur=u.up.find(function(x){return x.d===t&&x.e.k!=="t"&&!x.e.ad&&x.e.s&&x.e.s<=hm&&(x.e.e||x.e.s)>=hm});
 var nx=cur||u.up.find(function(x){return x.d===t&&x.e.k!=="t"&&!x.e.ad&&x.e.s})||u.up.find(function(x){return x.e.k!=="t"})||u.up[0];
 btn.classList.toggle("now",!!cur);tx.textContent="";btn.querySelector(".dot")&&btn.querySelector(".dot").remove();
 if(cur){btn.insertBefore(el("i","dot"),tx);tx.append(el("span",null,"Teraz · "),el("b",null,cur.e.t))}
 else if(nx){tx.append(el("span",null,dayLabel(nx.d)+(timeLabel(nx.e)?" "+nx.e.s:"")+" · "),el("b",null,nx.e.t))}
 else tx.textContent="Brak wydarzen";
 bd.hidden=!n;bd.textContent=n>99?"99+":n;bd.classList.toggle("w",u.od.length>0);
 btn.title=n?(u.od.length?u.od.length+" zaleglych zadan · ":"")+u.up.length+" w ciagu 7 dni":"Kalendarz";btn.setAttribute("aria-label","Kalendarz: "+btn.title);
 if(!pop.hidden)fill()}
function row(x,showDay){var c=COL[x.e.c||0],a=el("a","it");a.href=link(x);a.style.setProperty("--c",c);
 if(x.e.k==="t"){var k=el("button","ck");k.type="button";k.title="Oznacz jako zrobione";k.setAttribute("aria-label","Zrobione: "+x.e.t);k.onclick=function(ev){ev.preventDefault();ev.stopPropagation();toggle(x.e.id,x.d)};a.append(k)}
 else{var d=el("i","cd");d.style.background=c;a.append(d)}
 a.append(el("span","tt",x.e.t),el("span","tm",(showDay?dayLabel(x.d)+" ":"")+(timeLabel(x.e)||(x.e.k==="t"?"zadanie":"caly dzien"))));return a}
function fill(){var u=upcoming(7);pop.textContent="";
 if(u.od.length){pop.append(el("h4","w","Zalegle zadania"));u.od.forEach(function(x){pop.append(row(x,true))})}
 var g={};u.up.forEach(function(x){(g[x.d]=g[x.d]||[]).push(x)});
 Object.keys(g).forEach(function(d){pop.append(el("h4",null,dayLabel(d)+(diff(today(),d)>1?"":" · "+P(d).toLocaleDateString("pl-PL",{day:"numeric",month:"long"}))));g[d].forEach(function(x){pop.append(row(x))})});
 if(!u.od.length&&!u.up.length)pop.append(el("div","em","Nic zaplanowanego na najblizsze 7 dni"));
 var f=el("div","ft"),a1=el("a",null,"Otworz kalendarz"),a2=el("a","pr","+ Nowe");a1.href="kalendarz.html";a2.href="kalendarz.html#new";f.append(a1,a2);pop.append(f)}
function place(){var r=btn.getBoundingClientRect();pop.style.top=(r.bottom+6)+"px";pop.style.left=Math.max(8,Math.min(r.left,innerWidth-pop.offsetWidth-8))+"px"}
function mount(){var nav=document.querySelector(".topnav"),thm=nav&&nav.querySelector(".thm");if(!thm)return false;if(btn)return true;
 if(!nav.querySelector('a[href="kalendarz.html"]')){var a=el("a",null,"Kalendarz");a.href="kalendarz.html";if(/kalendarz\.html/.test(location.pathname))a.className="on";var ref=nav.querySelector('a[href="signals.html"]');ref?ref.after(a):nav.insertBefore(a,thm)}
 var st=el("style");st.textContent=css;document.head.append(st);
 btn=el("button","calp");btn.type="button";btn.innerHTML=ICO;tx=el("span","tx");bd=el("span","bd");btn.append(tx,bd);btn.setAttribute("aria-expanded","false");
 pop=el("div","calq");pop.hidden=true;pop.setAttribute("role","dialog");document.body.append(pop);
 btn.onclick=function(e){e.stopPropagation();var o=pop.hidden;document.querySelectorAll(".mnp,.thm .pop").forEach(function(x){x.hidden=true});pop.hidden=!o;btn.setAttribute("aria-expanded",o);if(o){fill();place()}};
 document.addEventListener("click",function(e){if(!pop.hidden&&!pop.contains(e.target)&&e.target!==btn){pop.hidden=true;btn.setAttribute("aria-expanded","false")}});
 document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!pop.hidden){pop.hidden=true;btn.focus()}});addEventListener("resize",function(){pop.hidden=true});
 thm.insertBefore(btn,thm.firstChild);paint();return true}
function boot(){if(!mount()){var n=0,t=setInterval(function(){if(mount()||++n>40)clearInterval(t)},150)}
 var k=0,f=setInterval(function(){paint();if(++k>12)clearInterval(f)},1500);setInterval(paint,30000);
 addEventListener("cal-change",paint);addEventListener("storage",function(e){if(e.key&&e.key.indexOf(KEY)>=0)paint()});document.addEventListener("visibilitychange",function(){if(!document.hidden)paint()})}
document.readyState==="loading"?document.addEventListener("DOMContentLoaded",boot):boot();
})();
