const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateUser } = require('../middleware/auth');

// POST /api/items/:id/claims - submit a claim on an item
router.post('/items/:id/claims', authenticateUser, (req, res) => {
  try {
    const itemId = parseInt(req.params.id, 10);
    const { proof_message } = req.body;

    if (!proof_message || typeof proof_message !== 'string' || proof_message.trim().length < 5) {
      return res.status(400).json({ error: 'Please provide a descriptive proof message (at least 5 characters).' });
    }

    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found.' });
    }

    if (item.user_id === req.user.id) {
      return res.status(400).json({ error: 'You cannot submit a claim on an item you reported yourself.' });
    }

    if (item.status === 'RETURNED' || item.status === 'CLOSED') {
      return res.status(400).json({ error: `Cannot submit claim. This item is already marked as ${item.status}.` });
    }

    // Check if user already submitted a pending claim
    const existing = db.prepare(`
      SELECT id FROM claims 
      WHERE item_id = ? AND claimant_id = ? AND status = 'PENDING'
    `).get(itemId, req.user.id);

    if (existing) {
      return res.status(400).json({ error: 'You already have an active pending claim for this item.' });
    }

    // Insert claim
    const insertClaim = db.prepare(`
      INSERT INTO claims (item_id, claimant_id, proof_message, status)
      VALUES (?, ?, ?, 'PENDING')
    `);
    const result = insertClaim.run(itemId, req.user.id, proof_message.trim());
    const claimId = Number(result.lastInsertRowid);

    // Update item status to CLAIM_PENDING if OPEN
    if (item.status === 'OPEN') {
      db.prepare("UPDATE items SET status = 'CLAIM_PENDING' WHERE id = ?").run(itemId);
    }

    // Notify item reporter
    db.prepare(`
      INSERT INTO notifications (user_id, message, link, is_read)
      VALUES (?, ?, ?, 0)
    `).run(
      item.user_id,
      `New Claim Received: ${req.user.name} submitted a ownership claim for your item '${item.title}'.`,
      `/item.html?id=${itemId}`
    );

    const createdClaim = db.prepare('SELECT * FROM claims WHERE id = ?').get(claimId);

    return res.status(201).json({
      message: 'Claim submitted successfully. The reporter or admin will review your proof.',
      claim: createdClaim
    });
  } catch (err) {
    console.error('Submit claim error:', err);
    return res.status(500).json({ error: 'Failed to submit claim. Please try again.' });
  }
});

// GET /api/claims/mine - list all claims made by current user
router.get('/mine', authenticateUser, (req, res) => {
  try {
    const claims = db.prepare(`
      SELECT 
        c.id as claim_id,
        c.proof_message,
        c.status as claim_status,
        c.created_at as claim_date,
        i.id as item_id,
        i.title as item_title,
        i.type as item_type,
        i.category as item_category,
        i.location as item_location,
        i.date_event as item_date,
        i.status as item_status,
        i.image_path,
        u.name as reporter_name,
        u.email as reporter_email,
        u.phone as reporter_phone
      FROM claims c
      JOIN items i ON c.item_id = i.id
      JOIN users u ON i.user_id = u.id
      WHERE c.claimant_id = ?
      ORDER BY c.created_at DESC
    `).all(req.user.id);

    return res.json({ claims });
  } catch (err) {
    console.error('Get my claims error:', err);
    return res.status(500).json({ error: 'Failed to retrieve your claims.' });
  }
});

// PUT /api/claims/:id - approve or reject a claim
router.put('/:id', authenticateUser, (req, res) => {
  try {
    const claimId = parseInt(req.params.id, 10);
    const { status } = req.body;

    if (!status || !['APPROVED', 'REJECTED'].includes(status.toUpperCase())) {
      return res.status(400).json({ error: "Claim status must be either 'APPROVED' or 'REJECTED'." });
    }

    const claim = db.prepare(`
      SELECT c.*, i.user_id as item_owner_id, i.title as item_title
      FROM claims c
      JOIN items i ON c.item_id = i.id
      WHERE c.id = ?
    `).get(claimId);

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found.' });
    }

    const isOwner = req.user.id === claim.item_owner_id;
    const isAdmin = req.user.is_admin === 1;

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'You are not authorized to review this claim.' });
    }

    const newStatus = status.toUpperCase();

    if (newStatus === 'APPROVED') {
      // 1. Approve this claim
      db.prepare("UPDATE claims SET status = 'APPROVED' WHERE id = ?").run(claimId);

      // 2. Reject all other pending claims on this item
      db.prepare("UPDATE claims SET status = 'REJECTED' WHERE item_id = ? AND id != ? AND status = 'PENDING'").run(
        claim.item_id,
        claimId
      );

      // 3. Update item status to RETURNED
      db.prepare("UPDATE items SET status = 'RETURNED' WHERE id = ?").run(claim.item_id);

      // 4. Notify claimant
      db.prepare(`
        INSERT INTO notifications (user_id, message, link, is_read)
        VALUES (?, ?, ?, 0)
      `).run(
        claim.claimant_id,
        `Congratulations! Your claim on '${claim.item_title}' has been APPROVED. The item is marked as RETURNED.`,
        `/item.html?id=${claim.item_id}`
      );
    } else {
      // Reject claim
      db.prepare("UPDATE claims SET status = 'REJECTED' WHERE id = ?").run(claimId);

      // Notify claimant
      db.prepare(`
        INSERT INTO notifications (user_id, message, link, is_read)
        VALUES (?, ?, ?, 0)
      `).run(
        claim.claimant_id,
        `Update on your claim: The claim for '${claim.item_title}' was reviewed and REJECTED.`,
        `/item.html?id=${claim.item_id}`
      );

      // Check if there are remaining pending claims on this item
      const remainingPending = db.prepare(`
        SELECT COUNT(*) as count FROM claims WHERE item_id = ? AND status = 'PENDING'
      `).get(claim.item_id);

      if (!remainingPending || remainingPending.count === 0) {
        // Revert item status to OPEN if it was CLAIM_PENDING
        db.prepare("UPDATE items SET status = 'OPEN' WHERE id = ? AND status = 'CLAIM_PENDING'").run(claim.item_id);
      }
    }

    const updatedClaim = db.prepare('SELECT * FROM claims WHERE id = ?').get(claimId);

    return res.json({
      message: `Claim has been ${newStatus.toLowerCase()} successfully.`,
      claim: updatedClaim
    });
  } catch (err) {
    console.error('Update claim error:', err);
    return res.status(500).json({ error: 'Failed to update claim status.' });
  }
});

module.exports = router;
