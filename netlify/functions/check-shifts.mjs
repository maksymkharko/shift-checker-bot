import fetch from 'node-fetch';
import { getStore } from '@netlify/blobs';

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const FORM_URL = process.env.FORM_URL;
const FORM_POST_URL = process.env.FORM_POST_URL;
const FORM_EMAIL = process.env.FORM_EMAIL;
const FORM_NAME = process.env.FORM_NAME;
const FORM_EMPLOYEE_ID = process.env.FORM_EMPLOYEE_ID;
const FORM_ACTION_TEXT = process.env.FORM_ACTION_TEXT || '2.+Chc%C4%99+przyj%C4%85%C4%87';
const FORM_CITY = process.env.FORM_CITY || 'Wroclaw';

export default async function handler(req, context) {
  try {
    const shifts = await getShifts();
    if (shifts.length === 0) {
      console.log('No shifts found');
      return new Response('No shifts found', { status: 200 });
    }

    const store = getStore('shift-checker');
    const seenRaw = await store.get('seenShifts');
    const seen = seenRaw ? JSON.parse(seenRaw) : [];

    const newShifts = shifts.filter(s => !seen.includes(s));

    if (newShifts.length > 0) {
      const shiftList = newShifts.join('\n');
      await sendTelegram('\uD83D\uDE80 Nowa zmiana!\n\n' + shiftList + '\n\nFormularz: ' + FORM_URL);
      const updated = [...seen, ...newShifts].slice(-50);
      await store.set('seenShifts', JSON.stringify(updated));
      console.log('Sent', newShifts.length, 'new shifts');
    } else {
      console.log('No new shifts');
    }

    return new Response('OK', { status: 200 });
  } catch (e) {
    console.error('Error:', e.toString());
    return new Response('Error: ' + e.toString(), { status: 500 });
  }
}

async function getShifts() {
  const resp1 = await fetch(FORM_URL);
  const html1 = await resp1.text();
  const cookie1 = resp1.headers.get('set-cookie') || '';

  let fbzx = '';
  const fidx = html1.indexOf('"fbzx"');
  if (fidx >= 0) {
    const fm = html1.substring(fidx, fidx + 60).match(/"fbzx","([^"]+)"/);
    if (fm) fbzx = fm[1];
  }

  const makeHeaders = (c) => ({
    'Content-Type': 'application/x-www-form-urlencoded',
    'Cookie': c,
    'Referer': FORM_URL
  });

  const fbzxEnc = encodeURIComponent(fbzx);
  const emailEnc = encodeURIComponent(FORM_EMAIL);
  const nameEnc = encodeURIComponent(FORM_NAME).replace(/%20/g, '+');

  const r2 = await fetch(FORM_POST_URL, {
    method: 'POST',
    headers: makeHeaders(cookie1),
    body: `entry.1045781291=${emailEnc}&pageHistory=0&fbzx=${fbzxEnc}`,
    redirect: 'manual'
  });
  const c2 = r2.headers.get('set-cookie') || cookie1;

  const r3 = await fetch(FORM_POST_URL, {
    method: 'POST',
    headers: makeHeaders(c2),
    body: `entry.245795837=${nameEnc}&entry.798046433=${FORM_EMPLOYEE_ID}&entry.455771016=${FORM_ACTION_TEXT}&pageHistory=0%2C1&fbzx=${fbzxEnc}`,
    redirect: 'manual'
  });
  const c3 = r3.headers.get('set-cookie') || c2;

  const r4 = await fetch(FORM_POST_URL, {
    method: 'POST',
    headers: makeHeaders(c3),
    body: `entry.75972183=${FORM_CITY}&pageHistory=0%2C1%2C2&fbzx=${fbzxEnc}`,
    redirect: 'manual'
  });
  const html4 = await r4.text();

  const shifts = [];
  const re = /"(\d{2}\.\d{2}\.\d{4}:\s*[^"]+)"[,\]]/g;
  let m;
  while ((m = re.exec(html4)) !== null) {
    if (m[1].includes(':') && !shifts.includes(m[1])) {
      shifts.push(m[1]);
    }
  }
  return shifts;
}

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text })
  });
}

export const config = {
  schedule: '* * * * *'
};
