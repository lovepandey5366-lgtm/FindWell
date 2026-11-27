const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

// All routes in this file require administrator privileges
router.use(requireAdmin);

// GET /api/admin/stats - get dashboard counters & metrics
router.get('/stats', (req, res) => {
  try {
    const totalLostRow = db.prepare("SELECT COUNT(*) as c FROM items WHERE type = 'LOST'").get();
    const totalFoundRow = db.prepare("SELECT COUNT(*) as c FROM items WHERE type = 'FOUND'").get();
    const totalReturnedRow = db.prepare("SELECT COUNT(*) as c FROM items WHERE status = 'RETURNED'").get();
    const totalOpenRow = db.prepare("SELECT COUNT(*) as c FROM items WHERE status = 'OPEN'").get();
    const totalPendingClaimsRow = db.prepare("SELECT COUNT(*) as c FROM claims WHERE status = 'PENDING'").get();
    const totalUsersRow = db.prepare("SELECT COUNT(*) as c FROM users").get();

    const totalLost = totalLostRow ? totalLostRow.c : 0;
    const totalFound = totalFoundRow ? totalFoundRow.c : 0;
    const totalReturned = totalReturnedRow ? totalReturnedRow.c : 0;
    const totalOpen = totalOpenRow ? totalOpenRow.c : 0;
    const totalPendingClaims = totalPendingClaimsRow ? totalPendingClaimsRow.c : 0;
    const totalUsers = totalUsersRow ? totalUsersRow.c : 0;

    const totalItems = totalLost + totalFound;
    const recoveryRate = totalItems > 0 ? Math.round((totalReturned / totalItems) * 100) : 0;

    // Recent items reported
    const recentItems = db.prepare(`
      SELECT i.id, i.title, i.type, i.category, i.location, i.status, i.created_at, u.name as reporter_name
      FROM items i
      JOIN users u ON i.user_id = u.id
      ORDER BY i.created_at DESC
      LIMIT 8
    `).all();

    // Breakdown by category
    const categoryStats = db.prepare(`
      SELECT category, COUNT(*) as count
      FROM items
      GROUP BY category
      ORDER BY count DESC
    `).all();

    return res.json({
      stats: {
        totalLost,
        totalFound,
        totalReturned,
        totalOpen,
        totalPendingClaims,
        totalUsers,
        totalItems,
        recoveryRate
      },
      recentItems,
      categoryStats
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    return res.status(500).json({ error: 'Failed to retrieve admin statistics.' });
  }
});

// GET /api/admin/items - get all items for administration
router.get('/items', (req, res) => {
  try {
    const items = db.prepare(`
      SELECT 
        i.*,
        u.name as reporter_name,
        u.email as reporter_email,
        u.phone as reporter_phone,
        u.role_type as reporter_role,
        (SELECT COUNT(*) FROM claims WHERE item_id = i.id) as claims_count
      FROM items i
      JOIN users u ON i.user_id = u.id
      ORDER BY i.created_at DESC
    `).all();

    return res.json({ items });
  } catch (err) {
    console.error('Admin items error:', err);
    return res.status(500).json({ error: 'Failed to retrieve items list for admin.' });
  }
});

// GET /api/admin/claims - get all claims across the campus
router.get('/claims', (req, res) => {
  try {
    const claims = db.prepare(`
      SELECT 
        c.*,
        i.title as item_title,
        i.type as item_type,
        i.category as item_category,
        i.location as item_location,
        i.status as item_status,
        claimant.name as claimant_name,
        claimant.email as claimant_email,
        claimant.phone as claimant_phone,
        claimant.role_type as claimant_role,
        owner.name as owner_name,
        owner.email as owner_email
      FROM claims c
      JOIN items i ON c.item_id = i.id
      JOIN users claimant ON c.claimant_id = claimant.id
      JOIN users owner ON i.user_id = owner.id
      ORDER BY 
        CASE c.status WHEN 'PENDING' THEN 1 ELSE 2 END,
        c.created_at DESC
    `).all();

    return res.json({ claims });
  } catch (err) {
    console.error('Admin claims error:', err);
    return res.status(500).json({ error: 'Failed to retrieve claims for admin.' });
  }
});

module.exports = router;
