const { pool } = require('./db');

const BUYER_NAMES = {
  TK: 'Toby',
  MA: 'Martina',
  KG: 'Ken',
  DS: 'Duran',
  PS: 'Prabhat',
};

const BUYER_ORDER = ['TK', 'MA', 'KG', 'DS', 'PS'];

function fmtMoney(n) {
  const v = Number(n);
  const abs = Math.abs(v);
  const s = abs >= 1000 ? `$${(abs / 1000).toFixed(1)}k` : `$${abs.toFixed(2)}`;
  return v < 0 ? `\\-${s}` : s; // escape minus for Telegram MarkdownV2
}

async function fetchYesterdayProfits() {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const { rows } = await pool.query(
    `SELECT c.buyer, COALESCE(SUM(s.profit), 0) AS profit
     FROM rt_campaigns c
     JOIN rt_campaign_stats s ON s.campaign_id = c.id
     WHERE c.buyer IS NOT NULL AND s.stat_date = $1
     GROUP BY c.buyer`,
    [yesterday]
  );
  return { yesterday, rows };
}

async function sendDailyReport() {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log('[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping');
    return;
  }

  try {
    const { yesterday, rows } = await fetchYesterdayProfits();
    const byBuyer = Object.fromEntries(rows.map(r => [r.buyer, Number(r.profit)]));

    const date = new Date(yesterday + 'T12:00:00Z');
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const lines = BUYER_ORDER.map(code => {
      const name   = BUYER_NAMES[code];
      const profit = byBuyer[code] ?? null;
      if (profit === null) return `⬜ *${name}:* —`;
      const emoji  = profit >= 0 ? '🟢' : '🔴';
      return `${emoji} *${name}:* ${fmtMoney(profit)}`;
    });

    const total     = Object.values(byBuyer).reduce((a, b) => a + b, 0);
    const totalLine = `\n💰 *Total: ${fmtMoney(total)}*`;

    const text = `📊 *Daily Profit — ${dateStr}*\n\n${lines.join('\n')}${totalLine}`;

    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });

    const data = await r.json();
    if (!data.ok) console.error('[telegram] Send failed:', data.description);
    else console.log('[telegram] Daily report sent for', yesterday);
  } catch (err) {
    console.error('[telegram] Error:', err.message);
  }
}

// Returns ms until 15:00 Europe/Madrid
function msUntilNext3pmMadrid() {
  const now  = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
  }).formatToParts(now);
  const h = parseInt(parts.find(p => p.type === 'hour').value);
  const m = parseInt(parts.find(p => p.type === 'minute').value);
  const s = parseInt(parts.find(p => p.type === 'second').value);
  let ms = ((15 - h) * 3600 - m * 60 - s) * 1000;
  if (ms <= 0) ms += 24 * 60 * 60 * 1000;
  return ms;
}

function scheduleTelegramReport() {
  function schedule() {
    const delay = msUntilNext3pmMadrid();
    console.log(`[telegram] Next report in ${Math.round(delay / 60000)} min (3:00 PM Madrid)`);
    setTimeout(async () => {
      await sendDailyReport();
      schedule(); // reschedule for next day
    }, delay);
  }
  schedule();
}

module.exports = { scheduleTelegramReport, sendDailyReport };
