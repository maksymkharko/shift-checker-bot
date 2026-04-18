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
    try {
      return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    } catch (e) {
      return { seenShifts: [] };
    }
  }
  return { seenShifts: [] };
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function sendTelegram(msg) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text: msg, parse_mode: 'HTML' })
  });
}

async function getShifts() {
  if (!FORM_URL) {
    console.error('FORM_URL not set');
    return [];
  }

  const fbzxMatch = FORM_URL.match(/[?&]fbzx=([^&]+)/);
  const fbzx = fbzxMatch ? fbzxMatch[1] : '';

  const params = new URLSearchParams();
  if (FORM_EMAIL) params.append('emailAddress', FORM_EMAIL);
  if (FORM_NAME) params.append('entry.name', FORM_NAME);
  if (FORM_EMPLOYEE_ID) params.append('entry.employeeId', FORM_EMPLOYEE_ID);
  params.append('entry.action', FORM_ACTION_TEXT);
  params.append('entry.city', FORM_CITY);
  if (fbzx) params.append('fbzx', fbzx);

  const targetUrl = FORM_POST_URL || FORM_URL;

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0'
      },
      body: params.toString()
    });

    const html = await res.text();

    const shiftRegex = /shift[^"]*"([^"]+)"/gi;
    const shifts = [];
    let match;
    while ((match = shiftRegex.exec(html)) !== null) {
      shifts.push(match[1]);
    }

    const dateRegex = /\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/g;
    const dates = html.match(dateRegex) || [];
    return [...new Set([...shifts, ...dates])];
  } catch (e) {
    console.error('Fetch error:', e.message);
    return [];
  }
}

async function main() {
  console.log('Checking shifts at', new Date().toISOString());

  const state = loadState();
  const seenShifts = new Set(state.seenShifts || []);

  const shifts = await getShifts();
  console.log('Found shifts:', shifts.length);

  const newShifts = shifts.filter(s => !seenShifts.has(s));

  if (newShifts.length > 0) {
    console.log('New shifts:', newShifts);
    const msg = `📊 <b>Nowe zmiany dostępne!</b>\n\n${newShifts.map(s => `• ${s}`).join('\n')}`;
    await sendTelegram(msg);

    newShifts.forEach(s => seenShifts.add(s));
    saveState({ seenShifts: [...seenShifts] });
    console.log('Telegram notification sent');
  } else {
    console.log('No new shifts');
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
