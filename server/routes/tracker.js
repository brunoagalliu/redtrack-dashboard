const express = require('express');
const router  = express.Router();
const { pool } = require('../db');
const { TABLES, TABLE_MAP } = require('../tracker-configs');
const { broadcast } = require('../ws');

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
        version    INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE ${t.dbTable} ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1`);
  }
  // Change log table (shared across all tracker tables)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dt_change_log (
      id          SERIAL PRIMARY KEY,
      table_key   TEXT NOT NULL,
      row_id      INTEGER NOT NULL,
      before_data JSONB,
      after_data  JSONB,
      changed_at  TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS dt_change_log_lookup ON dt_change_log (table_key, row_id, changed_at DESC)`);
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
  try {
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:key', async (req, res) => {
  try {
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
    broadcast({ type: 'tracker', key: req.params.key, action: 'create', row: result.rows[0] });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Batch insert — accepts { rows: [...] }, returns { inserted, errors }
router.post('/:key/batch', async (req, res) => {
  try {
    const cfg = TABLE_MAP[req.params.key];
    if (!cfg) return res.status(404).json({ error: 'Unknown table' });

    const incoming = req.body.rows;
    if (!Array.isArray(incoming) || incoming.length === 0)
      return res.status(400).json({ error: 'rows must be a non-empty array' });

    const allRows = incoming.map(r => pickFields(cfg, r)).filter(r => Object.keys(r).length > 0);
    if (allRows.length === 0) return res.status(400).json({ error: 'No valid fields in any row' });

    const cols = Object.keys(allRows[0]);
    const colSql = cols.join(', ');

    const vals = [];
    const valueClauses = allRows.map(row => {
      const rowVals = cols.map(c => row[c] ?? null);
      const placeholders = rowVals.map((_, i) => `$${vals.length + i + 1}`).join(', ');
      vals.push(...rowVals);
      return `(${placeholders})`;
    });

    const result = await pool.query(
      `INSERT INTO ${cfg.dbTable} (${colSql}) VALUES ${valueClauses.join(', ')} RETURNING id`,
      vals
    );
    res.status(201).json({ inserted: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:key/:id', async (req, res) => {
  try {
    const cfg = TABLE_MAP[req.params.key];
    if (!cfg) return res.status(404).json({ error: 'Unknown table' });

    const clientVersion = req.body.__version != null ? Number(req.body.__version) : null;

    // Snapshot before state for history log
    const beforeRes = await pool.query(`SELECT * FROM ${cfg.dbTable} WHERE id = $1`, [req.params.id]);
    const beforeRow = beforeRes.rows[0] ?? null;

    const data = pickFields(cfg, req.body); // strips __version and unknown fields
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No fields provided' });

    const keys = Object.keys(data);
    const vals = Object.values(data);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');

    const whereParams = [...vals, req.params.id];
    let whereSql = `WHERE id = $${keys.length + 1}`;

    if (clientVersion !== null) {
      whereSql += ` AND version = $${keys.length + 2}`;
      whereParams.push(clientVersion);
    }

    const result = await pool.query(
      `UPDATE ${cfg.dbTable} SET ${sets}, version = version + 1, updated_at = NOW() ${whereSql} RETURNING *`,
      whereParams
    );

    if (!result.rows.length) {
      if (clientVersion !== null) {
        // Version mismatch — fetch current row for conflict response
        const current = await pool.query(`SELECT * FROM ${cfg.dbTable} WHERE id = $1`, [req.params.id]);
        if (current.rows.length) {
          return res.status(409).json({ error: 'conflict', current: current.rows[0] });
        }
      }
      return res.status(404).json({ error: 'Not found' });
    }

    const afterRow = result.rows[0];

    pool.query(
      `INSERT INTO dt_change_log (table_key, row_id, before_data, after_data) VALUES ($1, $2, $3, $4)`,
      [req.params.key, req.params.id, JSON.stringify(beforeRow), JSON.stringify(afterRow)]
    ).catch(e => console.error('[tracker] history log:', e.message));

    broadcast({ type: 'tracker', key: req.params.key, action: 'update', row: afterRow });
    res.json(afterRow);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Row change history
router.get('/:key/:id/history', async (req, res) => {
  try {
    const cfg = TABLE_MAP[req.params.key];
    if (!cfg) return res.status(404).json({ error: 'Unknown table' });
    const result = await pool.query(
      `SELECT id, before_data, after_data, changed_at FROM dt_change_log
       WHERE table_key = $1 AND row_id = $2
       ORDER BY changed_at DESC LIMIT 50`,
      [req.params.key, req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Restore row to a before/after snapshot
router.post('/:key/:id/restore', async (req, res) => {
  try {
    const cfg = TABLE_MAP[req.params.key];
    if (!cfg) return res.status(404).json({ error: 'Unknown table' });

    const snapshot = req.body.data;
    if (!snapshot) return res.status(400).json({ error: 'data required' });

    const data = pickFields(cfg, snapshot);
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No fields in snapshot' });

    const keys = Object.keys(data);
    const vals = Object.values(data);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');

    const beforeRes = await pool.query(`SELECT * FROM ${cfg.dbTable} WHERE id = $1`, [req.params.id]);
    const result = await pool.query(
      `UPDATE ${cfg.dbTable} SET ${sets}, version = version + 1, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
      [...vals, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });

    const afterRow = result.rows[0];
    pool.query(
      `INSERT INTO dt_change_log (table_key, row_id, before_data, after_data) VALUES ($1, $2, $3, $4)`,
      [req.params.key, req.params.id, JSON.stringify(beforeRes.rows[0] ?? null), JSON.stringify(afterRow)]
    ).catch(e => console.error('[tracker] history log:', e.message));

    broadcast({ type: 'tracker', key: req.params.key, action: 'update', row: afterRow });
    res.json(afterRow);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk delete by IDs
router.delete('/:key/rows', async (req, res) => {
  try {
    const cfg = TABLE_MAP[req.params.key];
    if (!cfg) return res.status(404).json({ error: 'Unknown table' });

    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ error: 'ids must be a non-empty array' });

    const params = ids.map((_, i) => `$${i + 1}`).join(', ');
    const result = await pool.query(
      `DELETE FROM ${cfg.dbTable} WHERE id IN (${params}) RETURNING id`, ids
    );
    result.rows.forEach(r =>
      broadcast({ type: 'tracker', key: req.params.key, action: 'delete', id: String(r.id) })
    );
    res.json({ deleted: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Truncate all rows — import utility, requires auth
router.delete('/:key', async (req, res) => {
  try {
    const cfg = TABLE_MAP[req.params.key];
    if (!cfg) return res.status(404).json({ error: 'Unknown table' });
    await pool.query(`TRUNCATE TABLE ${cfg.dbTable} RESTART IDENTITY`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:key/:id', async (req, res) => {
  try {
    const cfg = TABLE_MAP[req.params.key];
    if (!cfg) return res.status(404).json({ error: 'Unknown table' });

    const result = await pool.query(`DELETE FROM ${cfg.dbTable} WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    broadcast({ type: 'tracker', key: req.params.key, action: 'delete', id: req.params.id });
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, initTrackerTables };
