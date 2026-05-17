import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

export const base44 = {};

const runtimeOrigin = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : '';
const isDevViaVite = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;
const baseOrigin = isDevViaVite ? runtimeOrigin : (import.meta.env.VITE_LOCAL_API_URL || runtimeOrigin);
const base = baseOrigin + '/api';
const defaultHeaders = { 'Content-Type': 'application/json', 'X-App-Id': appId };

const request = async (path, { method = 'GET', body, params, headers: extraHeaders } = {}) => {
  const url = new URL(base + path);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });
  }
  const token = (typeof window !== 'undefined') ? localStorage.getItem('auth_token') : null;
  const branchId = (typeof window !== 'undefined') ? (localStorage.getItem('active_branch_id') || null) : null;
  const headers = { ...defaultHeaders };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (branchId) headers['X-Branch-Id'] = String(branchId);
  if (extraHeaders && typeof extraHeaders === 'object') {
    Object.assign(headers, extraHeaders);
  }
  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let responseText = '';
  try {
    if (!res.ok) {
      responseText = await res.text();
      const statusText = res.status ? `status ${res.status}` : 'request failed';
      throw new Error(responseText || `${statusText} on ${path}`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        return await res.json();
      } catch {
        return { ok: true };
      }
    }
    responseText = await res.text();
    try { return JSON.parse(responseText); } catch { return { ok: true }; }
  } catch (e) {
    if (res && res.ok) return { ok: true };
    if (responseText === '') {
      const reason = res.statusText ? String(res.statusText) : 'Server Error';
      throw new Error(`${reason} (status ${res.status})`);
    }
    throw e;
  }
};

const makeEntity = (name) => ({
  list: async (sort) => {
    return request(`/entities/${name}`, { params: { sort } });
  },
  filter: async (params) => {
    return request(`/entities/${name}`, { params });
  },
  create: async (data, options) => {
    return request(`/entities/${name}`, { method: 'POST', body: data, headers: options?.headers });
  },
  update: async (id, data, options) => {
    return request(`/entities/${name}/${id}`, { method: 'PUT', body: data, headers: options?.headers });
  },
  delete: async (id, params, options) => {
    const key = encodeURIComponent(String(id));
    return request(`/entities/${name}/${key}`, { method: 'DELETE', params, headers: options?.headers });
  }
});

base44.entities = {
  Product: makeEntity('Product'),
  Category: makeEntity('Category'),
  Unit: makeEntity('Unit'),
  Customer: makeEntity('Customer'),
  Supplier: makeEntity('Supplier'),
  Purchase: makeEntity('Purchase'),
  StockMutation: makeEntity('StockMutation'),
  Sale: makeEntity('Sale'),
  Payment: makeEntity('Payment'),
  User: makeEntity('User')
};

base44.entities.Sale.deleteAll = async () => {
  return request(`/entities/Sale`, { method: 'DELETE' });
};

base44.auth = {};
base44.auth.login = async (username, password) => {
  const res = await request(`/auth/login`, { method: 'POST', body: { username, password } });
  if (res && res.token) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', res.token);
    }
  }
  return res;
};
base44.auth.adminOverride = async (username, password) => {
  return request(`/auth/admin-override`, { method: 'POST', body: { username, password } });
};
base44.auth.me = async () => {
  return request(`/auth/me`, { method: 'GET' });
};
base44.auth.logout = async () => {
  try { await request(`/auth/logout`, { method: 'POST' }); } catch {}
  if (typeof window !== 'undefined') {
    localStorage.removeItem('auth_token');
  }
  return { ok: true };
};
base44.auth.redirectToLogin = (returnUrl) => {
  if (typeof window !== 'undefined') {
    const target = '/Login' + (returnUrl ? `?return=${encodeURIComponent(returnUrl)}` : '');
    window.location.assign(target);
  }
};

base44.subscription = {};
base44.subscription.status = async () => {
  return request(`/subscription/status`, { method: 'GET' });
};
base44.subscription.current = async () => {
  return request(`/subscription/current`, { method: 'GET' });
};
base44.subscription.purchase = async (payload) => {
  return request(`/subscription/purchase`, { method: 'POST', body: payload });
};

base44.license = {};
base44.license.generate = async (payload) => {
  return request(`/license/generate`, { method: 'POST', body: payload });
};
base44.license.activate = async (payload) => {
  return request(`/license/activate`, { method: 'POST', body: payload });
};
base44.license.list = async (limit = 20) => {
  return request(`/license/list`, { method: 'GET', params: { limit } });
};
base44.license.get = async (id) => {
  return request(`/license/${id}`, { method: 'GET' });
};
base44.license.update = async (id, payload) => {
  return request(`/license/${id}`, { method: 'PUT', body: payload });
};
base44.license.delete = async (id) => {
  return request(`/license/${id}`, { method: 'DELETE' });
};

// Categories helpers
base44.categories = {};
base44.categories.syncFromCenter = async (sourceBranchId) => {
  const params = {};
  if (sourceBranchId) params.source_branch_id = String(sourceBranchId);
  return request(`/categories/sync-from-center`, { method: 'POST', params });
};

// Branches
base44.branches = {};
base44.branches.list = async (params) => {
  return request(`/branches`, { method: 'GET', params });
};
base44.branches.create = async (payload) => {
  return request(`/branches`, { method: 'POST', body: payload });
};
base44.branches.update = async (id, payload) => {
  return request(`/branches/${id}`, { method: 'PUT', body: payload });
};
base44.branches.delete = async (id) => {
  return request(`/branches/${id}`, { method: 'DELETE' });
};

// Stock transfers
base44.stockTransfers = {};
base44.stockTransfers.list = async (params) => {
  return request(`/stock-transfers`, { method: 'GET', params });
};
base44.stockTransfers.create = async (payload) => {
  return request(`/stock-transfers`, { method: 'POST', body: payload });
};
base44.stockTransfers.receive = async (id, payload) => {
  return request(`/stock-transfers/${id}/receive`, { method: 'POST', body: payload || {} });
};
base44.stockTransfers.resyncReceive = async (idOrDoc) => {
  const id = String(idOrDoc);
  return request(`/stock-transfers/${id}/resync-receive`, { method: 'POST' });
};
base44.stockTransfers.receive = async (id, payload) => {
  return request(`/stock-transfers/${id}/receive`, { method: 'POST', body: payload || {} });
};

// User-branch access
base44.userBranches = {};
base44.userBranches.get = async (userId) => {
  return request(`/users/${userId}/branches`, { method: 'GET' });
};
base44.userBranches.set = async (userId, branchIds) => {
  return request(`/users/${userId}/branches`, { method: 'PUT', body: { branch_ids: branchIds } });
};

// Misc helpers
base44.products = {};
base44.products.listByBranch = async (branchId, sort = '-created_date') => {
  return request(`/entities/Product`, { params: { sort }, headers: { 'X-Branch-Id': String(branchId) } });
};
