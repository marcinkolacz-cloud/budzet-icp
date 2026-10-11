import {AuthClient} from "@icp-sdk/auth/client";
import {HttpAgent,Actor} from "@icp-sdk/core/agent";
import {IDL} from "@icp-sdk/core/candid";
import {Principal} from "@icp-sdk/core/principal";

const CANISTER="tj3o4-rqaaa-aaaac-bgdmq-cai";
const SYNC=["gielda-v2","gielda-snaps","budzet-app-v3","krypto-v1","krypto-snaps","signals-v1"];           // synchronizowane z kontem (backend)
const MANAGED=new Set([...SYNC,"gielda-v1","gielda-backup","staking-sum","staking-cur"]);       // izolowane lokalnie per konto
const LS=localStorage,gi=Storage.prototype.getItem,si=Storage.prototype.setItem,ri=Storage.prototype.removeItem;
let NS="",actor=null,client=null,locked=false;
const revs={},timers={},chain={};

const idl=({IDL})=>{
 const Item=IDL.Record({key:IDL.Text,value:IDL.Text,rev:IDL.Nat});
 const Res=IDL.Variant({ok:IDL.Nat,err:IDL.Text});
 const RT=IDL.Variant({ok:IDL.Text,err:IDL.Text});
 const Access=IDL.Record({member:IDL.Bool,admin:IDL.Bool,principal:IDL.Principal});
 const Invite=IDL.Record({code:IDL.Text,note:IDL.Text,created:IDL.Int,expires:IDL.Int,usedBy:IDL.Opt(IDL.Principal),usedAt:IDL.Int});
 const MemberView=IDL.Record({p:IDL.Principal,note:IDL.Text,added:IDL.Int,admin:IDL.Bool,keys:IDL.Nat,bytes:IDL.Nat});
 return IDL.Service({kvGetAll:IDL.Func([],[IDL.Vec(Item)],["query"]),kvPut:IDL.Func([IDL.Text,IDL.Text,IDL.Nat],[Res],[]),
  myAccess:IDL.Func([],[Access],["query"]),redeemInvite:IDL.Func([IDL.Text],[RT],[]),
  createInvite:IDL.Func([IDL.Text,IDL.Nat],[RT],[]),listInvites:IDL.Func([],[IDL.Vec(Invite)],["query"]),deleteInvite:IDL.Func([IDL.Text],[RT],[]),
  listMembers:IDL.Func([],[IDL.Vec(MemberView)],["query"]),addMember:IDL.Func([IDL.Principal,IDL.Text],[RT],[]),removeMember:IDL.Func([IDL.Principal],[RT],[]),
  addAdmin:IDL.Func([IDL.Principal],[RT],[]),removeAdmin:IDL.Func([IDL.Principal],[RT],[])});
};

// --- izolacja localStorage per konto + zapis przez backend
const mk=(t,k)=>t===LS&&NS&&MANAGED.has(k)?NS+k:k;
Storage.prototype.getItem=function(k){return gi.call(this,mk(this,k));};
Storage.prototype.setItem=function(k,v){si.call(this,mk(this,k),v);if(this===LS&&NS&&SYNC.includes(k))schedule(k);};
Storage.prototype.removeItem=function(k){ri.call(this,mk(this,k));};

// --- UI
const css="position:fixed;top:8px;right:12px;z-index:9999;font:12px/1.4 'Segoe UI',sans-serif;background:var(--card,#fffdf9);border:1px solid var(--line,#e6e0d6);border-radius:999px;padding:5px 12px;display:flex;gap:10px;align-items:center;box-shadow:0 2px 10px #0001";
let chip,stEl;
function setSt(t,bad){if(stEl){stEl.textContent=t;stEl.style.color=bad?"var(--neg,#c23b3b)":"var(--muted,#7a736a)";}}
function overlay(html){
 const o=document.createElement("div");o.style.cssText="position:fixed;inset:0;z-index:10000;background:var(--bg,#f3f1ec);display:flex;align-items:center;justify-content:center;font-family:'Segoe UI',sans-serif";
 o.innerHTML='<div style="background:var(--card,#fffdf9);border:1px solid var(--line,#e6e0d6);border-radius:20px;padding:32px 36px;max-width:360px;text-align:center;box-shadow:0 12px 40px #0001">'+html+"</div>";
 document.body.append(o);return o;
}
function chipUi(pr,admin){
 chip=document.createElement("div");chip.style.cssText=css;
 const a=document.createElement("span");a.textContent=pr.slice(0,5)+"…"+pr.slice(-3);a.title=pr;
 if(admin){const ad=document.createElement("a");ad.href="admin.html";ad.textContent="Admin";ad.style.cssText="color:var(--ink,#1c1915);font-weight:600;text-decoration:none";chip.append(ad);}
 stEl=document.createElement("span");stEl.style.color="var(--muted,#7a736a)";stEl.textContent="zsynchronizowano";
 const b=document.createElement("button");b.textContent="Wyloguj";b.style.cssText="border:1px solid var(--line,#e6e0d6);background:var(--field2,#fff);border-radius:999px;padding:3px 10px;cursor:pointer;font:inherit";
 b.onclick=logout;chip.append(a,stEl,b);document.body.append(chip);
}

