const db = require('../db');

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'have', 'from', 'left', 'lost',
  'found', 'near', 'some', 'where', 'when', 'what', 'area', 'room', 'hall',
  'here', 'there', 'please', 'help', 'item', 'side', 'back', 'front', 'desk',
  'table', 'about', 'been', 'will', 'your', 'ours', 'them', 'they', 'were'
]);

function extractKeywords(text = '') {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 3 && !STOP_WORDS.has(word));
}

function calculateMatchScore(itemA, itemB) {
  // Must be opposite types
  if (!itemA || !itemB || itemA.type === itemB.type) {
    return 0;
  }

  let score = 0;

  // 1. Category Match (up to 35 points)
  if (itemA.category === itemB.category) {
    score += 35;
  } else if (itemA.category === 'Other' || itemB.category === 'Other') {
    score += 5;
  }

  // 2. Location Match (up to 20 points)
  if (itemA.location && itemB.location) {
    if (itemA.location.toLowerCase() === itemB.location.toLowerCase()) {
      score += 20;
    } else if (
      itemA.location.toLowerCase().includes(itemB.location.toLowerCase()) ||
      itemB.location.toLowerCase().includes(itemA.location.toLowerCase())
    ) {
      score += 10;
    }
  }

  // 3. Date Proximity (up to 15 points if within 7 days)
  if (itemA.date_event && itemB.date_event) {
    try {
      const dateA = new Date(itemA.date_event);
      const dateB = new Date(itemB.date_event);
      const diffMs = Math.abs(dateA - dateB);
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays <= 7) {
        score += Math.max(0, 15 - (diffDays * 2));
      }
    } catch (e) {
      // Ignore date parsing error
    }
  }

  // 4. Keyword Overlap in Title and Description (up to 30 points)
  const titleA = extractKeywords(itemA.title);
  const titleB = extractKeywords(itemB.title);
  const descA = extractKeywords(itemA.description);
  const descB = extractKeywords(itemB.description);

  const wordsA = new Set([...titleA, ...descA]);
  const wordsB = new Set([...titleB, ...descB]);

  let commonCount = 0;
  let titleBonus = 0;

  wordsA.forEach(word => {
    if (wordsB.has(word)) {
      commonCount++;
      if (titleA.includes(word) || titleB.includes(word)) {
        titleBonus += 5;
      }
    }
  });

  const keywordPoints = Math.min(30, (commonCount * 8) + titleBonus);
  score += keywordPoints;

  return Math.min(100, Math.round(score));
}

function findMatchesForItem(itemId, limit = 6) {
  const targetItem = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
  if (!targetItem) {
    return [];
  }

  const oppositeType = targetItem.type === 'LOST' ? 'FOUND' : 'LOST';

  // Find candidate items of opposite type that are OPEN or CLAIM_PENDING
  const candidates = db.prepare(`
    SELECT i.*, u.name as reporter_name, u.role_type as reporter_role
    FROM items i
    JOIN users u ON i.user_id = u.id
    WHERE i.type = ? AND i.status IN ('OPEN', 'CLAIM_PENDING') AND i.id != ?
    ORDER BY i.created_at DESC
  `).all(oppositeType, itemId);

  const scored = [];
  for (const candidate of candidates) {
    const score = calculateMatchScore(targetItem, candidate);
    if (score >= 40) { // Threshold for showing in UI
      scored.push({
        ...candidate,
        match_score: score
      });
    }
  }

  scored.sort((a, b) => b.match_score - a.match_score);
  return scored.slice(0, limit);
}

function checkAndNotifyMatches(newItemId) {
  const newItem = db.prepare('SELECT * FROM items WHERE id = ?').get(newItemId);
  if (!newItem || newItem.status !== 'OPEN') {
    return;
  }

  const matches = findMatchesForItem(newItemId, 10);
  const insertNotif = db.prepare(`
    INSERT INTO notifications (user_id, message, link, is_read)
    VALUES (?, ?, ?, 0)
  `);

  const existingNotifStmt = db.prepare(`
    SELECT id FROM notifications WHERE user_id = ? AND link = ?
  `);

  for (const match of matches) {
    if (match.match_score >= 50) { // High confidence match threshold
      const linkToMatch = `/item.html?id=${match.id}`;
      const linkToNew = `/item.html?id=${newItem.id}`;

      // Notify owner of newly posted item
      if (!existingNotifStmt.get(newItem.user_id, linkToMatch)) {
        insertNotif.run(
          newItem.user_id,
          `Smart Match (${match.match_score}%): Your ${newItem.type.toLowerCase()} item "${newItem.title}" matches a ${match.type.toLowerCase()} item "${match.title}" at ${match.location}.`,
          linkToMatch
        );
      }

      // Notify owner of previously posted candidate item (if different user)
      if (match.user_id !== newItem.user_id && !existingNotifStmt.get(match.user_id, linkToNew)) {
        insertNotif.run(
          match.user_id,
          `Smart Match (${match.match_score}%): A newly reported ${newItem.type.toLowerCase()} item "${newItem.title}" matches your ${match.type.toLowerCase()} report "${match.title}".`,
          linkToNew
        );
      }
    }
  }
}

module.exports = {
  calculateMatchScore,
  findMatchesForItem,
  checkAndNotifyMatches
};
