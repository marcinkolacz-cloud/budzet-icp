const ORIGINS = ["https://57a6w-kiaaa-aaaam-qjmvq-cai.icp0.io", "https://57a6w-kiaaa-aaaam-qjmvq-cai.ic0.app"];
let CORS = {};
const UA = { "User-Agent": "Mozilla/5.0 (gielda-quote)" };
const ok = t => /^[A-Z0-9.\-^=]{1,20}$/.test(t);

async function yahoo(sym) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`,
    { headers: UA, cf: { cacheTtl: 120, cacheEverything: true } });
  if (!r.ok) throw new Error("yahoo " + r.status);
  const m = (await r.json())?.chart?.result?.[0]?.meta;
  if (!m || !(m.regularMarketPrice > 0)) throw new Error("brak danych");
  return { c: m.regularMarketPrice, pc: m.chartPreviousClose || m.previousClose || m.regularMarketPrice,
    cur: m.currency || "USD", name: m.shortName || m.longName || sym };
}

const PREF = [".DE", ".AS", ".L", ".MI", ".PA", ".SW", ".WA", ".BR", ".MC", ".VI", ".ST", ".CO", ".HE", ".OL"];
async function resolve(t) {
  const base = t.split(".")[0], hits = (await search(base)).filter(x => x.s.split(".")[0] === base && x.s.includes("."));
  for (const p of PREF) { const h = hits.find(x => x.s.endsWith(p)); if (h) return h.s; }
  if (hits[0]) return hits[0].s;
  throw new Error("brak w Yahoo");
}

async function quote(t, fx) {
  let sym = t, q;
  try { q = await yahoo(t); } catch { sym = await resolve(t); q = await yahoo(sym); }
  let cur = q.cur, k = 1;
  if (cur === "GBp" || cur === "GBX") { cur = "GBP"; k = 0.01; }
  else if (cur === "ILA") { cur = "ILS"; k = 0.01; }
  if (cur !== "USD" && fx[cur] == null) fx[cur] = (await yahoo(cur + "USD=X")).c;
  const r = cur === "USD" ? 1 : fx[cur];
  return { sym, c: q.c * k, pc: q.pc * k, cur, name: q.name, usd: q.c * k * r, pcUsd: q.pc * k * r };
}

async function search(q) {
  const r = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`, { headers: UA });
  if (!r.ok) return [];
  return ((await r.json()).quotes || []).filter(x => x.symbol)
    .map(x => ({ s: x.symbol, name: x.shortname || x.longname || "", ex: x.exchDisp || x.exchange, type: x.quoteType }));
}

// ===== Trading Signals: reguła T_vt (EMA200 ±2%, reżim BTC, vol-target 60%) =====
const SG = ["BTC", "ETH", "NEAR", "ICP", "INJ"];
const KR = { BTC: "XBTUSD", ETH: "ETHUSD", NEAR: "NEARUSD", ICP: "ICPUSD", INJ: "INJUSD" };
const SRC = [
  ["binance", s => `https://data-api.binance.vision/api/v3/klines?symbol=${s}USDT&interval=1d&limit=1000`, j => j.map(x => [x[0], +x[4]])],
  ["gate", s => `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${s}_USDT&interval=1d&limit=1000`, j => j.map(x => [+x[0] * 1000, +x[2]])],
  ["kraken", s => `https://api.kraken.com/0/public/OHLC?pair=${KR[s]}&interval=1440`, j => {
    if (j.error && j.error.length) throw new Error(j.error[0]);
    return j.result[Object.keys(j.result).find(k => k !== "last")].map(x => [x[0] * 1000, +x[4]]);
  }]
];
const P6 = x => x == null ? null : Number(x.toPrecision(6));

async function klines(sym) {
  const errs = [], day0 = Math.floor(Date.now() / 864e5) * 864e5;
  for (const [n, url, parse] of SRC) {
    try {
      const r = await fetch(url(sym), { headers: UA, cf: { cacheTtl: 900, cacheEverything: true } });
      if (!r.ok) { errs.push(`${n} ${r.status}`); continue; }
      const a = parse(await r.json()).map(x => [Math.floor(x[0] / 864e5) * 864e5, x[1]]).filter(x => x[0] < day0 && x[1] > 0).sort((x, y) => x[0] - y[0]);
      if (a.length < 250) { errs.push(`${n} ${a.length}d`); continue; }
      return { src: n, a };
    } catch (e) { errs.push(`${n} ${e.message}`); }
  }
  throw new Error(`${sym}: ${errs.join("; ")}`);
}