// --- synchronizacja
function schedule(k){if(locked)return;setSt("zapisywanie…");clearTimeout(timers[k]);timers[k]=setTimeout(()=>push(k),800);}
let inflight=0;
const synced={};
function toast(t){const d=document.createElement("div");d.textContent=t;d.style.cssText="position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:10002;background:var(--acc,#1c1915);color:var(--acc-ink,#fff);font:13px 'Segoe UI',sans-serif;padding:10px 16px;border-radius:999px;box-shadow:0 6px 24px #0003;max-width:90vw";document.body.append(d);setTimeout(()=>d.remove(),7000);}
function reloadWith(msg){try{sessionStorage.setItem("auth-notice",msg);}catch{}location.reload();}
function push(k){
 clearTimeout(timers[k]);delete timers[k];
 chain[k]=(chain[k]||Promise.resolve()).then(async()=>{
  if(locked)return;
  inflight++;
  try{
   const v=gi.call(LS,NS+k);if(v==null)return;
   if(v===synced[k]){if(!Object.keys(timers).length)setSt("zsynchronizowano");return;}
   const r=await actor.kvPut(k,v,BigInt(revs[k]||0));
   if("ok" in r){revs[k]=Number(r.ok);synced[k]=v;if(!Object.keys(timers).length)setSt("zsynchronizowano");}
   else if(r.err==="conflict")await resolveConflict(k,v);
   else setSt("blad zapisu: "+r.err,true);
  }catch(e){setSt("brak polaczenia - zmiany nie zapisane",true);}
  finally{inflight--;}
 });
 return chain[k];
}
// Konflikt rewizji: bez komunikatow blokujacych. Te same dane -> tylko synchronizuje numer;
// rozne -> wygrywa wersja z serwera (kopia lokalnej zostaje w conflict-backup), strona sama sie odswieza.
async function resolveConflict(k,v){
 const it=(await actor.kvGetAll()).find(x=>x.key===k);
 if(!it){revs[k]=0;delete synced[k];schedule(k);return;}
 if(it.value===v){revs[k]=Number(it.rev);synced[k]=v;if(!Object.keys(timers).length)setSt("zsynchronizowano");return;}
 try{si.call(LS,"conflict-backup:"+NS+k,JSON.stringify({ts:Date.now(),value:v}));}catch{}
 si.call(LS,NS+k,it.value);revs[k]=Number(it.rev);synced[k]=it.value;
 reloadWith("Dane zaktualizowane z innego urzadzenia lub karty. Ostatnia zmiana mogla nie zostac zapisana - wprowadz ja ponownie.");
}
const flush=()=>Promise.all(Object.keys(timers).map(push));
let lastPull=0;
async function pull(){
 if(!actor||locked||Date.now()-lastPull<4000||Object.keys(timers).length||inflight)return;
 lastPull=Date.now();
 try{
  const items=await actor.kvGetAll();
  if(Object.keys(timers).length||inflight)return;
  let changed=false;
  for(const it of items){
   if(!SYNC.includes(it.key)||Number(it.rev)<=(revs[it.key]||0))continue;
   const cur=gi.call(LS,NS+it.key);
   revs[it.key]=Number(it.rev);synced[it.key]=it.value;
   if(cur!==it.value){si.call(LS,NS+it.key,it.value);changed=true;}
  }
  if(changed)reloadWith("Dane odswiezone z innego urzadzenia.");
 }catch{}
}
addEventListener("visibilitychange",()=>{if(!actor)return;if(document.visibilityState==="hidden")flush();else pull();});
addEventListener("focus",pull);
addEventListener("pagehide",()=>{if(actor)flush();});
// przejscie miedzy stronami dopiero po zapisie (inaczej poprzednia strona konczy zapis po zaladowaniu nastepnej)
document.addEventListener("click",async e=>{
 const a=e.target.closest&&e.target.closest("a[href]");
 if(!a||!actor||a.target==="_blank"||e.button||e.ctrlKey||e.metaKey||e.shiftKey)return;
 if(!Object.keys(timers).length&&!inflight)return;
 e.preventDefault();const href=a.href;
 try{await flush();await Promise.all(Object.values(chain));}catch{}
 location.href=href;
},true);

