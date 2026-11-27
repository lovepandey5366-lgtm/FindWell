// App State & Shared UI Components
let currentUser = null;

// Escape HTML utility to prevent XSS
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Category icon mapper
function getCategoryIcon(category) {
  switch (category) {
    case 'Electronics': return 'bi-laptop';
    case 'Books': return 'bi-book';
    case 'ID/Cards': return 'bi-person-badge';
    case 'Wallet/Bags': return 'bi-wallet2';
    case 'Keys': return 'bi-key';
    case 'Clothing': return 'bi-tag';
    case 'Accessories': return 'bi-watch';
    default: return 'bi-box-seam';
  }
}

// Format relative/full date
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Toast notification helper
function showToast(message, type = 'info', title = '') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toastId = 'toast-' + Date.now();
  const bgClass = type === 'success' ? 'text-bg-success' :
                  type === 'danger' || type === 'error' ? 'text-bg-danger' :
                  type === 'warning' ? 'text-bg-warning' : 'text-bg-primary';

  const toastHtml = `
    <div id="${toastId}" class="toast align-items-center ${bgClass} border-0 shadow-lg mb-2" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body">
          ${title ? `<strong>${escapeHTML(title)}:</strong> ` : ''}${escapeHTML(message)}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', toastHtml);
  const toastElem = document.getElementById(toastId);
  if (window.bootstrap) {
    const bsToast = new bootstrap.Toast(toastElem, { delay: 4500 });
    bsToast.show();
    toastElem.addEventListener('hidden.bs.toast', () => toastElem.remove());
  } else {
    setTimeout(() => toastElem.remove(), 4500);
  }
}

// Badge Generators
function getTypeBadge(type) {
  const isLost = type === 'LOST';
  return `<span class="badge ${isLost ? 'badge-lost' : 'badge-found'} px-2 py-1">
    <i class="bi ${isLost ? 'bi-exclamation-circle' : 'bi-check-circle'} me-1"></i>${type}
  </span>`;
}

function getStatusBadge(status) {
  switch (status) {
    case 'OPEN':
      return `<span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1">Active / Open</span>`;
    case 'CLAIM_PENDING':
      return `<span class="badge badge-pending px-2 py-1">Claim Pending</span>`;
    case 'RETURNED':
      return `<span class="badge badge-returned px-2 py-1"><i class="bi bi-patch-check-fill me-1"></i>Returned</span>`;
    case 'CLOSED':
      return `<span class="badge bg-secondary px-2 py-1">Closed</span>`;
    default:
      return `<span class="badge bg-light text-dark px-2 py-1">${escapeHTML(status)}</span>`;
  }
}

// Render dynamic navbar
function renderNavbar() {
  const navContainer = document.getElementById('navbar-container');
  if (!navContainer) return;

  const currentPath = window.location.pathname;

  navContainer.innerHTML = `
    <nav class="navbar navbar-expand-lg navbar-light bg-white border-bottom shadow-sm sticky-top">
      <div class="container">
        <a class="navbar-brand d-flex align-items-center text-primary" href="/index.html">
          <i class="bi bi-compass fs-3 me-2"></i>
          <span>Campus <span class="text-dark">Lost & Found</span></span>
        </a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNavbar" aria-controls="mainNavbar" aria-expanded="false" aria-label="Toggle navigation">
          <span class="navbar-toggler-icon"></span>
        </button>

        <div class="collapse navbar-collapse" id="mainNavbar">
          <ul class="navbar-nav me-auto mb-2 mb-lg-0 ms-lg-3">
            <li class="nav-item">
              <a class="nav-link ${currentPath.includes('index') || currentPath === '/' ? 'active fw-bold' : ''}" href="/index.html">
                <i class="bi bi-house-door me-1"></i>Home
              </a>
            </li>
            <li class="nav-item">
              <a class="nav-link ${currentPath.includes('items.html') ? 'active fw-bold' : ''}" href="/items.html">
                <i class="bi bi-grid me-1"></i>Browse Items
              </a>
            </li>
            <li class="nav-item">
              <a class="nav-link text-danger fw-semibold" href="/report.html?type=LOST">
                <i class="bi bi-dash-circle me-1"></i>Report Lost
              </a>
            </li>
            <li class="nav-item">
              <a class="nav-link text-success fw-semibold" href="/report.html?type=FOUND">
                <i class="bi bi-plus-circle me-1"></i>Report Found
              </a>
            </li>
          </ul>

          <div class="d-flex align-items-center gap-2" id="nav-auth-area">
            <!-- Dynamic auth content populated here -->
            <div class="spinner-border spinner-border-sm text-secondary" role="status">
              <span class="visually-hidden">Loading...</span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  `;
}

