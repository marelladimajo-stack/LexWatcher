// LexWatcher live feed — the latest legislative activity from official sources,
// whether or not LexWatcher already has a written explainer for it.
// Served at /api/feed and cached by Netlify's CDN for 3 hours.

const T = 7000;
const UA = { "User-Agent": "LexWatcher (educational legislation tracker)", Accept: "application/json" };
async function getJSON(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(T) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
const clip = (s, n) => (s && s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s || "");

// UK: bills most recently updated in Parliament
async function ukBills() {
  const d = await getJSON("https://bills-api.parliament.uk/api/v1/Bills?CurrentHouse=All&IsDefeated=false&IsWithdrawn=false&SortOrder=DateUpdatedDescending&Take=20");
  const today = new Date().toISOString().slice(0, 10);
  return (d.items || []).map(b => {
    const st = b.currentStage || {};
    const next = (st.stageSittings || []).map(s => (s.date || "").slice(0, 10)).filter(x => x >= today).sort()[0] || null;
    return {
      title: b.shortTitle, kind: b.billTypeId === 1 ? "Government bill" : "Other bill",
      stage: st.description ? `${st.description}, ${st.house || b.currentHouse}` : (b.isAct ? "Act of Parliament" : b.currentHouse),
      isAct: !!b.isAct, date: (b.lastUpdate || "").slice(0, 10), next,
      url: `https://bills.parliament.uk/bills/${b.billId}`
    };
  });
}

// US: significant final and proposed federal rules (Federal Register, no key needed)
async function usRules() {
  const base = "https://www.federalregister.gov/api/v1/documents.json?per_page=15&order=newest&conditions%5Bsignificant%5D=1";
  const d = await getJSON(`${base}&conditions%5Btype%5D%5B%5D=RULE&conditions%5Btype%5D%5B%5D=PRORULE`);
  return (d.results || []).map(x => ({
    title: x.title, kind: x.type === "Rule" ? "Final rule" : "Proposed rule",
    agency: (x.agencies || []).filter(a => !a.parent_id).map(a => a.name).join(", ") || (x.agencies || []).map(a => a.name)[0] || "",
    summary: clip(x.abstract, 260), date: x.publication_date, url: x.html_url
  }));
}

// US: laws recently enacted by Congress (needs CONGRESS_API_KEY)
async function usLaws(key, congress) {
  const d = await getJSON(`https://api.congress.gov/v3/law/${congress}?format=json&limit=40&api_key=${key}`);
  const congressPath = `${congress}th-congress`;
  const path = { HR: "house-bill", S: "senate-bill", HJRES: "house-joint-resolution", SJRES: "senate-joint-resolution" };
  return (d.bills || []).map(b => ({
    title: b.title, kind: (b.laws || []).map(l => `${l.type} ${l.number}`).join(", ") || "Enacted",
    date: b.latestAction ? b.latestAction.actionDate : null,
    url: `https://www.congress.gov/bill/${congressPath}/${path[b.type] || String(b.type).toLowerCase()}/${b.number}`
  })).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 15);
}

export default async () => {
  const key = process.env.CONGRESS_API_KEY;
  const congress = 119 + Math.floor((new Date().getUTCFullYear() - 2025) / 2);
  const [uk, rules, laws] = await Promise.allSettled([ukBills(), usRules(), key ? usLaws(key, congress) : Promise.resolve(null)]);
  const out = {
    fetchedAt: new Date().toISOString(),
    ukBills: uk.status === "fulfilled" ? uk.value : null,
    usRules: rules.status === "fulfilled" ? rules.value : null,
    usLaws: laws.status === "fulfilled" ? laws.value : null,
    notes: []
  };
  if (!key) out.notes.push("Add a free Congress.gov API key (CONGRESS_API_KEY) to show newly enacted US laws.");
  return new Response(JSON.stringify(out), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=600",
      "netlify-cdn-cache-control": "public, s-maxage=10800, stale-while-revalidate=86400"
    }
  });
};

export const config = { path: "/api/feed" };
