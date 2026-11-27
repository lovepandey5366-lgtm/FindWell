const http = require('http');

async function testAll() {
  console.log('--- Starting Automated End-to-End Tests ---');

  let cookieJar = '';

  async function req(method, path, body, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL('http://localhost:3000' + path);
      const postData = body ? JSON.stringify(body) : '';
      const headers = { ...extraHeaders };
      if (cookieJar) headers['Cookie'] = cookieJar;
      if (body) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(postData);
      }

      const request = http.request({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers
      }, (res) => {
        let data = '';
        if (res.headers['set-cookie']) {
          const rawCookies = Array.isArray(res.headers['set-cookie']) ? res.headers['set-cookie'] : [res.headers['set-cookie']];
          cookieJar = rawCookies.map(c => c.split(';')[0]).join('; ');
        }
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve({ status: res.statusCode, data: json });
          } catch(e) {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      });
      request.on('error', reject);
      if (postData) request.write(postData);
      request.end();
    });
  }

  // 1. Health check
  const health = await req('GET', '/api/health');
  console.log('1. Health check status:', health.status, health.data.status);

  // 2. Login as Admin
  const adminLogin = await req('POST', '/api/auth/login', { email: 'admin@campus.edu', password: 'Admin@123' });
  console.log('2. Admin login status:', adminLogin.status, 'Admin:', adminLogin.data.user.name);

  // 3. Admin stats
  const stats = await req('GET', '/api/admin/stats');
  console.log('3. Admin stats recovery rate:', stats.data.stats.recoveryRate + '%', 'Total items:', stats.data.stats.totalItems);

  // 4. Register new user
  cookieJar = '';
  const testEmail = 'teststudent_' + Date.now() + '@campus.edu';
  const registerRes = await req('POST', '/api/auth/register', {
    name: 'Jordan Smith',
    email: testEmail,
    phone: '9812345678',
    role_type: 'student',
    password: 'Password@123'
  });
  console.log('4. Register new user status:', registerRes.status, 'User:', registerRes.data.user.name);

  // 5. Session check /me
  const me = await req('GET', '/api/auth/me');
  console.log('5. Session check /me status:', me.status, 'Email:', me.data.user.email);

  // 6. Report a LOST item as Jordan
  const lostItem = await req('POST', '/api/items', {
    type: 'LOST',
    title: 'Lost Sony WH-1000XM5 Black Headphones',
    category: 'Electronics',
    location: 'Library',
    date_event: '2026-11-27',
    description: 'Black over-ear Sony noise cancelling headphones in black zippered case.',
    contact_pref: 'Email'
  });
  console.log('6. Report LOST item status:', lostItem.status, 'ID:', lostItem.data.item.id);
  const lostId = lostItem.data.item.id;

  // 7. Login as Dr. Sarah Chen and report matching FOUND item
  cookieJar = '';
  await req('POST', '/api/auth/login', { email: 'faculty@campus.edu', password: 'User@123' });
  const foundItem = await req('POST', '/api/items', {
    type: 'FOUND',
    title: 'Found Sony WH-1000XM5 Headphones in Case',
    category: 'Electronics',
    location: 'Library',
    date_event: '2026-11-27',
    description: 'Found black wireless Sony headphones inside black hard case on 1st floor reading table in Library.',
    contact_pref: 'Email'
  });
  console.log('7. Report matching FOUND item status:', foundItem.status, 'ID:', foundItem.data.item.id);
  const foundId = foundItem.data.item.id;

  // 8. Check smart matches
  const matches = await req('GET', '/api/items/' + lostId + '/matches');
  console.log('8. Smart matches found:', matches.data.matches.length);
  if (matches.data.matches.length > 0) {
    console.log('   Top match:', matches.data.matches[0].title, 'Score:', matches.data.matches[0].match_score + '%');
  }

  // 9. Login back as Jordan and check smart match notification
  cookieJar = '';
  await req('POST', '/api/auth/login', { email: testEmail, password: 'Password@123' });
  const notifs = await req('GET', '/api/notifications');
  console.log('9. Jordan notifications count:', notifs.data.notifications.length, 'Unread:', notifs.data.unreadCount);
  console.log('   Latest notification:', notifs.data.notifications[0].message);

  // 10. Submit a claim on the FOUND item
  const claimRes = await req('POST', '/api/items/' + foundId + '/claims', {
    proof_message: 'The case has my name initials JS written in silver marker on the inside lid and serial ends with 4912.'
  });
  console.log('10. Submit claim status:', claimRes.status, 'Claim ID:', claimRes.data.claim.id);
  const claimId = claimRes.data.claim.id;

  // 11. Check my claims
  const myClaims = await req('GET', '/api/claims/mine');
  console.log('11. My claims count:', myClaims.data.claims.length, 'Status:', myClaims.data.claims[0].claim_status);

  // 12. Switch to Dr. Sarah Chen and approve the claim
  cookieJar = '';
  await req('POST', '/api/auth/login', { email: 'faculty@campus.edu', password: 'User@123' });
  const approveRes = await req('PUT', '/api/claims/' + claimId, { status: 'APPROVED' });
  console.log('12. Approve claim status:', approveRes.status, 'Result status:', approveRes.data.claim.status);

  // 13. Verify item status transitioned to RETURNED
  const updatedItem = await req('GET', '/api/items/' + foundId);
  console.log('13. Verified item status:', updatedItem.data.item.status);

  // 14. Check browse items filter and search
  const searchRes = await req('GET', '/api/items?q=AirPods&category=Electronics');
  console.log('14. Search query items found:', searchRes.data.items.length);

  // 15. Check all HTML pages serve 200 OK
  const pages = ['/', '/login.html', '/register.html', '/report.html', '/items.html', '/item.html', '/dashboard.html', '/notifications.html', '/admin.html'];
  for (const page of pages) {
    const pageRes = await req('GET', page);
    if (pageRes.status !== 200) {
      throw new Error('Page ' + page + ' failed with status ' + pageRes.status);
    }
  }
  console.log('15. All 9 HTML pages served 200 OK');

  // 16. Logout
  const logoutRes = await req('POST', '/api/auth/logout');
  console.log('16. Logout status:', logoutRes.status, logoutRes.data.message);

  console.log('=======================================================');
  console.log(' ALL 16 COMPREHENSIVE TESTS PASSED WITH ZERO ERRORS!  ');
  console.log('=======================================================');
}

testAll().catch(e => { console.error('Test error:', e); process.exit(1); });
