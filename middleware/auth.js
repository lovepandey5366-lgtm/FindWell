const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'campus_lost_found_secret_key_2026';

function extractToken(req) {
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return req.headers.authorization.slice(7).trim();
  }
  return null;
}

function authenticateUser(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, name, email, phone, role_type, is_admin, created_at FROM users WHERE id = ?').get(decoded.id);
    if (!user) {
      res.clearCookie('token');
      return res.status(401).json({ error: 'User account no longer exists.' });
    }
    req.user = user;
    next();
  } catch (err) {
    res.clearCookie('token');
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
}

function optionalUser(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, name, email, phone, role_type, is_admin, created_at FROM users WHERE id = ?').get(decoded.id);
    req.user = user || null;
  } catch (err) {
    req.user = null;
  }
  next();
}

function requireAdmin(req, res, next) {
  authenticateUser(req, res, () => {
    if (!req.user || !req.user.is_admin) {
      return res.status(403).json({ error: 'Access forbidden. Administrator privileges required.' });
    }
    next();
  });
}

module.exports = {
  JWT_SECRET,
  authenticateUser,
  optionalUser,
  requireAdmin
};
