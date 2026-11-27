const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET, authenticateUser } = require('../middleware/auth');

// Simple in-memory rate limiting for login attempts
const loginAttempts = new Map();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function rateLimitLogin(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (record) {
    if (now - record.firstAttempt < WINDOW_MS) {
      if (record.count >= MAX_ATTEMPTS) {
        return res.status(429).json({
          error: 'Too many failed login attempts. Please try again after 5 minutes.'
        });
      }
    } else {
      // Reset window
      loginAttempts.set(ip, { count: 0, firstAttempt: now });
    }
  } else {
    loginAttempts.set(ip, { count: 0, firstAttempt: now });
  }
  next();
}

function recordFailedAttempt(req) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const record = loginAttempts.get(ip);
  if (record) {
    record.count++;
  } else {
    loginAttempts.set(ip, { count: 1, firstAttempt: Date.now() });
  }
}

function resetAttempts(req) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  loginAttempts.delete(ip);
}

function setTokenCookie(res, user) {
  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role_type: user.role_type,
      is_admin: user.is_admin
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  return token;
}

// POST /api/auth/register
router.post('/register', (req, res) => {
  try {
    const { name, email, phone, role_type, password } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Full name is required (at least 2 characters).' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email.trim())) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    const allowedRoles = ['student', 'faculty', 'staff'];
    if (!role_type || !allowedRoles.includes(role_type.toLowerCase())) {
      return res.status(400).json({ error: 'Role type must be student, faculty, or staff.' });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    // Check if email already registered
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email address already exists.' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const cleanPhone = phone ? phone.trim().slice(0, 20) : null;

    const stmt = db.prepare(`
      INSERT INTO users (name, email, phone, role_type, is_admin, password_hash)
      VALUES (?, ?, ?, ?, 0, ?)
    `);

    const result = stmt.run(name.trim(), cleanEmail, cleanPhone, role_type.toLowerCase(), passwordHash);
    const userId = Number(result.lastInsertRowid);

    const newUser = db.prepare('SELECT id, name, email, phone, role_type, is_admin, created_at FROM users WHERE id = ?').get(userId);

    // Create welcome notification
    db.prepare(`
      INSERT INTO notifications (user_id, message, link, is_read)
      VALUES (?, ?, ?, 0)
    `).run(userId, 'Welcome to Campus Lost & Found! You can report items or search for lost belongings anytime.', '/dashboard.html');

    setTokenCookie(res, newUser);

    return res.status(201).json({
      message: 'Account registered successfully.',
      user: newUser
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Server error during registration. Please try again.' });
  }
});

// POST /api/auth/login
router.post('/login', rateLimitLogin, (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);

    if (!user) {
      recordFailedAttempt(req);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      recordFailedAttempt(req);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    resetAttempts(req);

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role_type: user.role_type,
      is_admin: user.is_admin,
      created_at: user.created_at
    };

    setTokenCookie(res, safeUser);

    return res.json({
      message: 'Logged in successfully.',
      user: safeUser
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error during login. Please try again.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  return res.json({ message: 'Logged out successfully.' });
});

// GET /api/auth/me
router.get('/me', authenticateUser, (req, res) => {
  return res.json({ user: req.user });
});

module.exports = router;
