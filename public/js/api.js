// Unified API Client for Campus Lost & Found
const API = {
  async request(endpoint, options = {}) {
    const defaultHeaders = {};
    const config = {
      ...options,
      credentials: 'same-origin',
      headers: {
        ...defaultHeaders,
        ...(options.headers || {})
      }
    };

    // If body is an object and not FormData, stringify to JSON
    if (config.body && !(config.body instanceof FormData) && typeof config.body === 'object') {
      config.headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(endpoint, config);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = data.error || `Request failed with status ${response.status}`;
        const error = new Error(errorMsg);
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (err) {
      console.error(`API Error [${endpoint}]:`, err);
      throw err;
    }
  },

  // Auth endpoints
  auth: {
    register: (userData) => API.request('/api/auth/register', { method: 'POST', body: userData }),
    login: (credentials) => API.request('/api/auth/login', { method: 'POST', body: credentials }),
    logout: () => API.request('/api/auth/logout', { method: 'POST' }),
    me: () => API.request('/api/auth/me', { method: 'GET' })
  },

  // Locations (public)
  locations: {
    list: () => API.request('/api/locations', { method: 'GET' })
  },

  // Items endpoints
  items: {
    list: (params = {}) => {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          query.append(key, val);
        }
      });
      const qStr = query.toString() ? `?${query.toString()}` : '';
      return API.request(`/api/items${qStr}`, { method: 'GET' });
    },
    get: (id) => API.request(`/api/items/${id}`, { method: 'GET' }),
    create: (formData) => API.request('/api/items', { method: 'POST', body: formData }),
    update: (id, formDataOrObj) => API.request(`/api/items/${id}`, { method: 'PUT', body: formDataOrObj }),
    delete: (id) => API.request(`/api/items/${id}`, { method: 'DELETE' }),
    matches: (id) => API.request(`/api/items/${id}/matches`, { method: 'GET' })
  },

  // Claims endpoints
  claims: {
    create: (itemId, proofMessage) => API.request(`/api/items/${itemId}/claims`, {
      method: 'POST',
      body: { proof_message: proofMessage }
    }),
    mine: () => API.request('/api/claims/mine', { method: 'GET' }),
    updateStatus: (claimId, status) => API.request(`/api/claims/${claimId}`, {
      method: 'PUT',
      body: { status }
    })
  },

  // Notifications endpoints
  notifications: {
    list: () => API.request('/api/notifications', { method: 'GET' }),
    markRead: (id) => API.request(`/api/notifications/${id}/read`, { method: 'PUT' }),
    markAllRead: () => API.request('/api/notifications/read-all', { method: 'PUT' })
  },

  // Admin endpoints (full control over items, claims, users/members, and locations)
  admin: {
    stats: () => API.request('/api/admin/stats', { method: 'GET' }),
    items: () => API.request('/api/admin/items', { method: 'GET' }),
    claims: () => API.request('/api/admin/claims', { method: 'GET' }),

    // Members Management
    users: () => API.request('/api/admin/users', { method: 'GET' }),
    getUser: (id) => API.request(`/api/admin/users/${id}`, { method: 'GET' }),
    updateUser: (id, data) => API.request(`/api/admin/users/${id}`, { method: 'PUT', body: data }),
    deleteUser: (id) => API.request(`/api/admin/users/${id}`, { method: 'DELETE' }),

    // Locations Management
    locations: () => API.request('/api/admin/locations', { method: 'GET' }),
    createLocation: (data) => API.request('/api/admin/locations', { method: 'POST', body: data }),
    updateLocation: (id, data) => API.request(`/api/admin/locations/${id}`, { method: 'PUT', body: data }),
    deleteLocation: (id) => API.request(`/api/admin/locations/${id}`, { method: 'DELETE' })
  }
};