function calc(c) {
  const n = c.length, a = 2 / 201, e = Array(n).fill(null), st = Array(n).fill(0), vs = Array(n).fill(0), er = Array(n).fill(null);
  let ema = null, cnt = 0, s = 0;
  for (let i = 0; i < n; i++) {
    if (c[i] == null) { ema = null; cnt = 0; s = 0; continue; }
    ema = ema == null ? c[i] : a * c[i] + (1 - a) * ema; cnt++;
    if (cnt >= 200) { e[i] = ema; if (s === 0 && c[i] > ema * 1.02) s = 1; else if (s === 1 && c[i] < ema * 0.98) s = 0; }
    st[i] = s;
    if (i >= 30 && c[i - 30] != null) {
      const lr = []; let path = 0;
      for (let k = i - 29; k <= i; k++) { lr.push(Math.log(c[k] / c[k - 1])); path += Math.abs(c[k] - c[k - 1]); }
      const m = lr.reduce((x, y) => x + y, 0) / 30, sd = Math.sqrt(lr.reduce((x, y) => x + (y - m) ** 2, 0) / 29) * Math.sqrt(365);
      vs[i] = sd > 0 ? Math.round(Math.min(1, 0.6 / sd) * 10) / 10 : 1;
      er[i] = path > 0 ? Math.abs(c[i] - c[i - 30]) / path : 0;
    }
  }
  return { c, e, st, vs, er };
}

async function series() {
  const res = await Promise.all(SG.map(klines)), raw = res.map(x => x.a), mp = raw.map(a => new Map(a)), days = raw[0].map(x => x[0]);
  const out = { t: days.map(d => new Date(d).toISOString().slice(0, 10)), src: Object.fromEntries(SG.map((s, i) => [s, res[i].src])) };
  SG.forEach((s, i) => { out[s] = calc(days.map(d => mp[i].get(d) ?? null)); });
  const btc = out.BTC.st;
  SG.forEach(s => {
    const o = out[s]; o.on = o.st.map((v, i) => v && btc[i] && o.e[i] != null ? 1 : 0); o.w = o.on.map((v, i) => v ? o.vs[i] : 0);
    o.e = o.e.map(P6); o.er = o.er.map(x => x == null ? null : Math.round(x * 1000) / 1000); delete o.st; delete o.vs;
  });
  return out;
}

async function sendMail(env, txt) {
  const i = txt.indexOf("\n"), subject = (i < 0 ? txt : txt.slice(0, i)).slice(0, 150), text = i < 0 ? "" : txt.slice(i + 1, 4000);
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${env.RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM || "Trading Signals <onboarding@resend.dev>", to: [env.MAIL_TO], subject, text })
  });
  return r.ok ? "OK" : "ERR " + r.status;
}


