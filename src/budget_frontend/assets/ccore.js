const K=(()=>{
const KEY="krypto-v1",SNK="krypto-snaps",HK="krypto-hist",CG="https://api.coingecko.com/api/v3/";
const jp=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k)||"null");return v==null?d:v}catch{return d}};
const today=()=>new Date().toLocaleDateString("sv");
let n=0;const uid=()=>Date.now()*1000+(n++%1000);
const num=v=>{const x=Number(String(v??"").replace(/\s/g,"").replace(",","."));return Number.isFinite(x)?x:0};
const money=(x,c,d)=>new Intl.NumberFormat("pl-PL",{style:"currency",currency:c||"USD",maximumFractionDigits:d??2}).format(x||0);
const price=x=>!x?"–":money(x,"USD",x<0.01?6:x<1?4:2);
const qty=x=>new Intl.NumberFormat("pl-PL",{maximumFractionDigits:x<1?6:x<100?4:2}).format(x||0);
const pct=x=>x==null||!isFinite(x)?"–":(x>0?"+":"")+x.toFixed(2)+"%";
const cls=x=>x>=0?"pos":"neg";
const cmp=(a,b)=>a.d<b.d?-1:a.d>b.d?1:b.s-a.s;
// znane id CoinGecko; reszta wyszukiwana po symbolu i nazwie
const KNOWN={BTC:"bitcoin",ETH:"ethereum",SOL:"solana",ICP:"internet-computer",ALGO:"algorand",NEAR:"near",SNX:"havven",LINK:"chainlink",INJ:"injective-protocol",
 ADA:"cardano",DOT:"polkadot",XRP:"ripple",DOGE:"dogecoin",BNB:"binancecoin",LTC:"litecoin",AVAX:"avalanche-2",ATOM:"cosmos",USDC:"usd-coin",USDT:"tether",DAI:"dai",CHAT:"openchat",
 GLD:"gold-dao",GOLDAO:"gold-dao",WTN:"waterneuron",ICS:"icpswap-token",ICL:"iclighthouse-dao",RJR:"rujira",RUJI:"rujira",FOLKS:"folks-finance",NICP:"nicp",CKBTC:"chain-key-bitcoin",CKETH:"chain-key-ethereum"};
function norm(o){o.ps=o.ps||[];o.ids=o.ids||{};o.manual=o.manual||{};o.prices=o.prices||{};o.meta=o.meta||{};o.aggName=o.aggName||"Wszystkie (suma)";
 if(!o.ps.length)o.ps.push({id:uid(),name:"Portfel 1",trades:[]});o.ps.forEach(p=>p.trades=p.trades||[]);
 if(o.cur!==0&&!o.ps.some(p=>p.id===o.cur))o.cur=o.ps[0].id;return o;}
let S=norm(jp(KEY,{}));
const save=()=>localStorage.setItem(KEY,JSON.stringify(S));save();
const toBin=(type,label,data)=>{(S.bin=S.bin||[]).push({id:Date.now()*1000+Math.floor(Math.random()*1000),ts:Date.now(),type,label,data});};

