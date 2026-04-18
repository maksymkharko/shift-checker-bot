import fetch from 'node-fetch';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = resolve(__dirname, '../../.state.json');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const FORM_URL = process.env.FORM_URL;
const FORM_POST_URL = process.env.FORM_POST_URL;
const FORM_EMAIL = process.env.FORM_EMAIL;
const FORM_NAME = process.env.FORM_NAME;
const FORM_EMPLOYEE_ID = process.env.FORM_EMPLOYEE_ID;
const FORM_ACTION_TEXT = process.env.FORM_ACTION_TEXT || '2.+Chc%C4%99+przyj%C4%85%C4%87';
const FORM_CITY = process.env.FORM_CITY || 'Wroclaw';

function loadState() {
  if (existsSync(STATE_FILE)) {
    try { return JSON.parse(readFileSync(STATE_FILE, 'utf-8')); }
    catch (e) { return { seenShifts: [] }; }
  }
  return { seenShifts: [] };
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function sendTelegram(msg) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text: msg, parse_mode: 'HTML' })
  });
  const data = await res.json();
  if (!data.ok) throw new Error('Telegram error: ' + JSON.stringify(data));
  return data;
}

async function getShifts() {
  if (!FORM_URL || FORM_URL.includes('test')) {
    console.log('TEST MODE: returning fake shifts');
    return ['TEST_SHIFT_2026-04-18_08:00-16:00'];
  }

  const targetUrl = FORM_POST_URL || FORM_URL;
  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await res.text();
    const dateRegex = /\d{4}-\d{2}-\d{2}/g;
    const dates = [...new Set(html.match(dateRegex) || [])];
    console.log('Dates found in form:', dates.length);
    return dates;
  } catch (e) {
    console.error('Fetch error:', e.message);
    return [];
  }
}

async function main() {
  console.log('Checking shifts at', new Date().toISOString());
  console.log('TELEGRAM_TOKEN set:', !!TELEGRAM_TOKEN);
  console.log('CHAT_ID set:', !!CHAT_ID);

  const state = loadState();
  const seenShifts = new Set(state.seenShifts || []);
  console.log('Already seen shifts:', seenShifts.size);

  const shifts = await getShifts();
  console.log('Total shifts found:', shifts.length);

  const newShifts = shifts.filter(s => !seenShifts.has(s));
  console.log('New shifts:', newShifts.length);

  if (newShifts.length > 0) {
    const msg = `🟢 <b>Shift Checker Bot</b>\n\n📊 Nowe zmiany dost\u0119pne!\n\n${newShifts.map(s => `\u2022 ${s}`).join('\n')}\n\n\u23f0 ${new Date().toLocaleString('pl-PL')}`;
    await sendTelegram(msg);
    newShifts.forEach(s => seenShifts.add(s));
    saveState({ seenShifts: [...seenShifts] });
    console.log('Notification sent!');
  } else {
    await sendTelegram(`\u2705 <b>Shift Checker</b> pracuje\n\nSprawdzono: ${new Date().toLocaleString('pl-PL')}\nNowych zmian: 0`);
    console.log('No new shifts, sent status message.');
  }
}

main().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
