/* Pelny backup calej aplikacji: dane przegladarki (synchronizowane) + backend (staking, signals, terminal) */
;(function(){
const LSK=["budzet-app-v3","gielda-v2","gielda-snaps","krypto-v1","krypto-snaps","signals-v1"];
const PREF=["budzet-theme","budzet-accent","budzet-priv","budzet-cur","krypto-cur","staking-cur"];
const idl=({IDL})=>{
 const N=IDL.Record({id:IDL.Nat64,name:IDL.Text,start:IDL.Int,dissolve:IDL.Nat64,initStake:IDL.Nat64,stake:IDL.Nat64});
 const R=IDL.Record({nid:IDL.Nat64,ts:IDL.Int,un:IDL.Nat64,sm:IDL.Nat64,auto:IDL.Bool,delta:IDL.Int,sd:IDL.Nat64,ev:IDL.Text});
 const WP=IDL.Record({id:IDL.Nat,name:IDL.Text,start:IDL.Int});
 const W=IDL.Record({pid:IDL.Nat,date:IDL.Int,nicp:IDL.Float64,paid:IDL.Float64,red:IDL.Float64});
 const E=IDL.Record({chain:IDL.Text,day:IDL.Text,staked:IDL.Nat,pending:IDL.Nat,reward:IDL.Int,usd:IDL.Float64,pln:IDL.Float64,at:IDL.Int});
 const P=IDL.Record({day:IDL.Text,icpUsd:IDL.Float64,icpPln:IDL.Float64,nearUsd:IDL.Float64,nearPln:IDL.Float64,injUsd:IDL.Float64,injPln:IDL.Float64});
 const S=IDL.Record({nid:IDL.Nat64,ok:IDL.Bool,err:IDL.Text,at:IDL.Int});
 const StAll=IDL.Record({neurons:IDL.Vec(N),rewards:IDL.Vec(R),wtnPos:IDL.Vec(WP),wtn:IDL.Vec(W),ext:IDL.Vec(E),prices:IDL.Vec(P),sync:IDL.Vec(S),lastRun:IDL.Int,log:IDL.Text,nextRunSec:IDL.Nat,hasKey:IDL.Bool});
 const D=IDL.Record({day:IDL.Text,raw:IDL.Text,at:IDL.Int});
 const Ev=IDL.Record({id:IDL.Nat,day:IDL.Text,sym:IDL.Text,on:IDL.Bool,price:IDL.Float64,w:IDL.Float64,mailed:IDL.Bool});
 const Ps=IDL.Record({id:IDL.Nat,sym:IDL.Text,status:IDL.Text,opened:IDL.Text,entry:IDL.Float64,qty:IDL.Float64,stop:IDL.Float64,closed:IDL.Text,exit:IDL.Float64,note:IDL.Text,evId:IDL.Nat,at:IDL.Int});
 const SgAll=IDL.Record({days:IDL.Vec(D),events:IDL.Vec(Ev),pos:IDL.Vec(Ps),lastRun:IDL.Int,log:IDL.Text,nextRunSec:IDL.Nat,hasKey:IDL.Bool,mail:IDL.Bool});
 const Bot=IDL.Record({id:IDL.Nat,name:IDL.Text,syms:IDL.Vec(IDL.Text),amount:IDL.Float64,scale:IDL.Bool,fresh:IDL.Bool,mode:IDL.Text,start:IDL.Text,endDay:IDL.Text,maxEntries:IDL.Nat,entries:IDL.Nat,active:IDL.Bool,note:IDL.Text,created:IDL.Int});
 const Cfg=IDL.Record({kind:IDL.Text,qty:IDL.Vec(IDL.Tuple(IDL.Text,IDL.Float64))});
 const Od=IDL.Record({cid:IDL.Text,bot:IDL.Nat,day:IDL.Text,sym:IDL.Text,buy:IDL.Bool,req:IDL.Float64,status:IDL.Text,tries:IDL.Nat,msg:IDL.Text,at:IDL.Int});
 const Tr=IDL.Record({id:IDL.Nat,bot:IDL.Nat,day:IDL.Text,sym:IDL.Text,buy:IDL.Bool,price:IDL.Float64,qty:IDL.Float64,usd:IDL.Float64,fee:IDL.Float64});
 const Pl=IDL.Record({sym:IDL.Text,lv:IDL.Vec(IDL.Tuple(IDL.Float64,IDL.Float64)),tot:IDL.Float64,on:IDL.Bool,at:IDL.Int});
 const RT=IDL.Variant({ok:IDL.Text,err:IDL.Text}),RN=IDL.Variant({ok:IDL.Nat,err:IDL.Text});
 return IDL.Service({stAll:IDL.Func([],[StAll],["query"]),stNeuronPut:IDL.Func([N],[RT],[]),stRewardsImport:IDL.Func([IDL.Vec(R)],[RN],[]),
  stWtnPosPut:IDL.Func([IDL.Nat,IDL.Text,IDL.Int],[RN],[]),stWtnPut:IDL.Func([IDL.Vec(W)],[RN],[]),
  stWtnCloses:IDL.Func([],[IDL.Vec(IDL.Record({pid:IDL.Nat,date:IDL.Int,nicp:IDL.Float64,icp:IDL.Float64,val:IDL.Float64}))],["query"]),
  stWtnClosePut:IDL.Func([IDL.Record({pid:IDL.Nat,date:IDL.Int,nicp:IDL.Float64,icp:IDL.Float64,val:IDL.Float64})],[RT],[]),stExtImport:IDL.Func([IDL.Vec(E)],[RN],[]),
  sgAll:IDL.Func([],[SgAll],["query"]),sgPosPut:IDL.Func([Ps],[RN],[]),
  sgBotsAll:IDL.Func([],[IDL.Record({bots:IDL.Vec(Bot),trades:IDL.Vec(Tr),cfg:IDL.Vec(IDL.Tuple(IDL.Nat,Cfg))})],["query"]),
  tbAll:IDL.Func([],[IDL.Record({plans:IDL.Vec(Pl),sales:IDL.Vec(Tr),orders:IDL.Vec(Od),live:IDL.Bool,owner:IDL.Bool})],["query"]),tbPut:IDL.Func([Pl],[RT],[])});
};
let A=null;try{A=Auth.mk(idl);}catch(e){}
const B=v=>BigInt(v==null||v===""?0:v),jp=k=>{try{return JSON.parse(localStorage.getItem(k)||"null")}catch(e){return null}};
const today=()=>new Date().toLocaleDateString("sv",{timeZone:"Europe/Warsaw"});
let ov=null;const say=t=>{if(!ov){ov=document.createElement("div");ov.style.cssText="position:fixed;inset:0;z-index:10001;background:var(--bg,#f3f1ec);display:flex;align-items:center;justify-content:center;padding:20px;text-align:center;font:14px Segoe UI,sans-serif;color:var(--muted,#7a736a)";document.body.append(ov);}ov.textContent=t;};
const done=()=>{ov&&ov.remove();ov=null;};
const lsObj=()=>{const o={};LSK.forEach(k=>{const v=jp(k);if(v!=null)o[k]=v});return o;};
async function exp(){
 say("Przygotowanie backupu…");const o={app:"budzet-icp",v:2,kind:"full",exported:new Date().toISOString(),ls:lsObj(),prefs:{},errors:[]};
 PREF.forEach(k=>{const v=localStorage.getItem(k);if(v!=null)o.prefs[k]=v});
 const tryq=async(n,f)=>{try{return await f()}catch(e){o.errors.push(n+": "+(e&&e.message||e));return null}};
 if(A){
  const st=await tryq("staking",()=>A.stAll());if(st){o.staking={neurons:st.neurons,rewards:st.rewards,wtnPos:st.wtnPos,wtn:st.wtn,ext:st.ext};try{o.staking.wtnClose=await A.stWtnCloses();}catch(e){}}
  const sg=await tryq("signals",()=>A.sgAll());if(sg)o.signals={pos:sg.pos};
  const sb=await tryq("boty",()=>A.sgBotsAll());if(sb&&o.signals){o.signals.bots=sb.bots;o.signals.cfg=sb.cfg;o.signals.trades=sb.trades;}
  const tb=await tryq("terminal",()=>A.tbAll());if(tb&&tb.owner)o.terminal={plans:tb.plans,sales:tb.sales};
 }else o.errors.push("backend: brak polaczenia");
 const j=JSON.stringify(o,(_k,v)=>typeof v==="bigint"?v.toString():v,1);
 const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([j],{type:"application/json"}));a.download="budzet-backup-"+today()+".json";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
 done();if(o.errors.length)alert("Backup zapisany, ale bez czesci danych:\n"+o.errors.join("\n"));
}
function parse(t){let o;try{o=JSON.parse(t)}catch(e){throw new Error("To nie jest poprawny plik JSON")}
 if(!o||o.app!=="budzet-icp")throw new Error("To nie jest backup tej aplikacji");
 if(o.v!==2){o={ls:{"budzet-app-v3":o.budzet,"gielda-v2":o.gielda,"gielda-snaps":o.snaps,"krypto-v1":o.krypto,"krypto-snaps":o.ksnaps}};Object.keys(o.ls).forEach(k=>o.ls[k]==null&&delete o.ls[k]);}
 const L=o.ls||{},b=L["budzet-app-v3"],g=L["gielda-v2"],k=L["krypto-v1"];
 if(b&&!(Array.isArray(b.rows)&&Array.isArray(b.incomes)&&Array.isArray(b.expenses)))throw new Error("Uszkodzone dane budzetu");
 if(g&&!(Array.isArray(g.ps)&&g.ps.length))throw new Error("Uszkodzone dane gieldy");
 if(k&&!Array.isArray(k.ps))throw new Error("Uszkodzone dane krypto");
 return o;}
async function batches(rows,n,f){let s=0;for(let i=0;i<rows.length;i+=n){const r=await f(rows.slice(i,i+n));if("err" in r)throw new Error(r.err);s+=Number(r.ok)}return s;}
async function imp(file){
 let o;try{o=parse(await file.text())}catch(e){return alert(e.message)}
 const L=o.ls||{},st=o.staking,sg=o.signals,tb=o.terminal;
 const what=[L["budzet-app-v3"]&&"Budzet",L["gielda-v2"]&&"Gielda",L["krypto-v1"]&&"Krypto + Terminal",L["signals-v1"]&&"Signals (demo)",st&&"Staking",sg&&"Signals (pozycje)",tb&&"plany auto-sprzedazy"].filter(Boolean);
 if(!what.length)return alert("Plik nie zawiera danych.");
 if(!confirm("Przywrocic z backupu:\n• "+what.join("\n• ")+"\n\nBudzet/Gielda/Krypto zostana ZASTAPIONE (obecne zachowane w kopii w przegladarce). Staking i Signals sa dopisywane bez duplikatow. Boty nie sa przywracane, auto-sprzedaz wraca WYLACZONA."))return;
 const er=[];
 try{
  say("Zapisywanie danych przegladarki…");
  try{localStorage.setItem("gielda-backup",JSON.stringify({ts:Date.now(),old:lsObj()}))}catch(e){}
  Object.keys(L).forEach(k=>{if(LSK.includes(k))localStorage.setItem(k,JSON.stringify(L[k]))});
  Object.keys(o.prefs||{}).forEach(k=>{if(PREF.includes(k))try{localStorage.setItem(k,o.prefs[k])}catch(e){}});
  if(A&&st){say("Staking: neurony…");const cur=await A.stAll();
   for(const n of st.neurons||[]){const r=await A.stNeuronPut({id:B(n.id),name:n.name||"",start:B(n.start),dissolve:B(n.dissolve),initStake:B(n.initStake),stake:B(n.stake)});if("err" in r)er.push("Neuron "+n.id+": "+r.err);}
   say("Staking: nagrody…");await batches((st.rewards||[]).map(x=>({nid:B(x.nid),ts:B(x.ts),un:B(x.un),sm:B(x.sm),auto:!!x.auto,delta:B(x.delta),sd:B(x.sd),ev:x.ev||""})),1500,x=>A.stRewardsImport(x));
   say("Staking: WaterNeuron…");const pm=new Map();
   for(const p of st.wtnPos||[]){const ex=cur.wtnPos.find(x=>x.name===p.name);if(ex){pm.set(String(p.id),ex.id);continue}const r=await A.stWtnPosPut(0n,p.name,B(p.start));if("err" in r){er.push("WTN "+p.name+": "+r.err);continue}pm.set(String(p.id),r.ok);}
   await batches((st.wtn||[]).filter(x=>pm.has(String(x.pid))).map(x=>({pid:pm.get(String(x.pid)),date:B(x.date),nicp:+x.nicp,paid:+x.paid,red:+x.red})),1500,x=>A.stWtnPut(x));
   for(const c of st.wtnClose||[]){if(!pm.has(String(c.pid)))continue;const r=await A.stWtnClosePut({pid:pm.get(String(c.pid)),date:B(c.date),nicp:+c.nicp,icp:+c.icp,val:+c.val});if("err" in r)er.push("WTN zamkniecie: "+r.err);}
   say("Staking: NEAR/INJ…");await batches((st.ext||[]).map(x=>({chain:x.chain,day:x.day,staked:B(x.staked),pending:B(x.pending),reward:B(x.reward),usd:+x.usd||0,pln:+x.pln||0,at:B(x.at)})),1500,x=>A.stExtImport(x));}
  if(A&&sg&&sg.pos){say("Signals: pozycje…");const cur=(await A.sgAll()).pos,key=p=>[p.sym,p.opened,+p.entry,+p.qty].join("|");const have=new Set(cur.map(key));
   for(const p of sg.pos){if(have.has(key(p)))continue;const r=await A.sgPosPut({id:0n,sym:p.sym,status:p.status,opened:p.opened,entry:+p.entry,qty:+p.qty,stop:+p.stop,closed:p.closed||"",exit:+p.exit||0,note:p.note||"",evId:B(p.evId),at:B(p.at)});if("err" in r)er.push("Pozycja "+p.sym+": "+r.err);}}
  if(A&&tb&&tb.plans){say("Terminal: plany…");const cur=await A.tbAll();if(cur.owner)for(const p of tb.plans){if(cur.plans.some(x=>x.sym===p.sym))continue;const r=await A.tbPut({sym:p.sym,lv:p.lv.map(([a,b])=>[+a,+b]),tot:+p.tot||0,on:false,at:0n});if("err" in r)er.push("Plan "+p.sym+": "+r.err);}}
 }catch(e){er.push(e&&e.message||String(e))}
 say(er.length?"Przywrocono z bledami:\n"+er.join("\n"):"Przywrocono. Odswiezanie…");
 setTimeout(()=>location.reload(),er.length?4000:1500);
}
function pick(){const i=document.createElement("input");i.type="file";i.accept=".json,application/json";i.onchange=()=>i.files[0]&&imp(i.files[0]);i.click();}
window.BK={exp:()=>exp().catch(e=>{done();alert("Blad backupu: "+(e&&e.message||e))}),pick};
})();
