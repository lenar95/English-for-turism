/**
 * Статические страницы для поисковиков.
 *
 * Приложение — одностраничное, и поисковики видят его как одну страницу.
 * Этот скрипт после сборки создаёт обычные HTML-страницы из тех же данных:
 * каталог ситуаций, страницу на каждую ситуацию и город, sitemap.xml и robots.txt.
 * Каждая страница ведёт в приложение тренироваться.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { STAGES, cities, scenarios } from '../src/data';
import type { CityPack, Phrase, Scenario } from '../src/data/types';
import { plural } from '../src/lib/ru';

const SITE = (process.env.SITE_URL ?? 'https://engtrip.ru').replace(/\/$/, '');
const OUT = process.env.OUT_DIR ?? 'dist';
const today = new Date().toISOString().slice(0, 10);

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CSS = `
:root{--bg:#f6f4ef;--surface:#fff;--text:#1c1f24;--muted:#5d6168;--primary:#1f5f8b;--soft:#e3eef6;--border:#e2ddd2;--them:#7a4fb5;--them-soft:#efe7fa;--accent:#c98a12}
@media (prefers-color-scheme:dark){:root{--bg:#16181d;--surface:#1f2228;--text:#eceef1;--muted:#b0b4bb;--primary:#5aa7da;--soft:#1d3444;--border:#33373f;--them:#b393e6;--them-soft:#2e2540;--accent:#e8ac3a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif}
main{max-width:760px;margin:0 auto;padding:20px 16px 48px}a{color:var(--primary)}
nav.crumbs{font-size:14px;color:var(--muted);margin-bottom:12px}nav.crumbs a{color:var(--muted)}
h1{font-size:28px;line-height:1.2;letter-spacing:-.02em;margin:0 0 8px}h2{font-size:20px;margin:28px 0 12px}
.lead{color:var(--muted);margin:0 0 16px}
.cta{display:inline-flex;align-items:center;gap:8px;background:var(--primary);color:#fff;text-decoration:none;font-weight:700;padding:14px 20px;border-radius:14px;margin:8px 0 4px}
@media (prefers-color-scheme:dark){.cta{color:#0b1a24}}
.cards{display:grid;gap:10px}.card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:14px 16px}
.card a.item{display:flex;gap:12px;align-items:center;text-decoration:none;color:inherit}
.emoji{font-size:26px}.muted{color:var(--muted);font-size:14px}
.phrase{display:grid;grid-template-columns:1fr auto;gap:2px 12px;align-items:start}
.en{font-weight:700;font-size:18px}.tr{color:var(--primary)}.ru{color:var(--muted)}
.note{grid-column:1/-1;font-size:14px;color:var(--muted);margin-top:6px}
.local{grid-column:1/-1;display:grid;grid-template-columns:1fr auto;gap:2px 12px;margin-top:8px;padding:8px 10px;border-left:3px solid #e30a17;background:var(--soft);border-radius:10px}.local .en{font-size:16px}.local .small{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}.local .say{background:var(--surface)}
.tag{display:inline-block;font-size:12px;font-weight:700;border-radius:999px;padding:2px 9px;margin-bottom:4px;background:var(--soft);color:var(--primary)}
.tag.them{background:var(--them-soft);color:var(--them)}.key{color:var(--accent)}
.say{border:0;background:var(--soft);color:var(--primary);border-radius:10px;width:40px;height:40px;font-size:18px;cursor:pointer;grid-row:1/4;grid-column:2}
ul.tips{padding-left:20px}ul.tips li{margin-bottom:6px}
.dialog p{margin:6px 0}.dialog b{color:var(--primary)}.dialog .t b{color:var(--them)}
footer{margin-top:40px;font-size:14px;color:var(--muted)}
`;

const SPEAK_JS = `document.addEventListener('click',function(e){var b=e.target.closest('.say');if(!b||!window.speechSynthesis)return;var u=new SpeechSynthesisUtterance(b.dataset.text);u.lang=b.dataset.lang||'en-US';u.rate=.9;speechSynthesis.cancel();speechSynthesis.speak(u);});`;

interface PageMeta {
  path: string;
  title: string;
  description: string;
  body: string;
  jsonLd?: unknown[];
}

function layout({ path, title, description, body, jsonLd = [] }: PageMeta): string {
  const url = `${SITE}${path}`;
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Английский в поездку">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og.png">
<meta property="og:locale" content="ru_RU">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="/icon.svg">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<style>${CSS}</style>
${jsonLd.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n')}
</head>
<body>
<main>
${body}
<footer>
<p><a href="/">Английский в поездку</a> — бесплатное приложение для подготовки к поездке за границу: фразы с произношением русскими буквами, тренировка памяти и проверка произношения.</p>
</footer>
</main>
<script>${SPEAK_JS}</script>
</body>
</html>
`;
}

const crumbs = (items: { name: string; path: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: `${SITE}${it.path}` })),
});

function phraseCard(p: Phrase, city?: CityPack): string {
  const loc = city && p.local ? city.localLanguage : null;
  return `<div class="card phrase">
<div><span class="tag${p.speaker === 'them' ? ' them' : ''}">${p.speaker === 'you' ? 'Говорите вы' : 'Говорят вам'}</span>${p.key ? ' <span class="key">★</span>' : ''}</div>
<button class="say" type="button" data-text="${esc(p.en)}" aria-label="Прослушать">🔊</button>
<div class="en" lang="en">${esc(p.en)}</div>
<div class="tr">${esc(p.tr)}</div>
<div class="ru">${esc(p.ru)}</div>
${
  loc && p.local
    ? `<div class="local"><button class="say" type="button" data-lang="${loc.lang}" data-text="${esc(p.local.text)}" aria-label="Прослушать ${esc(loc.name)}">🔊</button><div class="small">${esc(loc.name)}</div><div class="en" lang="${loc.lang.slice(0, 2)}">${esc(p.local.text)}</div><div class="tr">${esc(p.local.tr)}</div></div>`
    : ''
}
${p.note ? `<div class="note">💡 ${esc(p.note)}</div>` : ''}
</div>`;
}

function scenarioPath(s: Scenario): string {
  return s.cityId ? `/city/${s.cityId}/${s.id.replace(`${s.cityId}-`, '')}/` : `/phrases/${s.id}/`;
}

function scenarioPage(s: Scenario, city?: CityPack): PageMeta {
  const n = s.phrases.length;
  const place = city ? ` ${city.nameIn}` : '';
  const title = `${s.title}${place} по-английски: ${n} ${plural(n, 'фраза', 'фразы', 'фраз')} с произношением`;
  const description = `${s.goal} Фразы на английском с переводом и произношением русскими буквами, советы и тренировка в приложении.`;
  const dialogue = s.dialogues[0];
  const byId = new Map(s.phrases.map((p) => [p.id, p]));
  const parent = city ? { name: city.name, path: `/city/${city.id}/` } : { name: 'Разговорник', path: '/phrases/' };
  const path = scenarioPath(s);
  const body = `
<nav class="crumbs"><a href="/">Главная</a> / <a href="${parent.path}">${esc(parent.name)}</a> / ${esc(s.title)}</nav>
<h1>${s.emoji} ${esc(s.title)}${esc(place)}: английский для туриста</h1>
<p class="lead">${esc(s.goal)}</p>
<a class="cta" href="/#/scenario/${s.id}">Тренироваться бесплатно →</a>
<p class="muted">В приложении — проверка произношения через микрофон, диалог-тренажёр и шкала готовности к поездке.</p>
<h2>Фразы (${n})</h2>
<div class="cards">
${s.phrases.map((p) => phraseCard(p, city)).join('\n')}
</div>
${
  dialogue
    ? `<h2>Пример диалога: ${esc(dialogue.title)}</h2>
<div class="card dialog">
${dialogue.lines
  .map((l) => byId.get(l.phraseId))
  .filter((p): p is Phrase => Boolean(p))
  .map((p) => `<p class="${p.speaker === 'them' ? 't' : ''}"><b>${p.speaker === 'you' ? 'Вы' : 'Вам'}:</b> <span lang="en">${esc(p.en)}</span> <span class="muted">— ${esc(p.ru)}</span></p>`)
  .join('\n')}
</div>`
    : ''
}
<h2>Советы</h2>
<ul class="tips">${s.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
<a class="cta" href="/#/scenario/${s.id}">Выучить эти фразы →</a>
`;
  return {
    path,
    title,
    description,
    body,
    jsonLd: [
      crumbs([{ name: 'Главная', path: '/' }, parent, { name: s.title, path }]),
      {
        '@context': 'https://schema.org',
        '@type': 'LearningResource',
        name: title,
        description,
        inLanguage: 'ru',
        teaches: `Английский язык: ${s.title}`,
        educationalLevel: 'Beginner',
        isAccessibleForFree: true,
        url: `${SITE}${path}`,
      },
    ],
  };
}

function catalogPage(): PageMeta {
  const sections = STAGES.map((st) => {
    const list = scenarios.filter((s) => s.stage === st.id);
    if (!list.length) return '';
    return `<h2>${esc(st.title)}</h2><div class="cards">${list
      .map(
        (s) => `<div class="card"><a class="item" href="${scenarioPath(s)}"><span class="emoji">${s.emoji}</span><span><b>${esc(s.title)}</b><br><span class="muted">${esc(s.goal)}</span></span></a></div>`,
      )
      .join('')}</div>`;
  }).join('\n');
  const citySection = `<h2>Наборы для городов</h2><div class="cards">${cities
    .map(
      (c) => `<div class="card"><a class="item" href="/city/${c.id}/"><span class="emoji">${c.emoji}</span><span><b>${esc(c.name)}</b><br><span class="muted">${esc(c.scenarios.map((s) => s.title).join(' · '))}</span></span></a></div>`,
    )
    .join('')}</div>`;
  const total = scenarios.reduce((n, s) => n + s.phrases.length, 0);
  return {
    path: '/phrases/',
    title: 'Разговорник английского для туристов: фразы с произношением русскими буквами',
    description: `${total} фраз на английском для поездки за границу: аэропорт, такси, отель, ресторан, магазины, аптека. С переводом и произношением русскими буквами.`,
    body: `
<nav class="crumbs"><a href="/">Главная</a> / Разговорник</nav>
<h1>Английский для туристов: разговорник по ситуациям</h1>
<p class="lead">Фразы, которые понадобятся за границей — от паспортного контроля до аптеки. У каждой — перевод и произношение русскими буквами.</p>
<a class="cta" href="/">Открыть приложение →</a>
${sections}
${citySection}`,
    jsonLd: [crumbs([{ name: 'Главная', path: '/' }, { name: 'Разговорник', path: '/phrases/' }])],
  };
}

function cityPage(c: CityPack): PageMeta {
  const inCity = c.nameGen;
  const path = `/city/${c.id}/`;
  return {
    path,
    title: `${c.name}: фразы для туриста на английском и местном языке, советы`,
    description: `${c.intro.slice(0, 150)}…`,
    body: `
<nav class="crumbs"><a href="/">Главная</a> / <a href="/phrases/">Разговорник</a> / ${esc(c.name)}</nav>
<h1>${c.emoji} ${esc(c.name)}: фразы для туриста</h1>
<p class="lead">${esc(c.intro)}</p>
<a class="cta" href="/#/city/${c.id}">Готовиться к поездке →</a>
<h2>Ситуации ${esc(inCity)}</h2>
<div class="cards">${c.scenarios
      .map(
        (s) => `<div class="card"><a class="item" href="${scenarioPath(s)}"><span class="emoji">${s.emoji}</span><span><b>${esc(s.title)}</b><br><span class="muted">${esc(s.goal)}</span></span></a></div>`,
      )
      .join('')}</div>
<h2>Пара слов ${esc(c.localLanguage.name)}</h2>
<div class="cards">${c.localLanguage.words
      .map(
        (w) => `<div class="card phrase"><button class="say" type="button" data-lang="${c.localLanguage.lang}" data-text="${esc(w.text.replace(' / ', ', '))}" aria-label="Прослушать">🔊</button><div class="en" lang="${c.localLanguage.lang.slice(0, 2)}">${esc(w.text)}</div><div class="tr">${esc(w.tr)}</div><div class="ru">${esc(w.ru)}</div></div>`,
      )
      .join('')}</div>
<h2>Советы</h2>
<ul class="tips">${c.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`,
    jsonLd: [crumbs([{ name: 'Главная', path: '/' }, { name: 'Разговорник', path: '/phrases/' }, { name: c.name, path }])],
  };
}

function write(path: string, html: string) {
  const file = join(OUT, path.endsWith('/') ? `${path}index.html` : path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

const pages: PageMeta[] = [catalogPage(), ...scenarios.map((s) => scenarioPage(s))];
for (const c of cities) {
  pages.push(cityPage(c));
  for (const s of c.scenarios) pages.push(scenarioPage(s, c));
}
for (const p of pages) write(p.path, layout(p));

write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['/', ...pages.map((p) => p.path)].map((p) => `  <url><loc>${SITE}${p}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`,
);
write(
  'robots.txt',
  `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${SITE}/sitemap.xml
`,
);
console.log(`Статические страницы: ${pages.length}, sitemap.xml, robots.txt`);
