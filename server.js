const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');

// Import database (auto-initializes and seeds)
const db = require('./db');

// Import routers
const authRoutes = require('./routes/auth');
const itemsRoutes = require('./routes/items');
const claimsRoutes = require('./routes/claims');
const notificationsRoutes = require('./routes/notifications');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure upload directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Request parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static assets
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/items', itemsRoutes);
app.use('/api', claimsRoutes); // handles /api/items/:id/claims, /api/claims/mine, /api/claims/:id
app.use('/api/claims', claimsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/admin', adminRoutes);

// Public locations listing endpoint
app.get('/api/locations', (req, res) => {
  try {
    const locations = db.prepare('SELECT id, name, description FROM locations WHERE is_active = 1 ORDER BY name ASC').all();
    res.json({ locations });
  } catch (e) {
    res.json({ locations: [] });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 404 handler for unknown API routes
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.originalUrl}` });
});

// HTML fallback for browser routes without .html extension
app.get('/:page', (req, res, next) => {
  const pagePath = path.join(__dirname, 'public', `${req.params.page}.html`);
  if (fs.existsSync(pagePath)) {
    return res.sendFile(pagePath);
  }
  next();
});

// Default root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Global Error]', err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal server error occurred.'
  });
});

// Start listening
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` Campus Lost & Found System is running!`);
  console.log(` URL: http://localhost:${PORT}`);
  console.log(` Admin: admin@campus.edu / Admin@123`);
  console.log(` Demo Users: student@campus.edu, faculty@campus.edu`);
  console.log(` Password for demo users: User@123`);
  console.log(`=======================================================`);
});
