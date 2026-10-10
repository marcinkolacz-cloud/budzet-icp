/* Motyw: wczytywany w <head> (bez migniecia), przelacznik wstrzykiwany do .topnav */
;(function(){
var K="budzet-theme",A="budzet-accent",d=document.documentElement,mq=matchMedia("(prefers-color-scheme: dark)");
function get(k){try{return localStorage.getItem(k)}catch(e){return null}}
function put(k,v){try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch(e){}}
function mode(){return get(K)||"system"}
function apply(){var m=mode();d.dataset.theme=m==="system"?(mq.matches?"dark":"light"):m;var a=get(A);if(a&&a!=="grafit")d.dataset.accent=a;else delete d.dataset.accent;}
apply();
mq.addEventListener&&mq.addEventListener("change",function(){if(mode()==="system"){apply();sync()}});
addEventListener("storage",function(e){if(e.key===K||e.key===A){apply();sync()}});
var ACC=[["grafit","#1c1915","Grafit"],["indygo","#4f46e5","Indygo"],["ocean","#2563eb","Ocean"],["szmaragd","#0f766e","Szmaragd"],["bursztyn","#b45309","Bursztyn"],["roz","#be185d","Roz"]];
var SUN='<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
var MOON='<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
var PAL='<svg viewBox="0 0 24 24"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2a10 10 0 0 0 0 20c.9 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.8-1.7 1.7-1.7h2A5.6 5.6 0 0 0 22 10.8C22 5.9 17.5 2 12 2z"/></svg>';
var root,tg,pop;
function sync(){if(!root)return;var dark=d.dataset.theme==="dark";tg.innerHTML=dark?SUN:MOON;tg.title=tg.ariaLabel=dark?"Tryb dzienny":"Tryb nocny";
 pop.querySelectorAll("[data-m]").forEach(function(b){b.classList.toggle("on",b.dataset.m===mode())});
 var a=get(A)||"grafit";pop.querySelectorAll("[data-a]").forEach(function(b){var on=b.dataset.a===a;b.classList.toggle("on",on);b.setAttribute("aria-pressed",on)});}
function mount(){var nav=document.querySelector(".topnav");if(!nav||root)return;
 root=document.createElement("div");root.className="thm";
 tg=document.createElement("button");tg.type="button";tg.onclick=function(){put(K,d.dataset.theme==="dark"?"light":"dark");apply();sync()};
 var pb=document.createElement("button");pb.type="button";pb.innerHTML=PAL;pb.title=pb.ariaLabel="Kolorystyka";pb.setAttribute("aria-expanded","false");
 pop=document.createElement("div");pop.className="pop";pop.hidden=true;
 pop.innerHTML='<b>Motyw</b><div class="seg2"><button type="button" data-m="light">Dzien</button><button type="button" data-m="dark">Noc</button><button type="button" data-m="system">Auto</button></div><b>Akcent</b><div class="dots">'+
  ACC.map(function(x){return '<button type="button" data-a="'+x[0]+'" title="'+x[2]+'" aria-label="'+x[2]+'" style="background:'+x[1]+'"></button>'}).join("")+"</div>";
 pop.onclick=function(e){var b=e.target.closest("button");if(!b)return;if(b.dataset.m)put(K,b.dataset.m==="system"?null:b.dataset.m);if(b.dataset.a)put(A,b.dataset.a==="grafit"?null:b.dataset.a);apply();sync()};
 pb.onclick=function(e){e.stopPropagation();pop.hidden=!pop.hidden;if(!pop.hidden){var r=pb.getBoundingClientRect();pop.style.top=(r.bottom+6)+"px";pop.style.right=Math.max(8,innerWidth-r.right)+"px"}pb.setAttribute("aria-expanded",!pop.hidden)};
 document.addEventListener("click",function(e){if(!pop.hidden&&!root.contains(e.target)){pop.hidden=true;pb.setAttribute("aria-expanded","false")}});
 addEventListener("resize",function(){pop.hidden=true});document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!pop.hidden){pop.hidden=true;pb.setAttribute("aria-expanded","false");pb.focus()}});
 root.append(tg,pb,pop);nav.append(root);sync();}
document.readyState==="loading"?document.addEventListener("DOMContentLoaded",mount):mount();
})();
