const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

// All routes in this router require administrator privileges
router.use(requireAdmin);

// ==========================================
// 1. STATS & ANALYTICS
// ==========================================

// GET /api/admin/stats
router.get('/stats', (req, res) => {
  try {
    const totalLostRow = db.prepare("SELECT COUNT(*) as c FROM items WHERE type = 'LOST'").get();
    const totalFoundRow = db.prepare("SELECT COUNT(*) as c FROM items WHERE type = 'FOUND'").get();
    const totalReturnedRow = db.prepare("SELECT COUNT(*) as c FROM items WHERE status = 'RETURNED'").get();
    const totalOpenRow = db.prepare("SELECT COUNT(*) as c FROM items WHERE status = 'OPEN'").get();
    const totalPendingClaimsRow = db.prepare("SELECT COUNT(*) as c FROM claims WHERE status = 'PENDING'").get();
    const totalUsersRow = db.prepare("SELECT COUNT(*) as c FROM users").get();
    const totalLocationsRow = db.prepare("SELECT COUNT(*) as c FROM locations").get();

    const totalLost = totalLostRow ? totalLostRow.c : 0;
    const totalFound = totalFoundRow ? totalFoundRow.c : 0;
    const totalReturned = totalReturnedRow ? totalReturnedRow.c : 0;
    const totalOpen = totalOpenRow ? totalOpenRow.c : 0;
    const totalPendingClaims = totalPendingClaimsRow ? totalPendingClaimsRow.c : 0;
    const totalUsers = totalUsersRow ? totalUsersRow.c : 0;
    const totalLocations = totalLocationsRow ? totalLocationsRow.c : 0;

    const totalItems = totalLost + totalFound;
    const recoveryRate = totalItems > 0 ? Math.round((totalReturned / totalItems) * 100) : 0;

    const recentItems = db.prepare(`
      SELECT i.id, i.title, i.type, i.category, i.location, i.status, i.created_at, u.name as reporter_name
      FROM items i
      JOIN users u ON i.user_id = u.id
      ORDER BY i.created_at DESC
      LIMIT 8
    `).all();

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
        totalLocations,
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

// ==========================================
// 2. MEMBERS / USERS MANAGEMENT
// ==========================================

// GET /api/admin/users - list all campus members
router.get('/users', (req, res) => {
  try {
    const users = db.prepare(`
      SELECT 
        u.id,
        u.name,
        u.email,
        u.phone,
        u.role_type,
        u.is_admin,
        u.created_at,
        (SELECT COUNT(*) FROM items WHERE user_id = u.id) as items_count,
        (SELECT COUNT(*) FROM claims WHERE claimant_id = u.id) as claims_count
      FROM users u
      ORDER BY u.created_at DESC
    `).all();

    return res.json({ users });
  } catch (err) {
    console.error('Admin users error:', err);
    return res.status(500).json({ error: 'Failed to retrieve members list.' });
  }
});

// GET /api/admin/users/:id - get single user details
router.get('/users/:id', (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const user = db.prepare(`
      SELECT id, name, email, phone, role_type, is_admin, created_at
      FROM users WHERE id = ?
    `).get(userId);

    if (!user) {
      return res.status(404).json({ error: 'Member not found.' });
    }

    return res.json({ user });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve member details.' });
  }
});

// PUT /api/admin/users/:id - update member details & rights
router.put('/users/:id', (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    if (!existing) {
      return res.status(404).json({ error: 'Member not found.' });
    }

    const { name, email, phone, role_type, is_admin, new_password } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters long.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email.trim())) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check if email taken by another user
    const duplicate = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(cleanEmail, userId);
    if (duplicate) {
      return res.status(400).json({ error: 'Another member already uses this email address.' });
    }

    const allowedRoles = ['student', 'faculty', 'staff'];
    const cleanRole = role_type && allowedRoles.includes(role_type.toLowerCase())
      ? role_type.toLowerCase()
      : existing.role_type;

    const adminFlag = is_admin === 1 || is_admin === true || is_admin === '1' ? 1 : 0;
    const cleanPhone = phone !== undefined ? (phone ? phone.trim() : null) : existing.phone;

    // Optional password reset by admin
    let passwordHash = existing.password_hash;
    if (new_password && typeof new_password === 'string' && new_password.trim().length >= 6) {
      passwordHash = bcrypt.hashSync(new_password.trim(), 10);
    }

    db.prepare(`
      UPDATE users SET
        name = ?,
        email = ?,
        phone = ?,
        role_type = ?,
        is_admin = ?,
        password_hash = ?
      WHERE id = ?
    `).run(name.trim(), cleanEmail, cleanPhone, cleanRole, adminFlag, passwordHash, userId);

    const updated = db.prepare('SELECT id, name, email, phone, role_type, is_admin, created_at FROM users WHERE id = ?').get(userId);

    return res.json({
      message: `Member "${updated.name}" updated successfully.`,
      user: updated
    });
  } catch (err) {
    console.error('Update member error:', err);
    return res.status(500).json({ error: 'Failed to update member.' });
  }
});

