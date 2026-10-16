/* Motyw: wczytywany w <head> (bez migniecia), przelacznik wstrzykiwany do .topnav */
;(function(){
var K="budzet-theme",A="budzet-accent",d=document.documentElement,mq=matchMedia("(prefers-color-scheme: dark)");
function get(k){try{return localStorage.getItem(k)}catch(e){return null}}
function put(k,v){try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch(e){}}
function mode(){return get(K)||"system"}
function apply(){var m=mode();d.dataset.theme=m==="system"?(mq.matches?"dark":"light"):m;var a=get(A);if(a&&a!=="grafit")d.dataset.accent=a;else delete d.dataset.accent;}
apply();
var PV="budzet-priv";function pv(){d.classList.toggle("priv",get(PV)==="1")}pv();
(function(){var c=get("budzet-cur");if(c)["krypto-cur","staking-cur"].forEach(function(k){put(k,c)})})();
mq.addEventListener&&mq.addEventListener("change",function(){if(mode()==="system"){apply();sync()}});
addEventListener("storage",function(e){if(e.key===K||e.key===A){apply();sync()}if(e.key===PV){pv();sync()}});
var ACC=[["grafit","#1c1915","Grafit"],["indygo","#4f46e5","Indygo"],["ocean","#2563eb","Ocean"],["szmaragd","#0f766e","Szmaragd"],["bursztyn","#b45309","Bursztyn"],["roz","#be185d","Roz"]];
var SUN='<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
var MOON='<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
var PAL='<svg viewBox="0 0 24 24"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2a10 10 0 0 0 0 20c.9 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.8-1.7 1.7-1.7h2A5.6 5.6 0 0 0 22 10.8C22 5.9 17.5 2 12 2z"/></svg>';
var GEAR='<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
var TRASH='<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>';
var DB='<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>';
var CK=["krypto-cur","staking-cur"];function dcur(){return get("budzet-cur")||""}
var root,tg,pop,sw;
function sync(){if(!root)return;sw.checked=d.classList.contains("priv");var dark=d.dataset.theme==="dark";tg.innerHTML=dark?SUN:MOON;tg.title=tg.ariaLabel=dark?"Tryb dzienny":"Tryb nocny";
 pop.querySelectorAll("[data-c]").forEach(function(b){b.classList.toggle("on",b.dataset.c===dcur())});
 pop.querySelectorAll("[data-m]").forEach(function(b){b.classList.toggle("on",b.dataset.m===mode())});
 var a=get(A)||"grafit";pop.querySelectorAll("[data-a]").forEach(function(b){var on=b.dataset.a===a;b.classList.toggle("on",on);b.setAttribute("aria-pressed",on)});}
function mount(){var nav=document.querySelector(".topnav");if(!nav||root)return;
 root=document.createElement("div");root.className="thm";
 tg=document.createElement("button");tg.type="button";tg.onclick=function(){put(K,d.dataset.theme==="dark"?"light":"dark");apply();sync()};
 var pb=document.createElement("button");pb.type="button";pb.innerHTML=GEAR;pb.title=pb.ariaLabel="Ustawienia";pb.setAttribute("aria-expanded","false");
 pop=document.createElement("div");pop.className="pop";pop.hidden=true;
 pop.innerHTML='<b>Ustawienia</b><b>Motyw</b><div class="seg2"><button type="button" data-m="light">Dzien</button><button type="button" data-m="dark">Noc</button><button type="button" data-m="system">Auto</button></div><b>Akcent</b><div class="dots">'+
  ACC.map(function(x){return '<button type="button" data-a="'+x[0]+'" title="'+x[2]+'" aria-label="'+x[2]+'" style="background:'+x[1]+'"></button>'}).join("")+'</div><b>Domyslna waluta</b><div class="seg2"><button type="button" data-c="PLN">PLN</button><button type="button" data-c="USD">USD</button><button type="button" data-c="">Per karta</button></div><small class="hint">Krypto, Terminal, Staking</small>';
 pop.onclick=function(e){var b=e.target.closest("button");if(!b)return;if(b.dataset.m)put(K,b.dataset.m==="system"?null:b.dataset.m);if(b.dataset.c!=null){put("budzet-cur",b.dataset.c||null);if(b.dataset.c){CK.forEach(function(k){put(k,b.dataset.c)});var cs=document.getElementById("cur");if(cs&&cs.value!==b.dataset.c){cs.value=b.dataset.c;cs.dispatchEvent(new Event("change"))}}}if(b.dataset.a)put(A,b.dataset.a==="grafit"?null:b.dataset.a);apply();sync()};
 pb.onclick=function(e){e.stopPropagation();document.querySelectorAll(".mnp").forEach(function(x){x.hidden=true});pop.hidden=!pop.hidden;if(!pop.hidden){var r=pb.getBoundingClientRect();pop.style.top=(r.bottom+6)+"px";pop.style.right=Math.max(8,innerWidth-r.right)+"px"}pb.setAttribute("aria-expanded",!pop.hidden)};
 document.addEventListener("click",function(e){if(!pop.hidden&&!root.contains(e.target)&&!pop.contains(e.target)){pop.hidden=true;pb.setAttribute("aria-expanded","false")}});
 addEventListener("resize",function(){pop.hidden=true});document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!pop.hidden){pop.hidden=true;pb.setAttribute("aria-expanded","false");pb.focus()}});
 var pl=document.createElement("label");pl.className="pvs";pl.title="Tryb prywatny - ukrywa wartosci";
 pl.innerHTML='<input type="checkbox" role="switch" aria-label="Tryb prywatny"><i></i><span>Prywatny</span>';sw=pl.firstChild;
 sw.onchange=function(){put(PV,sw.checked?"1":null);pv()};
 var cs=document.getElementById("cur");if(cs)cs.classList.add("cur");
 var kz=nav.querySelector('a[href="kosz.html"]');if(kz){kz.className="ib"+(/kosz\.html/.test(location.pathname)?" on":"");kz.innerHTML=TRASH;kz.title=kz.ariaLabel="Kosz"}
 var dm=document.createElement("div");dm.className="mnu dat";
 dm.innerHTML='<button type="button" class="mnb" aria-haspopup="true" aria-expanded="false" title="Kopia zapasowa" aria-label="Kopia zapasowa">'+DB+'</button><div class="mnp" role="menu" hidden><b>Kopia zapasowa</b><button type="button" data-bk="exp">Pobierz pelny backup</button><button type="button" data-bk="pick">Przywroc z backupu</button><small class="hint">Budzet, Gielda, Krypto, Terminal, Staking, Signals, ustawienia</small></div>';
 dm.querySelector(".mnp").addEventListener("click",function(e){var b=e.target.closest("[data-bk]");if(!b)return;if(!window.BK)return alert("Poczekaj na zalogowanie i wczytanie danych.");window.BK[b.dataset.bk]()});
 root.append(pl,dm);if(cs)root.append(cs);if(kz)root.append(kz);root.append(tg,pb);var ph=document.createElement("div");ph.className="thm";ph.style.display="contents";ph.append(pop);document.body.append(ph);nav.append(root);sync();}