// ===== Etap 2: prawdziwe zlecenia OKX EEA (spot, MARKET, pary *-USDC). Klucze tylko w sekretach workera. =====
// sekrety: OKX_KEY, OKX_SECRET, OKX_PASS; zmienne: LIVE=1 (wylacznik), MAX_ORDER_USD, MAX_DAY_USD, QUOTE (domyslnie USDC)
const OKB = "https://eea.okx.com", TRAD = ["ETH", "NEAR", "ICP", "INJ"];
const b64e = b => btoa(String.fromCharCode(...new Uint8Array(b)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const QT = env => env.QUOTE || "USDC", iid = (s, q) => `${s}-${q}`;
const hasK = env => env.OKX_KEY && env.OKX_SECRET && env.OKX_PASS;
async function okx(env, method, path, q = null, body = null) {
  const rp = path + (q ? "?" + new URLSearchParams(q) : ""), bs = body ? JSON.stringify(body) : "", ts = new Date().toISOString();
  const h = { "Content-Type": "application/json", ...UA };
  if (env) {
    const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.OKX_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    Object.assign(h, { "OK-ACCESS-KEY": env.OKX_KEY, "OK-ACCESS-PASSPHRASE": env.OKX_PASS, "OK-ACCESS-TIMESTAMP": ts,
      "OK-ACCESS-SIGN": b64e(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(ts + method + rp + bs))) });
  }
  const r = await fetch(OKB + rp, { method, headers: h, body: bs || undefined }), j = await r.json().catch(() => ({ code: "HTTP" + r.status }));
  if (j.code !== "0") throw new Error("okx " + j.code + " " + (j.data?.[0]?.sMsg || j.msg || ""));
  return j.data;
}
const dec = x => (String(x).split(".")[1] || "").replace(/0+$/, "").length;
async function pairInfo(sym, q) {
  const d = await okx(null, "GET", "/api/v5/public/instruments", { instType: "SPOT", instId: iid(sym, q) }).catch(() => []), p = d[0];
  if (!p || p.state !== "live") throw new Error(`brak pary ${sym}-${q}`);
  return { id: p.instId, lot: dec(p.lotSz), lsz: +p.lotSz, omin: +p.minSz };
}
async function balances(env) {
  const d = await okx(env, "GET", "/api/v5/account/balance", { ccy: [QT(env), ...TRAD].join(",") }), m = {};
  for (const a of [QT(env), ...TRAD]) m[a] = 0;
  for (const x of d[0]?.details || []) if (x.ccy in m) m[x.ccy] = +x.availBal || 0;
  return m;
}
// clOrdId (alfanum. <=32) z identyfikatora zlecenia canistra -> idempotencja
async function clid(cid) { const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cid))); return "c" + [...h].map(x => x.toString(16).padStart(2, "0")).join("").slice(0, 31); }
async function findOrd(env, inst, cl) {
  try { return (await okx(env, "GET", "/api/v5/trade/order", { instId: inst, clOrdId: cl }))[0] || null; }
  catch (e) { if (/51603/.test(e.message)) return null; throw e; }
}
function ordLine(cid, o, sym) {
  if (o.state === "live" || o.state === "partially_filled") return `WAIT|${cid}|${o.state}`;
  const q = +o.accFillSz, px = +o.avgPx || 0, fee = Math.abs(+o.fee || 0) * (o.feeCcy === sym ? px : 1);
  if (!(q > 0)) return `OK|${cid}|${o.state.toUpperCase()}|0|0|0|${o.ordId}`;
  return ["OK", cid, "FILLED", P6(q), P6(q * px), P6(fee), o.ordId].join("|");
}
async function placeOrder(env, body) {
  const [cid, sym, side, amt] = body.trim().split("|");
  if (env.LIVE !== "1") return "ERR live wylaczony";
  if (!hasK(env)) return "ERR brak kluczy";
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(cid || "") || !TRAD.includes(sym) || !["BUY", "SELL"].includes(side) || !(+amt > 0)) return "ERR zle dane";
  const pi = await pairInfo(sym, QT(env)), cl = await clid(cid);
  let o = await findOrd(env, pi.id, cl);
  if (o) return ordLine(cid, o, sym);
  const t = (await okx(null, "GET", "/api/v5/market/ticker", { instId: pi.id }))[0], ask = +t.askPx, bid = +t.bidPx;
  const maxO = +(env.MAX_ORDER_USD || 50), maxD = +(env.MAX_DAY_USD || 200), bal = await balances(env);
  let ord;
  if (side === "BUY") {
    const usd = Math.floor(+amt * 100) / 100;
    if (usd > maxO) return `ERR limit zlecenia ${maxO} USD`;
    const d0 = Math.floor(Date.now() / 864e5) * 864e5;
    const h = await okx(env, "GET", "/api/v5/trade/orders-history", { instType: "SPOT", begin: String(d0), limit: "100" });
    let day = 0; for (const x of h) if (x.side === "buy" && +x.cTime >= d0) day += +x.accFillSz * (+x.avgPx || 0);
    if (day + usd > maxD) return `ERR limit dzienny ${maxD} USD (dzis ${day.toFixed(2)})`;
    if (bal[QT(env)] < usd * 1.005) return `ERR brak ${QT(env)} (${bal[QT(env)].toFixed(2)})`;
    if (usd / ask < pi.omin) return `SKIP|${cid}|ponizej minimum (${pi.omin} ${sym})`;
    ord = { sz: usd.toFixed(2), tgtCcy: "quote_ccy" };
  } else {
    const vol = Math.floor(Math.min(+amt, bal[sym]) / pi.lsz) * pi.lsz;
    if (!(vol > 0)) return `SKIP|${cid}|brak ${sym} na gieldzie`;
    if (vol < pi.omin) return `SKIP|${cid}|ponizej minimum (${pi.omin} ${sym})`;
    if (vol * bid > maxO * 4) return `ERR sprzedaz > ${maxO * 4} USD`;
    ord = { sz: vol.toFixed(pi.lot), tgtCcy: "base_ccy" };
  }
  await okx(env, "POST", "/api/v5/trade/order", null, { instId: pi.id, tdMode: "cash", side: side.toLowerCase(), ordType: "market", clOrdId: cl, ...ord });
  for (let i = 0; i < 4; i++) { await sleep(1500); o = await findOrd(env, pi.id, cl); if (o && o.state === "filled") break; }
  return o ? ordLine(cid, o, sym) : `WAIT|${cid}|wyslane`;
}