// DELETE /api/admin/users/:id - remove member
router.delete('/users/:id', (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);

    // Prevent deleting own admin account
    if (req.user.id === userId) {
      return res.status(400).json({ error: 'You cannot delete your own logged-in administrator account.' });
    }

    const user = db.prepare('SELECT id, name FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'Member not found.' });
    }

    // Cascades items, claims, notifications
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    return res.json({ message: `Member "${user.name}" has been removed.` });
  } catch (err) {
    console.error('Delete member error:', err);
    return res.status(500).json({ error: 'Failed to delete member.' });
  }
});

// ==========================================
// 3. CAMPUS LOCATIONS MANAGEMENT
// ==========================================

// GET /api/admin/locations - list all locations with usage count
router.get('/locations', (req, res) => {
  try {
    const locations = db.prepare(`
      SELECT 
        l.*,
        (SELECT COUNT(*) FROM items WHERE location = l.name) as items_count
      FROM locations l
      ORDER BY l.name ASC
    `).all();

    return res.json({ locations });
  } catch (err) {
    console.error('Admin locations error:', err);
    return res.status(500).json({ error: 'Failed to retrieve campus locations.' });
  }
});

// POST /api/admin/locations - add new location
router.post('/locations', (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Location name must be at least 2 characters.' });
    }

    const cleanName = name.trim();
    const cleanDesc = description ? description.trim() : null;

    const existing = db.prepare('SELECT id FROM locations WHERE LOWER(name) = LOWER(?)').get(cleanName);
    if (existing) {
      return res.status(400).json({ error: 'A location with this name already exists.' });
    }

    const stmt = db.prepare('INSERT INTO locations (name, description, is_active) VALUES (?, ?, 1)');
    const result = stmt.run(cleanName, cleanDesc);
    const newId = Number(result.lastInsertRowid);

    const created = db.prepare('SELECT * FROM locations WHERE id = ?').get(newId);

    return res.status(201).json({
      message: `Campus location "${cleanName}" added successfully.`,
      location: created
    });
  } catch (err) {
    console.error('Create location error:', err);
    return res.status(500).json({ error: 'Failed to add campus location.' });
  }
});

// PUT /api/admin/locations/:id - update location
router.put('/locations/:id', (req, res) => {
  try {
    const locId = parseInt(req.params.id, 10);
    const existing = db.prepare('SELECT * FROM locations WHERE id = ?').get(locId);

    if (!existing) {
      return res.status(404).json({ error: 'Location not found.' });
    }

    const { name, description, is_active } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Location name must be at least 2 characters.' });
    }

    const cleanName = name.trim();
    const cleanDesc = description !== undefined ? (description ? description.trim() : null) : existing.description;
    const activeFlag = is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active;

    // Check duplicate name
    const duplicate = db.prepare('SELECT id FROM locations WHERE LOWER(name) = LOWER(?) AND id != ?').get(cleanName, locId);
    if (duplicate) {
      return res.status(400).json({ error: 'Another location already has this name.' });
    }

    // If name changed, update existing items that had old name
    if (cleanName !== existing.name) {
      db.prepare('UPDATE items SET location = ? WHERE location = ?').run(cleanName, existing.name);
    }

    db.prepare('UPDATE locations SET name = ?, description = ?, is_active = ? WHERE id = ?').run(
      cleanName,
      cleanDesc,
      activeFlag,
      locId
    );

    const updated = db.prepare('SELECT * FROM locations WHERE id = ?').get(locId);

    return res.json({
      message: `Location "${cleanName}" updated successfully.`,
      location: updated
    });
  } catch (err) {
    console.error('Update location error:', err);
    return res.status(500).json({ error: 'Failed to update location.' });
  }
});

// DELETE /api/admin/locations/:id - delete location
router.delete('/locations/:id', (req, res) => {
  try {
    const locId = parseInt(req.params.id, 10);
    const existing = db.prepare('SELECT * FROM locations WHERE id = ?').get(locId);

    if (!existing) {
      return res.status(404).json({ error: 'Location not found.' });
    }

    // Check if items are tied to this location
    const countRow = db.prepare('SELECT COUNT(*) as c FROM items WHERE location = ?').get(existing.name);
    const itemsCount = countRow ? countRow.c : 0;

    if (itemsCount > 0) {
      // Deactivate instead of deleting to preserve history, or allow force delete
      db.prepare('UPDATE locations SET is_active = 0 WHERE id = ?').run(locId);
      return res.json({
        message: `Location "${existing.name}" is associated with ${itemsCount} items. It has been deactivated instead of deleted.`
      });
    }

    db.prepare('DELETE FROM locations WHERE id = ?').run(locId);

    return res.json({ message: `Location "${existing.name}" deleted permanently.` });
  } catch (err) {
    console.error('Delete location error:', err);
    return res.status(500).json({ error: 'Failed to delete location.' });
  }
});

// ==========================================
// 4. ITEMS & CLAIMS MANAGEMENT
// ==========================================

// GET /api/admin/items
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

// GET /api/admin/claims
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