function menus(){document.querySelectorAll(".mnu").forEach(function(m){var b=m.querySelector(".mnb"),p=m.querySelector(".mnp");if(!b||!p||m.dataset.ok)return;m.dataset.ok=1;document.body.append(p);
 function cl(){p.hidden=true;b.setAttribute("aria-expanded","false")}
 b.onclick=function(e){e.stopPropagation();var o=p.hidden;document.querySelectorAll(".mnp").forEach(function(x){x.hidden=true});if(pop)pop.hidden=true;p.hidden=!o;b.setAttribute("aria-expanded",o);if(o){var r=b.getBoundingClientRect();p.style.top=(r.bottom+6)+"px";p.style.right=Math.max(8,innerWidth-r.right)+"px";var f=p.querySelector("button");f&&f.focus()}};
 p.addEventListener("click",function(e){if(e.target.closest("button"))cl()});
 document.addEventListener("click",function(e){if(!m.contains(e.target)&&!p.contains(e.target))cl()});
 document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!p.hidden){cl();b.focus()}});addEventListener("resize",cl);addEventListener("scroll",function(e){if(!p.contains(e.target))cl()},true);});}
function boot(){mount();menus()}
document.readyState==="loading"?document.addEventListener("DOMContentLoaded",boot):boot();
})();
