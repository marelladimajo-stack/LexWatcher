// LexWatcher national feeds — the newest laws from official sources of EU member states.
// Served at /api/national and cached by Netlify's CDN for 6 hours.
// Countries without an open, machine-readable source are covered by links in the app.

const T = 7000;
const UA = { "User-Agent": "LexWatcher (educational legislation tracker)" };
async function get(url, accept = "application/json") {
  const r = await fetch(url, { headers: { ...UA, Accept: accept }, signal: AbortSignal.timeout(T) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r;
}
const year = () => new Date().getUTCFullYear();
const iso = d => { const t = new Date(d); return isNaN(t) ? null : t.toISOString().slice(0, 10); };

// --- tiny RSS reader ---
function decodeEntities(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
function rss(xml) {
  return xml.split(/<item[\s>]/).slice(1).map(chunk => {
    const tag = n => { const m = chunk.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`)); return m ? decodeEntities(m[1]) : ""; };
    return { title: tag("title"), link: tag("link"), date: tag("pubDate") || tag("dc:date"), desc: tag("description") };
  });
}
const pubDate = s => {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{4})/); // keep the publication's own calendar day
  if (m) { const mo = "janfebmaraprmayjunjulaugsepoctnovdec".indexOf(m[2].toLowerCase()) / 3 + 1; if (mo > 0) return `${m[3]}-${String(mo).padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  return iso(s);
};

// Ireland: Acts recently signed into law
async function ireland() {
  const d = await (await get(`https://api.oireachtas.ie/v1/legislation?bill_status=Enacted&date_start=${year() - 1}-01-01&limit=60&lang=en`)).json();
  return (d.results || []).map(r => r.bill || r).filter(b => b.act).map(b => ({
    title: b.act.shortTitleEn || b.shortTitleEn,
    kind: "Act", date: b.act.dateSigned || null,
    url: b.act.actYear && b.act.actNo ? `https://www.irishstatutebook.ie/eli/${b.act.actYear}/act/${b.act.actNo}/enacted/en/html` : "https://www.oireachtas.ie/en/bills/"
  })).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 15);
}

// Sweden: newest entries in the Swedish Code of Statutes (SFS)
async function sweden() {
  const d = await (await get("https://data.riksdagen.se/dokumentlista/?doktyp=sfs&sort=datum&sortorder=desc&utformat=json&a=s&p=1&sz=20")).json();
  const docs = (d.dokumentlista && d.dokumentlista.dokument) || [];
  return docs.map(x => ({
    title: x.titel, kind: /^Lag\b/i.test(x.titel) ? "Act (lag)" : /^Förordning/i.test(x.titel) ? "Ordinance (förordning)" : "Statute",
    date: x.datum || null, url: x.dokument_url_html ? "https:" + x.dokument_url_html.replace(/^https?:/, "") : "https://www.riksdagen.se/"
  })).slice(0, 15);
}

// Spain: BOE Section I (general provisions: laws, decree-laws, royal decrees)
async function spain() {
  const xml = await (await get("https://www.boe.es/rss/boe.php?s=1", "application/rss+xml, application/xml")).text();
  const kindOf = t => /^Ley Orgánica/i.test(t) ? "Organic law" : /^Ley\b/i.test(t) ? "Law" : /^Real Decreto-ley/i.test(t) ? "Royal decree-law" : /^Real Decreto/i.test(t) ? "Royal decree" : /^Orden/i.test(t) ? "Ministerial order" : "General provision";
  return rss(xml).filter(i => !/^sumario/i.test(i.title)).map(i => ({ title: i.title, kind: kindOf(i.title), date: pubDate(i.date), url: i.link })).slice(0, 15);
}

// Germany: Federal Law Gazette, Part I
async function germany() {
  const xml = await (await get("https://www.recht.bund.de/rss/feeds/rss_bgbl-1-2.xml?nn=211452", "application/rss+xml, application/xml")).text();
  return rss(xml).filter(i => /bgbl-1/.test(i.link)).map(i => ({
    title: i.title, kind: /^\S*gesetz/i.test(i.title) ? "Act (Gesetz)" : /Verordnung/i.test(i.title) ? "Regulation (Verordnung)" : "Federal Law Gazette I",
    date: pubDate(i.date), url: i.link
  })).slice(0, 15);
}

// France: latest legislative texts in the Senate (bills under examination)
async function france() {
  const buf = await (await get("https://www.senat.fr/rss/textes.rss", "application/rss+xml, application/xml")).arrayBuffer();
  const head = new TextDecoder("latin1").decode(buf.slice(0, 200));
  const enc = (head.match(/encoding=["']([\w-]+)["']/i) || [, "utf-8"])[1].toLowerCase();
  let xml; try { xml = new TextDecoder(enc).decode(buf); } catch { xml = new TextDecoder("latin1").decode(buf); }
  return rss(xml).map(i => ({
    title: i.title, kind: /constitutionnelle/i.test(i.title + i.desc) ? "Constitutional bill" : /résolution/i.test(i.title + i.desc) ? "Resolution" : "Bill in the Senate",
    date: pubDate(i.date), url: i.link.replace(/^http:/, "https:")
  })).slice(0, 15);
}

// Poland: statutes (ustawy) published in the Journal of Laws
async function poland() {
  const y = year();
  const d = await (await get(`https://api.sejm.gov.pl/eli/acts/DU/${y}`)).json();
  const items = Array.isArray(d) ? d : (d.items || []);
  return items.filter(a => /^ustawa/i.test(a.type || "")).sort((a, b) => (b.pos || 0) - (a.pos || 0)).slice(0, 15).map(a => ({
    title: a.title, kind: "Statute (ustawa)", date: a.announcementDate || a.promulgation || null,
    url: `https://dziennikustaw.gov.pl/DU/${a.year || y}/${a.pos}`
  }));
}

export default async () => {
  const jobs = { IE: ireland, SE: sweden, ES: spain, DE: germany, FR: france, PL: poland };
  const keys = Object.keys(jobs);
  const res = await Promise.allSettled(keys.map(k => jobs[k]()));
  const out = { fetchedAt: new Date().toISOString(), countries: {}, errors: {} };
  res.forEach((r, i) => { if (r.status === "fulfilled") out.countries[keys[i]] = r.value; else out.errors[keys[i]] = String(r.reason && r.reason.message || r.reason); });
  return new Response(JSON.stringify(out), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=600",
      "netlify-cdn-cache-control": "public, s-maxage=21600, stale-while-revalidate=86400"
    }
  });
};

export const config = { path: "/api/national" };
