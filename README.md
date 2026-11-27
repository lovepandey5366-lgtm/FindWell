# Campus Lost & Found System

A centralized, responsive web platform designed for university campuses (students, faculty, and administrative staff) to digitally report lost and found items, cross-reference reports with automated smart matching algorithms, verify ownership claims, and streamline safe returns.

---

## 1. Features

- **Authentication & Role-Based Access:**
  - Secure registration and login with bcrypt password hashing and JWT in httpOnly cookies.
  - Roles: `student`, `faculty`, `staff` (with administrator privileges).
  - Rate-limiting protection on authentication endpoints.

- **Item Reporting (Lost & Found):**
  - Unified report form with dynamic switching between `LOST` and `FOUND`.
  - Categorization: Electronics, Books, ID/Cards, Wallet/Bags, Keys, Clothing, Accessories, Other.
  - Campus locations dropdown (Library, Canteen, Hostel, Labs, Classroom Block, Main Gate, Ground, Parking, Other).
  - Multer image uploads (JPEG, PNG, WebP up to 5 MB) with client-side drag-and-drop preview.
  - Flexible contact preferences (Email, Phone, or System Claims Only).

- **Smart Matching Engine:**
  - Automatically scores similarities between newly reported items and open items of the opposite type.
  - Scoring factors: Category (35%), Keyword overlap in title/description (30%), Location proximity (20%), and Date proximity within 7 days (15%).
  - Triggers automated in-app notifications for both reporters when similarity exceeds confidence threshold.
  - "Possible Matches" recommendation cards displayed on item details pages.

- **Claim & Verification Flow:**
  - Structured ownership claiming system requiring verification proof messages.
  - Item lifecycle transitions: `OPEN` &rarr; `CLAIM_PENDING` &rarr; `RETURNED` (or `CLOSED`).
  - Item reporters and administrators can review claims and one-click Approve or Reject.
  - Approving a claim automatically marks the item as `RETURNED` and notifies the claimant.

- **In-App Notification Center:**
  - Live navbar notification bell with unread badge counter.
  - Dedicated notification center with filtering and mark-as-read controls.
  - Instant notifications for matches, received claims, approvals, and status changes.

- **User Dashboard:**
  - "My Reported Items" tab with edit, delete, and mark-as-returned actions.
  - "My Submitted Claims" tab showing real-time verification status.

- **Admin Control Panel:**
  - Campus-wide recovery analytics: Total Lost, Total Found, Total Returned, and Recovery Rate %.
  - Live pending claims moderation queue.
  - Master items directory with search, inline status updater, and moderation delete.

---

## 2. Tech Stack

- **Backend:** Node.js, Express.js
- **Database:** SQLite (`better-sqlite3` with portable fallback to native `node:sqlite`), file-based, zero setup, auto-migrating and auto-seeding.
- **Frontend:** Server-served semantic HTML5, CSS3, Vanilla JavaScript (zero build step).
- **UI Framework:** Bootstrap 5.3 (CDN), Bootstrap Icons.
- **Authentication:** JWT in httpOnly cookies + bcryptjs password hashing.
- **File Uploads:** Multer with mime-type checking and file size restrictions.

---

## 3. Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- npm

### Installation & Run

1. Clone or navigate to the project directory:
   ```bash
   cd "e:\Love\SE\Project"
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the application:
   ```bash
   npm start
   ```

4. Open your browser and visit:
   ```
   http://localhost:3000
   ```

The SQLite database file (`campus_lost_found.db`) will be automatically created on first startup, initialized with tables, and seeded with demo accounts and matching sample items.

---

## 4. Demo Accounts

| Role | Name | Email | Password |
|---|---|---|---|
| **Administrator** | Campus Admin | `admin@campus.edu` | `Admin@123` |
| **Student** | Alex Rivera | `student@campus.edu` | `User@123` |
| **Faculty** | Dr. Sarah Chen | `faculty@campus.edu` | `User@123` |
| **Staff** | Mark Johnson | `staff@campus.edu` | `User@123` |

*(Tip: The Sign In page features one-click buttons to quickly populate these demo accounts!)*

---

## 5. Project Structure

```
/
├── package.json              # Project dependencies and start script
├── server.js                 # Express server configuration and routing
├── db.js                     # SQLite database setup, schema, and auto-seeding
├── README.md                 # Documentation
├── .gitignore                # Ignored files
├── middleware/
│   ├── auth.js               # JWT verification & admin authorization
│   └── upload.js             # Multer file upload validation (5 MB, images)
├── routes/
│   ├── auth.js               # /api/auth (register, login, logout, me)
│   ├── items.js              # /api/items (CRUD, filtering, smart matches)
│   ├── claims.js             # /api/claims (claim submission, approve/reject)
│   ├── notifications.js      # /api/notifications (list, mark read)
│   └── admin.js              # /api/admin (stats, moderation items, claims queue)
├── utils/
│   └── matcher.js            # Smart matching heuristic algorithm
├── uploads/                  # Uploaded item images storage
└── public/                   # Static frontend assets
    ├── index.html            # Landing / Home page with quick search and stats
    ├── login.html            # Sign in with demo account chips
    ├── register.html         # User registration with role selection
    ├── report.html           # Report lost/found items with image drag & drop
    ├── items.html            # Search & browse directory with multi-filter & pagination
    ├── item.html             # Item details, match recommendations, and claim flow
    ├── dashboard.html        # User dashboard (My Reports & My Claims)
    ├── notifications.html    # Notification alerts center
    ├── admin.html            # Administrator control panel
    ├── css/
    │   └── style.css         # Modern styling, theme variables, and badges
    └── js/
        ├── api.js            # Unified frontend fetch API wrapper
        └── app.js            # Shared UI logic, navbar, toasts, and auth state
```

---

## 6. REST API Reference

### Authentication
- `POST /api/auth/register` &mdash; Register a new account (`name`, `email`, `phone`, `role_type`, `password`).
- `POST /api/auth/login` &mdash; Sign in (`email`, `password`). Rate-limited.
- `POST /api/auth/logout` &mdash; Clear auth cookie.
- `GET /api/auth/me` &mdash; Get current authenticated user profile.

### Items
- `GET /api/items` &mdash; Query items (`q`, `type`, `category`, `location`, `status`, `from`, `to`, `page`, `limit`, `sort`).
- `GET /api/items/:id` &mdash; Get single item details, claims, and reporter info.
- `POST /api/items` &mdash; Report lost or found item (multipart form with optional `image`).
- `PUT /api/items/:id` &mdash; Update report details or status (Owner or Admin).
- `DELETE /api/items/:id` &mdash; Delete report and unlinks uploaded photo (Owner or Admin).
- `GET /api/items/:id/matches` &mdash; Get smart potential matches scored by similarity.

### Claims
- `POST /api/items/:id/claims` &mdash; Submit verification claim with `proof_message`.
- `GET /api/claims/mine` &mdash; Retrieve all claims submitted by the current user.
- `PUT /api/claims/:id` &mdash; Approve or reject a claim (`status: "APPROVED" | "REJECTED"`).

### Notifications
- `GET /api/notifications` &mdash; Fetch user notifications and unread counter.
- `PUT /api/notifications/:id/read` &mdash; Mark specific notification as read.
- `PUT /api/notifications/read-all` &mdash; Mark all user notifications as read.

### Admin (Administrator Privileges Required)
- `GET /api/admin/stats` &mdash; Fetch total counts, recovery rate, category stats.
- `GET /api/admin/items` &mdash; Fetch all campus items with reporter information.
- `GET /api/admin/claims` &mdash; Fetch all claims across the campus.