async function canister(req, env, u) {
  const T = (t, s = 200) => new Response(t, { status: s, headers: { "Content-Type": "text/plain" } });
  if (u.pathname === "/sig") {
    const S = await series(), L = S.t.length - 1;
    return T(["D|" + S.t[L], ...SG.filter(s => s !== "BTC").map(s => [s, S[s].on[L], S[s].w[L], P6(S[s].c[L]), S[s].e[L] ?? 0, S[s].er[L] ?? 0].join("|"))].join("\n"));
  }
  if (u.pathname === "/notify" && req.method === "POST") {
    if (!env.RESEND_KEY || !env.MAIL_TO) return T("ERR config", 500);
    return T(await sendMail(env, (await req.text()).slice(0, 5000)));
  }
  if (u.pathname === "/ord" && req.method === "POST") { try { return T(await placeOrder(env, (await req.text()).slice(0, 200))); } catch (e) { return T("ERR " + e.message); } }
  if (u.pathname === "/bal") {
    if (!hasK(env)) return T("ERR brak kluczy");
    const m = await balances(env);
    return T(["L|" + (env.LIVE === "1" ? 1 : 0) + "|" + (env.MAX_ORDER_USD || 50) + "|" + (env.MAX_DAY_USD || 200) + "|" + (req.cf?.colo || ""),
      QT(env) + "|" + P6(m[QT(env)] || 0),
      ...(await Promise.all(TRAD.map(async a => a + "|" + P6(m[a] || 0) + " (para " + iid(a, QT(env)) + ": " + await pairInfo(a, QT(env)).then(() => "OK", () => "BRAK") + ")")))].join("\n"));
  }
  return T("not found", 404);
}

export default {
  // codzienne zapytanie o saldo: klucz OKX bez IP nie wygasa (nieaktywnosc 14 dni)
  async scheduled(ev, env, ctx) { if (hasK(env)) ctx.waitUntil(balances(env).catch(() => 0)); },
  async fetch(req, env) {
    const sk = req.headers.get("x-sig-key");
    if (sk) {
      if (!env.SIG_KEY || sk !== env.SIG_KEY) return new Response("Forbidden", { status: 403 });
      try { return await canister(req, env, new URL(req.url)); } catch (e) { return new Response("ERR " + e.message, { status: 502 }); }
    }
    const origin = req.headers.get("Origin") || "";
    if (!ORIGINS.includes(origin)) return new Response("Forbidden", { status: 403 });
    CORS = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET,OPTIONS", "Vary": "Origin" };
    if (req.method !== "GET" && req.method !== "OPTIONS") return new Response("Method not allowed", { status: 405, headers: CORS });
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const u = new URL(req.url), J = (o, s = 200) => new Response(JSON.stringify(o),
      { status: s, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "max-age=60" } });
    if (u.pathname === "/q") {
      const syms = (u.searchParams.get("s") || "").toUpperCase().split(",").map(x => x.trim()).filter(ok).slice(0, 20);
      if (!syms.length) return J({ err: "s=?" }, 400);
      const fx = {}, out = {};
      for (const t of syms) { try { out[t] = await quote(t, fx); } catch (e) { out[t] = { err: e.message }; } }
      return J(out);
    }
    if (u.pathname === "/k") {
      try {
        return new Response(JSON.stringify(await series()), { headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "max-age=900" } });
      } catch (e) { return J({ err: e.message }, 502); }
    }
    if (u.pathname === "/search") {
      const q = (u.searchParams.get("q") || "").slice(0, 60);
      return J(q ? await search(q) : []);
    }
    return J({ ok: true, use: "/q?s=VWCE.DE,CDR.WA | /search?q=vanguard" });
  }
};
