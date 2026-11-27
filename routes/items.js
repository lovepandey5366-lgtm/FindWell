const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { authenticateUser, optionalUser } = require('../middleware/auth');
const { handleUpload } = require('../middleware/upload');
const { findMatchesForItem, checkAndNotifyMatches } = require('../utils/matcher');

const VALID_CATEGORIES = [
  'Electronics',
  'Books',
  'ID/Cards',
  'Wallet/Bags',
  'Keys',
  'Clothing',
  'Accessories',
  'Other'
];

// GET /api/items - list items with filtering & pagination
router.get('/', optionalUser, (req, res) => {
  try {
    const {
      q,
      type,
      category,
      location,
      status,
      from,
      to,
      page = 1,
      limit = 9,
      sort = 'newest'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 9));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    // Filter by type
    if (type && ['LOST', 'FOUND'].includes(type.toUpperCase())) {
      conditions.push('i.type = ?');
      params.push(type.toUpperCase());
    }

    // Filter by category
    if (category && category !== 'All') {
      conditions.push('i.category = ?');
      params.push(category);
    }

    // Filter by location
    if (location && location !== 'All') {
      conditions.push('i.location = ?');
      params.push(location);
    }

    // Filter by status
    if (status && status !== 'All') {
      conditions.push('i.status = ?');
      params.push(status.toUpperCase());
    }

    // Filter by date range
    if (from) {
      conditions.push('i.date_event >= ?');
      params.push(from);
    }
    if (to) {
      conditions.push('i.date_event <= ?');
      params.push(to);
    }

    // Search keyword
    if (q && q.trim()) {
      const searchTerm = `%${q.trim()}%`;
      conditions.push('(i.title LIKE ? OR i.description LIKE ? OR i.location LIKE ?)');
      params.push(searchTerm, searchTerm, searchTerm);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderBy = sort === 'oldest' ? 'ORDER BY i.created_at ASC' : 'ORDER BY i.created_at DESC';

    // Count total matching items
    const countQuery = `SELECT COUNT(*) as total FROM items i ${whereClause}`;
    const totalRow = db.prepare(countQuery).get(...params);
    const total = totalRow ? totalRow.total : 0;
    const totalPages = Math.ceil(total / limitNum) || 1;

    // Fetch items with reporter info
    const dataQuery = `
      SELECT 
        i.*,
        u.name as reporter_name,
        u.role_type as reporter_role
      FROM items i
      JOIN users u ON i.user_id = u.id
      ${whereClause}
      ${orderBy}
      LIMIT ? OFFSET ?
    `;

    const items = db.prepare(dataQuery).all(...params, limitNum, offset);

    return res.json({
      items,
      total,
      page: pageNum,
      totalPages,
      limit: limitNum
    });
  } catch (err) {
    console.error('Fetch items error:', err);
    return res.status(500).json({ error: 'Failed to retrieve items. Please try again.' });
  }
});

// GET /api/items/:id - get single item details
router.get('/:id', optionalUser, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ error: 'Invalid item ID.' });
    }

    const item = db.prepare(`
      SELECT 
        i.*,
        u.name as reporter_name,
        u.email as reporter_email,
        u.phone as reporter_phone,
        u.role_type as reporter_role
      FROM items i
      JOIN users u ON i.user_id = u.id
      WHERE i.id = ?
    `).get(id);

    if (!item) {
      return res.status(404).json({ error: 'Item not found.' });
    }

    // Check claims on this item
    const isOwner = req.user && req.user.id === item.user_id;
    const isAdmin = req.user && req.user.is_admin === 1;

    let claims = [];
    if (isOwner || isAdmin) {
      claims = db.prepare(`
        SELECT c.*, u.name as claimant_name, u.email as claimant_email, u.phone as claimant_phone, u.role_type as claimant_role
        FROM claims c
        JOIN users u ON c.claimant_id = u.id
        WHERE c.item_id = ?
        ORDER BY c.created_at DESC
      `).all(id);
    }

    let userClaim = null;
    if (req.user) {
      userClaim = db.prepare(`
        SELECT * FROM claims WHERE item_id = ? AND claimant_id = ?
      `).get(id, req.user.id);
    }

    // Filter contact info if contact preference is 'System Claims Only' and requester is neither owner nor admin
    const safeItem = { ...item };
    if (!isOwner && !isAdmin && safeItem.contact_pref === 'System Claims Only') {
      delete safeItem.reporter_email;
      delete safeItem.reporter_phone;
    }

    return res.json({
      item: safeItem,
      claims,
      userClaim,
      isOwner,
      isAdmin
    });
  } catch (err) {
    console.error('Get item error:', err);
    return res.status(500).json({ error: 'Failed to retrieve item details.' });
  }
});

// GET /api/items/:id/matches - get smart matching candidates
router.get('/:id/matches', optionalUser, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ error: 'Invalid item ID.' });
    }

    const matches = findMatchesForItem(id, 6);
    return res.json({ matches });
  } catch (err) {
    console.error('Fetch matches error:', err);
    return res.status(500).json({ error: 'Failed to find possible matches.' });
  }
});