const P=()=>S.ps.find(p=>p.id===S.cur),isAgg=()=>S.cur===0,sel=()=>isAgg()?S.ps:[P()];
const isReward=t=>t.s>0&&(t.p<=0.0011||/nagrod|staking|stakin|reward|neuron|airdrop/i.test(t.c||""));
function derive(trades,upTo){
 const pos={};
 [...trades].filter(t=>!upTo||t.d<=upTo).sort(cmp).forEach(t=>{
  const o=pos[t.t]||(pos[t.t]={q:0,cost:0,realized:0,bought:0,sold:0,rew:0,fees:0,cs:0}),f=t.f||0;
  if(t.s>0){o.q+=t.q;o.cost+=t.q*t.p+f;o.bought+=t.q*t.p+f;if(isReward(t))o.rew+=t.q;}
  else{const avg=o.q>0?o.cost/o.q:0,pr=t.q*t.p-f;o.realized+=pr-avg*t.q;o.cs+=avg*t.q;o.cost-=avg*Math.min(t.q,o.q);o.q-=t.q;o.sold+=pr;}
  o.fees+=f;if(o.q<1e-9){o.q=0;o.cost=0;}});
 return pos;
}
function summary(ps){
 const pos={};ps.forEach(p=>{const d=derive(p.trades);for(const t in d){const o=d[t],m=pos[t]||(pos[t]={q:0,cost:0,realized:0,bought:0,sold:0,rew:0,cs:0});for(const k in m)m[k]+=o[k]||0;}});
 const rows=[];let mv=0,day=0,cost=0,realized=0,rewV=0,base=0,dayPln=0,basePln=0;const missing=[];
 const d0=today(),tt={},R=S.rate||0,Rp=R&&S.fx24!=null?R/(1+S.fx24/100):R;
 ps.forEach(p=>p.trades.forEach(x=>{if(x.d===d0&&!isReward(x))(tt[x.t]=tt[x.t]||[]).push(x);}));
 for(const t in pos){const o=pos[t],pr=S.prices[t]||{},p=pr.p||0,open=o.q>1e-9;let m=open?o.q*p:0;
  const nop=open&&!(p>0);if(nop)m=o.cost;
  const r={t,name:(S.meta[t]||{}).name||t,img:(S.meta[t]||{}).img,open,nop,q:o.q,avg:open?o.cost/o.q:0,p,ch24:pr.ch24,ch7:pr.ch7,ch30:pr.ch30,spark:pr.spark,
   mv:m,cost:open?o.cost:0,day:0,dayPln:0,unreal:open?m-o.cost:0,realized:o.realized,rew:o.rew,rewV:o.rew*p,bought:o.bought,sold:o.sold};
  if(pr.ch24!=null&&p>0){const p24=p/(1+pr.ch24/100);let bq=0,bb=0,dd=0,qs=0;
   (tt[t]||[]).forEach(x=>{if(x.s>0){bq+=x.q;bb+=x.q*x.p;dd+=x.q*(p-x.p);}else{qs+=x.q;dd+=x.q*(x.p-p24);}});
   const qh=Math.max(o.q-bq,0),b0=(qh+qs)*p24;dd+=qh*(p-p24);
   r.day=dd;r.dayPln=dd*R+b0*(R-Rp);base+=b0+bb;basePln+=b0*Rp+bb*R;}
  day+=r.day;dayPln+=r.dayPln;
  r.cs=o.cs;r.pctR=o.cs>0?o.realized/o.cs*100:null;r.total=r.unreal+r.realized;r.pctU=r.cost>0?r.unreal/r.cost*100:null;
  rows.push(r);realized+=o.realized;rewV+=r.rewV;if(open){mv+=m;cost+=o.cost;if(!(p>0))missing.push(t);}}
 rows.forEach(r=>r.share=mv>0?r.mv/mv*100:0);
 rows.sort((a,b)=>(b.open-a.open)||(b.mv-a.mv)||(a.t<b.t?-1:1));
 const unreal=mv-cost,inv=ps.reduce((a,p)=>a+p.trades.reduce((s,t)=>s+(t.s>0?t.q*t.p+(t.f||0):-(t.q*t.p-(t.f||0))),0),0);
 return {rows,mv,day,dayPct:base>0?day/base*100:0,dayPln,dayPctPln:basePln>0?dayPln/basePln*100:0,cost,unreal,realized,total:unreal+realized,unrealPct:cost>0?unreal/cost*100:0,basis:cost+rows.reduce((x,r)=>x+(r.cs||0),0),totPct:(cost+rows.reduce((x,r)=>x+(r.cs||0),0))>0?(unreal+realized)/(cost+rows.reduce((x,r)=>x+(r.cs||0),0))*100:0,inv,rewV,missing,pln:S.rate||0};
}
const posRows=()=>isAgg()?S.ps.flatMap(p=>summary([p]).rows.map(r=>({...r,pn:p.name,pid:p.id}))):summary(sel()).rows;
function validTrades(tr){const q={};for(const t of [...tr].sort(cmp)){q[t.t]=(q[t.t]||0)+(t.s>0?t.q:-t.q);if(q[t.t]<-1e-6)return false;}return true;}
// --- ceny (CoinGecko, jedno zapytanie dla wszystkich)
async function cg(path){const r=await fetch(CG+path);if(r.status===429)throw new Error("CoinGecko: limit zapytan, sprobuj za minute");if(!r.ok)throw new Error("CoinGecko blad "+r.status);return r.json();}
const ascii=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"");
async function resolve(t){
 S.uids=S.uids||{};if(S.ids[t]&&(S.uids[t]||!KNOWN[t]))return S.ids[t];if(KNOWN[t])return S.ids[t]=KNOWN[t];
 const j=await cg("search?query="+encodeURIComponent((S.meta[t]||{}).name||t)),nm=ascii((S.meta[t]||{}).name);
 let c=(j.coins||[]).filter(x=>x.symbol.toUpperCase()===t);
 if(!c.length){const j2=await cg("search?query="+encodeURIComponent(t));c=(j2.coins||[]).filter(x=>x.symbol.toUpperCase()===t);}
 c.sort((a,b)=>((ascii(b.name)===nm)-(ascii(a.name)===nm))||((a.market_cap_rank||1e9)-(b.market_cap_rank||1e9)));
 if(!c[0])return null;return S.ids[t]=c[0].id;
}
const syms=()=>{const s=new Set();S.ps.forEach(p=>{const d=derive(p.trades);for(const t in d)if(d[t].q>1e-9)s.add(t);});return [...s];};
async function rate(){
 for(const u of ["https://api.frankfurter.dev/v1/latest?base=USD&symbols=PLN","https://api.frankfurter.app/latest?base=USD&symbols=PLN"]){try{const r=await fetch(u);if(r.ok){const j=await r.json();if(j.rates&&j.rates.PLN)return S.rate=j.rates.PLN;}}catch{}}
 try{const r=await fetch("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json");if(r.ok){const j=await r.json();if(j.usd&&j.usd.pln)return S.rate=j.usd.pln;}}catch{}
 return S.rate||0;
}
async function refresh(){
 const ts=syms(),errs=[];
 S.uids=S.uids||{};
 ts.forEach(t=>{if(KNOWN[t]&&!S.uids[t])S.ids[t]=KNOWN[t];});
 for(const t of ts){if(S.manual[t]>0||S.ids[t])continue;try{if(!(await resolve(t)))errs.push(t+": brak w CoinGecko - ustaw ID lub cene");await new Promise(r=>setTimeout(r,1200));}catch(e){errs.push(e.message);break;}}
 const ids=[...new Set(ts.filter(t=>!(S.manual[t]>0)).map(t=>S.ids[t]).filter(Boolean))];
 try{
  if(ids.length){const m=await cg("coins/markets?vs_currency=usd&ids="+ids.join(",")+"&sparkline=true&price_change_percentage=24h,7d,30d&per_page=250");
   const by={};m.forEach(x=>by[x.id]=x);
   ts.forEach(t=>{const x=by[S.ids[t]];if(!x)return;S.prices[t]={p:x.current_price,ch24:x.price_change_percentage_24h_in_currency,ch7:x.price_change_percentage_7d_in_currency,ch30:x.price_change_percentage_30d_in_currency,
    spark:(x.sparkline_in_7d&&x.sparkline_in_7d.price||[]).filter((_,i,a)=>i%4===0||i===a.length-1),mc:x.market_cap,rank:x.market_cap_rank};
    S.meta[t]={...(S.meta[t]||{}),name:(S.meta[t]||{}).name||x.name,img:x.image};});}
 }catch(e){errs.push(e.message);}
 ts.forEach(t=>{if(S.manual[t]>0)S.prices[t]={p:S.manual[t],manual:true};});
 await rate();
 try{const j=(await cg("simple/price?ids=tether&vs_currencies=usd,pln&include_24hr_change=true")).tether;S.fx24=((1+(j.pln_24h_change||0)/100)/(1+(j.usd_24h_change||0)/100)-1)*100;}catch{}
 S.ts=Date.now();save();
 if(!errs.length)snap();return errs.join(" · ");
}
async function quoteOne(t){
 if(S.manual[t]>0)return S.manual[t];const id=await resolve(t);if(!id)throw new Error(t+": brak w CoinGecko");
 const m=await cg("coins/markets?vs_currency=usd&ids="+id+"&sparkline=true&price_change_percentage=24h,7d,30d"),x=m[0];if(!x)throw new Error("Brak ceny "+t);
 S.prices[t]={p:x.current_price,ch24:x.price_change_percentage_24h_in_currency,ch7:x.price_change_percentage_7d_in_currency,ch30:x.price_change_percentage_30d_in_currency,spark:(x.sparkline_in_7d&&x.sparkline_in_7d.price||[]).filter((_,i,a)=>i%4===0||i===a.length-1)};
 S.meta[t]={...(S.meta[t]||{}),name:(S.meta[t]||{}).name||x.name,img:x.image};save();return x.current_price;
}
const snaps=()=>jp(SNK,{});
function snap(){const s=snaps(),v={};S.ps.forEach(p=>{const x=summary([p]);v[p.id]=[+x.mv.toFixed(2),+x.cost.toFixed(2)];});s[today()]={r:S.rate||0,v};localStorage.setItem(SNK,JSON.stringify(s));}
// --- historia cen (cache lokalny, nie synchronizowany)
async function history(days,onStep){
 const H=jp(HK,{}),need=new Set();S.ps.forEach(p=>p.trades.forEach(t=>need.add(t.t)));
 const list=[...need].filter(t=>!(S.manual[t]>0));let i=0;
 for(const t of list){const id=S.ids[t]||await resolve(t).catch(()=>null);i++;if(!id)continue;
  const h=H[id];if(h&&h.f===today()&&h.days>=days)continue;onStep&&onStep(i,list.length,t);
  try{const j=await cg("coins/"+id+"/market_chart?vs_currency=usd&days="+days+"&interval=daily"),px={};
   (j.prices||[]).forEach(([ms,v])=>px[new Date(ms).toISOString().slice(0,10)]=v);H[id]={f:today(),days,px};
   try{localStorage.setItem(HK,JSON.stringify(H));}catch{}}catch(e){if(/limit/.test(e.message)){await new Promise(r=>setTimeout(r,20000));try{const j=await cg("coins/"+id+"/market_chart?vs_currency=usd&days="+days+"&interval=daily"),px={};(j.prices||[]).forEach(([ms,v])=>px[new Date(ms).toISOString().slice(0,10)]=v);H[id]={f:today(),days,px};localStorage.setItem(HK,JSON.stringify(H));}catch{}}}
  await new Promise(r=>setTimeout(r,1300));}
 save();return H;
}
function series(ps,days){
 const H=jp(HK,{}),out=[],trades=ps.flatMap(p=>p.trades),T=new Date(today());
 const last={};
 for(let k=days;k>=0;k--){const d=new Date(T.getTime()-k*864e5).toISOString().slice(0,10),pos=derive(trades,d);let v=0,c=0,ok=true;
  for(const t in pos){const o=pos[t];if(o.q<=1e-9)continue;c+=o.cost;
   let p=S.manual[t]>0?S.manual[t]:null;const id=S.ids[t];if(p==null&&id&&H[id]&&H[id].px[d]!=null){p=H[id].px[d];last[t]=p;}if(p==null)p=last[t]??(d===today()?(S.prices[t]||{}).p:null);
   if(p==null){ok=false;p=o.cost/o.q;}v+=o.q*p;}
  out.push({d,v,c,ok});}
 return out;
}
// --- portfele
function mountSelect(el,cb){el.innerHTML="";const add=(v,t)=>{const o=document.createElement("option");o.value=v;o.textContent=t;if(v===S.cur)o.selected=true;el.append(o);};
 add(0,S.aggName);S.ps.forEach(p=>add(p.id,p.name));el.onchange=()=>{S.cur=+el.value;save();cb&&cb();};}
