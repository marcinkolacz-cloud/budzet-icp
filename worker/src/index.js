const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,OPTIONS" };
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

async function quote(t, fx) {
  const q = await yahoo(t);
  let cur = q.cur, k = 1;
  if (cur === "GBp" || cur === "GBX") { cur = "GBP"; k = 0.01; }
  else if (cur === "ILA") { cur = "ILS"; k = 0.01; }
  if (cur !== "USD" && fx[cur] == null) fx[cur] = (await yahoo(cur + "USD=X")).c;
  const r = cur === "USD" ? 1 : fx[cur];
  return { c: q.c * k, pc: q.pc * k, cur, name: q.name, usd: q.c * k * r, pcUsd: q.pc * k * r };
}

async function search(q) {
  const r = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`, { headers: UA });
  if (!r.ok) return [];
  return ((await r.json()).quotes || []).filter(x => x.symbol)
    .map(x => ({ s: x.symbol, name: x.shortname || x.longname || "", ex: x.exchDisp || x.exchange, type: x.quoteType }));
}

export default {
  async fetch(req) {
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
    if (u.pathname === "/search") {
      const q = (u.searchParams.get("q") || "").slice(0, 60);
      return J(q ? await search(q) : []);
    }
    return J({ ok: true, use: "/q?s=VWCE.DE,CDR.WA | /search?q=vanguard" });
  }
};
