const express = require('express');
const { pool } = require('../db');
const router = express.Router();

// GET /api/lists/:list  — fetch all items for a list (providers, routes, verticals)
router.get('/:list', async (req, res) => {
  const { list } = req.params;
  const { rows } = await pool.query(
    `SELECT id, value FROM list_items WHERE list = $1 ORDER BY id`,
    [list]
  );
  res.json(rows);
});

// POST /api/lists/:list  — add a new item
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

// DELETE /api/lists/:list/:id
router.delete('/:list/:id', async (req, res) => {
  const { list, id } = req.params;
  await pool.query(`DELETE FROM list_items WHERE id = $1 AND list = $2`, [id, list]);
  res.sendStatus(204);
});

// GET /api/lists/partners/all
router.get('/partners/all', async (req, res) => {
  const { rows } = await pool.query(`SELECT id, alias, code FROM partners ORDER BY id`);
  res.json(rows);
});

// POST /api/lists/partners
router.post('/partners', async (req, res) => {
  const { alias } = req.body;
  if (!alias?.trim()) return res.status(400).json({ message: 'alias is required' });
  const upperAlias = alias.trim().toUpperCase();
  try {
    // Auto-generate next P00X code
    const { rows: existing } = await pool.query(`SELECT code FROM partners ORDER BY code DESC LIMIT 1`);
    const lastNum = existing.length
      ? parseInt(existing[0].code.replace('P', ''), 10)
      : 0;
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

// DELETE /api/lists/partners/:id
router.delete('/partners/:id', async (req, res) => {
  await pool.query(`DELETE FROM partners WHERE id = $1`, [req.params.id]);
  res.sendStatus(204);
});

module.exports = router;
