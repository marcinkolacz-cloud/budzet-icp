const G=(()=>{
const KEY="gielda-v2",OLD="gielda-v1",KK="gielda-key",FXK="gielda-fx",SNK="gielda-snaps",BK="gielda-backup",CUR=["PLN","EUR","USD"];
const jp=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k)||"null");return v==null?d:v}catch{return d}};
const today=()=>new Date().toLocaleDateString("sv");
let n=0;const uid=()=>Date.now()*1000+(n++%1000);
const num=v=>{const x=Number(String(v??"").replace(/\s/g,"").replace(",","."));return Number.isFinite(x)?x:0};
const money=(x,c)=>new Intl.NumberFormat("pl-PL",{style:"currency",currency:c}).format(x||0);
const pct=x=>(x>0?"+":"")+(x||0).toFixed(2)+"%";
const cls=x=>x>=0?"pos":"neg";
const cmp=(a,b)=>a.d<b.d?-1:a.d>b.d?1:b.s-a.s;
const byD=(a,b)=>a.d<b.d?-1:a.d>b.d?1:0;
function norm(o){
 o.prices=o.prices||{};o.aggName=o.aggName||"Główny (suma)";
 o.ps.forEach(p=>{p.tx=p.tx||[];p.trades=p.trades||[];p.fx=p.fx||[];});
 if(!o.v3){o.ps.forEach(p=>p.tx.forEach(x=>{if(x.c)return;x.c="PLN";x.a=x.pln;
  p.fx.push(x.s>0?{id:uid(),d:x.d,f:"PLN",t:"USD",af:x.pln,at:x.usd,auto:true}:{id:uid(),d:x.d,f:"USD",t:"PLN",af:x.usd,at:x.pln,auto:true});}));o.v3=1;}
 if(o.cur!==0&&!o.ps.some(p=>p.id===o.cur))o.cur=o.ps[0].id;return o;
}
function load(){
 const o=jp(KEY,null);if(o&&Array.isArray(o.ps)&&o.ps.length)return norm(o);
 const v=jp(OLD,{}),src=Array.isArray(v.ps)&&v.ps.length?v.ps:[{id:1,name:"Portfel 1",list:v.list||[],tx:[]}];
 const r={ps:[],cur:0,prices:{},rate:null,trash:null};
 src.forEach(p=>{const q={id:p.id||uid(),name:p.name==="Glowny"?"Portfel 1":p.name,tx:p.tx||[],trades:[]};
  (p.list||[]).forEach(x=>{if(x.q>0)q.trades.push({id:uid(),d:today(),t:x.t,s:1,q:x.q,p:x.b>0?x.b:x.p,f:0});r.prices[x.t]={p:x.p,pc:x.pc};});
  r.ps.push(q);});
 r.cur=r.ps[0].id;return norm(r);
}
let S=load();
const save=()=>localStorage.setItem(KEY,JSON.stringify(S));save();
const P=()=>S.ps.find(p=>p.id===S.cur);
const isAgg=()=>S.cur===0;
const sel=()=>isAgg()?S.ps:[P()];
function derive(p){
 const pos={},w={PLN:0,EUR:0,USD:0};let dPln=0,dEur=0,dUsd=0,iPln=0,iUsd=0,xP=0,xU=0;
 p.tx.forEach(x=>{w[x.c||"PLN"]+=x.s*(x.a!=null?x.a:x.pln);dPln+=x.s*x.pln;dEur+=x.s*x.eur;dUsd+=x.s*x.usd;if(x.s>0){iPln+=x.pln;iUsd+=x.usd;}});
 (p.fx||[]).forEach(x=>{w[x.f]-=x.af;w[x.t]+=x.at;if(x.f==="PLN"&&x.t==="USD"){xP+=x.af;xU+=x.at;}});
 [...p.trades].sort(cmp).forEach(t=>{const o=pos[t.t]||(pos[t.t]={q:0,cost:0,realized:0}),f=t.f||0;
  if(t.s>0){o.q+=t.q;o.cost+=t.q*t.p+f;w.USD-=t.q*t.p+f;}
  else{const avg=o.q>0?o.cost/o.q:0,pr=t.q*t.p-f;o.realized+=pr-avg*t.q;o.cost-=avg*t.q;o.q-=t.q;w.USD+=pr;}
  if(o.q<1e-9){o.q=0;o.cost=0;}});
 return {pos,w,dPln,dEur,dUsd,iPln,iUsd,xP,xU};
}
function summary(ps){
 const pos={},w={PLN:0,EUR:0,USD:0};let dPln=0,dEur=0,dUsd=0,iPln=0,iUsd=0,xP=0,xU=0;
 ps.forEach(p=>{const d=derive(p);CUR.forEach(c=>w[c]+=d.w[c]);dPln+=d.dPln;dEur+=d.dEur;dUsd+=d.dUsd;iPln+=d.iPln;iUsd+=d.iUsd;xP+=d.xP;xU+=d.xU;
  for(const t in d.pos){const o=d.pos[t],m=pos[t]||(pos[t]={q:0,cost:0,realized:0});m.q+=o.q;m.cost+=o.cost;m.realized+=o.realized;}});
 const rows=[];let mv=0,day=0,cost=0,realized=0;const missing=[];
 for(const t in pos){const o=pos[t],pr=S.prices[t]||{p:0,pc:0},open=o.q>1e-9,m=open?o.q*pr.p:0;
  const r={t,open,q:open?o.q:0,avg:open?o.cost/o.q:0,p:pr.p,pc:pr.pc,mv:m,cost:open?o.cost:0,day:open&&pr.pc?(pr.p-pr.pc)*o.q:0,unreal:open?m-o.cost:0,realized:o.realized};
  rows.push(r);realized+=o.realized;if(open){mv+=m;day+=r.day;cost+=o.cost;if(!(pr.p>0))missing.push(t);}}
 rows.sort((a,b)=>b.mv-a.mv);
 const rate=S.rate?S.rate.r:0,eur=S.rate&&S.rate.e?S.rate.e:0;
 const cashMissing=(w.EUR!==0&&!eur)||(w.PLN!==0&&!rate);
 const cash=w.USD+(eur?w.EUR/eur:0)+(rate?w.PLN/rate:0),vUsd=mv+cash,profUsd=vUsd-dUsd,vPln=vUsd*rate;
 return {rows,mv,day,cost,cash,w,cashMissing,realized,unreal:mv-cost,vUsd,dPln,dEur,dUsd,rate,eur,missing,
  avgRate:xU?xP/xU:(iUsd?iPln/iUsd:0),profUsd,profPct:dUsd>0?profUsd/dUsd*100:0,vPln,vEur:vUsd*eur,
  totPln:rate?vPln-dPln:0,totPct:rate&&dPln>0?(vPln-dPln)/dPln*100:0,assetPln:profUsd*rate,fxPln:rate?dUsd*rate-dPln:0};
}
function posRows(){
 if(!isAgg())return summary(sel()).rows;
 return S.ps.flatMap(p=>summary([p]).rows.map(x=>({...x,pn:p.name}))).sort((a,b)=>(b.open-a.open)||(a.t<b.t?-1:a.t>b.t?1:a.pn<b.pn?-1:1));
}
function validTrades(tr){const q={};for(const t of [...tr].sort(cmp)){q[t.t]=(q[t.t]||0)+(t.s>0?t.q:-t.q);if(q[t.t]<-1e-9)return false;}return true;}
function negWallets(p){const w=derive(p).w;return CUR.filter(c=>w[c]<-0.005).map(c=>c+" "+money(w[c],c));}
function setKey(){const k=prompt("Klucz API Finnhub (darmowy: finnhub.io)");if(k)localStorage.setItem(KK,k.trim());return localStorage.getItem(KK);}
const CRYPTO={USDC:"usd-coin",USDT:"tether",DAI:"dai",BTC:"bitcoin",ETH:"ethereum",SOL:"solana",XRP:"ripple",ADA:"cardano",DOGE:"dogecoin",BNB:"binancecoin",LTC:"litecoin",DOT:"polkadot"},STABLE=["USDC","USDT","DAI"];
async function cgQuote(t){
 const id=CRYPTO[t];
 try{const r=await fetch("https://api.coingecko.com/api/v3/simple/price?ids="+id+"&vs_currencies=usd&include_24hr_change=true");if(!r.ok)throw 0;
  const x=(await r.json())[id];if(!x||!(x.usd>0))throw 0;return {c:x.usd,pc:x.usd/(1+(x.usd_24h_change||0)/100)};}
 catch{if(STABLE.includes(t))return {c:1,pc:1};throw new Error("Brak ceny "+t+" (CoinGecko)");}
}
const WKK="gielda-worker";
function setWorker(){const u=prompt("URL Cloudflare Worker (gielda-quote), np. https://gielda-quote.xxx.workers.dev");if(u)localStorage.setItem(WKK,u.trim().replace(/\/+$/,""));return localStorage.getItem(WKK);}
async function euQuote(t){
 const u=localStorage.getItem(WKK)||"https://gielda-quote.marcinkolacz.workers.dev";if(!u)throw new Error("Brak URL workera");
 let r;try{r=await fetch(u+"/q?s="+encodeURIComponent(t));}catch{throw new Error("Worker niedostepny");}
 if(!r.ok)throw new Error("Worker blad "+r.status);
 const x=(await r.json())[t];if(!x||!(x.usd>0))throw new Error("Nie znaleziono: "+t+(x&&x.err?" ("+x.err+")":""));
 return {c:x.usd,pc:x.pcUsd||x.usd,cur:x.cur,n:x.c,name:x.name};
}
async function quote(t){
 if(CRYPTO[t])return cgQuote(t);
 if(t.includes("."))return euQuote(t);
 try{return await usQuote(t);}catch(e){try{return await euQuote(t);}catch{throw e;}}
}
async function usQuote(t){
 const k=localStorage.getItem(KK)||setKey();if(!k)throw new Error("Brak klucza API");
 const r=await fetch("https://finnhub.io/api/v1/quote?symbol="+encodeURIComponent(t)+"&token="+encodeURIComponent(k));
 if(r.status===401||r.status===403){localStorage.removeItem(KK);throw new Error("Zly klucz API");}
 if(r.status===429)throw new Error("Limit zapytan, sprobuj za minute");
 if(!r.ok)throw new Error("Blad "+r.status);
 const q=await r.json();if(!q.c)throw new Error("Nie znaleziono: "+t);return q;
}
const FXU=["https://api.frankfurter.dev/v1/","https://api.frankfurter.app/"];
async function fxGet(path,q){for(const u of FXU){try{const x=await fetch(u+path+"?"+q);if(x.ok)return await x.json();}catch{}}return null;}
async function fxAlt(date,base,syms){
 const b=base.toLowerCase();
 try{const x=await fetch("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@"+date+"/v1/currencies/"+b+".json");
  if(x.ok){const j=await x.json(),m=j[b];if(m&&syms.every(s=>m[s.toLowerCase()]>0)){const rates={};syms.forEach(s=>rates[s]=m[s.toLowerCase()]);return {rates,date:j.date};}}}catch{}
 return null;
}
async function rates(d){
 const c=jp(FXK,{});if(c[d])return c[d];
 let r=await fxGet(d>=today()?"latest":d,"base=PLN&symbols=EUR,USD");
 if(!r||!r.rates||!r.rates.EUR)r=await fxAlt(d>=today()?"latest":d,"PLN",["EUR","USD"]);
 if(!r||!r.rates||!r.rates.EUR)throw new Error("Brak kursu walut dla "+d);
 c[d]=r.rates;localStorage.setItem(FXK,JSON.stringify(c));return r.rates;
}
async function convert(d,f,t,a){const r=await rates(d),u={PLN:1,EUR:r.EUR,USD:r.USD};return a*u[t]/u[f];}
async function depositValues(d,c,a){
 const r=await rates(d),u={PLN:1,EUR:r.EUR,USD:r.USD},pln=a/u[c],o={pln,eur:pln*u.EUR,usd:pln*u.USD};o[c.toLowerCase()]=a;
 return {pln:+o.pln.toFixed(2),eur:+o.eur.toFixed(2),usd:+o.usd.toFixed(2)};
}
async function getRate(force){
 if(!force&&S.rate&&S.rate.e&&Date.now()-S.rate.ts<3600e3)return S.rate.r;
 let j=await fxGet("latest","base=USD&symbols=PLN,EUR");
 if(!(j&&j.rates&&j.rates.PLN&&j.rates.EUR))j=await fxAlt("latest","USD",["PLN","EUR"]);
 if(j&&j.rates&&j.rates.PLN&&j.rates.EUR){S.rate={r:j.rates.PLN,e:j.rates.EUR,ts:Date.now(),d:j.date};save();return S.rate.r;}
 if(S.rate)return S.rate.r;throw new Error("Brak kursu USD/PLN");
}
const snaps=()=>jp(SNK,{});
function snap(){if(!S.rate)return;const s=snaps(),v={};S.ps.forEach(p=>{v[p.id]=summary([p]).vUsd;});s[today()]={r:S.rate.r,e:S.rate.e||null,v};localStorage.setItem(SNK,JSON.stringify(s));}
async function refreshAll(){
 let err=null;const ts=new Set();
 S.ps.forEach(p=>{const d=derive(p);for(const t in d.pos)if(d.pos[t].q>1e-9)ts.add(t);});
 try{await getRate(true);}catch(e){err=e.message;}
 try{for(const t of ts){const q=await quote(t);S.prices[t]={p:q.c,pc:q.pc};}}catch(e){err=e.message;}
 if(!err)S.pricesTs=Date.now();
 save();if(!err&&!summary(S.ps).missing.length)snap();return err;
}
function history(ps){
 const sn=snaps(),ids=ps.map(p=>p.id),last={},out=[];
 Object.keys(sn).sort().forEach(d=>{Object.assign(last,sn[d].v);out.push({d,v:ids.reduce((a,id)=>a+(last[id]||0),0),r:sn[d].r,e:sn[d].e||0});});
 return out;
}
function live(ps){const s=summary(ps);return !s.missing.length&&!s.cashMissing?{d:today(),v:s.vUsd,r:S.rate?S.rate.r:0,e:S.rate&&S.rate.e||0,live:true}:null;}
function points(ps){const T=today(),lv=live(ps),H=history(ps).filter(h=>!lv||h.d<T);return lv?[...H,lv]:H;}
const flows=ps=>ps.flatMap(p=>p.tx.map(x=>({d:x.d,pln:x.s*x.pln,eur:x.s*x.eur,usd:x.s*x.usd}))).sort(byD);
const valueIn=(pt,c)=>!pt?null:c==="USD"?pt.v:c==="PLN"?(pt.r?pt.v*pt.r:null):(pt.e?pt.v*pt.e:null);
const ptAt=(pts,d)=>{let b=null;for(const h of pts)if(h.d<=d)b=h;return b;};
function periodReturn(ps,from,to){
 const pts=points(ps),F=flows(ps),en=ptAt(pts,to),st=ptAt(pts,from);
 if(!en||en.d<from)return null;
 const day=d=>new Date(d).getTime()/864e5,span=Math.max(1,day(to)-day(from));
 return CUR.map(c=>{
  const k=c.toLowerCase(),b0=F.filter(f=>f.d<=from).reduce((a,f)=>a+f[k],0),vs=st?valueIn(st,c):b0,ve=valueIn(en,c);
  const fl=F.filter(f=>f.d>from&&f.d<=to),sf=fl.reduce((a,f)=>a+f[k],0);
  if(vs==null||ve==null)return {c,vs,sf,ve:null};
  const wb=vs+fl.reduce((a,f)=>a+f[k]*Math.min(1,Math.max(0,day(to)-day(f.d)+0.5)/span),0),base=vs<=0&&sf>0?sf:wb,pr=ve-vs-sf;
  return {c,vs,sf,ve,pr,pct:base>0?pr/base*100:null};
 });
}
function mountSelect(el,cb){
 el.innerHTML="";const add=(v,t)=>{const o=document.createElement("option");o.value=v;o.textContent=t;if(v===S.cur)o.selected=true;el.append(o);};
 add(0,S.aggName);S.ps.forEach(p=>add(p.id,p.name));
 el.onchange=()=>{S.cur=+el.value;save();cb&&cb();};
}
function addPortfolio(name){const id=uid();S.ps.push({id,name:name.slice(0,40),tx:[],trades:[],fx:[]});S.cur=id;save();}
function rename(name){if(isAgg())S.aggName=name.slice(0,40);else P().name=name.slice(0,40);save();}
function removePortfolio(p){
 if(!p)return "Wybierz konkretny portfel";if(S.ps.length<2)return "Musi zostac przynajmniej jeden portfel";
 S.trash={ts:Date.now(),p};S.ps=S.ps.filter(x=>x.id!==p.id);S.cur=S.ps[0].id;save();return "";
}
function restore(){if(!S.trash)return;const p=S.trash.p;if(S.ps.some(x=>x.id===p.id))p.id=uid();S.ps.push(p);S.cur=p.id;S.trash=null;save();}
function exportJson(){
 const b=new Blob([JSON.stringify({v:3,S,snaps:snaps()},null,1)],{type:"application/json"}),a=document.createElement("a");
 a.href=URL.createObjectURL(b);a.download="gielda-backup-"+today()+".json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function importJson(txt){
 const o=JSON.parse(txt),s=o&&o.S;
 if(!s||!Array.isArray(s.ps)||!s.ps.length||!s.ps.every(p=>p&&p.id!=null&&typeof p.name==="string"&&Array.isArray(p.tx)&&Array.isArray(p.trades)))throw new Error("Nieprawidlowy plik kopii");
 localStorage.setItem(BK,localStorage.getItem(KEY)||"");S=norm(s);if(o.snaps)localStorage.setItem(SNK,JSON.stringify(o.snaps));save();
}
return {get S(){return S},CUR,save,P,isAgg,sel,derive,summary,posRows,validTrades,negWallets,quote,rates,convert,depositValues,getRate,refreshAll,snaps,history,points,flows,valueIn,ptAt,periodReturn,
 mountSelect,addPortfolio,rename,removePortfolio,restore,exportJson,importJson,setKey,setWorker,today,uid,num,money,pct,cls,cmp,byD};
})();