// POST /api/items - report a new lost/found item
router.post('/', authenticateUser, handleUpload('image'), (req, res) => {
  try {
    const {
      type,
      title,
      description,
      category,
      location,
      date_event,
      contact_pref = 'Email'
    } = req.body;

    if (!type || !['LOST', 'FOUND'].includes(type.toUpperCase())) {
      return res.status(400).json({ error: 'Report type must be LOST or FOUND.' });
    }

    if (!title || typeof title !== 'string' || title.trim().length < 3) {
      return res.status(400).json({ error: 'Title must be at least 3 characters long.' });
    }

    if (!description || typeof description !== 'string' || description.trim().length < 5) {
      return res.status(400).json({ error: 'Description must be at least 5 characters long.' });
    }

    if (!category || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Category must be one of: ${VALID_CATEGORIES.join(', ')}.` });
    }

    if (!location || typeof location !== 'string' || !location.trim()) {
      return res.status(400).json({ error: 'Campus location is required.' });
    }

    if (!date_event || isNaN(Date.parse(date_event))) {
      return res.status(400).json({ error: 'A valid date of incident is required.' });
    }

    const cleanContactPref = ['Email', 'Phone', 'System Claims Only'].includes(contact_pref)
      ? contact_pref
      : 'Email';

    let imagePath = null;
    if (req.file) {
      imagePath = `/uploads/${req.file.filename}`;
    }

    const insertStmt = db.prepare(`
      INSERT INTO items (
        user_id, type, title, description, category, location, date_event, image_path, contact_pref, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')
    `);

    const result = insertStmt.run(
      req.user.id,
      type.toUpperCase(),
      title.trim(),
      description.trim(),
      category,
      location.trim(),
      date_event,
      imagePath,
      cleanContactPref
    );

    const newItemId = Number(result.lastInsertRowid);
    const createdItem = db.prepare('SELECT * FROM items WHERE id = ?').get(newItemId);

    // Trigger smart matching and automatic notifications in the background
    try {
      checkAndNotifyMatches(newItemId);
    } catch (matchErr) {
      console.error('Smart match evaluation error:', matchErr);
    }

    return res.status(201).json({
      message: `Your ${type.toUpperCase()} item has been reported successfully.`,
      item: createdItem
    });
  } catch (err) {
    console.error('Report item error:', err);
    return res.status(500).json({ error: 'Failed to report item. Please try again.' });
  }
});

// PUT /api/items/:id - update an existing item
router.put('/:id', authenticateUser, handleUpload('image'), (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(id);

    if (!existing) {
      return res.status(404).json({ error: 'Item not found.' });
    }

    const isOwner = req.user.id === existing.user_id;
    const isAdmin = req.user.is_admin === 1;

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'You are not authorized to update this item.' });
    }

    const {
      title,
      description,
      category,
      location,
      date_event,
      contact_pref,
      status
    } = req.body;

    const newTitle = title ? title.trim() : existing.title;
    const newDesc = description ? description.trim() : existing.description;
    const newCat = category && VALID_CATEGORIES.includes(category) ? category : existing.category;
    const newLoc = location ? location.trim() : existing.location;
    const newDate = date_event && !isNaN(Date.parse(date_event)) ? date_event : existing.date_event;
    const newContactPref = contact_pref && ['Email', 'Phone', 'System Claims Only'].includes(contact_pref)
      ? contact_pref
      : existing.contact_pref;

    const allowedStatuses = ['OPEN', 'CLAIM_PENDING', 'RETURNED', 'CLOSED'];
    const newStatus = status && allowedStatuses.includes(status.toUpperCase())
      ? status.toUpperCase()
      : existing.status;

    let imagePath = existing.image_path;
    if (req.file) {
      // Remove old image if replaced
      if (existing.image_path) {
        const oldFile = path.join(__dirname, '..', existing.image_path);
        if (fs.existsSync(oldFile)) {
          fs.unlinkSync(oldFile);
        }
      }
      imagePath = `/uploads/${req.file.filename}`;
    }

    db.prepare(`
      UPDATE items SET
        title = ?,
        description = ?,
        category = ?,
        location = ?,
        date_event = ?,
        image_path = ?,
        contact_pref = ?,
        status = ?
      WHERE id = ?
    `).run(
      newTitle,
      newDesc,
      newCat,
      newLoc,
      newDate,
      imagePath,
      newContactPref,
      newStatus,
      id
    );

    // If marked RETURNED or CLOSED, resolve notifications or notify claimant
    if (newStatus === 'RETURNED' && existing.status !== 'RETURNED') {
      db.prepare(`
        INSERT INTO notifications (user_id, message, link, is_read)
        VALUES (?, ?, ?, 0)
      `).run(
        existing.user_id,
        `Item status updated: Your report '${newTitle}' has been marked as RETURNED.`,
        `/item.html?id=${id}`
      );
    }

    const updated = db.prepare('SELECT * FROM items WHERE id = ?').get(id);

    return res.json({
      message: 'Item updated successfully.',
      item: updated
    });
  } catch (err) {
    console.error('Update item error:', err);
    return res.status(500).json({ error: 'Failed to update item.' });
  }
});

// DELETE /api/items/:id - delete an item
router.delete('/:id', authenticateUser, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(id);

    if (!existing) {
      return res.status(404).json({ error: 'Item not found.' });
    }

    const isOwner = req.user.id === existing.user_id;
    const isAdmin = req.user.is_admin === 1;

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'You are not authorized to delete this item.' });
    }

    // Delete image file if present
    if (existing.image_path) {
      const filePath = path.join(__dirname, '..', existing.image_path);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.warn('Could not remove image file:', e.message);
        }
      }
    }

    // Delete item (foreign keys cascade claims)
    db.prepare('DELETE FROM items WHERE id = ?').run(id);

    return res.json({ message: 'Item deleted successfully.' });
  } catch (err) {
    console.error('Delete item error:', err);
    return res.status(500).json({ error: 'Failed to delete item.' });
  }
});

module.exports = router;
