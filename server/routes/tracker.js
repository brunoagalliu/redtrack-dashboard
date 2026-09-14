const express = require('express');
const router  = express.Router();
const { pool } = require('../db');
const { TABLES, TABLE_MAP } = require('../tracker-configs');

// ── DB init ───────────────────────────────────────────────────────────────────

const PG_TYPE = { text: 'TEXT', date: 'DATE', boolean: 'BOOLEAN DEFAULT FALSE', select: 'TEXT' };

async function initTrackerTables() {
  for (const t of TABLES) {
    const cols = t.fields.map(f => {
      const pgType = PG_TYPE[f.type] ?? 'TEXT';
      const notNull = f.required ? ' NOT NULL' : '';
      return `${f.key} ${pgType}${notNull}`;
    }).join(',\n      ');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${t.dbTable} (
        id         SERIAL PRIMARY KEY,
        ${cols},
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
  }
  console.log('[tracker] Tables ready');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pickFields(cfg, body) {
  const allowed = new Set(cfg.fields.map(f => f.key));
  return Object.fromEntries(Object.entries(body).filter(([k]) => allowed.has(k)));
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/meta', (_req, res) => res.json(TABLES));

router.get('/:key', async (req, res) => {
  const cfg = TABLE_MAP[req.params.key];
  if (!cfg) return res.status(404).json({ error: 'Unknown table' });

  const page     = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize) || 50));
  const search   = (req.query.search || '').trim();
  const sortKey  = req.query.sort;
  const dir      = req.query.dir === 'desc' ? 'DESC' : 'ASC';

  const validSort = cfg.fields.find(f => f.key === sortKey);
  const orderBy   = validSort ? `${sortKey} ${dir}` : 'id DESC';

  const values = [];
  let where = '';
  if (search) {
    values.push(`%${search}%`);
    where = `WHERE ${cfg.primaryField} ILIKE $1`;
  }

  const countRes = await pool.query(`SELECT COUNT(*) FROM ${cfg.dbTable} ${where}`, values);
  const total    = parseInt(countRes.rows[0].count);

  const offset = (page - 1) * pageSize;
  const dataValues = [...values, pageSize, offset];
  const dataRes = await pool.query(
    `SELECT * FROM ${cfg.dbTable} ${where} ORDER BY ${orderBy} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    dataValues
  );

  res.json({ rows: dataRes.rows, total, page, pageSize });
});

router.post('/:key', async (req, res) => {
  const cfg = TABLE_MAP[req.params.key];
  if (!cfg) return res.status(404).json({ error: 'Unknown table' });

  const data = pickFields(cfg, req.body);
  const required = cfg.fields.filter(f => f.required).map(f => f.key);
  for (const k of required) {
    if (!data[k]) return res.status(400).json({ error: `${k} is required` });
  }

  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No fields provided' });

  const keys   = Object.keys(data);
  const vals   = Object.values(data);
  const cols   = keys.join(', ');
  const params = keys.map((_, i) => `$${i + 1}`).join(', ');

  const result = await pool.query(
    `INSERT INTO ${cfg.dbTable} (${cols}) VALUES (${params}) RETURNING *`,
    vals
  );
  res.status(201).json(result.rows[0]);
});

router.put('/:key/:id', async (req, res) => {
  const cfg = TABLE_MAP[req.params.key];
  if (!cfg) return res.status(404).json({ error: 'Unknown table' });

  const data = pickFields(cfg, req.body);
  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No fields provided' });

  const keys   = Object.keys(data);
  const vals   = Object.values(data);
  const sets   = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');

  const result = await pool.query(
    `UPDATE ${cfg.dbTable} SET ${sets}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
    [...vals, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(result.rows[0]);
});

router.delete('/:key/:id', async (req, res) => {
  const cfg = TABLE_MAP[req.params.key];
  if (!cfg) return res.status(404).json({ error: 'Unknown table' });

  const result = await pool.query(`DELETE FROM ${cfg.dbTable} WHERE id = $1 RETURNING id`, [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
  res.sendStatus(204);
});

module.exports = { router, initTrackerTables };
