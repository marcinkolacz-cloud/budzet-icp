window.IO=(function(){
const LS=localStorage,TODAY=()=>new Date().toLocaleDateString("sv");
const jp=k=>{try{return JSON.parse(LS.getItem(k)||"null")}catch{return null}};
const num=v=>{const n=Number(String(v??"").replace(/[\s ]/g,"").replace(",","."));return Number.isFinite(n)?n:0};
const r2=n=>Math.round((n||0)*100)/100;
// ---------- minimalny zapis .xlsx (zip bez kompresji)
const enc=new TextEncoder();
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
const crc32=b=>{let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;};
const u16=v=>[v&255,(v>>>8)&255],u32=v=>[v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255];
function zip(files){
 const parts=[],cen=[];let off=0;
 files.forEach(([name,data])=>{
  const nb=enc.encode(name),db=enc.encode(data),crc=crc32(db);
  const lh=new Uint8Array([0x50,0x4b,3,4,...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(db.length),...u32(db.length),...u16(nb.length),...u16(0)]);
  parts.push(lh,nb,db);
  cen.push([new Uint8Array([0x50,0x4b,1,2,...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(db.length),...u32(db.length),...u16(nb.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(off)]),nb]);
  off+=lh.length+nb.length+db.length;
 });
 let cs=0;cen.forEach(([h,n])=>{parts.push(h,n);cs+=h.length+n.length;});
 parts.push(new Uint8Array([0x50,0x4b,5,6,0,0,0,0,...u16(files.length),...u16(files.length),...u32(cs),...u32(off),0,0]));
 return new Blob(parts,{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}
const esc=s=>String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const col=i=>{let s="";for(i++;i>0;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;};
const NS='xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',HDR='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
function sheetXml(rows){
 const n=Math.max(1,...rows.map(r=>r.length)),w=[];
 for(let c=0;c<n;c++){let m=8;rows.forEach(r=>{const v=r[c];if(v!=null&&v!==""){const l=typeof v==="number"?String(v.toFixed?v.toFixed(2):v).length+2:String(v).length+2;if(l>m)m=l;}});w.push(Math.min(m,42));}
 let x=HDR+'<worksheet '+NS+'><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>'+w.map((v,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+v+'" customWidth="1"/>').join("")+'</cols><sheetData>';
 rows.forEach((r,ri)=>{
  const bold=ri===0||r.b;x+='<row r="'+(ri+1)+'">';
  r.forEach((v,ci)=>{
   if(v===""||v==null)return;const ref=col(ci)+(ri+1);
   if(typeof v==="number"&&Number.isFinite(v))x+='<c r="'+ref+'" s="'+(bold?3:2)+'"><v>'+v+'</v></c>';
   else x+='<c r="'+ref+'" t="inlineStr" s="'+(bold?1:0)+'"><is><t xml:space="preserve">'+esc(v)+'</t></is></c>';
  });
  x+='</row>';
 });
 return x+'</sheetData></worksheet>';
}
function workbook(sheets){
 const names=[];
 sheets.forEach(s=>{let b=String(s.name).replace(/[\[\]:*?\/\\]/g," ").trim().slice(0,31)||"Arkusz",n=b,i=2;while(names.includes(n.toLowerCase()))n=b.slice(0,28)+" "+i++;names.push(n.toLowerCase());s.n=n;});
 const f=[];
 f.push(["[Content_Types].xml",HDR+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((s,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("")+'</Types>']);
 f.push(["_rels/.rels",HDR+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>']);
 f.push(["xl/workbook.xml",HDR+'<workbook '+NS+' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map((s,i)=>'<sheet name="'+esc(s.n)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join("")+'</sheets></workbook>']);
 f.push(["xl/_rels/workbook.xml.rels",HDR+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((s,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join("")+'<Relationship Id="rId'+(sheets.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>']);
 f.push(["xl/styles.xml",HDR+'<styleSheet '+NS+'><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>']);
 sheets.forEach((s,i)=>f.push(["xl/worksheets/sheet"+(i+1)+".xml",sheetXml(s.rows)]));
 return zip(f);
}
// ---------- arkusze: budzet
const dmy=iso=>String(iso).split("-").reverse().join("-");
function budzetSheets(){
 const s=jp("budzet-app-v3");if(!s||!Array.isArray(s.rows)||!s.rows.length)return [];
 const del=(r,k)=>r.del&&r.del[k],val=(r,k)=>del(r,k)||r[k]==null||r[k]===""?"":r2(num(r[k]));
 const rows=[["Miesiac",...s.incomes,"Przychody razem",...s.expenses,"Koszty razem","Zostaje"]];
 s.rows.forEach(r=>{const a=s.incomes.map(k=>val(r,k)),b=s.expenses.map(k=>val(r,k)),si=r2(a.reduce((x,y)=>x+(y||0),0)),so=r2(b.reduce((x,y)=>x+(y||0),0));rows.push([r.data||"",...a,si,...b,so,r2(si-so)]);});
 const tot=["Razem"],n=rows[0].length;for(let c=1;c<n;c++)tot.push(r2(rows.slice(1).reduce((a,r)=>a+(typeof r[c]==="number"?r[c]:0),0)));tot.b=true;rows.push(tot);
 const out=[{name:"Budzet",rows}];
 const cr=Array.isArray(s.credits)?s.credits:[];
 if(cr.length){
  const sm=[["Kredyt","Nr umowy","Kwota kredytu","Oprocentowanie","Okres","Harmonogram z dnia","Liczba rat","Suma odsetek"]];
  cr.forEach(c=>sm.push([c.name,c.meta.umowa||"",c.meta.kwota||"",c.meta.oproc||"",c.meta.okres||"",c.meta.data||"",c.schedule.length,r2(c.schedule.reduce((a,x)=>a+x.ods,0))]));
  out.push({name:"Kredyty",rows:sm});
  cr.forEach(c=>{const rr=[["Nr","Termin","Kapital","Odsetki","Rata","Saldo po racie"]];c.schedule.forEach(x=>rr.push([x.nr,dmy(x.date),x.kap,x.ods,x.rata,x.saldo]));
   const t=["Suma","",r2(c.schedule.reduce((a,x)=>a+x.kap,0)),r2(c.schedule.reduce((a,x)=>a+x.ods,0)),r2(c.schedule.reduce((a,x)=>a+x.rata,0)),""];t.b=true;rr.push(t);out.push({name:c.name,rows:rr});});
 }
 return out;
}
// ---------- arkusze: gielda (wymaga gcore.js -> window.G)
function gieldaSheets(){
 let GX=null;try{GX=G}catch{}
 if(!GX||!GX.S||!GX.S.ps||!GX.S.ps.length)return [];
 const ps=GX.S.ps,sum=[["Portfel","Wplaty netto PLN","Wplaty netto EUR","Wplaty netto USD","Wartosc pozycji USD","Gotowka PLN","Gotowka EUR","Gotowka USD","Wolna gotowka (rown. USD)","Wartosc portfela USD","Wynik z aktywow USD","Wynik z aktywow %","Wynik calkowity PLN","Wynik calkowity %"]];
 const line=(name,q)=>[name,r2(q.dPln),r2(q.dEur),r2(q.dUsd),r2(q.mv),r2(q.w.PLN),r2(q.w.EUR),r2(q.w.USD),r2(q.cash),r2(q.vUsd),r2(q.profUsd),r2(q.profPct),r2(q.totPln),r2(q.totPct)];
 ps.forEach(p=>sum.push(line(p.name,GX.summary([p]))));
 const all=line("Razem (suma portfeli)",GX.summary(ps));all.b=true;sum.push(all);
 const pos=[["Portfel","Ticker","Stan","Ilosc","Sr. cena USD","Cena USD","Wartosc USD","Zysk niezreal. USD","Zysk zreal. USD"]];
 ps.forEach(p=>GX.summary([p]).rows.forEach(x=>pos.push([p.name,x.t,x.open?"otwarta":"zamknieta",x.open?+x.q.toFixed(6):0,x.open?r2(x.avg):"",x.open?r2(x.p):"",x.open?r2(x.mv):"",x.open?r2(x.unreal):"",r2(x.realized)])));
 const tr=[["Data","Portfel","Ticker","Operacja","Ilosc","Cena USD","Prowizja USD","Wartosc USD"]];
 ps.flatMap(p=>p.trades.map(t=>({t,p}))).sort((a,b)=>a.t.d<b.t.d?-1:a.t.d>b.t.d?1:0).forEach(({t,p})=>tr.push([t.d,p.name,t.t,t.s>0?"Kupno":"Sprzedaz",+t.q.toFixed(6),r2(t.p),r2(t.f||0),r2(t.q*t.p)]));
 const dp=[["Data","Portfel","Operacja","Waluta","Kwota","= PLN","= EUR","= USD"]];
 ps.flatMap(p=>p.tx.map(x=>({x,p}))).sort((a,b)=>a.x.d<b.x.d?-1:a.x.d>b.x.d?1:0).forEach(({x,p})=>dp.push([x.d,p.name,x.s>0?"Wplata":"Wyplata",x.c||"PLN",r2(x.s*(x.a!=null?x.a:x.pln)),r2(x.s*x.pln),r2(x.s*x.eur),r2(x.s*x.usd)]));
 const fx=[["Data","Portfel","Z waluty","Kwota","Na walute","Kwota","Kurs (na/z)"]];
 ps.flatMap(p=>(p.fx||[]).map(x=>({x,p}))).sort((a,b)=>a.x.d<b.x.d?-1:a.x.d>b.x.d?1:0).forEach(({x,p})=>fx.push([x.d,p.name,x.f,r2(x.af),x.t,r2(x.at),x.af?Math.round(x.at/x.af*1e6)/1e6:""]));
 return [{name:"Gielda - podsumowanie",rows:sum},{name:"Pozycje",rows:pos},{name:"Transakcje",rows:tr},{name:"Wplaty i wyplaty",rows:dp},{name:"Wymiany walut",rows:fx}];
}
function build(which){
 const sh=which==="budzet"?budzetSheets():which==="gielda"?gieldaSheets():[...budzetSheets(),...gieldaSheets()];
 return sh.length?workbook(sh):null;
}
function download(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);}
function excel(which){
 const b=build(which);if(!b)return alert("Brak danych do eksportu.");
 download(b,(which==="all"?"budzet-gielda":which)+"-"+TODAY()+".xlsx");
}
// ---------- kopia zapasowa JSON (budzet + gielda)
function backupObj(){return {app:"budzet-icp",v:1,exported:new Date().toISOString(),budzet:jp("budzet-app-v3"),gielda:jp("gielda-v2"),snaps:jp("gielda-snaps")};}
function backup(){
 const o=backupObj();if(!o.budzet&&!o.gielda)return alert("Brak danych do zapisania.");
 download(new Blob([JSON.stringify(o,null,1)],{type:"application/json"}),"budzet-kopia-"+TODAY()+".json");
}
const isStr=a=>Array.isArray(a)&&a.every(x=>typeof x==="string");
function validBudzet(b){return b&&typeof b==="object"&&Array.isArray(b.rows)&&b.rows.every(r=>r&&typeof r==="object")&&isStr(b.incomes)&&isStr(b.expenses)&&(b.credits==null||Array.isArray(b.credits));}
function validGielda(g){return g&&typeof g==="object"&&Array.isArray(g.ps)&&g.ps.length>0&&g.ps.every(p=>p&&p.id!=null&&typeof p.name==="string"&&Array.isArray(p.tx)&&Array.isArray(p.trades));}
function parseBackup(text){
 let o;try{o=JSON.parse(text);}catch{throw new Error("To nie jest poprawny plik JSON");}
 if(o&&o.app==="budzet-icp")o={budzet:o.budzet,gielda:o.gielda,snaps:o.snaps};
 else if(o&&o.S)o={budzet:null,gielda:o.S,snaps:o.snaps};   // stary eksport samej gieldy
 else throw new Error("To nie jest kopia zapasowa tej aplikacji");
 if(o.budzet&&!validBudzet(o.budzet))throw new Error("Uszkodzone dane budzetu w pliku");
 if(o.gielda&&!validGielda(o.gielda))throw new Error("Uszkodzone dane gieldy w pliku");
 if(o.snaps&&typeof o.snaps!=="object")throw new Error("Uszkodzone dane historii wartosci");
 if(!o.budzet&&!o.gielda)throw new Error("Plik nie zawiera danych budzetu ani gieldy");
 return o;
}
async function restore(file){
 if(!file)return;
 let o;try{o=parseBackup(await file.text());}catch(e){return alert(e.message);}
 const what=[o.budzet?"Budzet ("+o.budzet.rows.length+" mies.)":null,o.gielda?"Gielda ("+o.gielda.ps.length+" portf.)":null].filter(Boolean).join(" i ");
 if(!confirm("Zastapic obecne dane: "+what+" danymi z pliku?\nObecne dane zostana zachowane w kopii w przegladarce."))return;
 try{LS.setItem("gielda-backup",JSON.stringify({ts:Date.now(),old:backupObj()}));}catch{}
 if(o.budzet)LS.setItem("budzet-app-v3",JSON.stringify(o.budzet));
 if(o.gielda)LS.setItem("gielda-v2",JSON.stringify(o.gielda));
 if(o.snaps)LS.setItem("gielda-snaps",JSON.stringify(o.snaps));
 document.body.insertAdjacentHTML("beforeend",'<div style="position:fixed;inset:0;z-index:10001;background:#f3f1ec;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,sans-serif;color:#7a736a">Zapisywanie przywroconych danych…</div>');
 setTimeout(()=>location.reload(),1500);
}
function pick(){const i=document.createElement("input");i.type="file";i.accept=".json,application/json";i.onchange=()=>restore(i.files[0]);i.click();}
return {excel,backup,restore,pick,_build:build,_parse:parseBackup};
})();