// Update navbar with user login state & notifications
async function updateNavAuth() {
  const authArea = document.getElementById('nav-auth-area');
  if (!authArea) return;

  try {
    const data = await API.auth.me();
    currentUser = data.user;

    // Fetch unread notifications count
    let unreadCount = 0;
    try {
      const notifData = await API.notifications.list();
      unreadCount = notifData.unreadCount || 0;
    } catch (e) {
      // Ignore notif fetch error
    }

    authArea.innerHTML = `
      <!-- Notification Bell -->
      <a href="/notifications.html" class="btn btn-light position-relative rounded-circle p-2 me-1 text-secondary" title="Notifications">
        <i class="bi bi-bell-fill fs-5"></i>
        ${unreadCount > 0 ? `<span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger badge-unread-notif">${unreadCount > 9 ? '9+' : unreadCount}</span>` : ''}
      </a>

      <!-- User Dropdown Menu -->
      <div class="dropdown">
        <button class="btn btn-outline-primary dropdown-toggle d-flex align-items-center gap-2 py-1 px-3" type="button" data-bs-toggle="dropdown" aria-expanded="false">
          <i class="bi bi-person-circle fs-5"></i>
          <span class="d-none d-sm-inline fw-medium">${escapeHTML(currentUser.name)}</span>
          <span class="badge bg-primary-subtle text-primary border border-primary-subtle text-capitalize">${escapeHTML(currentUser.role_type)}</span>
        </button>
        <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0">
          <li class="px-3 py-2 border-bottom">
            <div class="fw-bold">${escapeHTML(currentUser.name)}</div>
            <div class="small text-muted">${escapeHTML(currentUser.email)}</div>
          </li>
          <li>
            <a class="dropdown-item py-2" href="/dashboard.html">
              <i class="bi bi-speedometer2 me-2 text-primary"></i>My Dashboard
            </a>
          </li>
          <li>
            <a class="dropdown-item py-2" href="/notifications.html">
              <i class="bi bi-bell me-2 text-warning"></i>Notifications
              ${unreadCount > 0 ? `<span class="badge bg-danger ms-2">${unreadCount}</span>` : ''}
            </a>
          </li>
          ${currentUser.is_admin ? `
          <li><hr class="dropdown-divider"></li>
          <li>
            <a class="dropdown-item py-2 text-primary fw-bold" href="/admin.html">
              <i class="bi bi-shield-lock-fill me-2"></i>Admin Dashboard
            </a>
          </li>
          ` : ''}
          <li><hr class="dropdown-divider"></li>
          <li>
            <button class="dropdown-item py-2 text-danger" id="nav-logout-btn">
              <i class="bi bi-box-arrow-right me-2"></i>Sign Out
            </button>
          </li>
        </ul>
      </div>
    `;

    document.getElementById('nav-logout-btn')?.addEventListener('click', handleLogout);
  } catch (err) {
    currentUser = null;
    authArea.innerHTML = `
      <a href="/login.html" class="btn btn-outline-primary btn-sm px-3 fw-medium">Sign In</a>
      <a href="/register.html" class="btn btn-primary btn-sm px-3 fw-medium">Register</a>
    `;
  }
}

// Global logout handler
async function handleLogout() {
  try {
    await API.auth.logout();
    showToast('Logged out successfully.', 'info');
    setTimeout(() => {
      window.location.href = '/index.html';
    }, 600);
  } catch (err) {
    showToast(err.message || 'Logout failed.', 'danger');
  }
}

// Render dynamic footer
function renderFooter() {
  const footerContainer = document.getElementById('footer-container');
  if (!footerContainer) return;

  footerContainer.innerHTML = `
    <footer class="mt-auto">
      <div class="container">
        <div class="row g-4 mb-4">
          <div class="col-lg-4 col-md-6">
            <h5 class="text-white fw-bold mb-3 d-flex align-items-center">
              <i class="bi bi-compass text-primary me-2"></i>Campus Lost & Found
            </h5>
            <p class="text-secondary small">
              A centralized digital platform for students, faculty, and staff to securely report, search, and reclaim lost belongings across campus.
            </p>
          </div>
          <div class="col-lg-2 col-md-6">
            <h6 class="text-white fw-semibold mb-3">Quick Links</h6>
            <ul class="list-unstyled small d-flex flex-column gap-2">
              <li><a href="/index.html">Home</a></li>
              <li><a href="/items.html">Browse All Items</a></li>
              <li><a href="/report.html?type=LOST">Report Lost Item</a></li>
              <li><a href="/report.html?type=FOUND">Report Found Item</a></li>
            </ul>
          </div>
          <div class="col-lg-3 col-md-6">
            <h6 class="text-white fw-semibold mb-3">Campus Hubs</h6>
            <ul class="list-unstyled small d-flex flex-column gap-2">
              <li><a href="/items.html?location=Library">Central Library</a></li>
              <li><a href="/items.html?location=Canteen">Campus Canteen</a></li>
              <li><a href="/items.html?location=Labs">Computing & Science Labs</a></li>
              <li><a href="/items.html?location=Main Gate">Security & Main Gate</a></li>
            </ul>
          </div>
          <div class="col-lg-3 col-md-6">
            <h6 class="text-white fw-semibold mb-3">Demo Credentials</h6>
            <div class="bg-dark p-3 rounded small text-secondary border border-secondary border-opacity-25">
              <div class="text-white fw-semibold mb-1">Admin Access:</div>
              <div><code>admin@campus.edu</code></div>
              <div>Pass: <code>Admin@123</code></div>
              <div class="text-white fw-semibold mt-2 mb-1">Demo Users:</div>
              <div><code>student@campus.edu</code> (Alex)</div>
              <div>Pass: <code>User@123</code></div>
            </div>
          </div>
        </div>
        <div class="border-top border-secondary border-opacity-25 pt-3 text-center small text-secondary">
          &copy; ${new Date().getFullYear()} Campus Lost & Found System. Built with Node.js, Express & SQLite.
        </div>
      </div>
    </footer>
  `;
}

// Global initialization
document.addEventListener('DOMContentLoaded', async () => {
  renderNavbar();
  renderFooter();
  await updateNavAuth();
});
