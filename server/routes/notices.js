'use strict';
/** Notice board routes — latest announcements for students (archived hidden). */
const express = require('express');
const db = require('../db');

const router = express.Router();

/** GET /api/notices?category=College|Library&limit=N */
router.get('/', async (req, res, next) => {
  try {
    const { category, limit } = req.query;
    const params = [];
    let sql = 'SELECT * FROM notices WHERE archived = 0';
    if (category && ['College', 'Library'].includes(String(category))) {
      sql += ' AND category = ?';
      params.push(String(category));
    }
    sql += ' ORDER BY posted_on DESC, notice_id DESC';
    const lim = Number(limit) || 0;
    if (lim > 0) {
      sql += ' LIMIT ?';
      params.push(Math.min(lim, 100));
    }
    const notices = await db.all(sql, params);
    res.json({ notices });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
