import { readFile, writeFile } from 'node:fs/promises';

const enPath = 'packages/desktop-client/frontend-keys/en.json';
const ptPath = 'packages/desktop-client/locale/pt-BR.json';
const en = JSON.parse(await readFile(enPath, 'utf8'));
const pt = JSON.parse(await readFile(ptPath, 'utf8'));

const manualTranslations = {
  '{{provider}} menu': 'Menu do {{provider}}',
  '28+': '28+',
  Base: 'Base',
  Divisor: 'Divisor',
  Euro: 'Euro',
  'Fees paid: {{amount}}, charged at the end of the year.': 'Taxas pagas: {{amount}}, cobradas no fim do ano.',
  'Filtered running total only; no scheduled occurrences in this range': 'Apenas total acumulado filtrado; não há ocorrências agendadas neste intervalo.',
  'Filters applied': 'Filtros aplicados',
  Finish: 'Concluir',
  'First condition': 'Primeira condição',
  'First earnings': 'Primeiros ganhos',
  'First period (1-based)': 'Primeiro período (começa em 1)',
  'First result': 'Primeiro resultado',
  'First text value': 'Primeiro valor de texto',
  'First value': 'Primeiro valor',
  'Fixed amount': 'Valor fixo',
  'Fixed yearly fee': 'Taxa anual fixa',
  'Flat rate per pot': 'Taxa fixa por reserva',
};

Object.assign(pt, manualTranslations);

function maskMarkers(text) {
  const markers = [];
  const masked = text.replace(/\{\{[^}]+\}\}|<\/?\d+>/g, marker => {
    const token = `ZZZMARK${markers.length}ZZZ`;
    markers.push([token, marker]);
    return token;
  });
  return { masked, markers };
}

function restoreMarkers(text, markers) {
  let restored = text;
  for (const [token, marker] of markers) {
    if ((restored.match(new RegExp(token, 'g')) ?? []).length !== 1) {
      return undefined;
    }
    restored = restored.replace(token, marker);
  }
  return restored;
}

async function translate(text) {
  const { masked, markers } = maskMarkers(text);
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.search = new URLSearchParams({ client: 'gtx', sl: 'en', tl: 'pt', dt: 't', q: masked });
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error(`Translation request failed: ${response.status}`);
  const payload = await response.json();
  const translated = payload[0].map(part => part[0]).join('');
  const restored = restoreMarkers(translated, markers);
  if (!restored) throw new Error('Translation changed protected placeholders');
  return restored;
}

const pending = Object.keys(en).filter(key => !pt[key] || !String(pt[key]).trim() || pt[key] === key);
const skipped = [];
const maxItems = Number(process.env.MAX_ITEMS ?? 'Infinity');
let completed = 0;

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

for (const key of pending) {
  if (completed + skipped.length >= maxItems) break;
  if (key.startsWith(':root {')) {
    skipped.push(key);
    continue;
  }
  try {
    let translated;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        translated = await translate(key);
        break;
      } catch (error) {
        if (!String(error.message).includes('429') || attempt === 4) throw error;
        await delay(60_000);
      }
    }
    pt[key] = translated;
    completed += 1;
    await writeFile(ptPath, `${JSON.stringify(pt, null, 2)}\n`);
    await delay(500);
  } catch (error) {
    skipped.push(key);
    console.warn(`Skipped: ${key.slice(0, 80)} (${error.message})`);
  }
}

await writeFile(ptPath, `${JSON.stringify(pt, null, 2)}\n`);
console.log(JSON.stringify({ completed, skipped: skipped.length, skipped }, null, 2));