function addPortfolio(name){const id=uid();S.ps.push({id,name:name.slice(0,40),trades:[]});S.cur=id;save();}
function rename(name){if(isAgg())S.aggName=name.slice(0,40);else P().name=name.slice(0,40);save();}
function removePortfolio(p){if(!p)return "Wybierz konkretny portfel";if(S.ps.length<2)return "Musi zostac przynajmniej jeden portfel";
 toBin("k-ps","Portfel "+p.name+" ("+p.trades.length+" transakcji)",{p});S.ps=S.ps.filter(x=>x.id!==p.id);S.cur=S.ps[0].id;save();return "";}
function restore(){if(!S.trash)return alert("Brak usunietego portfela");S.ps.push(S.trash.p);S.cur=S.trash.p.id;S.trash=null;save();}
// --- import z innej aplikacji (portfolio_export_*.json)
const nsDate=v=>{try{const ms=typeof v==="string"&&v.length>15?Number(BigInt(v)/1000000n):Number(v);const d=new Date(ms<1e11?ms*1000:ms);return isNaN(d)?today():d.toLocaleDateString("sv");}catch{return today();}};
function parseExport(o){
 if(!o||!Array.isArray(o.portfolios))throw new Error("Nieznany format pliku (brak 'portfolios')");
 return o.portfolios.map(pf=>{
  const trades=(pf.transactions||[]).filter(x=>x&&x.assetSymbol&&num(x.amount)>0).map(x=>({id:uid(),d:nsDate(x.date),t:String(x.assetSymbol).toUpperCase(),s:x.type==="sell"?-1:1,q:num(x.amount),p:num(x.price),f:0,c:String(x.comment||"").slice(0,120)}));
  const run={};[...trades].sort(cmp).forEach(t=>{run[t.t]=(run[t.t]||0)+t.s*t.q;
   if(run[t.t]<-1e-6){const nb=trades.filter(x=>x.t===t.t&&x.s>0&&x.d>t.d).map(x=>x.d).sort().pop();if(nb){t.d=nb;t.c=(t.c?t.c+" ":"")+"(data przesunieta)";}run[t.t]=0;}});
  const names={};(pf.assets||[]).forEach(a=>names[String(a.symbol).toUpperCase()]=a.name);(pf.transactions||[]).forEach(x=>names[String(x.assetSymbol).toUpperCase()]=names[String(x.assetSymbol).toUpperCase()]||x.assetName);
  const pos=derive(trades),fix=[];
  (pf.assets||[]).forEach(a=>{const t=String(a.symbol).toUpperCase(),have=(pos[t]||{}).q||0,diff=num(a.amount)-have;
   if(Math.abs(diff)>1e-6){trades.push({id:uid(),d:today(),t,s:diff>0?1:-1,q:Math.abs(diff),p:diff>0?0:0,f:0,c:"korekta importu (stan z eksportu)"});fix.push(t+" "+(diff>0?"+":"")+diff);}});
  return {name:String(pf.name||"Import").slice(0,40),trades,names,fix};
 });
}
function applyImport(list,mode){
 list.forEach(x=>{Object.entries(x.names).forEach(([t,nm])=>{if(nm)S.meta[t]={...(S.meta[t]||{}),name:nm};});
  const ex=S.ps.find(p=>p.name===x.name);
  if(ex&&mode==="replace")ex.trades=x.trades;else S.ps.push({id:uid(),name:ex?x.name+" (import)":x.name,trades:x.trades});});
 if(S.ps.length>1&&S.ps[0].name==="Portfel 1"&&!S.ps[0].trades.length)S.ps.shift();
 S.cur=S.ps[S.ps.length-1].id;save();
}
function exportJson(){return {app:"budzet-icp-krypto",v:1,exported:new Date().toISOString(),krypto:S,snaps:snaps()};}
return {get S(){return S},save,P,isAgg,sel,derive,summary,posRows,validTrades,refresh,quoteOne,resolve,history,series,snaps,mountSelect,addPortfolio,rename,removePortfolio,restore,toBin,
 parseExport,applyImport,exportJson,isReward,today,uid,num,money,price,qty,pct,cls,cmp};
})();
