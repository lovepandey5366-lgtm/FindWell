const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'campus_lost_found.db');

let db;
try {
  const BetterSqlite3 = require('better-sqlite3');
  db = new BetterSqlite3(dbPath);
  db.pragma('foreign_keys = ON');
} catch (err) {
  // Fallback to Node.js native SQLite DatabaseSync
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
}

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    role_type TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('LOST', 'FOUND')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    location TEXT NOT NULL,
    date_event TEXT NOT NULL,
    image_path TEXT,
    contact_pref TEXT DEFAULT 'Email',
    status TEXT DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CLAIM_PENDING', 'RETURNED', 'CLOSED')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    claimant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    proof_message TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    link TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_locations_name ON locations(name);
  CREATE INDEX IF NOT EXISTS idx_items_type_status ON items(type, status);
  CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
  CREATE INDEX IF NOT EXISTS idx_items_location ON items(location);
  CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id);
  CREATE INDEX IF NOT EXISTS idx_claims_item ON claims(item_id);
  CREATE INDEX IF NOT EXISTS idx_claims_claimant ON claims(claimant_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
`);

// Auto-seed locations if table is empty
function seedLocations() {
  const locCount = db.prepare('SELECT COUNT(*) as count FROM locations').get();
  if (locCount && locCount.count > 0) {
    return;
  }

  console.log('[Database] Seeding default campus locations...');
  const insertLoc = db.prepare('INSERT INTO locations (name, description, is_active) VALUES (?, ?, 1)');
  const defaultLocations = [
    ['Library', 'Central Library, Reference Sections & Reading Rooms'],
    ['Canteen', 'Campus Main Canteen & Food Court Area'],
    ['Hostel', 'Student Hostel Blocks & Common Lounges'],
    ['Labs', 'Computer Science, Engineering & Research Labs'],
    ['Classroom Block', 'Academic Lecture Theatres & Classrooms'],
    ['Main Gate', 'Campus Entrance Gate & Security Checkpoint'],
    ['Ground', 'Athletic Sports Ground, Gym & Pavilion'],
    ['Parking', 'Vehicular Parking Lots (Two-Wheeler & Four-Wheeler)'],
    ['Auditorium', 'Main University Convention Auditorium'],
    ['Admin Block', 'Administrative Office & Dean Complex']
  ];

  for (const [name, desc] of defaultLocations) {
    try {
      insertLoc.run(name, desc);
    } catch (e) {
      // Ignore if exists
    }
  }
}

// Auto-seed users & sample items if database has no users
function seedDatabase() {
  seedLocations();

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount && userCount.count > 0) {
    return;
  }

  console.log('[Database] Empty database detected. Seeding demo users and items...');

  const adminHash = bcrypt.hashSync('Admin@123', 10);
  const userHash = bcrypt.hashSync('User@123', 10);

  // 1 Admin + 3 Demo Users
  const insertUser = db.prepare(`
    INSERT INTO users (name, email, phone, role_type, is_admin, password_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const adminRes = insertUser.run('Campus Admin', 'admin@campus.edu', '9876543210', 'staff', 1, adminHash);
  const user1Res = insertUser.run('Alex Rivera', 'student@campus.edu', '9876543211', 'student', 0, userHash);
  const user2Res = insertUser.run('Dr. Sarah Chen', 'faculty@campus.edu', '9876543212', 'faculty', 0, userHash);
  const user3Res = insertUser.run('Mark Johnson', 'staff@campus.edu', '9876543213', 'staff', 0, userHash);

  const adminId = Number(adminRes.lastInsertRowid);
  const u1Id = Number(user1Res.lastInsertRowid);
  const u2Id = Number(user2Res.lastInsertRowid);
  const u3Id = Number(user3Res.lastInsertRowid);

  // 12 Sample Items (Pairs that match immediately)
  const insertItem = db.prepare(`
    INSERT INTO items (user_id, type, title, description, category, location, date_event, image_path, contact_pref, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Pair 1: AirPods (LOST & FOUND in Library - matching pair!)
  const item1Res = insertItem.run(
    u1Id, 'LOST', 'Lost Apple AirPods Pro with White Case',
    'White Apple AirPods Pro (2nd Gen) in charging case. Has a small blue star sticker on the back. Left on a desk in the 2nd-floor library reading room.',
    'Electronics', 'Library', '2026-11-25', null, 'Email', 'OPEN'
  );
  const item1Id = Number(item1Res.lastInsertRowid);

  const item2Res = insertItem.run(
    u2Id, 'FOUND', 'Found Apple AirPods in White Case',
    'Found a set of white Apple AirPods in their charging case with a small sticker on a 2nd floor library study desk.',
    'Electronics', 'Library', '2026-11-25', null, 'Email', 'OPEN'
  );
  const item2Id = Number(item2Res.lastInsertRowid);

  // Pair 2: Wallet (LOST & FOUND in Canteen - matching pair!)
  const item3Res = insertItem.run(
    u3Id, 'LOST', 'Lost Brown Leather Fossil Wallet',
    'Brown leather bifold wallet by Fossil. Contains college staff ID, metro transit pass, and debit card.',
    'Wallet/Bags', 'Canteen', '2026-11-24', null, 'Phone', 'CLAIM_PENDING'
  );
  const item3Id = Number(item3Res.lastInsertRowid);

  const item4Res = insertItem.run(
    u1Id, 'FOUND', 'Found Brown Leather Wallet near Counter',
    'Found a brown leather bifold wallet on table near the main meal counter at the campus canteen.',
    'Wallet/Bags', 'Canteen', '2026-11-24', null, 'Email', 'OPEN'
  );
  const item4Id = Number(item4Res.lastInsertRowid);

  // Pair 3: ID Card (LOST & FOUND at Main Gate - matching pair!)
  const item5Res = insertItem.run(
    u1Id, 'LOST', 'Lost Campus Student ID Card',
    'Student identity card with blue campus lanyard lost near main pedestrian entrance.',
    'ID/Cards', 'Main Gate', '2026-11-26', null, 'Email', 'OPEN'
  );
  const item5Id = Number(item5Res.lastInsertRowid);

  const item6Res = insertItem.run(
    u3Id, 'FOUND', 'Found Student ID Card with Blue Lanyard',
    'Blue lanyard student ID card handed to security booth at the Main Gate turnstiles.',
    'ID/Cards', 'Main Gate', '2026-11-26', null, 'Phone', 'OPEN'
  );
  const item6Id = Number(item6Res.lastInsertRowid);

  // Additional varied items
  insertItem.run(
    u2Id, 'LOST', 'Lost Silver MacBook Air M2 in Gray Sleeve',
    '13-inch Silver MacBook Air inside dark gray felt sleeve. Left near front row in CS Lab 3.',
    'Electronics', 'Labs', '2026-11-22', null, 'Email', 'OPEN'
  );

  insertItem.run(
    u3Id, 'FOUND', 'Found Casio Scientific Calculator fx-991EX',
    'Black Casio scientific calculator left on bench in Classroom Block room 204.',
    'Electronics', 'Classroom Block', '2026-11-23', null, 'Email', 'OPEN'
  );

  insertItem.run(
    u1Id, 'LOST', 'Lost Black Casio G-Shock Sports Watch',
    'Matte black G-Shock water-resistant watch with digital display, lost during evening soccer match on sports ground.',
    'Accessories', 'Ground', '2026-11-20', null, 'Phone', 'OPEN'
  );

  insertItem.run(
    u2Id, 'FOUND', 'Found Honda Two-Wheeler Key with Red Tag',
    'Single motorbike ignition key with a red woven keychain tag found in Two-Wheeler Parking Slot B-12.',
    'Keys', 'Parking', '2026-11-21', null, 'Phone', 'OPEN'
  );

  insertItem.run(
    u3Id, 'LOST', 'Lost Blue Stainless Steel Water Bottle',
    'Cobalt blue 32oz insulated Hydro Flask bottle with small dent on base, misplaced in Hostel common area.',
    'Other', 'Hostel', '2026-11-19', null, 'Email', 'OPEN'
  );

  insertItem.run(
    u1Id, 'FOUND', 'Found Dell 65W USB-C Laptop Charger',
    'Dell genuine USB-C 65W power adapter left plugged in at Library ground floor workstation. Verified and returned to owner.',
    'Electronics', 'Library', '2026-11-15', null, 'Email', 'RETURNED'
  );

  // Sample claim on item 3
  const insertClaim = db.prepare(`
    INSERT INTO claims (item_id, claimant_id, proof_message, status)
    VALUES (?, ?, ?, ?)
  `);
  insertClaim.run(item3Id, u1Id, 'My wallet has my staff ID inside and a small family photo behind the license flap.', 'PENDING');

  // Seed sample notifications
  const insertNotif = db.prepare(`
    INSERT INTO notifications (user_id, message, link, is_read)
    VALUES (?, ?, ?, ?)
  `);
  insertNotif.run(u1Id, "Smart Match Found: Your lost 'Apple AirPods Pro' has a high probability match reported in Library!", `/item.html?id=${item2Id}`, 0);
  insertNotif.run(u2Id, "Smart Match Found: Your found 'Apple AirPods' has a high probability match reported in Library!", `/item.html?id=${item1Id}`, 0);
  insertNotif.run(u3Id, "New Claim Received: Alex Rivera submitted a verification claim for your reported wallet.", `/item.html?id=${item3Id}`, 0);
  insertNotif.run(adminId, "System Alert: Welcome to Campus Lost & Found Administration Dashboard.", "/admin.html", 0);

  console.log('[Database] Database successfully seeded with demo users, locations, items, claims, and notifications.');
}

// Run seed immediately
seedDatabase();

module.exports = db;
