// LexWatcher live data — fetches the current status of tracked files from official sources.
// Called by the app as /api/live?uk=4083,4254&ukt=Title%20One|Title%20Two&us=119/hr/3633&eu=2025-0359
// Netlify's CDN caches the answer for 6 hours, so the official APIs are called at most a few times a day.

const T = 7000; // per-request timeout (ms)
const UA = { "User-Agent": "LexWatcher (educational legislation tracker)", Accept: "application/json" };
const today = () => new Date().toISOString().slice(0, 10);

async function getJSON(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(T) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ---------- UK Parliament Bills API (no key needed) ----------
async function ukById(id) {
  const b = await getJSON(`https://bills-api.parliament.uk/api/v1/Bills/${id}`);
  const st = b.currentStage || {};
  const next = (st.stageSittings || []).map(s => (s.date || "").slice(0, 10)).filter(d => d >= today()).sort()[0] || null;
  const last = (st.stageSittings || []).map(s => (s.date || "").slice(0, 10)).filter(d => d && d < today()).sort().pop() || null;
  return {
    id: b.billId, title: b.shortTitle,
    stage: st.description || null, house: st.house || b.currentHouse || null,
    isAct: !!b.isAct, defeated: !!b.isDefeated, withdrawn: !!b.billWithdrawn,
    next, last, updated: (b.lastUpdate || "").slice(0, 10),
    sponsors: (b.sponsors || []).map(s => s.member ? `${s.member.name} (${s.member.party})` : (s.organisation && s.organisation.name)).filter(Boolean),
    url: `https://bills.parliament.uk/bills/${b.billId}`
  };
}
async function ukByTitle(title) {
  const q = encodeURIComponent(title);
  const res = await getJSON(`https://bills-api.parliament.uk/api/v1/Bills?SearchTerm=${q}&SortOrder=DateUpdatedDescending&Take=10`);
  const items = res.items || [];
  const norm = s => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const hit = items.find(i => norm(i.shortTitle) === norm(title)) || items.find(i => norm(i.shortTitle).includes(norm(title)));
  if (!hit) return { notFound: true, title };
  return ukById(hit.billId);
}

// ---------- Congress.gov API (needs a free key in CONGRESS_API_KEY) ----------
const US_PATH = { hr: "house-bill", s: "senate-bill", hjres: "house-joint-resolution", sjres: "senate-joint-resolution", hres: "house-resolution", sres: "senate-resolution" };
async function usBill(ref, key) {
  const [congress, type, number] = ref.split("/");
  const d = await getJSON(`https://api.congress.gov/v3/bill/${congress}/${type}/${number}?format=json&api_key=${key}`);
  const b = d.bill || {};
  const la = b.latestAction || {};
  const enacted = (b.laws || []).length > 0 || /became public law|signed by president/i.test(la.text || "");
  return {
    ref, title: b.title, number: `${type.toUpperCase()}.${number}`,
    latest: { date: la.actionDate || null, text: la.text || null },
    enacted, laws: (b.laws || []).map(l => `${l.type} ${l.number}`),
    sponsors: (b.sponsors || []).map(s => `${s.fullName}`),
    cosponsors: b.cosponsors ? b.cosponsors.count : null,
    policyArea: b.policyArea ? b.policyArea.name : null,
    url: `https://www.congress.gov/bill/${congress}th-congress/${US_PATH[type] || type}/${number}`
  };
}

// ---------- European Parliament Open Data API (no key needed) ----------
const EP_ACT = {
  PUBLICATION_OFFICIAL_JOURNAL: "Published in the Official Journal",
  SIGNATURE: "Signed by Parliament and Council",
  PLENARY_ADOPT_POSITION: "Parliament adopted the text in plenary",
  COMMITTEE_APPROVE_PROVISIONAL_AGREEMENT: "Committee approved the trilogue agreement",
  INTERINSTITUTIONAL_NEGOTIATION: "Trilogue meeting with Council and Commission",
  PLENARY_ENDORSE_COMMITTEE_INTERINSTITUTIONAL_NEGOTIATIONS: "Plenary confirmed the mandate to negotiate",
  PLENARY_REFER_COMMITTEE_INTERINSTITUTIONAL_NEGOTIATIONS: "Referred back to committee for negotiations",
  COMMITTEE_ADOPTING_REPORT: "Committee adopted its report",
  COMMITTEE_ADOPTING_OPINION: "A committee adopted its opinion",
  COMMITTEE_TABLING_REPORT: "Draft report presented in committee",
  COMMITTEE_TABLING_AMENDMENT: "Amendments tabled in committee",
  TABLING_PLENARY: "Report or amendments tabled for plenary",
  PLENARY_DEBATE: "Debate in plenary",
  PLENARY_VOTE: "Vote in plenary",
  PLENARY_VOTE_RESULTS: "Plenary vote results published",
  PLENARY_AMEND: "Parliament adopted amendments",
  REFERRAL: "Referred to committee"
};
const EP_KEY = ["PUBLICATION_OFFICIAL_JOURNAL","SIGNATURE","PLENARY_ADOPT_POSITION","COMMITTEE_APPROVE_PROVISIONAL_AGREEMENT","INTERINSTITUTIONAL_NEGOTIATION","PLENARY_ENDORSE_COMMITTEE_INTERINSTITUTIONAL_NEGOTIATIONS","PLENARY_AMEND","COMMITTEE_ADOPTING_REPORT","COMMITTEE_TABLING_REPORT","REFERRAL"];
const EP_GROUP = { PPE: "EPP", "S-D": "S&D", RENEW: "Renew", "VERTS-ALE": "Greens/EFA", ECR: "ECR", PFE: "Patriots", ESN: "ESN", "THE-LEFT": "The Left", NI: "Non-attached" };
const EP_STAGE = { RDG1: "First reading", RDG2: "Second reading", RDG3: "Third reading / conciliation" };
const tail = s => String(s || "").split("/").pop();

async function epProc(ref) {
  const d = await getJSON(`https://data.europarl.europa.eu/api/v2/procedures/${ref}?format=application%2Fld%2Bjson`);
  const p = (d.data || [])[0] || {};
  const acts = (p.consists_of || []).filter(a => a.activity_date).map(a => ({ date: a.activity_date, type: tail(a.had_activity_type) }));
  acts.sort((a, b) => b.date.localeCompare(a.date));
  const key = acts.find(a => EP_KEY.includes(a.type));
  const latest = acts[0];
  const next = (p.was_scheduled_in || []).map(a => ({ date: a.activity_date, type: tail(a.had_activity_type) }))
    .filter(a => a.date >= today()).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  const rapp = (p.had_participation || []).filter(x => /RAPPORTEUR(_CO)?$/.test(tail(x.participation_role)))
    .map(x => `${EP_GROUP[tail(x.politicalGroup)] || tail(x.politicalGroup)}${x.participation_in_name_of ? " (" + tail(x.participation_in_name_of) + ")" : ""}`);
  const lead = (p.had_participation || []).filter(x => tail(x.participation_role) === "COMMITTEE_LEAD").map(x => tail((x.had_participant_organization || [])[0]));
  const lab = d => d && { date: d.date, text: EP_ACT[d.type] || d.type.toLowerCase().replace(/_/g, " ") };
  return {
    ref, label: p.label, title: p.process_title && p.process_title.en,
    stage: EP_STAGE[tail(p.current_stage)] || tail(p.current_stage) || null,
    published: acts.some(a => a.type === "PUBLICATION_OFFICIAL_JOURNAL"),
    milestone: lab(key), latest: lab(latest), next: lab(next),
    rapporteurs: [...new Set(rapp)], leadCommittees: lead,
    url: `https://oeil.secure.europarl.europa.eu/oeil/en/procedure-file?reference=${encodeURIComponent((p.label || ref.replace("-", "/") + "(COD)"))}`
  };
}

const list = (v, sep = ",") => (v || "").split(sep).map(s => s.trim()).filter(Boolean).slice(0, 40);

export default async (req) => {
  const u = new URL(req.url);
  const uk = list(u.searchParams.get("uk")).filter(x => /^\d{1,6}$/.test(x));
  const ukt = list(u.searchParams.get("ukt"), "|").filter(x => x.length < 120);
  const us = list(u.searchParams.get("us")).filter(x => /^\d{2,3}\/[a-z]{1,6}\/\d{1,6}$/.test(x));
  const eu = list(u.searchParams.get("eu")).filter(x => /^\d{4}-\d{4}$/.test(x));
  const key = process.env.CONGRESS_API_KEY;

  const jobs = [
    ...uk.map(id => ["uk", id, () => ukById(id)]),
    ...ukt.map(t => ["ukt", t, () => ukByTitle(t)]),
    ...(key ? us.map(r => ["us", r, () => usBill(r, key)]) : []),
    ...eu.map(r => ["eu", r, () => epProc(r)])
  ];
  const settled = await Promise.allSettled(jobs.map(j => j[2]()));
  const out = { fetchedAt: new Date().toISOString(), uk: {}, ukt: {}, us: {}, eu: {}, errors: {}, notes: [] };
  settled.forEach((s, i) => {
    const [kind, id] = jobs[i];
    if (s.status === "fulfilled") out[kind][id] = s.value; else out.errors[`${kind}:${id}`] = String(s.reason && s.reason.message || s.reason);
  });
  if (!key && us.length) out.notes.push("US live data is off: add a free Congress.gov API key as CONGRESS_API_KEY in Netlify.");

  return new Response(JSON.stringify(out), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=600",
      "netlify-cdn-cache-control": "public, s-maxage=21600, stale-while-revalidate=86400"
    }
  });
};

export const config = { path: "/api/live" };
