const express = require('express');
const { pool } = require('../db');
const router = express.Router();

// ── Partners (must be defined before /:list to avoid conflict) ───────────────

router.get('/partners', async (req, res) => {
  const { rows } = await pool.query(`SELECT id, alias, code FROM partners ORDER BY id`);
  res.json(rows);
});

router.post('/partners', async (req, res) => {
  const { alias } = req.body;
  if (!alias?.trim()) return res.status(400).json({ message: 'alias is required' });
  const upperAlias = alias.trim().toUpperCase();
  try {
    const { rows: existing } = await pool.query(`SELECT code FROM partners ORDER BY code DESC LIMIT 1`);
    const lastNum = existing.length ? parseInt(existing[0].code.replace('P', ''), 10) : 0;
    const code = `P${String(lastNum + 1).padStart(3, '0')}`;
    const { rows } = await pool.query(
      `INSERT INTO partners (alias, code) VALUES ($1, $2) RETURNING id, alias, code`,
      [upperAlias, code]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Already exists.' });
    throw err;
  }
});

router.delete('/partners/:id', async (req, res) => {
  await pool.query(`DELETE FROM partners WHERE id = $1`, [req.params.id]);
  res.sendStatus(204);
});

// ── Generic list items ────────────────────────────────────────────────────────

router.get('/:list', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, value FROM list_items WHERE list = $1 ORDER BY id`,
    [req.params.list]
  );
  res.json(rows);
});

router.post('/:list', async (req, res) => {
  const { list } = req.params;
  const { value } = req.body;
  if (!value?.trim()) return res.status(400).json({ message: 'value is required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO list_items (list, value) VALUES ($1, $2) RETURNING id, value`,
      [list, value.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Already exists.' });
    throw err;
  }
});

router.delete('/:list/:id', async (req, res) => {
  const { list, id } = req.params;
  await pool.query(`DELETE FROM list_items WHERE id = $1 AND list = $2`, [id, list]);
  res.sendStatus(204);
});

module.exports = router;