async function logout(){
 try{await flush();await Promise.all(Object.values(chain));}catch{}
 if(locked&&!confirm("Zapis jest wstrzymany (konflikt) - niezapisane zmiany zostana utracone. Wylogowac?"))return;
 Object.keys(LS).filter(k=>k.startsWith(NS)).forEach(k=>ri.call(LS,k));
 try{await client.signOut();}catch{}
 location.reload();
}

async function login(){
 client=new AuthClient();
 if(client.isAuthenticated())return client.getIdentity();
 return new Promise(res=>{
  const o=overlay('<h2 style="margin:0 0 8px;letter-spacing:-.03em">Zaloguj sie</h2><p style="color:var(--muted,#7a736a);margin:0 0 20px">Internet Identity. Dane sa przypisane do Twojego konta i dostepne na kazdym urzadzeniu.</p><button id="li" style="border:0;background:var(--acc,#1c1915);color:var(--acc-ink,#fff);border-radius:999px;padding:10px 22px;cursor:pointer;font:inherit">Zaloguj przez Internet Identity</button><p id="le" style="color:var(--neg,#c23b3b);margin:12px 0 0;min-height:1em"></p>');
  const btn=o.querySelector("#li"),er=o.querySelector("#le");
  btn.onclick=async()=>{btn.disabled=true;er.textContent="";
   try{const id=await client.signIn();o.remove();res(id);}
   catch(e){er.textContent="Logowanie nie powiodlo sie: "+(e&&e.message||e);btn.disabled=false;}};
 });
}

// --- dostep: kod zaproszenia
const BTN="border:0;background:var(--acc,#1c1915);color:var(--acc-ink,#fff);border-radius:999px;padding:10px 22px;cursor:pointer;font:inherit";
async function access(pr){
 for(;;){
  let a;try{a=await actor.myAccess();}catch(e){await new Promise(r=>{const o=overlay('<h2 style="margin:0 0 8px">Brak polaczenia</h2><p style="color:var(--muted,#7a736a);margin:0 0 16px">Nie mozna sprawdzic dostepu.</p><button id="rt" style="'+BTN+'">Ponow</button>');o.querySelector("#rt").onclick=()=>{o.remove();r();};});continue;}
  if(a.member)return a;
  await new Promise(res=>{
   const o=overlay('<h2 style="margin:0 0 8px;letter-spacing:-.03em">Kod zaproszenia</h2><p style="color:var(--muted,#7a736a);margin:0 0 16px">To konto nie ma jeszcze dostepu. Wpisz kod otrzymany od administratora.</p>'+
    '<input id="ic" placeholder="XXXX-XXXX-XXXX" autocomplete="off" style="width:100%;box-sizing:border-box;border:1px solid var(--line,#e6e0d6);background:var(--field,#f7f4ee);border-radius:12px;padding:11px 12px;font:16px ui-monospace,monospace;text-align:center;letter-spacing:.08em;text-transform:uppercase;margin-bottom:12px">'+
    '<button id="ib" style="'+BTN+';width:100%">Aktywuj dostep</button><p id="ie" style="color:var(--neg,#c23b3b);margin:10px 0 0;min-height:1em;font-size:13px"></p>'+
    '<p style="color:var(--muted,#7a736a);font-size:11px;margin:14px 0 6px">Twoj identyfikator (dla administratora):</p><code id="ip" style="display:block;font-size:11px;word-break:break-all;background:var(--field,#f7f4ee);border-radius:8px;padding:8px;cursor:pointer" title="Kliknij, aby skopiowac"></code>'+
    '<button id="lo" style="margin-top:14px;border:1px solid var(--line,#e6e0d6);background:var(--field2,#fff);border-radius:999px;padding:6px 14px;cursor:pointer;font:inherit">Wyloguj</button>');
   const ic=o.querySelector("#ic"),ib=o.querySelector("#ib"),ie=o.querySelector("#ie"),ip=o.querySelector("#ip");
   ip.textContent=pr;ip.onclick=()=>{try{navigator.clipboard.writeText(pr);ie.style.color="var(--pos,#1a8a4a)";ie.textContent="Skopiowano";}catch{}};
   o.querySelector("#lo").onclick=async()=>{try{await client.signOut();}catch{}location.reload();};
   const go=async()=>{const c=ic.value.trim();if(!c){ie.textContent="Wpisz kod";return;}ib.disabled=true;ie.style.color="var(--neg,#c23b3b)";ie.textContent="Sprawdzanie…";
    try{const r=await actor.redeemInvite(c);if("ok" in r){o.remove();res();}else{ie.textContent=r.err;ib.disabled=false;}}catch(e){ie.textContent="Blad: "+(e&&e.message||e);ib.disabled=false;}};
   ib.onclick=go;ic.onkeydown=e=>{if(e.key==="Enter")go();};setTimeout(()=>ic.focus(),30);
  });
 }
}

