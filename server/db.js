const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rt_sync_status (
      id           INT PRIMARY KEY DEFAULT 1,
      status       TEXT,
      processed    INT,
      total        INT,
      started_at   TIMESTAMP,
      completed_at TIMESTAMP,
      error        TEXT
    );

    CREATE TABLE IF NOT EXISTS rt_campaigns (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL,
      buyer      TEXT,
      vertical   TEXT,
      platform   TEXT,
      created_at TEXT,
      synced_at  TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rt_campaign_stats (
      campaign_id  TEXT    NOT NULL REFERENCES rt_campaigns(id) ON DELETE CASCADE,
      stat_date    DATE    NOT NULL,
      clicks       INTEGER NOT NULL DEFAULT 0,
      conversions  INTEGER NOT NULL DEFAULT 0,
      cost         NUMERIC(14,4) NOT NULL DEFAULT 0,
      revenue      NUMERIC(14,4) NOT NULL DEFAULT 0,
      profit       NUMERIC(14,4) NOT NULL DEFAULT 0,
      PRIMARY KEY (campaign_id, stat_date)
    );

    CREATE INDEX IF NOT EXISTS rt_campaign_stats_date ON rt_campaign_stats(stat_date);
    CREATE INDEX IF NOT EXISTS rt_campaigns_buyer     ON rt_campaigns(buyer);
  `);

  // Migrate existing DBs that pre-date the vertical/platform/route/carrier/data_partner columns
  await pool.query(`
    ALTER TABLE rt_campaigns ADD COLUMN IF NOT EXISTS vertical     TEXT;
    ALTER TABLE rt_campaigns ADD COLUMN IF NOT EXISTS platform     TEXT;
    ALTER TABLE rt_campaigns ADD COLUMN IF NOT EXISTS route        TEXT;
    ALTER TABLE rt_campaigns ADD COLUMN IF NOT EXISTS carrier      TEXT;
    ALTER TABLE rt_campaigns ADD COLUMN IF NOT EXISTS data_partner TEXT;
  `);

  // Indexes after columns are guaranteed to exist
  await pool.query(`
    CREATE INDEX IF NOT EXISTS rt_campaigns_vertical     ON rt_campaigns(vertical);
    CREATE INDEX IF NOT EXISTS rt_campaigns_route        ON rt_campaigns(route);
    CREATE INDEX IF NOT EXISTS rt_campaigns_carrier      ON rt_campaigns(carrier);
    CREATE INDEX IF NOT EXISTS rt_campaigns_data_partner ON rt_campaigns(data_partner);
  `);

  // Offer analytics tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rt_offers (
      id   TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rt_campaign_offers (
      campaign_id TEXT NOT NULL REFERENCES rt_campaigns(id) ON DELETE CASCADE,
      offer_id    TEXT NOT NULL REFERENCES rt_offers(id)    ON DELETE CASCADE,
      PRIMARY KEY (campaign_id, offer_id)
    );

    CREATE TABLE IF NOT EXISTS rt_offer_stats (
      offer_id    TEXT         NOT NULL REFERENCES rt_offers(id)    ON DELETE CASCADE,
      campaign_id TEXT         NOT NULL REFERENCES rt_campaigns(id) ON DELETE CASCADE,
      stat_date   DATE         NOT NULL,
      clicks      INTEGER      NOT NULL DEFAULT 0,
      conversions INTEGER      NOT NULL DEFAULT 0,
      cost        NUMERIC(14,4) NOT NULL DEFAULT 0,
      revenue     NUMERIC(14,4) NOT NULL DEFAULT 0,
      profit      NUMERIC(14,4) NOT NULL DEFAULT 0,
      PRIMARY KEY (offer_id, campaign_id, stat_date)
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS rt_offer_stats_date     ON rt_offer_stats(stat_date);
    CREATE INDEX IF NOT EXISTS rt_offer_stats_offer    ON rt_offer_stats(offer_id);
    CREATE INDEX IF NOT EXISTS rt_offer_stats_campaign ON rt_offer_stats(campaign_id);
  `);

  // AI recommendations cache
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rt_ai_report (
      id           INT PRIMARY KEY DEFAULT 1,
      generated_at TIMESTAMP,
      period_days  INT,
      content      TEXT,
      data_json    JSONB
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS list_items (
      id   SERIAL PRIMARY KEY,
      list TEXT NOT NULL,
      value TEXT NOT NULL,
      UNIQUE (list, value)
    );

    CREATE TABLE IF NOT EXISTS partners (
      id    SERIAL PRIMARY KEY,
      alias TEXT NOT NULL UNIQUE,
      code  TEXT NOT NULL UNIQUE
    );
  `);

  // Seed defaults if tables are empty
  const { rows: existing } = await pool.query(`SELECT COUNT(*) FROM list_items`);
  if (parseInt(existing[0].count) === 0) {
    const defaults = [
      ['provider', 'TK'],
      ['provider', 'Pineapple'],
      ['provider', 'CM'],
      ['provider', 'InfoBip'],
      ['provider', 'Mr.Messaging'],
      ['provider', 'Campaigner'],
      ['provider', 'SMS Gateway'],
      ['provider', 'Tells'],
      ['provider', 'IT Decision'],
      ['provider', 'BSG'],
      ['route', 'USMS'],
      ['route', 'ltsauto'],
      ['route', 'cloudstorage4u'],
      ['route', 'iphonetechzone'],
      ['route', 'maxtechie'],
      ['route', 'triallooks'],
      ['route', 'dominantwire'],
      ['vertical', 'CLOUD'],
      ['vertical', 'AUTO'],
      ['vertical', 'AV'],
      ['vertical', 'DEBT'],
      ['vertical', 'CLINICAL'],
      ['vertical', 'PAYDAY'],
      ['vertical', 'GLP1'],
    ];
    for (const [list, value] of defaults) {
      await pool.query(
        `INSERT INTO list_items (list, value) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [list, value]
      );
    }
  }

  // Always ensure these items exist (runs on every startup, safe to re-run)
  for (const v of ['PAYDAY', 'GLP1']) {
    await pool.query(
      `INSERT INTO list_items (list, value) VALUES ('vertical', $1) ON CONFLICT DO NOTHING`,
      [v]
    );
  }
  for (const r of ['USMS', 'Ranhog', 'TechStar', 'Internal']) {
    await pool.query(
      `INSERT INTO list_items (list, value) VALUES ('route', $1) ON CONFLICT DO NOTHING`,
      [r]
    );
  }

  const { rows: existingPartners } = await pool.query(`SELECT COUNT(*) FROM partners`);
  if (parseInt(existingPartners[0].count) === 0) {
    const defaults = [
      ['JC', 'P001'],
      ['AVANTO', 'P002'],
      ['LM', 'P003'],
      ['UPSTART', 'P004'],
      ['KOINO', 'P005'],
    ];
    for (const [alias, code] of defaults) {
      await pool.query(
        `INSERT INTO partners (alias, code) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [alias, code]
      );
    }
  }

  // If the server restarted mid-sync the DB row will be stuck at status='running'.
  // Clear it so the UI doesn't show a phantom running sync on next page load.
  await pool.query(`
    UPDATE rt_sync_status SET status = 'interrupted', error = 'Server restarted during sync'
    WHERE id = 1 AND status = 'running'
  `);
}

module.exports = { pool, init };
