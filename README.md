# LexWatcher

New, upcoming and landmark law in the EU, the UK and the US, explained for law students, with live updates from official sources.

## What updates on its own

| What | Source | Key needed |
|---|---|---|
| Stage, next sitting and sponsor of tracked UK bills | UK Parliament Bills API | No |
| Every recently updated UK bill (Live updates tab) | UK Parliament Bills API | No |
| Latest milestone, next vote and rapporteurs of tracked EU files | European Parliament Open Data API | No |
| Significant US federal rules (final and proposed) | Federal Register API | No |
| Latest action and sponsors of tracked US bills, new US laws | Congress.gov API | Yes, free |
| Newest laws in Ireland, Sweden, Spain, Germany and Poland, and new bills in the French Senate (EU countries tab) | Oireachtas API, Riksdag open data, BOE, Federal Law Gazette, Sejm ELI API, Sénat | No |

The three functions in `netlify/functions/` fetch these sources. Netlify keeps each answer for a few hours, so the data refreshes several times a day without overloading the official sites. When a bill becomes law, the stage bar moves forward automatically.

The written parts (overview, political situation, why it matters) are edited by hand in the `DATA` block of `index.html`.

## Publish it (about 15 minutes)

Live updates need Netlify Functions, which do **not** work with drag-and-drop. Use GitHub:

1. On github.com, create a new repository called `lexwatcher`.
2. Click **uploading an existing file** and drag in everything inside this folder, including the `netlify` folder. Click **Commit changes**.
3. On app.netlify.com: **Add new site → Import an existing project → GitHub → lexwatcher**. Leave the build command empty and click **Deploy**.
4. Rename the site to `lexwatcher` under **Site configuration → Change site name**.
5. For US data: request a free key at https://api.data.gov/signup, then in Netlify go to **Site configuration → Environment variables → Add a variable**, name it `CONGRESS_API_KEY`, paste the key and redeploy (**Deploys → Trigger deploy**).

Check that it works: open `https://lexwatcher.netlify.app/api/live?uk=4083` — you should see data about the Courts and Tribunals Bill.

## EU countries

The `countries` block in `index.html` holds, for each of the 27 Member States, how laws are made, official links and the "Notable recent laws" (field `notable`). Countries without an open data feed show links to their official gazette and parliament.

## Compare, transposition map and study tools

- **Compare tab**: the `compare` list in the `extra` block of `index.html`. Each topic has a column per jurisdiction (`EU`, `UK`, `US`, optional `MS` for member states), a key difference and an essay question.
- **Transposition map** (EU countries tab): the `tmap` list in the same block. Each directive lists the official Commission infringement steps (`lfn` letter of formal notice, `ro` reasoned opinion, `ref` referral to the Court of Justice), the countries named and the official source. Add new steps after each monthly infringement package.
- **Study tools** (every explainer): `cite` (OSCOLA citation), `questions` and `cases` in each file of the `DATA` block. The quiz is generated automatically from the file's data.

## Source policy

LexWatcher uses **only publicly available sources**, for information purposes:
- official open-data services, legislative databases and official gazettes;
- official press releases and publicly published analysis (news, law firms, research centres).

Never use documents with restricted distribution (for example Council documents marked "LIMITE"), leaked texts, paywalled content, or anything that requires bypassing a login, encryption or other access controls.

## Add or update a file

Edit the `DATA` block in `index.html` (on GitHub, open the file and click the pencil). Each file can have:

- `politics`: paragraphs on the political situation
- `live`: one of
  - `"uk": "4083"` (the number in the bills.parliament.uk link)
  - `"ukt": "Exact Bill Title"` (if you don't know the number yet)
  - `"us": "119/hr/3633"` (Congress, bill type, number)
  - `"eu": "2025-0359"` (Legislative Observatory reference 2025/0359(COD))

After a change, update `asOf` in the data and change `lexwatcher-v2` to the next number in `sw.js`, so installed phones download the new version.

LexWatcher is a study tool, not legal advice.
