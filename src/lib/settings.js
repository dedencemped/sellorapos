const STORAGE_KEY = 'pos_settings';
const BRANCH_PREFIX = 'pos_branch_settings_';

const DEFAULTS = {
  store_name: 'TOKO ANDA',
  store_address: '',
  store_phone: '',
  store_email: '',
  store_fax: '',
  store_npwp: '',
  store_business_license: '',
  logo_url: '',
  default_tax_percent: 0,
  default_discount_type: 'nominal',
  default_discount_value: 0,
  default_payment_method: 'cash',
  receipt_footer: '',
  invoice_footer: '',
  show_invoice_signatures: true,
  theme: 'system',
  primary_color: 'violet',
  accent_color: 'cyan',
  border_radius: 'md',
  sidebar_collapsed: false,
  mobile_mode: false,
  compact_mode: false,
  scanner_global_listener: true,
  scanner_auto_focus: true,
};

function getActiveBranchId() {
  try {
    if (typeof window === 'undefined') return '1';
    return String(window.localStorage.getItem('active_branch_id') || '1');
  } catch {
    return '1';
  }
}

function getBranchStorageKey(branchId) {
  return `${BRANCH_PREFIX}${String(branchId)}`;
}

const BRANCH_KEYS = new Set([
  'store_name',
  'store_address',
  'store_phone',
  'store_email',
  'store_fax',
  'store_npwp',
  'store_business_license',
  'logo_url',
  'default_tax_percent',
  'default_discount_type',
  'default_discount_value',
  'default_payment_method',
  'receipt_footer',
  'invoice_footer',
  'show_invoice_signatures',
]);

export function getSettings() {
  try {
    if (typeof window === 'undefined') return { ...DEFAULTS };
    const baseRaw = window.localStorage.getItem(STORAGE_KEY);
    const base = baseRaw ? JSON.parse(baseRaw) : {};
    const branchId = getActiveBranchId();
    const branchRaw = window.localStorage.getItem(getBranchStorageKey(branchId));
    const branch = branchRaw ? JSON.parse(branchRaw) : {};
    return { ...DEFAULTS, ...base, ...branch };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(partial) {
  try {
    const branchId = getActiveBranchId();
    const baseRaw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    const branchRaw = typeof window !== 'undefined' ? window.localStorage.getItem(getBranchStorageKey(branchId)) : null;
    const base = baseRaw ? JSON.parse(baseRaw) : {};
    const branch = branchRaw ? JSON.parse(branchRaw) : {};
    const nextBase = { ...base };
    const nextBranch = { ...branch };
    for (const [k, v] of Object.entries(partial || {})) {
      if (BRANCH_KEYS.has(k)) nextBranch[k] = v;
      else nextBase[k] = v;
    }
    const merged = { ...DEFAULTS, ...nextBase, ...nextBranch };
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextBase));
      window.localStorage.setItem(getBranchStorageKey(branchId), JSON.stringify(nextBranch));
      try {
        window.dispatchEvent(new CustomEvent('settings:updated', { detail: merged }));
      } catch {}
    }
    return merged;
  } catch {
    return getSettings();
  }
}

export function resetSettings() {
  try {
    if (typeof window !== 'undefined') {
      const branchId = getActiveBranchId();
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(getBranchStorageKey(branchId));
    }
  } catch {}
  return { ...DEFAULTS };
}