async function loadRemote(){
 for(;;){
  try{
   const items=await actor.kvGetAll(),have=new Set();
   for(const it of items){si.call(LS,NS+it.key,it.value);revs[it.key]=Number(it.rev);synced[it.key]=it.value;have.add(it.key);}
   return have;
  }catch(e){
   await new Promise(r=>{const o=overlay('<h2 style="margin:0 0 8px">Brak polaczenia</h2><p style="color:var(--muted,#7a736a);margin:0 0 16px">Nie mozna wczytac danych konta.</p><button id="rt" style="border:0;background:var(--acc,#1c1915);color:var(--acc-ink,#fff);border-radius:999px;padding:10px 22px;cursor:pointer;font:inherit">Ponow</button>');o.querySelector("#rt").onclick=()=>{o.remove();r();};});
  }
 }
}

async function runAfterAuth(){
 const list=[...document.querySelectorAll('script[type="text/x-after-auth"]')];
 for(const s of list){
  const n=document.createElement("script");
  await new Promise((res,rej)=>{
   if(s.src){n.src=s.src;n.onload=res;n.onerror=()=>rej(new Error("Nie zaladowano "+s.src));}
   else{n.textContent=s.textContent;}
   document.body.append(n);if(!s.src)res();
  });
 }
}

async function start(){
 const identity=await login(),pr=identity.getPrincipal().toText();
 NS="u:"+pr+":";
 ri.call(LS,"staking-sum");ri.call(LS,"staking-cur"); // stare klucze bez przestrzeni konta
 const agent=await HttpAgent.create({identity,host:"https://icp-api.io"});
 actor=Actor.createActor(idl,{agent,canisterId:CANISTER});
 const acc=await access(pr);
 window.Auth.api=actor;window.Auth.mk=f=>Actor.createActor(f,{agent,canisterId:CANISTER});window.Auth.admin=!!acc.admin;window.Auth.principal=pr;
 const wait=overlay('<p style="margin:0;color:var(--muted,#7a736a)">Wczytywanie danych konta…</p>');
 const have=await loadRemote();
 // dane sprzed logowania trafiaja do pierwszego konta, ktore zaloguje sie w tej przegladarce
 const claim=gi.call(LS,"auth-legacy-claimed");
 if(!claim||claim===pr){
  for(const k of [...SYNC,"gielda-v1"]){const raw=gi.call(LS,k);if(raw&&!have.has(k)&&gi.call(LS,NS+k)==null){si.call(LS,NS+k,raw);if(SYNC.includes(k))schedule(k);}}
  if(!claim)si.call(LS,"auth-legacy-claimed",pr);
 }
 wait.remove();chipUi(pr,acc.admin);
 try{const n=sessionStorage.getItem("auth-notice");if(n){sessionStorage.removeItem("auth-notice");toast(n);}}catch{}
 await runAfterAuth();
}
window.Auth={start,api:null,admin:false,principal:"",Principal};
const go=()=>start().catch(e=>{document.body.append(Object.assign(document.createElement("pre"),{textContent:"Blad logowania: "+(e&&e.message||e),style:"position:fixed;top:40px;left:12px;color:var(--neg,#c23b3b);z-index:10001"}));});
document.readyState==="loading"?addEventListener("DOMContentLoaded",go):go();
