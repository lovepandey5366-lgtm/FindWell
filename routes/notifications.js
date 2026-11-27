const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateUser } = require('../middleware/auth');

// GET /api/notifications - get current user's notifications
router.get('/', authenticateUser, (req, res) => {
  try {
    const notifications = db.prepare(`
      SELECT * FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(req.user.id);

    const unreadRow = db.prepare(`
      SELECT COUNT(*) as unread FROM notifications
      WHERE user_id = ? AND is_read = 0
    `).get(req.user.id);

    return res.json({
      notifications,
      unreadCount: unreadRow ? unreadRow.unread : 0
    });
  } catch (err) {
    console.error('Fetch notifications error:', err);
    return res.status(500).json({ error: 'Failed to retrieve notifications.' });
  }
});

// PUT /api/notifications/:id/read - mark single notification as read
router.put('/:id/read', authenticateUser, (req, res) => {
  try {
    const notifId = parseInt(req.params.id, 10);
    const notif = db.prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?').get(notifId, req.user.id);

    if (!notif) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(notifId);

    return res.json({ message: 'Notification marked as read.' });
  } catch (err) {
    console.error('Mark read error:', err);
    return res.status(500).json({ error: 'Failed to mark notification as read.' });
  }
});

// PUT /api/notifications/read-all - mark all user notifications as read
router.put('/read-all', authenticateUser, (req, res) => {
  try {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
    return res.json({ message: 'All notifications marked as read.' });
  } catch (err) {
    console.error('Mark all read error:', err);
    return res.status(500).json({ error: 'Failed to mark notifications as read.' });
  }
});

module.exports = router;
