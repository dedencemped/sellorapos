import http from 'http'
import dotenv from 'dotenv'
import { getPool } from './db.js'
import url from 'url'
import { StringDecoder } from 'string_decoder'
import { createHash, randomBytes, createHmac, randomUUID } from 'node:crypto'

dotenv.config()

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000
const ADMIN_OVERRIDE_SECRET = String(process.env.ADMIN_OVERRIDE_SECRET || process.env.LICENSE_SECRET || 'admin-override-secret').trim()

const sendJson = (res, statusCode, data, headers = {}) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-App-Id, Authorization, X-Branch-Id, X-Admin-Override',
    ...headers
  })
  res.end(JSON.stringify(data))
}

const publicErrorMessage = (err, fallback) => {
  const fallbackMsg = String(fallback || 'Terjadi kesalahan').trim() || 'Terjadi kesalahan'
  const msg = String(err?.message || '').trim()
  if (!msg) return fallbackMsg
  const code = String(err?.code || '').trim()
  const lower = msg.toLowerCase()
  const looksLikeDb =
    (code && code.startsWith('ER_')) ||
    lower.includes('sql') ||
    lower.includes('unknown column') ||
    lower.includes('duplicate') ||
    lower.includes('constraint') ||
    lower.includes('foreign key') ||
    lower.includes('database') ||
    lower.includes('syntax')
  if (looksLikeDb) return fallbackMsg
  const allowStarts = [
    'Stok tidak mencukupi',
    'Produk tidak ditemukan',
    'Invalid JSON',
    'username',
    'Username',
    'License',
    'No fields to update',
    'Invalid id',
    'Forbidden',
    'Not Found',
    'Transfer not found',
    'Tidak ada item valid',
    'Tidak bisa hapus',
    'Gagal memproses FIFO',
    'Gagal memproses penerimaan stok'
  ]
  if (allowStarts.some(p => msg.startsWith(p))) return msg
  if (msg.length <= 100 && !/[<>{}[\]]/.test(msg)) return msg
  return fallbackMsg
}

const sendError = (res, statusCode, err, fallback) => {
  sendJson(res, statusCode, { error: publicErrorMessage(err, fallback) })
}

const createAdminOverrideToken = (payload) => {
  const payloadStr = JSON.stringify(payload || {})
  const payloadB64 = Buffer.from(payloadStr).toString('base64')
  const sig = createHmac('sha256', ADMIN_OVERRIDE_SECRET).update(payloadB64).digest('hex')
  return `${payloadB64}.${sig}`
}

const verifyAdminOverrideToken = (token) => {
  const raw = String(token || '').trim()
  if (!raw || !raw.includes('.')) return null
  const [payloadB64, sig] = raw.split('.', 2)
  if (!payloadB64 || !sig) return null
  const expected = createHmac('sha256', ADMIN_OVERRIDE_SECRET).update(payloadB64).digest('hex')
  if (sig !== expected) return null
  let payload = null
  try { payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8')) } catch { payload = null }
  if (!payload) return null
  const exp = Number(payload.exp || 0)
  if (!Number.isFinite(exp) || exp <= Date.now()) return null
  const role = String(payload.role || '').toLowerCase()
  if (!['admin', 'license_admin', 'superadmin'].includes(role)) return null
  return payload
}

const readJsonBody = async (req) => {
  return new Promise((resolve, reject) => {
    const decoder = new StringDecoder('utf8')
    
    let buffer = ''
    req.on('data', (data) => {
      buffer += decoder.write(data)
    })
    req.on('end', () => {
      buffer += decoder.end()
      try {
        const json = buffer ? JSON.parse(buffer) : {}
        resolve(json)
      } catch (e) {
        console.error('Invalid JSON body:', buffer)
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

const addMonths = (d, months) => {
  const date = new Date(d)
  const target = date.getDate()
  date.setMonth(date.getMonth() + months)
  if (date.getDate() !== target) {
    date.setDate(0)
  }
  return date
}
const getAuthUid = (req) => {
  try {
    const auth = req.headers?.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (!token) return null
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'))
    return decoded?.uid || null
  } catch { return null }
}
const getSubscriptionStatus = async (pool) => {
  // Priority: Active over Expired, then Profesional over Basic, then latest expiry
  const [rows] = await pool.query(`
    SELECT id, plan, package_name, valid_from, valid_until 
    FROM app_subscriptions 
    ORDER BY 
      (CASE WHEN valid_until > NOW() THEN 1 ELSE 0 END) DESC,
      (CASE WHEN package_name = 'Profesional' THEN 1 ELSE 0 END) DESC, 
      COALESCE(valid_until, valid_from) DESC 
    LIMIT 1
  `)
  const now = new Date()
  if (rows.length === 0) {
    console.log(`[SUBSCRIPTION] No subscription found, returning Basic`)
    return { status: 'none', valid_until: null, days_left: -1, package_name: 'Basic' }
  }
  const vu = rows[0].valid_until ? new Date(rows[0].valid_until) : null
  const pn = rows[0].package_name || 'Basic'
  console.log(`[SUBSCRIPTION] Found subscription ID: ${rows[0].id}, package_name: ${pn}`)
  if (!vu) {
    return { status: 'none', valid_until: null, days_left: -1, package_name: pn }
  }
  const diff = vu.getTime() - now.getTime()
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  if (vu > now) {
    return { status: 'active', valid_until: vu.toISOString(), days_left: days, package_name: pn }
  }
  try {
    await pool.query(`UPDATE app_licenses SET status = 'non_aktif' WHERE status = 'aktif' AND end_date IS NOT NULL AND end_date < NOW()`)
  } catch {}
  return { status: 'expired', valid_until: vu.toISOString(), days_left: days, package_name: pn }
}
const ensureBranchAccess = async (pool, req, branchId) => {
  try {
    const uid = getAuthUid(req)
    if (!uid) return true
    const [urows] = await pool.query(`SELECT role FROM users WHERE id = ? LIMIT 1`, [uid])
    const role = (urows?.[0]?.role || '').toLowerCase()
    if (['admin','license_admin','superadmin'].includes(role)) return true
    const [maps] = await pool.query(`SELECT 1 FROM user_branches WHERE user_id = ? AND branch_id = ? LIMIT 1`, [uid, branchId])
    return maps.length > 0
  } catch { return false }
}

const getPusatId = async (pool) => {
  try {
    const [rows] = await pool.query(`SELECT id FROM branches WHERE name = 'Pusat' OR code = 'PST' ORDER BY id ASC LIMIT 1`);
    return rows[0]?.id || 1;
  } catch { return 1; }
}

const ensureTables = async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS branches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      code VARCHAR(64) NULL,
      address TEXT NULL,
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `)
  // Seed default branch
  const [bcount] = await pool.query(`SELECT COUNT(*) AS c FROM branches`)
  if ((bcount?.[0]?.c || 0) === 0) {
    await pool.query(`INSERT INTO branches (name, code) VALUES ('Pusat', 'PST')`)
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      custom_id VARCHAR(64) NULL,
      barcode VARCHAR(255),
      name VARCHAR(255) NOT NULL,
      category VARCHAR(255),
      brand VARCHAR(255),
      image_url LONGTEXT,
      default_unit VARCHAR(10) DEFAULT 'PCS',
      pcs_per_dus INT DEFAULT 1,
      buy_price_pcs DECIMAL(12,2) DEFAULT 0,
      buy_price_dus DECIMAL(12,2) DEFAULT 0,
      sell_price_pcs DECIMAL(12,2) DEFAULT 0,
      sell_price_dus DECIMAL(12,2) DEFAULT 0,
      stock_pcs INT DEFAULT 0,
      min_stock_pcs INT DEFAULT 0,
      is_active TINYINT(1) DEFAULT 1,
      branch_id INT DEFAULT 1,
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE INDEX idx_custom_id_branch (custom_id, branch_id)
    );
  `)
  // Ensure image_url exists for older tables
  const [imgCol] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'image_url'`
  )
  if (imgCol.length === 0) {
    await pool.query(`ALTER TABLE products ADD COLUMN image_url LONGTEXT AFTER brand`)
  }
  // Ensure default_unit exists for older tables
  const [unitCol] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'default_unit'`
  )
  if (unitCol.length === 0) {
    await pool.query(`ALTER TABLE products ADD COLUMN default_unit VARCHAR(10) DEFAULT 'PCS' AFTER brand`)
  }
  // Add column custom_id if missing
  const [customIdCol] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'custom_id'`
  )
  if (customIdCol.length === 0) {
    await pool.query(`ALTER TABLE products ADD COLUMN custom_id VARCHAR(64) NULL`)
    await pool.query(`CREATE UNIQUE INDEX idx_custom_id_branch ON products(custom_id, branch_id)`)
  } else {
    // Check if it's a global unique index and fix it if necessary
    const [indexes] = await pool.query(`SHOW INDEX FROM products WHERE Column_name = 'custom_id'`)
    const uniqueIndex = indexes.find(idx => idx.Non_unique === 0)
    if (uniqueIndex && uniqueIndex.Key_name === 'custom_id') {
      try {
        await pool.query(`ALTER TABLE products DROP INDEX custom_id`)
        await pool.query(`CREATE UNIQUE INDEX idx_custom_id_branch ON products(custom_id, branch_id)`)
      } catch (err) {
        console.error('[DB FIX] Failed to migrate custom_id index:', err.message)
      }
    }
  }
  const [srcProdIdCol] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'source_product_id'`
  )
  if (srcProdIdCol.length === 0) {
    await pool.query(`ALTER TABLE products ADD COLUMN source_product_id VARCHAR(64) NULL AFTER custom_id`)
    await pool.query(`CREATE INDEX idx_source_product_id ON products(source_product_id)`)
  } else {
    // Ensure it's VARCHAR if it was previously INT
    const [colType] = await pool.query(
      `SELECT DATA_TYPE FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'source_product_id'`
    )
    if (colType.length > 0 && colType[0].DATA_TYPE === 'int') {
      await pool.query(`ALTER TABLE products MODIFY COLUMN source_product_id VARCHAR(64) NULL`)
    }
  }
  const [prodBranchCol] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'branch_id'`
  )
  if (prodBranchCol.length === 0) {
    await pool.query(`ALTER TABLE products ADD COLUMN branch_id INT DEFAULT 1 AFTER is_active`)
    await pool.query(`UPDATE products SET branch_id = 1 WHERE branch_id IS NULL`)
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      branch_id INT DEFAULT 1,
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `)
  // Ensure default_unit exists for categories
  const [catUnitCol] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'default_unit'`
  )
  if (catUnitCol.length === 0) {
    await pool.query(`ALTER TABLE categories ADD COLUMN default_unit VARCHAR(32) NULL AFTER description`)
  }
  const [catBranchCol] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'branch_id'`
  )
  if (catBranchCol.length === 0) {
    await pool.query(`ALTER TABLE categories ADD COLUMN branch_id INT DEFAULT 1 AFTER description`)
    await pool.query(`UPDATE categories SET branch_id = 1 WHERE branch_id IS NULL`)
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      address TEXT,
      total_debt DECIMAL(12,2) DEFAULT 0,
      branch_id INT DEFAULT 1,
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `)
  const [custBranchCol] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'branch_id'`
  )
  if (custBranchCol.length === 0) {
    await pool.query(`ALTER TABLE customers ADD COLUMN branch_id INT DEFAULT 1 AFTER total_debt`)
    await pool.query(`UPDATE customers SET branch_id = 1 WHERE branch_id IS NULL`)
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS units (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(64) NOT NULL UNIQUE,
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      address TEXT,
      total_debt DECIMAL(12,2) DEFAULT 0,
      branch_id INT DEFAULT 1,
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `)
  const [supBranchCol] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'branch_id'`
  )
  if (supBranchCol.length === 0) {
    await pool.query(`ALTER TABLE suppliers ADD COLUMN branch_id INT DEFAULT 1 AFTER total_debt`)
    await pool.query(`UPDATE suppliers SET branch_id = 1 WHERE branch_id IS NULL`)
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchases (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice_number VARCHAR(100),
      supplier_id INT,
      supplier_name VARCHAR(255),
      items LONGTEXT,
      subtotal DECIMAL(12,2) DEFAULT 0,
      total DECIMAL(12,2) DEFAULT 0,
      payment_method VARCHAR(50),
      paid_amount DECIMAL(12,2) DEFAULT 0,
      debt_amount DECIMAL(12,2) DEFAULT 0,
      purchase_date DATETIME,
      status VARCHAR(50),
      branch_id INT DEFAULT 1,
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `)
  const [statusCol] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchases' AND COLUMN_NAME = 'status'`
  )
  if (statusCol.length === 0) {
    await pool.query(`ALTER TABLE purchases ADD COLUMN status VARCHAR(50)`)
  }
  const [purBranchCol] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchases' AND COLUMN_NAME = 'branch_id'`
  )
  if (purBranchCol.length === 0) {
    await pool.query(`ALTER TABLE purchases ADD COLUMN branch_id INT DEFAULT 1 AFTER status`)
    await pool.query(`UPDATE purchases SET branch_id = 1 WHERE branch_id IS NULL`)
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_mutations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id VARCHAR(64),
      product_name VARCHAR(255),
      type VARCHAR(20),
      qty_pcs INT DEFAULT 0,
      stock_before INT DEFAULT 0,
      stock_after INT DEFAULT 0,
      reference_type VARCHAR(50),
      reference_id VARCHAR(64) NULL,
      notes TEXT,
      branch_id INT DEFAULT 1,
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `)
  // Ensure column types are compatible with string-based IDs
  const [prodIdType] = await pool.query(
    `SELECT DATA_TYPE FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_mutations' AND COLUMN_NAME = 'product_id'`
  )
  if (prodIdType.length > 0 && prodIdType[0].DATA_TYPE !== 'varchar') {
    await pool.query(`ALTER TABLE stock_mutations MODIFY COLUMN product_id VARCHAR(64)`)
  }
  const [refIdType] = await pool.query(
    `SELECT DATA_TYPE FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_mutations' AND COLUMN_NAME = 'reference_id'`
  )
  if (refIdType.length > 0 && refIdType[0].DATA_TYPE !== 'varchar') {
    await pool.query(`ALTER TABLE stock_mutations MODIFY COLUMN reference_id VARCHAR(64) NULL`)
  }
  const [notesCol] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_mutations' AND COLUMN_NAME = 'notes'`
  )
  if (notesCol.length === 0) {
    await pool.query(`ALTER TABLE stock_mutations ADD COLUMN notes TEXT AFTER reference_id`)
  }
  const [mutBranchCol] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_mutations' AND COLUMN_NAME = 'branch_id'`
  )
  if (mutBranchCol.length === 0) {
    await pool.query(`ALTER TABLE stock_mutations ADD COLUMN branch_id INT DEFAULT 1 AFTER notes`)
    await pool.query(`UPDATE stock_mutations SET branch_id = 1 WHERE branch_id IS NULL`)
  }
  // Backfill missing notes for legacy stock_transfer mutations using doc_number and branch names
  try {
    await pool.query(`
      UPDATE stock_mutations sm
      JOIN stock_transfers st ON st.id = CAST(sm.reference_id AS UNSIGNED)
      LEFT JOIN branches fb ON fb.id = st.from_branch_id
      LEFT JOIN branches tb ON tb.id = st.to_branch_id
      SET sm.notes = CONCAT(COALESCE(fb.name, CONCAT('Cabang ', st.from_branch_id)), ' / ', COALESCE(tb.name, CONCAT('Cabang ', st.to_branch_id)), ' ', COALESCE(st.doc_number, CONCAT('#', st.id)))
      WHERE (sm.notes IS NULL OR TRIM(sm.notes) = '')
        AND sm.reference_type = 'stock_transfer'
    `)
  } catch {}
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_transfers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      doc_number VARCHAR(32) UNIQUE,
      from_branch_id INT NOT NULL,
      to_branch_id INT NOT NULL,
      items LONGTEXT,
      notes TEXT,
      status VARCHAR(20) DEFAULT 'sent',
      received_by VARCHAR(255) NULL,
      receive_notes TEXT NULL,
      received_date DATETIME NULL,
      transfer_date DATETIME,
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `)
  const [docCol] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_transfers' AND COLUMN_NAME = 'doc_number'`
  )
  if (docCol.length === 0) {
    await pool.query(`ALTER TABLE stock_transfers ADD COLUMN doc_number VARCHAR(32) UNIQUE AFTER id`)
  }
  const ensureCol = async (name, ddl) => {
    const [col] = await pool.query(
      `SELECT 1 FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_transfers' AND COLUMN_NAME = ?`, [name]
    )
    if (col.length === 0) {
      await pool.query(`ALTER TABLE stock_transfers ADD COLUMN ${name} ${ddl}`)
    }
  }
  await ensureCol('status', `VARCHAR(20) DEFAULT 'sent' AFTER notes`)
  await ensureCol('received_by', `VARCHAR(255) NULL AFTER status`)
  await ensureCol('receive_notes', `TEXT NULL AFTER received_by`)
  await ensureCol('received_date', `DATETIME NULL AFTER receive_notes`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice_number VARCHAR(100),
      customer_id INT NULL,
      customer_name VARCHAR(255) NULL,
      items LONGTEXT,
      subtotal DECIMAL(12,2) DEFAULT 0,
      total DECIMAL(12,2) DEFAULT 0,
      discount_type VARCHAR(20) NULL,
      discount_value DECIMAL(12,2) DEFAULT 0,
      discount_amount DECIMAL(12,2) DEFAULT 0,
      tax_percent DECIMAL(12,2) DEFAULT 0,
      tax_amount DECIMAL(12,2) DEFAULT 0,
      payment_method VARCHAR(50),
      paid_amount DECIMAL(12,2) DEFAULT 0,
      change_amount DECIMAL(12,2) DEFAULT 0,
      debt_amount DECIMAL(12,2) DEFAULT 0,
      due_date DATE NULL,
      notes TEXT NULL,
      cashier_name VARCHAR(255) NULL,
      sale_date DATETIME,
      status VARCHAR(50),
      branch_id INT DEFAULT 1,
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `)
  const [saleBranchCol] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales' AND COLUMN_NAME = 'branch_id'`
  )
  if (saleBranchCol.length === 0) {
    await pool.query(`ALTER TABLE sales ADD COLUMN branch_id INT DEFAULT 1 AFTER status`)
    await pool.query(`UPDATE sales SET branch_id = 1 WHERE branch_id IS NULL`)
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      type VARCHAR(50),
      party_id INT,
      party_name VARCHAR(255),
      amount DECIMAL(12,2) DEFAULT 0,
      payment_method VARCHAR(50),
      payment_date DATETIME,
      notes TEXT,
      branch_id INT DEFAULT 1,
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `)
  const [payCreatedCol] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'created_date'`
  )
  if (payCreatedCol.length === 0) {
    await pool.query(`ALTER TABLE payments ADD COLUMN created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP`)
  }
  const [payDateCol] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'payment_date'`
  )
  if (payDateCol.length === 0) {
    await pool.query(`ALTER TABLE payments ADD COLUMN payment_date DATETIME`)
  }
  const [payNotesCol] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'notes'`
  )
  if (payNotesCol.length === 0) {
    await pool.query(`ALTER TABLE payments ADD COLUMN notes TEXT`)
  }
  const [payBranchCol] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'branch_id'`
  )
  if (payBranchCol.length === 0) {
    await pool.query(`ALTER TABLE payments ADD COLUMN branch_id INT DEFAULT 1 AFTER notes`)
    await pool.query(`UPDATE payments SET branch_id = 1 WHERE branch_id IS NULL`)
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_branches (
      user_id INT NOT NULL,
      branch_id INT NOT NULL,
      PRIMARY KEY (user_id, branch_id)
    );
  `)
  // sessions table dihapus sesuai permintaan: auth dibuat stateless
  
  // Users table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      full_name VARCHAR(255) NOT NULL,
      role VARCHAR(32) NOT NULL DEFAULT 'staf',
      password_hash VARCHAR(128) NOT NULL,
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // FIFO Product Batches table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_batches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id VARCHAR(64) NOT NULL,
      purchase_price DECIMAL(12,2) DEFAULT 0,
      initial_qty INT DEFAULT 0,
      remaining_qty INT DEFAULT 0,
      branch_id INT DEFAULT 1,
      purchase_id INT NULL,
      transfer_batch_id INT NULL,
      notes VARCHAR(255) NULL,
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_product_branch (product_id, branch_id),
      INDEX idx_created (created_date)
    );
  `)

  // Check if notes column exists in product_batches (for existing tables)
  const [batchNotesCol] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_batches' AND COLUMN_NAME = 'notes'`
  )
  if (batchNotesCol.length === 0) {
    await pool.query(`ALTER TABLE product_batches ADD COLUMN notes VARCHAR(255) NULL AFTER purchase_id`)
  }

  // Check if transfer_batch_id column exists
  const [batchTransferCol] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_batches' AND COLUMN_NAME = 'transfer_batch_id'`
  )
  if (batchTransferCol.length === 0) {
    await pool.query(`ALTER TABLE product_batches ADD COLUMN transfer_batch_id INT NULL AFTER purchase_id`)
  }

  // Add profit fields to sales
  const [saleProfitCol] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales' AND COLUMN_NAME = 'total_cost'`
  )
  if (saleProfitCol.length === 0) {
    await pool.query(`ALTER TABLE sales ADD COLUMN total_cost DECIMAL(12,2) DEFAULT 0 AFTER total`)
    await pool.query(`ALTER TABLE sales ADD COLUMN total_profit DECIMAL(12,2) DEFAULT 0 AFTER total_cost`)
  }

  // Ensure is_system flag exists to hide internal users
  const [isSystemCol] = await pool.query(
    `SHOW COLUMNS FROM users LIKE 'is_system'`
  )
  if (isSystemCol.length === 0) {
    await pool.query(`ALTER TABLE users ADD COLUMN is_system TINYINT(1) DEFAULT 0 AFTER password_hash`)
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_subscriptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      plan VARCHAR(20) NOT NULL,
      package_name VARCHAR(50) DEFAULT 'Basic',
      valid_from DATETIME,
      valid_until DATETIME,
      payment_date DATETIME,
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_licenses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      phone VARCHAR(50),
      address TEXT,
      type VARCHAR(20) NOT NULL,
      package_name VARCHAR(50) DEFAULT 'Basic',
      months INT,
      start_date DATETIME,
      end_date DATETIME,
      status VARCHAR(20),
      license_key VARCHAR(512) NOT NULL UNIQUE,
      payload LONGTEXT,
      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `)
  const [priceCol] = await pool.query(
    `SHOW COLUMNS FROM app_licenses LIKE 'price'`
  )
  if (priceCol.length === 0) {
    await pool.query(`ALTER TABLE app_licenses ADD COLUMN price DECIMAL(12,2) NULL AFTER address`)
  }
  const [packageNameColLic] = await pool.query(
    `SHOW COLUMNS FROM app_licenses LIKE 'package_name'`
  )
  if (packageNameColLic.length === 0) {
    await pool.query(`ALTER TABLE app_licenses ADD COLUMN package_name VARCHAR(50) DEFAULT 'Basic' AFTER type`)
  }
  const [packageNameColSub] = await pool.query(
    `SHOW COLUMNS FROM app_subscriptions LIKE 'package_name'`
  )
  if (packageNameColSub.length === 0) {
    await pool.query(`ALTER TABLE app_subscriptions ADD COLUMN package_name VARCHAR(50) DEFAULT 'Basic' AFTER plan`)
  }
  try {
    const [subExists] = await pool.query(`SELECT id FROM app_subscriptions LIMIT 1`)
    if (subExists.length === 0) {
      const months = Number(process.env.DEFAULT_SUBSCRIPTION_MONTHS || 1)
      const now = new Date()
      const valid_until = addMonths(now, months)
      await pool.query(
        `INSERT INTO app_subscriptions (plan, package_name, valid_from, valid_until, payment_date) VALUES (?, ?, ?, ?, ?)`,
        ['init', 'Basic', now, valid_until, now]
      )
      console.log(`[INIT] Subscription activated: +${months} month(s), valid_until=${valid_until.toISOString()}`)
    }
  } catch (e) {
    console.warn(`[INIT] Failed to auto-activate subscription:`, e?.message || e)
  }
  // Seed or ensure hidden system user
  const desiredSystemUser = process.env.DEFAULT_SYSTEM_USER
  const desiredSystemPass = process.env.DEFAULT_SYSTEM_PASSWORD
  if (desiredSystemUser) {
    const [existsUser] = await pool.query(`SELECT id, is_system FROM users WHERE username = ? LIMIT 1`, [desiredSystemUser])
    if (existsUser.length === 0) {
      if (!desiredSystemPass) {
        console.warn(`[INIT] DEFAULT_SYSTEM_PASSWORD is not set for desired system user "${desiredSystemUser}". Skipping create.`)
      } else {
        const password_hash = createHash('sha256').update(desiredSystemPass).digest('hex')
        await pool.query(
          `INSERT INTO users (username, full_name, role, password_hash, is_system) VALUES (?, ?, 'admin', ?, 1)`,
          [desiredSystemUser, 'System', password_hash]
        )
        console.log(`[INIT] Hidden system user ensured -> username: ${desiredSystemUser}`)
      }
    } else if (Number(existsUser[0].is_system) !== 1) {
      await pool.query(`UPDATE users SET is_system = 1, role = 'admin' WHERE id = ?`, [existsUser[0].id])
      console.log(`[INIT] Marked existing user "${desiredSystemUser}" as hidden system user`)
    }
  } else {
    // Fallback: ensure at least one hidden system user exists
    const [hasSystem] = await pool.query(`SELECT id FROM users WHERE is_system = 1 LIMIT 1`)
    if (hasSystem.length === 0) {
      const username = 'system'
      const rawPass = randomBytes(6).toString('base64url')
      const password_hash = createHash('sha256').update(rawPass).digest('hex')
      await pool.query(
        `INSERT INTO users (username, full_name, role, password_hash, is_system) VALUES (?, ?, 'admin', ?, 1)`,
        [username, 'System', password_hash]
      )
      console.log(`[INIT] Hidden system user created -> username: ${username}, password: ${rawPass}`)
    }
  }
  // Ensure root user has full access (admin)
  const desiredRootUser = process.env.DEFAULT_ROOT_USER || 'root'
  const desiredRootPass = process.env.DEFAULT_ROOT_PASSWORD || null
  try {
    const [rootRows] = await pool.query(`SELECT id, username, role, password_hash FROM users WHERE username = ? LIMIT 1`, [desiredRootUser])
    if (rootRows.length === 0) {
      let rawPass = desiredRootPass
      if (!rawPass) {
        rawPass = randomBytes(8).toString('base64url')
        console.log(`[INIT] Created root user with temporary password: ${rawPass}`)
      }
      const password_hash = createHash('sha256').update(rawPass).digest('hex')
      await pool.query(
        `INSERT INTO users (username, full_name, role, password_hash, is_system) VALUES (?, ?, 'license_admin', ?, 0)`,
        [desiredRootUser, 'Root', password_hash]
      )
      console.log(`[INIT] Root user ensured -> username: ${desiredRootUser} (role: license_admin)`)
    } else {
      const root = rootRows[0]
      if (String(root.role) !== 'license_admin' && String(root.role) !== 'superadmin') {
        await pool.query(`UPDATE users SET role = 'license_admin' WHERE id = ?`, [root.id])
        console.log(`[INIT] Updated user "${desiredRootUser}" role to license_admin`)
      }
      if (desiredRootPass) {
        const password_hash = createHash('sha256').update(desiredRootPass).digest('hex')
        // Only update and log when the hash actually differs, to avoid noisy repeated logs
        if (String(root.password_hash || '') !== password_hash) {
          await pool.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [password_hash, root.id])
          console.log(`[INIT] Updated password for user "${desiredRootUser}" from env`)
        }
      }
    }
  } catch (e) {
    console.warn(`[INIT] Failed to ensure root user:`, e?.message || e)
  }

  // Seed superadmin user
  const desiredSuperadminUser = process.env.DEFAULT_SUPERADMIN_USER
  const desiredSuperadminPass = process.env.DEFAULT_SUPERADMIN_PASSWORD
  if (desiredSuperadminUser) {
    try {
      const [saRows] = await pool.query(`SELECT id, username, role, password_hash FROM users WHERE username = ? LIMIT 1`, [desiredSuperadminUser])
      if (saRows.length === 0) {
        if (!desiredSuperadminPass) {
          console.warn(`[INIT] DEFAULT_SUPERADMIN_PASSWORD is not set for desired superadmin user "${desiredSuperadminUser}". Skipping create.`)
        } else {
          const password_hash = createHash('sha256').update(desiredSuperadminPass).digest('hex')
          await pool.query(
            `INSERT INTO users (username, full_name, role, password_hash, is_system) VALUES (?, ?, 'superadmin', ?, 0)`,
            [desiredSuperadminUser, 'Super Admin', password_hash]
          )
          console.log(`[INIT] Super Admin user ensured -> username: ${desiredSuperadminUser}`)
        }
      } else {
        const sa = saRows[0]
        if (String(sa.role) !== 'superadmin') {
          await pool.query(`UPDATE users SET role = 'superadmin' WHERE id = ?`, [sa.id])
          console.log(`[INIT] Updated user "${desiredSuperadminUser}" role to superadmin`)
        }
        if (desiredSuperadminPass) {
          const password_hash = createHash('sha256').update(desiredSuperadminPass).digest('hex')
          if (String(sa.password_hash || '') !== password_hash) {
            await pool.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [password_hash, sa.id])
            console.log(`[INIT] Updated password for user "${desiredSuperadminUser}" from env`)
          }
        }
      }
    } catch (e) {
      console.warn(`[INIT] Failed to ensure superadmin user:`, e?.message || e)
    }
  }
  const [invCol] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales' AND COLUMN_NAME = 'invoice_number'`
  )
  if (invCol.length === 0) {
    await pool.query(`ALTER TABLE sales ADD COLUMN invoice_number VARCHAR(100)`)
  }
  const [statusSalesCol] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales' AND COLUMN_NAME = 'status'`
  )
  if (statusSalesCol.length === 0) {
    await pool.query(`ALTER TABLE sales ADD COLUMN status VARCHAR(50)`)
  }
  const requiredSalesCols = [
    { name: 'customer_id', ddl: 'INT NULL' },
    { name: 'customer_name', ddl: 'VARCHAR(255) NULL' },
    { name: 'items', ddl: 'LONGTEXT' },
    { name: 'subtotal', ddl: 'DECIMAL(12,2) DEFAULT 0' },
    { name: 'total', ddl: 'DECIMAL(12,2) DEFAULT 0' },
    { name: 'discount_type', ddl: 'VARCHAR(20) NULL' },
    { name: 'discount_value', ddl: 'DECIMAL(12,2) DEFAULT 0' },
    { name: 'discount_amount', ddl: 'DECIMAL(12,2) DEFAULT 0' },
    { name: 'tax_percent', ddl: 'DECIMAL(12,2) DEFAULT 0' },
    { name: 'tax_amount', ddl: 'DECIMAL(12,2) DEFAULT 0' },
    { name: 'payment_method', ddl: 'VARCHAR(50)' },
    { name: 'paid_amount', ddl: 'DECIMAL(12,2) DEFAULT 0' },
    { name: 'change_amount', ddl: 'DECIMAL(12,2) DEFAULT 0' },
    { name: 'debt_amount', ddl: 'DECIMAL(12,2) DEFAULT 0' },
    { name: 'due_date', ddl: 'DATE NULL' },
    { name: 'notes', ddl: 'TEXT NULL' },
    { name: 'cashier_name', ddl: 'VARCHAR(255) NULL' },
    { name: 'sale_date', ddl: 'DATETIME' },
    { name: 'created_date', ddl: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
  ]
  for (const col of requiredSalesCols) {
    const [exists] = await pool.query(
      `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales' AND COLUMN_NAME = ?`,
      [col.name]
    )
    if (exists.length === 0) {
      await pool.query(`ALTER TABLE sales ADD COLUMN ${col.name} ${col.ddl}`)
    }
  }
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true)
  const pathname = parsedUrl.pathname || '/'
  const method = req.method || 'GET'
  const branchId = (() => {
    const h = req.headers?.['x-branch-id']
    const q = parsedUrl?.query?.branch_id
    const v = Number(h ?? q ?? 1)
    return Number.isFinite(v) && v > 0 ? v : 1
  })()
  const uid = getAuthUid(req)

  if (method === 'OPTIONS') {
    sendJson(res, 200, { ok: true })
    return
  }

  try {
    // Manage user branch access
    if (pathname.match(/^\/api\/users\/\d+\/branches$/) && method === 'GET') {
      const pool = await getPool()
      await ensureTables(pool)
      if (!uid) { sendJson(res, 403, { error: 'Forbidden' }); return }
      const [self] = await pool.query(`SELECT role FROM users WHERE id = ? LIMIT 1`, [uid])
      const role = (self?.[0]?.role || '').toLowerCase()
      if (!['admin','license_admin','superadmin'].includes(role)) { sendJson(res, 403, { error: 'Forbidden' }); return }
      const id = Number(pathname.split('/')[3])
      if (!Number.isFinite(id) || id <= 0) { sendJson(res, 400, { error: 'Invalid id' }); return }
      const [rows] = await pool.query(`SELECT branch_id FROM user_branches WHERE user_id = ? ORDER BY branch_id ASC`, [id])
      sendJson(res, 200, rows.map(r => r.branch_id))
      return
    }
    if (pathname.match(/^\/api\/users\/\d+\/branches$/) && method === 'PUT') {
      const pool = await getPool()
      await ensureTables(pool)
      if (!uid) { sendJson(res, 403, { error: 'Forbidden' }); return }
      const [self] = await pool.query(`SELECT role FROM users WHERE id = ? LIMIT 1`, [uid])
      const role = (self?.[0]?.role || '').toLowerCase()
      if (!['admin','license_admin','superadmin'].includes(role)) { sendJson(res, 403, { error: 'Forbidden' }); return }
      const id = Number(pathname.split('/')[3])
      if (!Number.isFinite(id) || id <= 0) { sendJson(res, 400, { error: 'Invalid id' }); return }
      let body
      try { body = await readJsonBody(req) } catch { sendJson(res, 400, { error: 'Invalid JSON' }); return }
      const arr = Array.isArray(body?.branch_ids) ? body.branch_ids : []
      await pool.query(`DELETE FROM user_branches WHERE user_id = ?`, [id])
      for (const bid of arr) {
        const b = Number(bid)
        if (Number.isFinite(b) && b > 0) {
          await pool.query(`INSERT IGNORE INTO user_branches (user_id, branch_id) VALUES (?, ?)`, [id, b])
        }
      }
      sendJson(res, 200, { success: true })
      return
    }
    // Branches CRUD
    if (pathname === '/api/branches' && method === 'GET') {
      const pool = await getPool()
      await ensureTables(pool)
      let rows
      try {
        const uid = getAuthUid(req)
        if (uid) {
          const [urows] = await pool.query(`SELECT role FROM users WHERE id = ? LIMIT 1`, [uid])
          const role = (urows?.[0]?.role || '').toLowerCase()
          if (['admin','license_admin','superadmin'].includes(role) || parsedUrl.query.all === '1') {
            const [all] = await pool.query(`SELECT id, name, code, address, created_date FROM branches ORDER BY id ASC`)
            rows = all
          } else {
            const [allowed] = await pool.query(
              `SELECT b.id, b.name, b.code, b.address, b.created_date
               FROM branches b
               INNER JOIN user_branches ub ON ub.branch_id = b.id
               WHERE ub.user_id = ?
               ORDER BY b.id ASC`, [uid]
            )
            rows = allowed
          }
        } else {
          const [all] = await pool.query(`SELECT id, name, code, address, created_date FROM branches ORDER BY id ASC`)
          rows = all
        }
      } catch {
        const [fallback] = await pool.query(`SELECT id, name, code, address, created_date FROM branches ORDER BY id ASC`)
        rows = fallback
      }
      sendJson(res, 200, rows || [])
      return
    }
    if (pathname === '/api/branches' && method === 'POST') {
      const pool = await getPool()
      await ensureTables(pool)
      let body
      try { body = await readJsonBody(req) } catch { sendJson(res, 400, { error: 'Invalid JSON' }); return }
      const name = String(body.name || '').trim()
      if (!name) { sendJson(res, 400, { error: 'Nama cabang wajib diisi' }); return }
      const code = body.code ? String(body.code).trim() : null
      const address = body.address ? String(body.address).trim() : null
      const [r] = await pool.query(`INSERT INTO branches (name, code, address) VALUES (?, ?, ?)`, [name, code, address])
      const [rows] = await pool.query(`SELECT id, name, code, address, created_date FROM branches WHERE id = ?`, [r.insertId])
      sendJson(res, 201, rows[0])
      return
    }
    if (pathname.startsWith('/api/branches/') && (method === 'PUT' || method === 'PATCH')) {
      const pool = await getPool()
      await ensureTables(pool)
      const id = Number(pathname.split('/').pop())
      if (!Number.isFinite(id) || id <= 0) { sendJson(res, 400, { error: 'Invalid id' }); return }
      let body
      try { body = await readJsonBody(req) } catch { sendJson(res, 400, { error: 'Invalid JSON' }); return }
      const fields = ['name','code','address']
      const setClauses = []
      const values = []
      for (const f of fields) {
        if (body[f] !== undefined) { setClauses.push(`${f} = ?`); values.push(body[f]) }
      }
      if (setClauses.length === 0) { sendJson(res, 400, { error: 'No fields to update' }); return }
      values.push(id)
      await pool.query(`UPDATE branches SET ${setClauses.join(', ')} WHERE id = ?`, values)
      const [rows] = await pool.query(`SELECT id, name, code, address, created_date FROM branches WHERE id = ?`, [id])
      sendJson(res, 200, rows[0])
      return
    }
    if (pathname.startsWith('/api/branches/') && method === 'DELETE') {
      const pool = await getPool()
      await ensureTables(pool)
      const id = Number(pathname.split('/').pop())
      if (!Number.isFinite(id) || id <= 0) { sendJson(res, 400, { error: 'Invalid id' }); return }
      // Prevent deleting default branch
      const pusatId = await getPusatId(pool)
      if (id === pusatId) { sendJson(res, 400, { error: 'Tidak bisa menghapus cabang default' }); return }
      await pool.query(`DELETE FROM branches WHERE id = ?`, [id])
      sendJson(res, 200, { success: true })
      return
    }
    if (pathname === '/api/health' && method === 'GET') {
      sendJson(res, 200, { status: 'ok' })
      return
    }

    if (pathname.startsWith('/api/apps/public/prod/public-settings/by-id/') && method === 'GET') {
      const appId = pathname.split('/').pop()
      sendJson(res, 200, {
        app_id: appId,
        name: 'Local Base44 App',
        settings: {
          auth_required: false
        }
      })
      return
    }

    if (pathname === '/api/mysql/ping' && method === 'GET') {
      const pool = await getPool()
      const [rows] = await pool.query('SELECT 1 as ok')
      sendJson(res, 200, { db: 'mysql', ok: rows?.[0]?.ok === 1 })
      return
    }

    // Stock Transfers
    if ((pathname === '/api/stock-transfers' || pathname === '/api/stock-transfers/') && method === 'GET') {
      const pool = await getPool()
      await ensureTables(pool)
      const sort = parsedUrl.query.sort
      const order = sort === '-created_date' ? 'ORDER BY created_date DESC' : 'ORDER BY id DESC'
      const [rows] = await pool.query(
        `SELECT * FROM stock_transfers WHERE from_branch_id = ? OR to_branch_id = ? ${order}`,
        [branchId, branchId]
      )
      const data = rows.map(r => ({ ...r, items: r.items ? JSON.parse(r.items) : [] }))
      sendJson(res, 200, data)
      return
    }
    if ((pathname === '/api/stock-transfers' || pathname === '/api/stock-transfers/') && method === 'POST') {
      const pool = await getPool()
      await ensureTables(pool)
      const uid = getAuthUid(req)
      if (!uid) { sendJson(res, 403, { error: 'Forbidden' }); return }
      let body
      try { body = await readJsonBody(req) } catch { sendJson(res, 400, { error: 'Invalid JSON' }); return }
      const to_branch_id = Number(body?.to_branch_id)
      const pusatId = await getPusatId(pool)
      const from_branch_id = Number(body?.from_branch_id ?? branchId ?? pusatId)
      const items = Array.isArray(body?.items) ? body.items : []
      const notes = typeof body?.notes === 'string' ? body.notes : null
      if (!Number.isFinite(from_branch_id) || from_branch_id <= 0) {
        sendJson(res, 400, { error: 'Cabang asal tidak valid' }); return
      }
      if (!Number.isFinite(to_branch_id) || to_branch_id <= 0 || to_branch_id === from_branch_id) {
        sendJson(res, 400, { error: 'Cabang tujuan tidak valid' }); return
      }
      if (!items.length) { sendJson(res, 400, { error: 'Item wajib diisi' }); return }
      const okFrom = await ensureBranchAccess(pool, req, from_branch_id)
      if (!okFrom) { sendJson(res, 403, { error: 'Forbidden' }); return }

      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        const now = new Date()
        const y = now.getFullYear()
        const m = String(now.getMonth() + 1).padStart(2, '0')
        const d = String(now.getDate()).padStart(2, '0')
        const ymd = `${y}${m}${d}`
        const [cntRows] = await connection.query(`SELECT COUNT(*) as c FROM stock_transfers WHERE DATE(created_date) = CURDATE()`)
        const seq = Number(cntRows?.[0]?.c || 0) + 1
        const docNumber = `ST-${ymd}-${String(seq).padStart(4, '0')}`
        
        const [hdr] = await connection.query(
          `INSERT INTO stock_transfers (doc_number, from_branch_id, to_branch_id, items, notes, transfer_date) VALUES (?, ?, ?, '[]', ?, ?)`,
          [docNumber, from_branch_id, to_branch_id, notes, now]
        )
        const transferId = hdr.insertId

        let fromName = String(from_branch_id), toName = String(to_branch_id)
        try {
          const [brows] = await connection.query(`SELECT id, name FROM branches WHERE id IN (?, ?)`, [from_branch_id, to_branch_id])
          for (const b of brows) {
            if (Number(b.id) === Number(from_branch_id)) fromName = b.name || fromName
            if (Number(b.id) === Number(to_branch_id)) toName = b.name || toName
          }
        } catch {}
        const routeNote = `${fromName} / ${toName} ${docNumber}`
        const outItems = []

        for (const it of items) {
          const pid = it?.product_id ? String(it.product_id) : null
          const barcode = (it?.barcode ? String(it.barcode).trim() : '')
          
          let src = null
          if (pid && pid !== 'NaN') {
            const [prows] = await connection.query(`SELECT * FROM products WHERE id = ? AND branch_id = ? LIMIT 1 FOR UPDATE`, [pid, from_branch_id])
            src = prows[0] || null
          }
          if (!src && barcode && barcode.length >= 3) {
            const [prows2] = await connection.query(`SELECT * FROM products WHERE barcode = ? AND branch_id = ? LIMIT 1 FOR UPDATE`, [barcode, from_branch_id])
            src = prows2[0] || null
          }
          if (!src) continue

          const unit = String(it?.unit || '').trim().toUpperCase()
          const qtyValue = Number(it?.qty_value)
          const per = Number(src?.pcs_per_dus || 1) || 1
          let qty = Number(it?.qty_pcs)
          if (!Number.isFinite(qty) || qty <= 0) {
            if (Number.isFinite(qtyValue) && qtyValue > 0) {
              qty = unit && unit !== 'PCS' && per > 1 ? Math.round(qtyValue * per) : Math.round(qtyValue)
            }
          }
          qty = Math.round(qty || 0)
          if (qty <= 0) continue

          const stockBefore = Number(src.stock_pcs || 0)
          if (stockBefore < qty) {
            throw new Error(`Stok produk '${src.name}' tidak mencukupi (Tersedia: ${stockBefore}, Minta: ${qty})`);
          }

          // FIFO Deduction for Transfer
          let remainingToDeduct = qty;
          let totalTransferCost = 0;
          const usedBatches = [];
          let [batches] = await connection.query(
            `SELECT * FROM product_batches WHERE product_id = ? AND branch_id = ? AND remaining_qty > 0 ORDER BY id ASC`,
            [src.id, from_branch_id]
          );

          // RECONCILIATION: If stock_pcs > 0 but no batches, create a default batch to prevent crash
          if (batches.length === 0 && Number(src.stock_pcs || 0) > 0) {
            console.log(`[FIFO RECONCILE TRANSFER] Creating default batch for ${src.name} (ID: ${src.id}, Branch: ${from_branch_id})`);
            const defaultBuyPrice = Number(src.buy_price_pcs || 0);
            const currentStock = Number(src.stock_pcs || 0);
            await connection.query(
              `INSERT INTO product_batches (product_id, purchase_price, initial_qty, remaining_qty, branch_id)
               VALUES (?, ?, ?, ?, ?)`,
              [src.id, defaultBuyPrice, currentStock, currentStock, from_branch_id]
            );
            const [reRows] = await connection.query(
              `SELECT * FROM product_batches WHERE product_id = ? AND branch_id = ? AND remaining_qty > 0 ORDER BY created_date ASC`,
              [src.id, from_branch_id]
            );
            batches = reRows;
          }

          for (const batch of batches) {
            if (remainingToDeduct <= 0) break;
            const take = Math.min(remainingToDeduct, batch.remaining_qty);
            const cost = Number(batch.purchase_price || 0);
            totalTransferCost += take * cost;
            usedBatches.push({ id: batch.id, qty: take, purchase_price: cost });
            await connection.query(`UPDATE product_batches SET remaining_qty = remaining_qty - ? WHERE id = ? AND branch_id = ?`, [take, batch.id, from_branch_id]);
            remainingToDeduct -= take;
          }

          if (remainingToDeduct > 0) {
            throw new Error(`Gagal memproses FIFO untuk ${src.name}: Data batch tidak mencukupi (Kurang ${remainingToDeduct} PCS)`);
          }

          const stockAfter = stockBefore - qty
          await connection.query(`UPDATE products SET stock_pcs = ? WHERE id = ? AND branch_id = ?`, [stockAfter, src.id, from_branch_id])
          
          const outNote = [routeNote, notes && String(notes).trim() ? String(notes).trim() : null].filter(Boolean).join(' | ')
          await connection.query(
            `INSERT INTO stock_mutations (product_id, product_name, type, qty_pcs, stock_before, stock_after, reference_type, reference_id, notes, branch_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [String(src.id), src.name || null, 'out', qty, stockBefore, stockAfter, 'stock_transfer', String(transferId), outNote, from_branch_id]
          )

          outItems.push({
            product_id: String(src.id),
            source_product_id: src.source_product_id || String(src.id),
            barcode: src.barcode || null,
            name: src.name || null,
            category: src.category || null,
            brand: src.brand || null,
            image_url: src.image_url || null,
            buy_price_pcs: qty > 0 ? (totalTransferCost / qty) : (src.buy_price_pcs || 0),
            batch_details: usedBatches,
            buy_price_dus: src.buy_price_dus || 0,
            sell_price_pcs: src.sell_price_pcs || 0,
            sell_price_dus: src.sell_price_dus || 0,
            min_stock_pcs: src.min_stock_pcs || 0,
            unit: unit || (src.default_unit || 'PCS'),
            src_default_unit: src.default_unit || 'PCS',
            src_pcs_per_dus: Number(src.pcs_per_dus || 1) || 1,
            qty_value: Number.isFinite(qtyValue) && qtyValue > 0 ? qtyValue : null,
            qty_pcs: qty
          })
        }

        if (outItems.length === 0) {
          throw new Error('Tidak ada item valid untuk diproses');
        }

        await connection.query(`UPDATE stock_transfers SET items = ?, transfer_date = ? WHERE id = ?`, [JSON.stringify(outItems), new Date(), transferId])
        
        await connection.commit();
        const [trows] = await pool.query(`SELECT * FROM stock_transfers WHERE id = ?`, [transferId])
        const row = trows[0] || null
        if (row) row.items = row.items ? JSON.parse(row.items) : []
        sendJson(res, 201, row)
      } catch (err) {
        await connection.rollback();
        console.error(`[TRANSFER ERROR]`, err)
        sendError(res, 400, err, 'Gagal memproses transfer')
      } finally {
        connection.release();
      }
      return
    }
    if (pathname.match(/^\/api\/stock-transfers\/[^/]+\/receive\/?$/) && method === 'POST') {
      const pool = await getPool()
      await ensureTables(pool)
      const uid = getAuthUid(req)
      if (!uid) { sendJson(res, 403, { error: 'Forbidden' }); return }
      const slug = String(pathname.split('/').slice(-2, -1)[0] || '').trim()
      let id = Number(slug)
      let trs = []
      if (Number.isFinite(id) && id > 0) {
        const [rows] = await pool.query(`SELECT * FROM stock_transfers WHERE id = ?`, [id])
        trs = rows
      } else {
        const [rows] = await pool.query(`SELECT * FROM stock_transfers WHERE doc_number = ?`, [slug])
        trs = rows
        id = rows?.[0]?.id ? Number(rows[0].id) : NaN
      }
      if (!Number.isFinite(id) || id <= 0) { sendJson(res, 400, { error: 'Invalid id' }); return }
      const t = trs[0]
      if (!t) { sendJson(res, 404, { error: 'Transfer not found' }); return }
      const ok = await ensureBranchAccess(pool, req, Number(t.to_branch_id))
      if (!ok) { sendJson(res, 403, { error: 'Forbidden' }); return }
      let body
      try { body = await readJsonBody(req) } catch { body = {} }
      const [urows] = await pool.query(`SELECT username, full_name FROM users WHERE id = ? LIMIT 1`, [uid])
      const receiver = (urows?.[0]?.full_name || urows?.[0]?.username || `User#${uid}`)
      
      if (String(t.status || '').toLowerCase() === 'received') {
        sendJson(res, 200, t); return
      }

      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        await connection.query(
          `UPDATE stock_transfers SET status = 'received', received_by = ?, receive_notes = ?, received_date = ? WHERE id = ?`,
          [receiver, body?.notes ?? null, new Date(), id]
        )
        
        const [rows] = await connection.query(`SELECT * FROM stock_transfers WHERE id = ?`, [id])
        const row = rows[0] || null
        if (!row) throw new Error('Transfer record lost during update');
        row.items = row.items ? JSON.parse(row.items) : []

        let fromName = String(row.from_branch_id), toName = String(row.to_branch_id)
        try {
          const [brows] = await connection.query(`SELECT id, name FROM branches WHERE id IN (?, ?)`, [row.from_branch_id, row.to_branch_id])
          for (const b of brows) {
            if (Number(b.id) === Number(row.from_branch_id)) fromName = b.name || fromName
            if (Number(b.id) === Number(row.to_branch_id)) toName = b.name || toName
          }
        } catch {}
        const routeNote = `${fromName} / ${toName} ${row.doc_number || `#${row.id}`}`
        const items = Array.isArray(row.items) ? row.items : []
        const processed = []
        const pusatId = await getPusatId(connection)

        for (const it of items) {
          const pid = it?.product_id ? String(it.product_id) : null
          const source_pid = it?.source_product_id ? String(it.source_product_id) : (Number(row.from_branch_id) === pusatId ? pid : null)
          const barcode = (it?.barcode ? String(it.barcode).trim() : '')
          let itName = (it?.name ? String(it.name).trim() : '')
          
          console.log(`[TRANSFER RECEIVE] Processing item: pid=${pid}, source_pid=${source_pid}, barcode=${barcode}, name=${itName}`)

          // Fallback: Jika nama tidak ada di item transfer (data lama), ambil dari tabel produk cabang asal
          if (!itName && pid && pid !== 'NaN' && row.from_branch_id) {
            try {
              const [srcRows] = await connection.query(`SELECT name, barcode, category, brand, image_url, default_unit, pcs_per_dus, buy_price_pcs, buy_price_dus, sell_price_pcs, sell_price_dus, source_product_id FROM products WHERE id = ? AND branch_id = ? LIMIT 1`, [pid, row.from_branch_id]);
              if (srcRows?.[0]) {
                const s = srcRows[0];
                itName = s.name;
                it.name = s.name;
                it.barcode = s.barcode;
                it.category = s.category;
                it.brand = s.brand;
                it.image_url = s.image_url;
                it.src_default_unit = s.default_unit;
                it.src_pcs_per_dus = s.pcs_per_dus;
                it.buy_price_pcs = s.buy_price_pcs;
                it.buy_price_dus = s.buy_price_dus;
                it.sell_price_pcs = s.sell_price_pcs;
                it.sell_price_dus = s.sell_price_dus;
                it.source_product_id = s.source_product_id || (Number(row.from_branch_id) === 1 ? pid : null);
                console.log(`[TRANSFER RECEIVE] Fallback resolved name: ${itName}`)
              }
            } catch (err) {
              console.error(`[TRANSFER ERROR] Failed to fetch source product info:`, err.message);
            }
          }

          let dest = null
          // PRIORITAS 1: Cari berdasarkan source_product_id (Hanya jika source_pid valid)
          if (source_pid && String(source_pid).trim() !== '' && String(source_pid).toLowerCase() !== 'null') {
            const [dSrc] = await connection.query(`SELECT * FROM products WHERE source_product_id = ? AND branch_id = ? LIMIT 1 FOR UPDATE`, [source_pid, row.to_branch_id])
            if (dSrc[0]) {
              dest = dSrc[0];
              console.log(`[TRANSFER RECEIVE] Matched by source_product_id: ${dest.id} (${dest.name})`)
            }
          }
          // PRIORITAS 2: Cari berdasarkan barcode jika belum ketemu (Barcode harus unik dan valid)
          if (!dest && barcode && barcode !== '' && barcode.toLowerCase() !== 'null' && barcode.length >= 3) {
            const [d1] = await connection.query(`SELECT * FROM products WHERE barcode = ? AND branch_id = ? LIMIT 1 FOR UPDATE`, [barcode, row.to_branch_id])
            if (d1[0]) {
              dest = d1[0];
              console.log(`[TRANSFER RECEIVE] Matched by barcode: ${dest.id} (${dest.name})`)
            }
          }
          // PRIORITAS 3: Cari berdasarkan nama jika belum ketemu (Nama harus unik dan valid)
          if (!dest && itName && itName !== '' && itName.toLowerCase() !== 'null') {
            const [dByName] = await connection.query(`SELECT * FROM products WHERE name = ? AND branch_id = ? LIMIT 1 FOR UPDATE`, [itName, row.to_branch_id])
            if (dByName[0]) {
              dest = dByName[0];
              console.log(`[TRANSFER RECEIVE] Matched by name: ${dest.id} (${dest.name})`)
            }
          }

          const productData = {
            barcode: barcode || null,
            name: itName || it?.name || 'Produk Tanpa Nama',
            category: it?.category || null,
            brand: it?.brand || null,
            image_url: it?.image_url || null,
            default_unit: it?.src_default_unit || it?.unit || 'PCS',
            pcs_per_dus: Number(it?.src_pcs_per_dus || 1) || 1,
            buy_price_pcs: Number(it?.buy_price_pcs || 0) || 0,
            buy_price_dus: Number(it?.buy_price_dus || 0) || 0,
            sell_price_pcs: Number(it?.sell_price_pcs || 0) || 0,
            sell_price_dus: Number(it?.sell_price_dus || 0) || 0,
            min_stock_pcs: Number(it?.min_stock_pcs || 0) || 0,
            is_active: 1,
            branch_id: row.to_branch_id,
            source_product_id: source_pid
          }

          if (productData.category) {
            try {
              const [catRows] = await connection.query(`SELECT id FROM categories WHERE name = ? AND branch_id = ? LIMIT 1`, [productData.category, row.to_branch_id]);
              if (catRows.length === 0) {
                await connection.query(`INSERT INTO categories (name, branch_id) VALUES (?, ?)`, [productData.category, row.to_branch_id]);
              }
            } catch (err) {
              console.error(`[TRANSFER ERROR] Category sync failed:`, err.message);
            }
          }

          let dBefore = 0;
          const batchDetails = Array.isArray(it.batch_details) ? it.batch_details : [{ qty: qty, purchase_price: Number(it.buy_price_pcs || 0), id: null }];
          
          if (!dest) {
            console.log(`[TRANSFER RECEIVE] No existing product found. Creating new: ${productData.name}`)
            
            // Set initial master price from the FIRST batch in the transfer (FIFO)
            if (batchDetails.length > 0) {
              productData.buy_price_pcs = Number(batchDetails[0].purchase_price || productData.buy_price_pcs || 0);
              const per = Number(productData.pcs_per_dus || 1) || 1;
              productData.buy_price_dus = productData.buy_price_pcs * per;
            }

            const fields = Object.keys(productData)
            const values = Object.values(productData)
            const placeholders = fields.map(() => '?').join(',')
            
            // Inisialisasi dengan qty_pcs langsung saat INSERT untuk produk pertama kali
            let initialQty = Number(it?.qty_pcs)
            if (!Number.isFinite(initialQty) || initialQty <= 0) {
              const unit = String(it?.unit || '').trim().toUpperCase()
              const qtyValue = Number(it?.qty_value)
              const per = Number(it?.src_pcs_per_dus || 1) || 1
              if (Number.isFinite(qtyValue) && qtyValue > 0) {
                initialQty = unit && unit !== 'PCS' && per > 1 ? Math.round(qtyValue * per) : Math.round(qtyValue)
              }
            }
            initialQty = Math.round(initialQty || 0);
            if (initialQty < 0) initialQty = 0;

            const [ins] = await connection.query(
              `INSERT INTO products (${fields.join(',')}, stock_pcs) VALUES (${placeholders}, ?)`,
              [...values, initialQty]
            )
            const [d2] = await connection.query(`SELECT * FROM products WHERE id = ?`, [ins.insertId])
            dest = d2[0] || null
            dBefore = 0; 
            
            // Tandai qty sebagai sudah diproses untuk menghindari penambahan ganda di blok update bawah
            it._already_initialized = true;
            it._initial_qty = initialQty;
            
            console.log(`[TRANSFER] Created product ID ${dest?.id} in branch ${row.to_branch_id} with initial stock: ${initialQty}`)
          } else {
            dBefore = Number(dest.stock_pcs || 0);
            // Hanya update metadata jika dari Pusat, agar tidak merusak data lokal cabang yang mungkin berbeda sengaja
            if (Number(row.from_branch_id) === pusatId) {
              const fieldsToSync = ['category', 'brand', 'image_url', 'default_unit', 'pcs_per_dus', 'buy_price_pcs', 'buy_price_dus', 'sell_price_pcs', 'sell_price_dus']
              // Jangan paksa update Nama jika sudah ada (mencegah collision salah sasaran merusak nama)
              if (!dest.name || String(dest.name).trim() === '' || String(dest.name).toLowerCase() === 'null') {
                fieldsToSync.push('name')
              }
              
              const updates = []
              const updateValues = []
              for (const f of fieldsToSync) {
                if (productData[f] !== undefined && productData[f] !== null) {
                  updates.push(`${f} = ?`)
                  updateValues.push(productData[f])
                }
              }
              // Selalu pastikan source_product_id terisi jika belum ada
              if (!dest.source_product_id && source_pid) {
                updates.push(`source_product_id = ?`)
                updateValues.push(source_pid)
              }

              if (updates.length > 0) {
                updateValues.push(dest.id)
                await connection.query(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, updateValues)
              }
            }
          }

          if (!dest) continue;

          let qty = Number(it?.qty_pcs)
          if (!Number.isFinite(qty) || qty <= 0) {
            const unit = String(it?.unit || '').trim().toUpperCase()
            const qtyValue = Number(it?.qty_value)
            const per = Number(it?.src_pcs_per_dus || dest?.pcs_per_dus || 1) || 1
            if (Number.isFinite(qtyValue) && qtyValue > 0) {
              qty = unit && unit !== 'PCS' && per > 1 ? Math.round(qtyValue * per) : Math.round(qtyValue)
            }
            if ((!Number.isFinite(qty) || qty <= 0) && it?.qty !== undefined) {
              const legacyQty = Number(it.qty)
              if (Number.isFinite(legacyQty) && legacyQty > 0) {
                qty = unit && unit !== 'PCS' && per > 1 ? Math.round(legacyQty * per) : Math.round(legacyQty)
              }
            }
          }
          qty = Math.round(qty || 0);
          if (qty <= 0) continue

          const dAfter = it._already_initialized ? it._initial_qty : (dBefore + qty)
          
          if (!it._already_initialized) {
            console.log(`[TRANSFER DEBUG] Branch ${row.to_branch_id} Product ${dest.id} (${dest.name}): before=${dBefore}, adding=${qty}, expectedAfter=${dAfter}`)
            
            // FIFO: Update master product price based on the OLDEST batch available (including newly arriving ones)
            // If branch current stock is 0, use the first batch of this transfer
            let newBuyPricePcs = Number(dest.buy_price_pcs || 0);
            if (dBefore <= 0 && batchDetails.length > 0) {
              newBuyPricePcs = Number(batchDetails[0].purchase_price || 0);
            }
            
            const per = Number(dest.pcs_per_dus || 1) || 1;
            const newBuyPriceDus = newBuyPricePcs * per;
            
            if (newBuyPricePcs > 0) {
              await connection.query(`UPDATE products SET stock_pcs = stock_pcs + ?, buy_price_pcs = ?, buy_price_dus = ? WHERE id = ?`, [qty, newBuyPricePcs, newBuyPriceDus, dest.id])
            } else {
              await connection.query(`UPDATE products SET stock_pcs = stock_pcs + ? WHERE id = ?`, [qty, dest.id])
            }
            
            // FIFO: Create multiple batches in destination branch based on Pusat details
            for (const bd of batchDetails) {
              await connection.query(
                `INSERT INTO product_batches (product_id, purchase_price, initial_qty, remaining_qty, branch_id, purchase_id, transfer_batch_id, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [String(dest.id), Number(bd.purchase_price || 0), bd.qty, bd.qty, row.to_branch_id, null, bd.id ? String(bd.id) : null, `Transfer dari ${fromName} (${row.doc_number})`]
              );
            }

            // Re-fetch accurate after for mutation
            const [vRows] = await connection.query(`SELECT stock_pcs FROM products WHERE id = ?`, [dest.id])
            const actualAfter = Number(vRows?.[0]?.stock_pcs || 0)
            
            console.log(`[TRANSFER DEBUG] DB Verification: actualAfter=${actualAfter}`)
            
            const inNote = [routeNote, (row.receive_notes && String(row.receive_notes).trim()) ? String(row.receive_notes).trim() : null].filter(Boolean).join(' | ')
            await connection.query(
              `INSERT INTO stock_mutations (product_id, product_name, type, qty_pcs, stock_before, stock_after, reference_type, reference_id, notes, branch_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [String(dest.id), productData.name, 'in', qty, dBefore, actualAfter, 'stock_transfer', String(id), inNote, row.to_branch_id]
            )
          } else {
            // For newly created products, the stock was already set in INSERT
            // FIFO: Create multiple batches for newly created product based on Pusat details
            for (const bd of batchDetails) {
              await connection.query(
                `INSERT INTO product_batches (product_id, purchase_price, initial_qty, remaining_qty, branch_id, purchase_id, transfer_batch_id, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [String(dest.id), Number(bd.purchase_price || 0), bd.qty, bd.qty, row.to_branch_id, null, bd.id ? String(bd.id) : null, `Transfer dari ${fromName} (${row.doc_number})`]
              );
            }

            const inNote = [routeNote, (row.receive_notes && String(row.receive_notes).trim()) ? String(row.receive_notes).trim() : null].filter(Boolean).join(' | ')
            await connection.query(
              `INSERT INTO stock_mutations (product_id, product_name, type, qty_pcs, stock_before, stock_after, reference_type, reference_id, notes, branch_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [String(dest.id), productData.name, 'in', qty, 0, dAfter, 'stock_transfer', String(id), inNote, row.to_branch_id]
            )
          }
          processed.push({
            product_id: pid,
            dest_product_id: dest.id,
            barcode: barcode || null,
            name: itName || null,
            unit: it?.unit || null,
            src_default_unit: it?.src_default_unit || null,
            src_pcs_per_dus: it?.src_pcs_per_dus || null,
            qty_value: Number.isFinite(it?.qty_value) ? it.qty_value : null,
            qty_pcs: qty
          })
        }
        
        if (processed.length > 0) {
          await connection.query(`UPDATE stock_transfers SET items = ? WHERE id = ?`, [JSON.stringify(processed), id])
          row.items = processed
        }
        
        await connection.query(
          `UPDATE stock_mutations 
           SET notes = ? 
           WHERE reference_type = 'stock_transfer' AND reference_id = ? AND (notes IS NULL OR TRIM(notes) = '')`,
          [routeNote, String(id)]
        )

        await connection.commit();
        sendJson(res, 200, row)
      } catch (err) {
        await connection.rollback();
        console.error(`[TRANSFER CRITICAL ERROR]`, err)
        sendJson(res, 500, { error: 'Gagal memproses penerimaan stok' })
      } finally {
        connection.release();
      }
      return
    }
    if (pathname.match(/^\/api\/stock-transfers\/[^/]+\/resync-receive\/?$/) && method === 'POST') {
      const pool = await getPool()
      await ensureTables(pool)
      const uid = getAuthUid(req)
      if (!uid) { sendJson(res, 403, { error: 'Forbidden' }); return }
      const slug = String(pathname.split('/').slice(-2, -1)[0] || '').trim()
      let id = Number(slug)
      let trs = []
      if (Number.isFinite(id) && id > 0) {
        const [rows] = await pool.query(`SELECT * FROM stock_transfers WHERE id = ?`, [id])
        trs = rows
      } else {
        const [rows] = await pool.query(`SELECT * FROM stock_transfers WHERE doc_number = ?`, [slug])
        trs = rows
        id = rows?.[0]?.id ? Number(rows[0].id) : NaN
      }
      if (!Number.isFinite(id) || id <= 0) { sendJson(res, 400, { error: 'Invalid id' }); return }
      const t = trs[0]
      if (!t) { sendJson(res, 404, { error: 'Transfer not found' }); return }
      const ok = await ensureBranchAccess(pool, req, Number(t.to_branch_id))
      if (!ok) { sendJson(res, 403, { error: 'Forbidden' }); return }
      const [urows] = await pool.query(`SELECT username, full_name FROM users WHERE id = ? LIMIT 1`, [uid])
      const receiver = (urows?.[0]?.full_name || urows?.[0]?.username || `User#${uid}`)
      
      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        const [rows] = await connection.query(`SELECT * FROM stock_transfers WHERE id = ?`, [id])
        const row = rows[0] || null
        if (!row) throw new Error('Transfer record not found');
        row.items = row.items ? JSON.parse(row.items) : []

        let fromName = String(row.from_branch_id), toName = String(row.to_branch_id)
        try {
          const [brows] = await connection.query(`SELECT id, name FROM branches WHERE id IN (?, ?)`, [row.from_branch_id, row.to_branch_id])
          for (const b of brows) {
            if (Number(b.id) === Number(row.from_branch_id)) fromName = b.name || fromName
            if (Number(b.id) === Number(row.to_branch_id)) toName = b.name || toName
          }
        } catch {}
        const routeNote = `${fromName} / ${toName} ${row.doc_number || `#${row.id}`}`
        const items = Array.isArray(row.items) ? row.items : []
        let changed = false

        for (const it of items) {
          let dest = null
          const pid = it?.dest_product_id || it?.product_id ? String(it.dest_product_id || it.product_id) : null
          const source_pid = it?.source_product_id ? String(it.source_product_id) : pid
          const barcode = (it?.barcode ? String(it.barcode).trim() : '')
          let itName = (it?.name ? String(it.name).trim() : '')
          
          // Fallback metadata jika data lama tidak punya nama
          if (!itName && pid && pid !== 'NaN' && row.from_branch_id) {
            try {
              const [srcRows] = await connection.query(`SELECT name, barcode, category, brand, image_url, default_unit, pcs_per_dus, buy_price_pcs, buy_price_dus, sell_price_pcs, sell_price_dus, source_product_id FROM products WHERE id = ? AND branch_id = ? LIMIT 1`, [pid, row.from_branch_id]);
              if (srcRows?.[0]) {
                const s = srcRows[0];
                itName = s.name;
                it.name = s.name;
                it.barcode = s.barcode;
                it.category = s.category;
                it.brand = s.brand;
                it.image_url = s.image_url;
                it.src_default_unit = s.default_unit;
                it.src_pcs_per_dus = s.pcs_per_dus;
                it.buy_price_pcs = s.buy_price_pcs;
                it.buy_price_dus = s.buy_price_dus;
                it.sell_price_pcs = s.sell_price_pcs;
                it.sell_price_dus = s.sell_price_dus;
                it.source_product_id = s.source_product_id || pid;
              }
            } catch {}
          }

          if (source_pid && String(source_pid).trim() !== '' && String(source_pid).toLowerCase() !== 'null') {
            const [dSrc] = await connection.query(`SELECT * FROM products WHERE source_product_id = ? AND branch_id = ? LIMIT 1 FOR UPDATE`, [source_pid, row.to_branch_id])
            dest = dSrc[0] || null
          }
          if (!dest && barcode && barcode !== '' && barcode.toLowerCase() !== 'null' && barcode.length >= 3) {
            const [d1] = await connection.query(`SELECT * FROM products WHERE barcode = ? AND branch_id = ? LIMIT 1 FOR UPDATE`, [barcode, row.to_branch_id])
            dest = d1[0] || null
          }
          if (!dest && itName && itName !== '' && itName.toLowerCase() !== 'null') {
            const [d2] = await connection.query(`SELECT * FROM products WHERE name = ? AND branch_id = ? LIMIT 1 FOR UPDATE`, [itName, row.to_branch_id])
            dest = d2[0] || null
          }
          if (!dest && pid && pid !== 'NaN') {
            const [d0] = await connection.query(`SELECT * FROM products WHERE id = ? AND branch_id = ? LIMIT 1 FOR UPDATE`, [pid, row.to_branch_id])
            dest = d0[0] || null
          }
          if (!dest) {
            const productData = {
              barcode: barcode || null,
              name: itName || it?.name || 'Produk Tanpa Nama',
              category: it?.category || null,
              brand: it?.brand || null,
              image_url: it?.image_url || null,
              default_unit: it?.src_default_unit || it?.unit || 'PCS',
              pcs_per_dus: Number(it?.src_pcs_per_dus || 1) || 1,
              buy_price_pcs: Number(it?.buy_price_pcs || 0) || 0,
              buy_price_dus: Number(it?.buy_price_dus || 0) || 0,
              sell_price_pcs: Number(it?.sell_price_pcs || 0) || 0,
              sell_price_dus: Number(it?.sell_price_dus || 0) || 0,
              min_stock_pcs: Number(it?.min_stock_pcs || 0) || 0,
              is_active: 1,
              branch_id: row.to_branch_id,
              source_product_id: source_pid
            }

            if (productData.category) {
              try {
                const [catRows] = await connection.query(`SELECT id FROM categories WHERE name = ? AND branch_id = ? LIMIT 1`, [productData.category, row.to_branch_id]);
                if (catRows.length === 0) {
                  await connection.query(`INSERT INTO categories (name, branch_id) VALUES (?, ?)`, [productData.category, row.to_branch_id]);
                }
              } catch {}
            }

            const fields = Object.keys(productData)
            const values = Object.values(productData)
            const placeholders = fields.map(() => '?').join(',')
            
            // Inisialisasi stok langsung saat resync jika produk belum ada
            let initialQty = Number(it?.qty_pcs)
            if (!Number.isFinite(initialQty) || initialQty <= 0) {
              const unit = String(it?.unit || '').trim().toUpperCase()
              const qtyValue = Number(it?.qty_value)
              const per = Number(it?.src_pcs_per_dus || 1) || 1
              if (Number.isFinite(qtyValue) && qtyValue > 0) {
                initialQty = unit && unit !== 'PCS' && per > 1 ? Math.round(qtyValue * per) : Math.round(qtyValue)
              }
            }
            initialQty = Math.round(initialQty || 0);
            if (initialQty < 0) initialQty = 0;

            const [ins] = await connection.query(
              `INSERT INTO products (${fields.join(',')}, stock_pcs) VALUES (${placeholders}, ?)`,
              [...values, initialQty]
            )
            const [dNew] = await connection.query(`SELECT * FROM products WHERE id = ?`, [ins.insertId])
            dest = dNew[0] || null
            if (!dest) continue
            
            // Tandai agar tidak diupdate lagi di bawah
            it._resync_initialized = true;
            it._resync_qty = initialQty;
          }
          const [existsMut] = await connection.query(
            `SELECT id FROM stock_mutations WHERE branch_id = ? AND reference_type = 'stock_transfer' AND reference_id = ? AND product_id = ? AND type = 'in' LIMIT 1`,
            [row.to_branch_id, String(id), String(dest.id)]
          )
          if (existsMut && existsMut.length > 0) continue
          let qty = Number(it?.qty_pcs)
          if (!Number.isFinite(qty) || qty <= 0) {
            const unit = String(it?.unit || '').trim().toUpperCase()
            const qtyValue = Number(it?.qty_value)
            const per = Number(it?.src_pcs_per_dus || dest?.pcs_per_dus || 1) || 1
            if (Number.isFinite(qtyValue) && qtyValue > 0) {
              qty = unit && unit !== 'PCS' && per > 1 ? Math.round(qtyValue * per) : Math.round(qtyValue)
            }
            if ((!Number.isFinite(qty) || qty <= 0) && it?.qty !== undefined) {
              const legacyQty = Number(it.qty)
              if (Number.isFinite(legacyQty) && legacyQty > 0) {
                qty = unit && unit !== 'PCS' && per > 1 ? Math.round(legacyQty * per) : Math.round(legacyQty)
              }
            }
          }
          qty = Math.round(qty || 0);
          if (qty <= 0) continue
          
          const before = it._resync_initialized ? 0 : Number(dest?.stock_pcs || 0)
          const after = it._resync_initialized ? it._resync_qty : (before + qty)
          
          if (!it._resync_initialized) {
            // Update master product price based on transfer price if it's non-zero
            const newBuyPricePcs = Number(it.buy_price_pcs || 0);
            const newBuyPriceDus = Number(it.buy_price_dus || 0);
            if (newBuyPricePcs > 0) {
              await connection.query(`UPDATE products SET stock_pcs = stock_pcs + ?, buy_price_pcs = ?, buy_price_dus = ? WHERE id = ?`, [qty, newBuyPricePcs, newBuyPriceDus, dest.id])
            } else {
              await connection.query(`UPDATE products SET stock_pcs = stock_pcs + ? WHERE id = ?`, [qty, dest.id])
            }
            
            // Re-fetch accurate after for mutation
            const [vRows] = await connection.query(`SELECT stock_pcs FROM products WHERE id = ?`, [dest.id])
            const actualAfter = Number(vRows?.[0]?.stock_pcs || 0)
            
            const inNote = [routeNote, (row.receive_notes && String(row.receive_notes).trim()) ? String(row.receive_notes).trim() : null].filter(Boolean).join(' | ')
            await connection.query(
              `INSERT INTO stock_mutations (product_id, product_name, type, qty_pcs, stock_before, stock_after, reference_type, reference_id, notes, branch_id)
               VALUES (?, ?, 'in', ?, ?, ?, 'stock_transfer', ?, ?, ?)`,
              [String(dest.id), productData.name, qty, before, actualAfter, String(id), inNote, row.to_branch_id]
            )
          } else {
            const inNote = [routeNote, (row.receive_notes && String(row.receive_notes).trim()) ? String(row.receive_notes).trim() : null].filter(Boolean).join(' | ')
            await connection.query(
              `INSERT INTO stock_mutations (product_id, product_name, type, qty_pcs, stock_before, stock_after, reference_type, reference_id, notes, branch_id)
               VALUES (?, ?, 'in', ?, ?, ?, 'stock_transfer', ?, ?, ?)`,
              [String(dest.id), productData.name, qty, 0, after, String(id), inNote, row.to_branch_id]
            )
          }
          changed = true
        }

        if (changed && String(row.status || '').toLowerCase() !== 'received') {
          await connection.query(
            `UPDATE stock_transfers SET status = 'received', received_by = COALESCE(received_by, ?), received_date = COALESCE(received_date, ?) WHERE id = ?`,
            [String(receiver), new Date(), id]
          )
        }

        await connection.commit();
        const [r2] = await pool.query(`SELECT * FROM stock_transfers WHERE id = ?`, [id])
        const rr = r2[0] || null
        if (rr) rr.items = rr.items ? JSON.parse(rr.items) : []
        sendJson(res, 200, rr || row)
      } catch (err) {
        await connection.rollback();
        console.error(`[RESYNC CRITICAL ERROR]`, err)
        sendJson(res, 500, { error: 'Gagal resync stok' })
      } finally {
        connection.release();
      }
      return
    }
    // Admin: cleanup all purchase return histories
    if (pathname === '/api/admin/cleanup-purchase-returns' && (method === 'POST' || method === 'GET')) {
      const pool = await getPool()
      await ensureTables(pool)
      // Load all returned purchases
      const [purchases] = await pool.query(`SELECT * FROM purchases WHERE LOWER(status) = 'returned'`)
      // Build product index
      const [products] = await pool.query(`SELECT id, default_unit, pcs_per_dus, stock_pcs FROM products`)
      const productIndex = {}
      for (const pr of products) {
        productIndex[String(pr.id)] = pr
      }
      // For each returned purchase: restore stock, remove stock mutations of type return_purchase, then remove purchase row
      for (const p of purchases) {
        if (!p) continue
        let items = []
        try { items = p.items ? JSON.parse(p.items) : [] } catch { items = [] }
        for (const it of items) {
          const pr = productIndex[String(it?.product_id)]
          if (!pr) continue
          const unit = String(it?.unit || '').trim().toUpperCase()
          const perDus = Number(it?.pcs_per_dus || pr?.pcs_per_dus || 1) || 1
          const qty = Number(it?.qty || it?.return_qty || 0)
          const qtyPcs = unit && unit !== 'PCS' && perDus > 1 ? qty * perDus : qty
          const newStock = Number(pr.stock_pcs || 0) + qtyPcs
          await pool.query(`UPDATE products SET stock_pcs = ? WHERE id = ?`, [newStock, pr.id])
          pr.stock_pcs = newStock
        }
        // Delete related stock mutations
        await pool.query(`DELETE FROM stock_mutations WHERE reference_type = 'return_purchase' AND reference_id = ?`, [p.id])
        // Delete the returned purchase itself to remove its history
        await pool.query(`DELETE FROM purchases WHERE id = ?`, [p.id])
      }
      // Recalculate supplier total_debt from remaining purchases with tempo
      const [suppliers] = await pool.query(`SELECT id FROM suppliers`)
      const [tempoPurchases] = await pool.query(`SELECT supplier_id, SUM(debt_amount) as total_debt FROM purchases WHERE LOWER(payment_method) = 'tempo' GROUP BY supplier_id`)
      const debtMap = {}
      for (const row of tempoPurchases) {
        debtMap[String(row.supplier_id)] = Number(row.total_debt || 0)
      }
      for (const s of suppliers) {
        const td = debtMap[String(s.id)] || 0
        await pool.query(`UPDATE suppliers SET total_debt = ? WHERE id = ?`, [td, s.id])
      }
      sendJson(res, 200, { success: true, removed: purchases.length })
      return
    }

    if (pathname === '/api/subscription/status' && method === 'GET') {
      const pool = await getPool()
      await ensureTables(pool)
      const s = await getSubscriptionStatus(pool)
      sendJson(res, 200, s)
      return
    }
    if (pathname === '/api/subscription/current' && method === 'GET') {
      const pool = await getPool()
      await ensureTables(pool)
      const [rows] = await pool.query(
        `SELECT id, plan, package_name, valid_from, valid_until, payment_date
         FROM app_subscriptions
         ORDER BY 
           (CASE WHEN valid_until > NOW() THEN 1 ELSE 0 END) DESC,
           (CASE WHEN package_name = 'Profesional' THEN 1 ELSE 0 END) DESC, 
           COALESCE(valid_until, payment_date) DESC
         LIMIT 1`
      )
      if (rows.length === 0) { sendJson(res, 200, null); return }
      const r = rows[0]
      sendJson(res, 200, {
        id: r.id,
        plan: r.plan,
        package_name: r.package_name || 'Basic',
        valid_from: r.valid_from,
        valid_until: r.valid_until,
        payment_date: r.payment_date
      })
      return
    }
    if (pathname === '/api/subscription/purchase' && method === 'POST') {
      const pool = await getPool()
      await ensureTables(pool)
      let body
      try { body = await readJsonBody(req) } catch { sendJson(res, 400, { error: 'Invalid JSON' }); return }
      const planRaw = String(body.plan || '').toLowerCase()
      const map = { '1bulan': 1, '1-bulan': 1, 'bulan': 1, 'month': 1, '6bulan': 6, '6-bulan': 6, 'semester': 6, 'year': 12, '1tahun': 12, '1-tahun': 12, 'tahun': 12 }
      let months = Number(body.months || 0)
      const packageName = String(body.package_name || 'Basic').trim()
      if (!months || months <= 0) {
        months = map[planRaw] || 1
      }
      const paymentDate = body.payment_date ? new Date(body.payment_date) : new Date()
      const [rows] = await pool.query(`SELECT valid_until FROM app_subscriptions ORDER BY COALESCE(valid_until, payment_date) DESC LIMIT 1`)
      const latest = rows[0]
      let baseDate = paymentDate
      if (latest && latest.valid_until) {
        const lastUntil = new Date(latest.valid_until)
        if (lastUntil > paymentDate) baseDate = lastUntil
      }
      const valid_from = baseDate
      const valid_until = addMonths(baseDate, months)
      const [lastIdRows] = await pool.query(`SELECT id FROM app_subscriptions ORDER BY COALESCE(valid_until, payment_date) DESC LIMIT 1`)
      const latestIdRow = lastIdRows[0]
      if (!latestIdRow) {
        await pool.query(
          `INSERT INTO app_subscriptions SET ?`,
          {
            plan: String(planRaw || `${months}-bulan`),
            package_name: packageName,
            valid_from,
            valid_until,
            payment_date: paymentDate
          }
        )
      } else {
        await pool.query(
          `UPDATE app_subscriptions SET ? WHERE id = ?`,
          [
            {
              plan: String(planRaw || `${months}-bulan`),
              package_name: packageName,
              valid_from,
              valid_until,
              payment_date: paymentDate
            },
            latestIdRow.id
          ]
        )
      }
      const s = await getSubscriptionStatus(pool)
      sendJson(res, 200, { status: s.status, valid_until: s.valid_until, days_left: s.days_left })
      return
    }

    if (pathname === '/api/license/generate' && method === 'POST') {
      const pool = await getPool()
      await ensureTables(pool)
      const auth = req.headers?.authorization || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (!token) { sendJson(res, 403, { error: 'Forbidden' }); return }
      let uid = null
      try {
        const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'))
        uid = decoded?.uid
      } catch {}
      if (!uid) { sendJson(res, 403, { error: 'Forbidden' }); return }
      const [urows] = await pool.query(`SELECT id, role FROM users WHERE id = ? LIMIT 1`, [uid])
      const current = urows[0]
      if (!current || !['license_admin','admin','superadmin'].includes(String(current.role))) {
        sendJson(res, 403, { error: 'Forbidden' }); return
      }
      let body
      try { 
        body = await readJsonBody(req) 
        console.log(`[LICENSE] /api/license/generate body:`, JSON.stringify(body))
      } catch { sendJson(res, 400, { error: 'Invalid JSON' }); return }
      const type = String(body.type || body.plan || '').toLowerCase()
      let packageName = 'Basic'
      if (body.package_name === 'Profesional' || body.package === 'Profesional') {
        packageName = 'Profesional'
      } else if (body.package_name === 'Basic' || body.package === 'Basic') {
        packageName = 'Basic'
      } else {
        // Fallback to whatever is sent if not one of the two above
        packageName = String(body.package_name || body.package || 'Basic').trim()
      }
      console.log(`[LICENSE DEBUG] body.package_name="${body.package_name}", body.package="${body.package}", selected="${packageName}"`)
      const company_name = String(body.company_name || '').trim()
      const email = body.email ? String(body.email).trim() : null
      const phone = body.phone ? String(body.phone).trim() : null
      const address = body.address ? String(body.address).trim() : null
      const status = 'pending'
      let months = Number(body.months || 0)
      const start_date = body.start_date ? new Date(body.start_date) : new Date()
      const addDays = (d, n) => new Date(d.getTime() + n * 24 * 60 * 60 * 1000)
      if (type === 'bulanan') months = 1
      else if (type === 'tahunan') months = 12
      else if (type === 'custom' && (!months || months <= 0)) months = 1
      
      let end_date = null
      if (type === 'trial') {
        const days = Number(body.days || 14)
        end_date = addDays(start_date, days)
        months = 0 // trial doesn't count as months
      } else if (type === 'lifetime') {
        end_date = null
        months = 999
      } else {
        if (!months || months <= 0) months = 1
        end_date = addMonths(start_date, months)
      }
      const nonce = randomBytes(12).toString('hex')
      const price = body.price != null ? Number(body.price) : null
      const payloadObj = {
        company_name,
        email,
        phone,
        address,
        type,
        package_name: packageName,
        package: packageName,
        months: end_date ? months : null,
        start_date: start_date.toISOString(),
        end_date: end_date ? end_date.toISOString() : null,
        price,
        status,
        nonce
      }
      const payloadStr = JSON.stringify(payloadObj)
      const genCode = (len = 12) => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        let s = ''
        for (let i = 0; i < len; i++) {
          s += chars[Math.floor(Math.random() * chars.length)]
        }
        return s
      }
      let license = genCode(12)
      for (let attempt = 0; attempt < 10; attempt++) {
        const [existsTry] = await pool.query(`SELECT id FROM app_licenses WHERE license_key = ? LIMIT 1`, [license])
        if (existsTry.length === 0) break
        license = genCode(12)
      }
      if (!company_name) { sendJson(res, 400, { error: 'Nama perusahaan wajib diisi' }); return }
      try {
        const [exists] = await pool.query(`SELECT id FROM app_licenses WHERE license_key = ? LIMIT 1`, [license])
        if (exists.length > 0) { sendJson(res, 409, { error: 'License key duplikat' }); return }
        
        const finalPackageName = String(packageName || 'Basic').trim()
        console.log(`[LICENSE] Inserting into app_licenses: company_name="${company_name}", finalPackageName="${finalPackageName}"`)
        
        console.log(`[LICENSE] Inserting into app_licenses with object:`, {
          company_name,
          package_name: finalPackageName,
          license_key: license
        })
        
        const [result] = await pool.query(
          `INSERT INTO app_licenses SET ?`,
          {
            company_name,
            email,
            phone,
            address,
            type: type || null,
            package_name: finalPackageName,
            months: end_date ? months : null,
            start_date,
            end_date,
            status,
            license_key: license,
            price,
            payload: payloadStr
          }
        )
        console.log(`[LICENSE] Inserted license ID: ${result.insertId}, package_name: ${finalPackageName}`)
        sendJson(res, 201, {
          id: result.insertId,
          license_key: license,
          start_date: payloadObj.start_date,
          end_date: payloadObj.end_date,
          status: payloadObj.status
        })
      } catch (e) {
        if (e && e.code === 'ER_DUP_ENTRY') {
          sendJson(res, 409, { error: 'License key duplikat' }); return
        }
        throw e
      }
      return
    }

    if (pathname === '/api/license/activate' && method === 'POST') {
      const pool = await getPool()
      await ensureTables(pool)
      const auth = req.headers?.authorization || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (!token) { sendJson(res, 403, { error: 'Forbidden' }); return }
      let uid = null
      try {
        const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'))
        uid = decoded?.uid
      } catch {}
      if (!uid) { sendJson(res, 403, { error: 'Forbidden' }); return }
      const [urows] = await pool.query(`SELECT id, role FROM users WHERE id = ? LIMIT 1`, [uid])
      const current = urows[0]
      if (!current || !['license_admin','admin','superadmin'].includes(String(current.role))) {
        sendJson(res, 403, { error: 'Forbidden' }); return
      }
      let body
      try { body = await readJsonBody(req) } catch { sendJson(res, 400, { error: 'Invalid JSON' }); return }
      const license_key = String(body.license_key || body.license || '').trim()
      if (!license_key) { sendJson(res, 400, { error: 'License key wajib diisi' }); return }
      let payloadObj = null
      if (license_key.includes('.')) {
        const parts = license_key.split('.')
        const payloadB64 = parts[0]
        try {
          payloadObj = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8'))
        } catch {
          sendJson(res, 400, { error: 'License key tidak valid' }); return
        }
        const secret = process.env.LICENSE_SECRET
        if (secret && parts.length === 2) {
          const expected = createHmac('sha256', secret).update(payloadB64).digest('hex')
          if (parts[1] !== expected) {
            sendJson(res, 400, { error: 'Signature lisensi tidak cocok' }); return
          }
        }
      } else {
        const [licRows] = await pool.query(`SELECT payload FROM app_licenses WHERE license_key = ? LIMIT 1`, [license_key])
        if (licRows.length === 0) {
          sendJson(res, 400, { error: 'License key tidak valid' }); return
        }
        try {
          payloadObj = JSON.parse(licRows[0].payload)
        } catch {
          sendJson(res, 400, { error: 'Payload lisensi rusak' }); return
        }
      }
      const start_date = payloadObj.start_date ? new Date(payloadObj.start_date) : new Date()
      let end_date = payloadObj.end_date ? new Date(payloadObj.end_date) : null
      const type = String(payloadObj.type || '').toLowerCase()
      const packageName = String(payloadObj.package_name || payloadObj.package || 'Basic').trim()
      console.log(`[LICENSE] Activating license. Payload package_name: "${payloadObj.package_name}", package: "${payloadObj.package}", using: "${packageName}"`)
      if (!end_date) {
        if (type === 'lifetime') {
          end_date = new Date('2099-12-31T00:00:00Z')
        } else if (type === 'trial') {
          end_date = new Date(start_date.getTime() + 14 * 24 * 60 * 60 * 1000)
        } else {
          const months = Number(payloadObj.months || 1)
          end_date = addMonths(start_date, months)
        }
      }
      const [lastIdRows2] = await pool.query(`SELECT id FROM app_subscriptions ORDER BY COALESCE(valid_until, payment_date) DESC LIMIT 1`)
      const latestIdRow2 = lastIdRows2[0]
      if (!latestIdRow2) {
        console.log(`[SUBSCRIPTION] Creating new subscription: plan=${type || 'license'}, package_name=${packageName}`)
        await pool.query(
          `INSERT INTO app_subscriptions SET ?`,
          {
            plan: type || 'license',
            package_name: packageName,
            valid_from: start_date,
            valid_until: end_date,
            payment_date: new Date()
          }
        )
      } else {
        console.log(`[SUBSCRIPTION] Updating existing subscription ID: ${latestIdRow2.id}, plan=${type || 'license'}, package_name=${packageName}`)
        await pool.query(
          `UPDATE app_subscriptions SET ? WHERE id = ?`,
          [
            {
              plan: type || 'license',
              package_name: packageName,
              valid_from: start_date,
              valid_until: end_date,
              payment_date: new Date()
            },
            latestIdRow2.id
          ]
        )
      }
      try {
        await pool.query(`UPDATE app_licenses SET status = 'aktif' WHERE license_key = ?`, [license_key])
      } catch {}
      const s = await getSubscriptionStatus(pool)
      sendJson(res, 200, { status: s.status, valid_until: s.valid_until, days_left: s.days_left })
      return
    }

    if (pathname === '/api/license/list' && method === 'GET') {
      const pool = await getPool()
      await ensureTables(pool)
      const auth = req.headers?.authorization || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (!token) { sendJson(res, 403, { error: 'Forbidden' }); return }
      let uid = null
      try {
        const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'))
        uid = decoded?.uid
      } catch {}
      if (!uid) { sendJson(res, 403, { error: 'Forbidden' }); return }
      const [urows] = await pool.query(`SELECT id, role FROM users WHERE id = ? LIMIT 1`, [uid])
      const current = urows[0]
      if (!current || !['license_admin','admin','superadmin'].includes(String(current.role))) {
        sendJson(res, 403, { error: 'Forbidden' }); return
      }
      const limitParam = Number((parsedUrl.query?.limit) || 20)
      const limit = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 100 ? limitParam : 20
      const [rows] = await pool.query(
        `SELECT id, company_name, email, phone, address, type, package_name, months, start_date, end_date, status, price, license_key, created_date
         FROM app_licenses
         ORDER BY created_date DESC
         LIMIT ?`,
        [limit]
      )
      sendJson(res, 200, rows)
      return
    }
    if (pathname.startsWith('/api/license/') && method === 'GET') {
      const pool = await getPool()
      await ensureTables(pool)
      const auth = req.headers?.authorization || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (!token) { sendJson(res, 403, { error: 'Forbidden' }); return }
      let uid = null
      try {
        const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'))
        uid = decoded?.uid
      } catch {}
      if (!uid) { sendJson(res, 403, { error: 'Forbidden' }); return }
      const [urows] = await pool.query(`SELECT id, role FROM users WHERE id = ? LIMIT 1`, [uid])
      const current = urows[0]
      if (!current || !['license_admin','admin','superadmin'].includes(String(current.role))) {
        sendJson(res, 403, { error: 'Forbidden' }); return
      }
      const idStr = pathname.split('/').pop()
      const id = Number(idStr)
      if (!Number.isFinite(id) || id <= 0) { sendJson(res, 400, { error: 'Invalid id' }); return }
      const [rows] = await pool.query(
        `SELECT id, company_name, email, phone, address, type, months, start_date, end_date, status, price, license_key, created_date
         FROM app_licenses WHERE id = ? LIMIT 1`,
        [id]
      )
      if (rows.length === 0) { sendJson(res, 404, { error: 'Not found' }); return }
      sendJson(res, 200, rows[0])
      return
    }
    if (pathname.startsWith('/api/license/') && (method === 'PUT' || method === 'PATCH')) {
      const pool = await getPool()
      await ensureTables(pool)
      const auth = req.headers?.authorization || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (!token) { sendJson(res, 403, { error: 'Forbidden' }); return }
      let uid = null
      try {
        const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'))
        uid = decoded?.uid
      } catch {}
      if (!uid) { sendJson(res, 403, { error: 'Forbidden' }); return }
      const [urows] = await pool.query(`SELECT id, role FROM users WHERE id = ? LIMIT 1`, [uid])
      const current = urows[0]
      if (!current || !['license_admin','admin','superadmin'].includes(String(current.role))) {
        sendJson(res, 403, { error: 'Forbidden' }); return
      }
      const idStr = pathname.split('/').pop()
      const id = Number(idStr)
      if (!Number.isFinite(id) || id <= 0) { sendJson(res, 400, { error: 'Invalid id' }); return }
      let body
      try { body = await readJsonBody(req) } catch { sendJson(res, 400, { error: 'Invalid JSON' }); return }
      const company_name = body.company_name !== undefined ? String(body.company_name).trim() : undefined
      const email = body.email !== undefined ? (body.email ? String(body.email).trim() : null) : undefined
      const phone = body.phone !== undefined ? (body.phone ? String(body.phone).trim() : null) : undefined
      const address = body.address !== undefined ? (body.address ? String(body.address).trim() : null) : undefined
      const fields = []
      const values = []
      if (company_name !== undefined) { fields.push('company_name = ?'); values.push(company_name) }
      if (email !== undefined) { fields.push('email = ?'); values.push(email) }
      if (phone !== undefined) { fields.push('phone = ?'); values.push(phone) }
      if (address !== undefined) { fields.push('address = ?'); values.push(address) }
      if (body.price !== undefined) {
        const price = body.price != null ? Number(body.price) : null
        fields.push('price = ?'); values.push(price)
      }
      if (fields.length === 0) { sendJson(res, 400, { error: 'No updatable fields' }); return }
      values.push(id)
      await pool.query(`UPDATE app_licenses SET ${fields.join(', ')} WHERE id = ?`, values)
      const [rows] = await pool.query(
        `SELECT id, company_name, email, phone, address, type, months, start_date, end_date, status, price, license_key, created_date
         FROM app_licenses WHERE id = ? LIMIT 1`,
        [id]
      )
      sendJson(res, 200, rows[0] || {})
      return
    }
    if (pathname.startsWith('/api/license/') && method === 'DELETE') {
      const pool = await getPool()
      await ensureTables(pool)
      const auth = req.headers?.authorization || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (!token) { sendJson(res, 403, { error: 'Forbidden' }); return }
      let uid = null
      try {
        const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'))
        uid = decoded?.uid
      } catch {}
      if (!uid) { sendJson(res, 403, { error: 'Forbidden' }); return }
      const [urows] = await pool.query(`SELECT id, role FROM users WHERE id = ? LIMIT 1`, [uid])
      const current = urows[0]
      if (!current || !['license_admin','admin','superadmin'].includes(String(current.role))) {
        sendJson(res, 403, { error: 'Forbidden' }); return
      }
      const idStr = pathname.split('/').pop()
      const id = Number(idStr)
      if (!Number.isFinite(id) || id <= 0) { sendJson(res, 400, { error: 'Invalid id' }); return }
      await pool.query(`DELETE FROM app_licenses WHERE id = ?`, [id])
      sendJson(res, 200, { success: true })
      return
    }
    if (pathname === '/api/auth/login' && method === 'POST') {
      const pool = await getPool()
      await ensureTables(pool)
      let body
      try {
        body = await readJsonBody(req)
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON' })
        return
      }
      const username = typeof body.username === 'string' ? body.username.trim() : ''
      const password = typeof body.password === 'string' ? body.password : ''
      if (!username || !password) {
        sendJson(res, 400, { error: 'username dan password wajib diisi' })
        return
      }
      const password_hash = createHash('sha256').update(password).digest('hex')
      const [rows] = await pool.query(
        `SELECT id, username, full_name, role, password_hash FROM users WHERE username = ? LIMIT 1`,
        [username]
      )
      const user = rows[0]
      if (!user || user.password_hash !== password_hash) {
        sendJson(res, 401, { error: 'Username atau password salah' })
        return
      }
      const payload = Buffer.from(JSON.stringify({ uid: user.id, ts: Date.now() })).toString('base64')
      const token = payload
      sendJson(res, 200, { 
        token, 
        user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role } 
      })
      return
    }

    if ((pathname === '/api/auth/admin-override' || pathname === '/auth/admin-override') && method === 'POST') {
      const pool = await getPool()
      await ensureTables(pool)
      const callerUid = getAuthUid(req)
      if (!callerUid) { sendJson(res, 401, { error: 'Unauthorized' }); return }
      let body
      try {
        body = await readJsonBody(req)
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON' })
        return
      }
      const username = typeof body.username === 'string' ? body.username.trim() : ''
      const password = typeof body.password === 'string' ? body.password : ''
      if (!username || !password) {
        sendJson(res, 400, { error: 'username dan password wajib diisi' })
        return
      }
      const password_hash = createHash('sha256').update(password).digest('hex')
      const [rows] = await pool.query(
        `SELECT id, username, full_name, role, password_hash FROM users WHERE username = ? LIMIT 1`,
        [username]
      )
      const user = rows[0]
      const roleLower = String(user?.role || '').toLowerCase()
      if (!user || user.password_hash !== password_hash || !['admin', 'license_admin', 'superadmin'].includes(roleLower)) {
        sendJson(res, 401, { error: 'Otorisasi admin gagal' })
        return
      }
      const exp = Date.now() + 5 * 60 * 1000
      const override_token = createAdminOverrideToken({ uid: user.id, role: user.role, exp })
      sendJson(res, 200, { override_token, expires_at: exp, admin: { id: user.id, username: user.username, full_name: user.full_name, role: user.role } })
      return
    }
    
    if (pathname === '/auth/login' && method === 'POST') {
      const pool = await getPool()
      await ensureTables(pool)
      let body
      try {
        body = await readJsonBody(req)
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON' })
        return
      }
      const username = typeof body.username === 'string' ? body.username.trim() : ''
      const password = typeof body.password === 'string' ? body.password : ''
      if (!username || !password) {
        sendJson(res, 400, { error: 'username dan password wajib diisi' })
        return
      }
      const password_hash = createHash('sha256').update(password).digest('hex')
      const [rows] = await pool.query(
        `SELECT id, username, full_name, role, password_hash FROM users WHERE username = ? LIMIT 1`,
        [username]
      )
      const user = rows[0]
      if (!user || user.password_hash !== password_hash) {
        sendJson(res, 401, { error: 'Username atau password salah' })
        return
      }
      const payload = Buffer.from(JSON.stringify({ uid: user.id, ts: Date.now() })).toString('base64')
      const token = payload
      sendJson(res, 200, { 
        token, 
        user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role } 
      })
      return
    }
    if (pathname === '/api/auth/me' && method === 'GET') {
      const pool = await getPool()
      await ensureTables(pool)
      const uid = getAuthUid(req)
      if (!uid) { sendJson(res, 401, { error: 'Unauthorized' }); return }
      const [rows] = await pool.query(`SELECT id, username, full_name, role FROM users WHERE id = ? LIMIT 1`, [uid])
      const user = rows[0]
      if (!user) { sendJson(res, 401, { error: 'Unauthorized' }); return }
      const role = String(user.role || '').toLowerCase()
      let allowed = []
      if (!['admin','license_admin','superadmin'].includes(role)) {
        const [maps] = await pool.query(`SELECT branch_id FROM user_branches WHERE user_id = ? ORDER BY branch_id ASC`, [uid])
        allowed = maps.map(r => r.branch_id)
      }
      sendJson(res, 200, { id: user.id, username: user.username, full_name: user.full_name, role: user.role, allowed_branches: allowed })
      return
    }
    if (pathname === '/auth/me' && method === 'GET') {
      const pool = await getPool()
      await ensureTables(pool)
      const uid = getAuthUid(req)
      if (!uid) { sendJson(res, 401, { error: 'Unauthorized' }); return }
      const [rows] = await pool.query(`SELECT id, username, full_name, role FROM users WHERE id = ? LIMIT 1`, [uid])
      const user = rows[0]
      if (!user) { sendJson(res, 401, { error: 'Unauthorized' }); return }
      const role = String(user.role || '').toLowerCase()
      let allowed = []
      if (!['admin','license_admin','superadmin'].includes(role)) {
        const [maps] = await pool.query(`SELECT branch_id FROM user_branches WHERE user_id = ? ORDER BY branch_id ASC`, [uid])
        allowed = maps.map(r => r.branch_id)
      }
      sendJson(res, 200, { id: user.id, username: user.username, full_name: user.full_name, role: user.role, allowed_branches: allowed })
      return
    }
    if (pathname === '/api/auth/logout' && method === 'POST') {
      const pool = await getPool()
      await ensureTables(pool)
      sendJson(res, 200, { ok: true })
      return
    }
    if (pathname === '/auth/logout' && method === 'POST') {
      const pool = await getPool()
      await ensureTables(pool)
      sendJson(res, 200, { ok: true })
      return
    }

    // Alias legacy paths: /api/base44_app/{Entity} -> /api/entities/{Entity}
    if (pathname.startsWith('/api/base44_app/')) {
      const parts = pathname.split('/').filter(Boolean) // ['api','base44_app','Entity', 'id?']
      const entity = parts[2]
      const id = parts[3] || null

      // Map to Categories
      if (entity === 'Category') {
        const pool = await getPool()
        await ensureTables(pool)
        if (method === 'GET' && !id) {
          const [rows] = await pool.query(`SELECT * FROM categories ORDER BY created_date DESC`)
          sendJson(res, 200, rows); return
        }
        if (method === 'POST' && !id) {
          const body = await readJsonBody(req)
          const newId = randomUUID()
          const [result] = await pool.query(
            `INSERT INTO categories (id, name, description, default_unit) VALUES (?, ?, ?, ?)`,
            [newId, body.name ?? null, body.description ?? null, body.default_unit ?? null]
          )
          const [rows] = await pool.query(`SELECT * FROM categories WHERE id = ?`, [newId])
          sendJson(res, 201, rows[0]); return
        }
        if ((method === 'PUT' || method === 'PATCH') && id) {
          const body = await readJsonBody(req)
          await pool.query(
            `UPDATE categories SET name = ?, description = ?, default_unit = ? WHERE id = ?`,
            [body.name ?? null, body.description ?? null, body.default_unit ?? null, id]
          )
          const [rows] = await pool.query(`SELECT * FROM categories WHERE id = ?`, [id])
          sendJson(res, 200, rows[0]); return
        }
        if (method === 'DELETE' && id) {
          await pool.query(`DELETE FROM categories WHERE id = ?`, [id])
          sendJson(res, 200, { success: true }); return
        }
      }

      // Map to Products
      if (entity === 'Product') {
        const pool = await getPool()
        await ensureTables(pool)
        if (method === 'GET' && !id) {
          const [rows] = await pool.query(`SELECT * FROM products ORDER BY created_date DESC`)
          sendJson(res, 200, rows); return
        }
        if (method === 'POST' && !id) {
          const body = await readJsonBody(req)
          const newId = randomUUID()
          const fields = [
            'id','custom_id','barcode','name','category','brand','image_url','default_unit','pcs_per_dus',
            'buy_price_pcs','buy_price_dus','sell_price_pcs','sell_price_dus',
            'stock_pcs','min_stock_pcs','is_active'
          ]
          const values = fields.map(f => (f === 'id' ? newId : (body[f] ?? null)))
          const placeholders = fields.map(() => '?').join(',')
          const [result] = await pool.query(
            `INSERT INTO products (${fields.join(',')}) VALUES (${placeholders})`,
            values
          )
          const [rows] = await pool.query(`SELECT * FROM products WHERE id = ?`, [newId])
          sendJson(res, 201, rows[0]); return
        }
        if ((method === 'PUT' || method === 'PATCH') && id) {
          const body = await readJsonBody(req)
          const fields = [
            'custom_id','barcode','name','category','brand','image_url','default_unit','pcs_per_dus',
            'buy_price_pcs','buy_price_dus','sell_price_pcs','sell_price_dus',
            'stock_pcs','min_stock_pcs','is_active'
          ]
          const setClauses = []
          const values = []
          for (const f of fields) {
            if (body[f] !== undefined) { setClauses.push(`${f} = ?`); values.push(body[f]) }
          }
          if (setClauses.length === 0) { sendJson(res, 400, { error: 'No fields to update' }); return }
          values.push(id)
          await pool.query(`UPDATE products SET ${setClauses.join(', ')} WHERE id = ?`, values)
          const [rows] = await pool.query(`SELECT * FROM products WHERE id = ?`, [id])
          sendJson(res, 200, rows[0]); return
        }
        if (method === 'DELETE' && id) {
          await pool.query(`DELETE FROM products WHERE id = ?`, [id])
          sendJson(res, 200, { success: true }); return
        }
      }
    }

    // Entities: Product
    if (pathname === '/api/entities/Product' && method === 'GET') {
      const pool = await getPool()
      await ensureTables(pool)
      const sort = parsedUrl.query.sort
      const order = sort === '-created_date' ? 'ORDER BY created_date DESC' : ''
      const [rows] = await pool.query(`SELECT * FROM products WHERE branch_id = ? ${order}`, [branchId])
      sendJson(res, 200, rows)
      return
    }
    if (pathname === '/api/entities/Product' && method === 'POST') {
      const pool = await getPool()
      await ensureTables(pool)
      const uid = getAuthUid(req)
      if (!uid) { sendJson(res, 403, { error: 'Forbidden' }); return }
      const [urows] = await pool.query(`SELECT role FROM users WHERE id = ? LIMIT 1`, [uid])
      const role = String(urows?.[0]?.role || '').toLowerCase()
      if (role === 'kasir') {
        const ot = req.headers?.['x-admin-override'] || ''
        const payload = verifyAdminOverrideToken(ot)
        if (!payload) { sendJson(res, 403, { error: 'Perlu otorisasi admin' }); return }
      }
      const body = await readJsonBody(req)
      const newId = randomUUID()
      const customId = (String(body?.custom_id || '').trim() || null)
      const fields = [
        'id','custom_id','barcode','name','category','brand','image_url','default_unit','pcs_per_dus',
        'buy_price_pcs','buy_price_dus','sell_price_pcs','sell_price_dus',
        'stock_pcs','min_stock_pcs','is_active','branch_id'
      ]
      const values = fields.map(f => (f === 'id' ? newId : (f === 'branch_id' ? branchId : (f === 'custom_id' ? customId : (body[f] ?? null)))))
      const placeholders = fields.map(() => '?').join(',')
      const [result] = await pool.query(
        `INSERT INTO products (${fields.join(',')}) VALUES (${placeholders})`,
        values
      )
      const [rows] = await pool.query(`SELECT * FROM products WHERE id = ? AND branch_id = ?`, [newId, branchId])
      sendJson(res, 201, rows[0])
      // Propagate basic fields to other branches when created at Pusat
      try {
        const pusatId = await getPusatId(pool)
        const currentBranchId = Number(branchId)
        console.log(`[PRODUCT BROADCAST] New product created. currentBranchId=${currentBranchId}, pusatId=${pusatId}`);
        
        if (currentBranchId === pusatId) {
          const [bs] = await pool.query(`SELECT id, name FROM branches WHERE id <> ?`, [pusatId])
          console.log(`[PRODUCT BROADCAST] Propagating to ${bs.length} branches: ${bs.map(b => b.id).join(', ')}`);
          
          const barcode = (body?.barcode ? String(body.barcode).trim() : '')
          for (const b of bs) {
            const destId = Number(b.id)
            if (!Number.isFinite(destId) || destId <= 0) continue
            try {
              let exists = null
              if (barcode) {
                const [e1] = await pool.query(`SELECT id FROM products WHERE branch_id = ? AND barcode = ? LIMIT 1`, [destId, barcode])
                exists = e1[0] || null
              }
              if (!exists && body.name) {
                const [e2] = await pool.query(`SELECT id FROM products WHERE branch_id = ? AND name = ? LIMIT 1`, [destId, body.name])
                exists = e2[0] || null
              }
              if (exists) {
                console.log(`   - Updating existing product in Branch ${destId} (${b.name})`);
                await pool.query(
                  `UPDATE products 
                     SET name = ?, 
                         category = ?, 
                         brand = COALESCE(?, brand), 
                         default_unit = COALESCE(?, default_unit), 
                         pcs_per_dus = COALESCE(?, pcs_per_dus),
                         buy_price_pcs = COALESCE(?, buy_price_pcs),
                         buy_price_dus = COALESCE(?, buy_price_dus),
                         sell_price_pcs = COALESCE(?, sell_price_pcs),
                         sell_price_dus = COALESCE(?, sell_price_dus),
                         min_stock_pcs = COALESCE(?, min_stock_pcs),
                         source_product_id = COALESCE(source_product_id, ?)
                   WHERE id = ? AND branch_id = ?`,
                  [
                    body.name ?? null,
                    body.category ?? null,
                    body.brand ?? null,
                    body.default_unit ?? null,
                    body.pcs_per_dus ?? null,
                    body.buy_price_pcs ?? null,
                    body.buy_price_dus ?? null,
                    body.sell_price_pcs ?? null,
                    body.sell_price_dus ?? null,
                    body.min_stock_pcs ?? null,
                    newId, // source_product_id
                    exists.id, 
                    destId
                  ]
                )
              } else {
                console.log(`   - Creating new product in Branch ${destId} (${b.name})`);
                const branchProdId = randomUUID(); // Explicitly generate UUID for branch product
                await pool.query(
                  `INSERT INTO products (id, custom_id, barcode, name, category, brand, image_url, default_unit, pcs_per_dus, buy_price_pcs, buy_price_dus, sell_price_pcs, sell_price_dus, stock_pcs, min_stock_pcs, is_active, branch_id, source_product_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?)`,
                  [
                    branchProdId,
                    customId,
                    barcode || null,
                    body.name ?? null,
                    body.category ?? null,
                    body.brand ?? null,
                    body.image_url ?? null,
                    body.default_unit ?? null,
                    body.pcs_per_dus ?? null,
                    body.buy_price_pcs ?? 0,
                    body.buy_price_dus ?? 0,
                    body.sell_price_pcs ?? 0,
                    body.sell_price_dus ?? 0,
                    body.min_stock_pcs ?? 0,
                    destId,
                    newId // source_product_id
                  ]
                )
              }
            } catch (err) {
              console.error(`   [BROADCAST ERROR] Failed for Branch ${destId} (${b.name}):`, err.message);
            }
          }
          console.log(`[PRODUCT BROADCAST] Propagation finished.`);
        } else {
          console.log(`[PRODUCT BROADCAST] Skipping broadcast because currentBranchId(${currentBranchId}) is not Pusat(${pusatId})`);
        }
      } catch (err) {
        console.error(`[PRODUCT BROADCAST CRITICAL ERROR]`, err);
      }
      return
    }
    if (pathname.startsWith('/api/entities/Product/') && (method === 'PUT' || method === 'PATCH')) {
      const pool = await getPool()
      await ensureTables(pool)
      const uid = getAuthUid(req)
      if (!uid) { sendJson(res, 403, { error: 'Forbidden' }); return }
      const [urows] = await pool.query(`SELECT role FROM users WHERE id = ? LIMIT 1`, [uid])
      const role = String(urows?.[0]?.role || '').toLowerCase()
      if (role === 'kasir') {
        const ot = req.headers?.['x-admin-override'] || ''
        const payload = verifyAdminOverrideToken(ot)
        if (!payload) { sendJson(res, 403, { error: 'Perlu otorisasi admin' }); return }
      }
      const id = pathname.split('/').pop()
      const body = await readJsonBody(req)
      const fields = [
        'custom_id','barcode','name','category','brand','image_url','default_unit','pcs_per_dus',
        'buy_price_pcs','buy_price_dus','sell_price_pcs','sell_price_dus',
        'stock_pcs','min_stock_pcs','is_active'
      ]
      const setClauses = []
      const values = []
      for (const f of fields) {
        if (body[f] !== undefined) {
          setClauses.push(`${f} = ?`)
          values.push(body[f])
        }
      }
      if (setClauses.length === 0) {
        sendJson(res, 400, { error: 'No fields to update' })
        return
      }
      values.push(id, branchId)
      await pool.query(`UPDATE products SET ${setClauses.join(', ')} WHERE id = ? AND branch_id = ?`, values)
      const [rows] = await pool.query(`SELECT * FROM products WHERE id = ? AND branch_id = ?`, [id, branchId])
      const updated = rows[0]
      sendJson(res, 200, updated)
      // Propagate edits from Pusat to other branches
      try {
        const pusatId = await getPusatId(pool)
        if (Number(branchId) === pusatId && updated) {
          const [bs] = await pool.query(`SELECT id FROM branches WHERE id <> ?`, [pusatId])
          const barcode = (updated?.barcode ? String(updated.barcode).trim() : '')
          for (const b of bs) {
            const destId = Number(b.id)
            if (!Number.isFinite(destId) || destId <= 0) continue
            let exists = null
            if (barcode) {
              const [e1] = await pool.query(`SELECT id FROM products WHERE branch_id = ? AND barcode = ? LIMIT 1`, [destId, barcode])
              exists = e1[0] || null
            }
            if (!exists && updated?.name) {
              const [e2] = await pool.query(`SELECT id FROM products WHERE branch_id = ? AND name = ? LIMIT 1`, [destId, updated.name])
              exists = e2[0] || null
            }
            if (exists) {
              await pool.query(
                `UPDATE products 
                   SET name = ?, 
                       category = ?, 
                       brand = COALESCE(?, brand), 
                       default_unit = COALESCE(?, default_unit), 
                       pcs_per_dus = COALESCE(?, pcs_per_dus),
                       buy_price_pcs = COALESCE(?, buy_price_pcs),
                       buy_price_dus = COALESCE(?, buy_price_dus),
                       sell_price_pcs = COALESCE(?, sell_price_pcs),
                       sell_price_dus = COALESCE(?, sell_price_dus),
                       min_stock_pcs = COALESCE(?, min_stock_pcs),
                       source_product_id = COALESCE(source_product_id, ?)
                 WHERE id = ? AND branch_id = ?`,
                [
                  updated.name ?? null,
                  updated.category ?? null,
                  updated.brand ?? null,
                  updated.default_unit ?? null,
                  updated.pcs_per_dus ?? null,
                  updated.buy_price_pcs ?? null,
                  updated.buy_price_dus ?? null,
                  updated.sell_price_pcs ?? null,
                  updated.sell_price_dus ?? null,
                  updated.min_stock_pcs ?? null,
                  id, // source_product_id
                  exists.id,
                  destId
                ]
              )
            }
          }
        }
      } catch {}
      return
    }
    if (pathname.startsWith('/api/entities/Product/') && method === 'DELETE') {
      const pool = await getPool()
      await ensureTables(pool)
      const uid = getAuthUid(req)
      if (!uid) { sendJson(res, 403, { error: 'Forbidden' }); return }
      const [urows] = await pool.query(`SELECT role FROM users WHERE id = ? LIMIT 1`, [uid])
      const role = String(urows?.[0]?.role || '').toLowerCase()
      if (role === 'kasir') {
        const ot = req.headers?.['x-admin-override'] || ''
        const payload = verifyAdminOverrideToken(ot)
        if (!payload) { sendJson(res, 403, { error: 'Perlu otorisasi admin' }); return }
      }
      const id = pathname.split('/').pop()
      await pool.query(`DELETE FROM products WHERE id = ? AND branch_id = ?`, [id, branchId])
      sendJson(res, 200, { success: true })
      return
    }

    // Entities: Category
  // Entities: Unit
  if (pathname === '/api/entities/Unit' && method === 'GET') {
    const pool = await getPool()
    await ensureTables(pool)
    const [rows] = await pool.query(`SELECT * FROM units ORDER BY name ASC`)
    sendJson(res, 200, rows)
    return
  }
  if (pathname === '/api/entities/Unit' && method === 'POST') {
    const pool = await getPool()
    await ensureTables(pool)
    let body
    try {
      body = await readJsonBody(req)
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON' })
      return
    }
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      sendJson(res, 400, { error: 'Nama satuan wajib diisi' })
      return
    }
    if (name.length > 64) {
      sendJson(res, 400, { error: 'Nama satuan maksimal 64 karakter' })
      return
    }
    try {
      const [result] = await pool.query(`INSERT INTO units (name) VALUES (?)`, [name])
      const [rows] = await pool.query(`SELECT * FROM units WHERE id = ?`, [result.insertId])
      sendJson(res, 201, rows[0] || { id: result.insertId, name })
    } catch (e) {
      // Duplicate name
      if (e && e.code === 'ER_DUP_ENTRY') {
        sendJson(res, 409, { error: 'Nama satuan sudah ada' })
      } else {
        throw e
      }
    }
    return
  }
  if (pathname.startsWith('/api/entities/Unit/') && (method === 'PUT' || method === 'PATCH')) {
    const pool = await getPool()
    await ensureTables(pool)
    const id = pathname.split('/').pop()
    let body
    try {
      body = await readJsonBody(req)
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON' })
      return
    }
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      sendJson(res, 400, { error: 'Nama satuan wajib diisi' })
      return
    }
    if (name.length > 64) {
      sendJson(res, 400, { error: 'Nama satuan maksimal 64 karakter' })
      return
    }
    try {
      await pool.query(`UPDATE units SET name = ? WHERE id = ?`, [name, id])
      const [rows] = await pool.query(`SELECT * FROM units WHERE id = ?`, [id])
      sendJson(res, 200, rows[0])
    } catch (e) {
      if (e && e.code === 'ER_DUP_ENTRY') {
        sendJson(res, 409, { error: 'Nama satuan sudah ada' })
      } else {
        throw e
      }
    }
    return
  }
  if (pathname.startsWith('/api/entities/Unit/') && method === 'DELETE') {
    const pool = await getPool()
    await ensureTables(pool)
    const id = pathname.split('/').pop()
    await pool.query(`DELETE FROM units WHERE id = ?`, [id])
    sendJson(res, 200, { success: true })
    return
  }

    // Entities: Category
    if (pathname === '/api/entities/Category' && method === 'GET') {
      const pool = await getPool()
      await ensureTables(pool)
      let [rows] = await pool.query(`SELECT * FROM categories WHERE branch_id = ? ORDER BY created_date DESC`, [branchId])
      // Auto ensure branch categories follow center catalog by name
      const pusatId = await getPusatId(pool)
      if (Number(branchId) !== pusatId) {
        try {
          const [centerRows] = await pool.query(`SELECT name, description, default_unit FROM categories WHERE branch_id = ? ORDER BY id ASC`, [pusatId])
          const have = new Set(rows.map(r => String(r.name || '')))
          const toInsert = (centerRows || []).filter(c => c?.name && !have.has(String(c.name)))
          if (toInsert.length > 0) {
            for (const c of toInsert) {
              try {
                await pool.query(
                  `INSERT INTO categories (name, description, default_unit, branch_id) VALUES (?, ?, ?, ?)`,
                  [c.name ?? null, c.description ?? null, c.default_unit ?? null, branchId]
                )
              } catch {}
            }
            ;[rows] = await pool.query(`SELECT * FROM categories WHERE branch_id = ? ORDER BY created_date DESC`, [branchId])
          }
        } catch {}
      }
      sendJson(res, 200, rows)
      return
    }
    if (pathname === '/api/categories/sync-from-center' && method === 'POST') {
      const pool = await getPool()
      await ensureTables(pool)
      const sourceIdRaw = parsedUrl?.query?.source_branch_id
      const pusatId = await getPusatId(pool)
      const sourceId = (() => {
        const v = Number(sourceIdRaw)
        return Number.isFinite(v) && v > 0 ? v : pusatId
      })()
      if (Number(sourceId) === Number(branchId)) {
        sendJson(res, 400, { error: 'Source and destination branch must be different' })
        return
      }
      const [src] = await pool.query(
        `SELECT name, description, default_unit FROM categories WHERE branch_id = ? ORDER BY id ASC`,
        [sourceId]
      )
      let added = 0, updated = 0
      for (const c of src) {
        try {
          const [existsRows] = await pool.query(
            `SELECT id, name, description, default_unit FROM categories WHERE branch_id = ? AND name = ? LIMIT 1`,
            [branchId, c.name]
          )
          if (existsRows.length === 0) {
            await pool.query(
              `INSERT INTO categories (name, description, default_unit, branch_id) VALUES (?, ?, ?, ?)`,
              [c.name ?? null, c.description ?? null, c.default_unit ?? null, branchId]
            )
            added++
          } else {
            const exists = existsRows[0]
            if (String(exists.description || '') !== String(c.description || '') || String(exists.default_unit || '') !== String(c.default_unit || '')) {
              await pool.query(
                `UPDATE categories SET description = ?, default_unit = ? WHERE id = ? AND branch_id = ?`,
                [c.description ?? null, c.default_unit ?? null, exists.id, branchId]
              )
              updated++
            }
          }
        } catch {}
      }
      const [destCountRows] = await pool.query(`SELECT COUNT(1) AS cnt FROM categories WHERE branch_id = ?`, [branchId])
      const [srcCountRows] = await pool.query(`SELECT COUNT(1) AS cnt FROM categories WHERE branch_id = ?`, [sourceId])
      sendJson(res, 200, { ok: true, added, updated, destination_branch_id: branchId, source_branch_id: sourceId, destination_total: destCountRows?.[0]?.cnt || 0, source_total: srcCountRows?.[0]?.cnt || 0 })
      return
    }
    if (pathname === '/api/entities/Category' && method === 'POST') {
      const pool = await getPool()
      await ensureTables(pool)
      const body = await readJsonBody(req)
      const newId = randomUUID()
      const [result] = await pool.query(
        `INSERT INTO categories (id, name, description, default_unit, branch_id) VALUES (?, ?, ?, ?, ?)`,
        [newId, body.name ?? null, body.description ?? null, body.default_unit ?? null, branchId]
      )
      const pusatId = await getPusatId(pool)
      if (Number(branchId) === pusatId) {
        try {
          const [branches] = await pool.query(`SELECT id FROM branches WHERE id <> ? ORDER BY id ASC`, [pusatId])
          for (const b of branches) {
            try {
              const destId = Number(b.id)
              if (!Number.isFinite(destId) || destId <= 0) continue
              const [existsRows] = await pool.query(
                `SELECT id FROM categories WHERE branch_id = ? AND name = ? LIMIT 1`,
                [destId, body.name ?? null]
              )
              if (existsRows.length === 0) {
                await pool.query(
                  `INSERT INTO categories (id, name, description, default_unit, branch_id) VALUES (?, ?, ?, ?, ?)`,
                  [randomUUID(), body.name ?? null, body.description ?? null, body.default_unit ?? null, destId]
                )
              }
            } catch {}
          }
        } catch {}
      }
      const [rows] = await pool.query(`SELECT * FROM categories WHERE id = ? AND branch_id = ?`, [newId, branchId])
      sendJson(res, 201, rows[0])
      return
    }
    if (pathname.startsWith('/api/entities/Category/') && (method === 'PUT' || method === 'PATCH')) {
      const pool = await getPool()
      await ensureTables(pool)
      const id = pathname.split('/').pop()
      const body = await readJsonBody(req)
      const pusatId = await getPusatId(pool)
      let before = null
      if (Number(branchId) === pusatId) {
        try {
          const [rows] = await pool.query(`SELECT * FROM categories WHERE id = ? AND branch_id = ?`, [id, branchId])
          before = rows?.[0] || null
        } catch {}
      }
      await pool.query(
        `UPDATE categories SET name = ?, description = ?, default_unit = ? WHERE id = ? AND branch_id = ?`,
        [body.name ?? null, body.description ?? null, body.default_unit ?? null, id, branchId]
      )
      // Propagate edits from center to branches
      if (Number(branchId) === pusatId) {
        try {
          const newName = (body.name ?? before?.name) ?? null
          const newDesc = body.description ?? before?.description ?? null
          const newUnit = body.default_unit ?? before?.default_unit ?? null
          const oldName = before?.name ?? newName
          if (newName) {
            const [branches] = await pool.query(`SELECT id FROM branches WHERE id <> ? ORDER BY id ASC`, [pusatId])
            for (const b of branches) {
              try {
                const destId = Number(b.id)
                if (!Number.isFinite(destId) || destId <= 0) continue
                const [existOldRows] = await pool.query(
                  `SELECT id FROM categories WHERE branch_id = ? AND name = ? LIMIT 1`,
                  [destId, oldName]
                )
                if (existOldRows.length > 0) {
                  await pool.query(
                    `UPDATE categories SET name = ?, description = ?, default_unit = ? WHERE id = ? AND branch_id = ?`,
                    [newName, newDesc, newUnit, existOldRows[0].id, destId]
                  )
                } else {
                  const [existNewRows] = await pool.query(
                    `SELECT id FROM categories WHERE branch_id = ? AND name = ? LIMIT 1`,
                    [destId, newName]
                  )
                  if (existNewRows.length > 0) {
                    await pool.query(
                      `UPDATE categories SET description = ?, default_unit = ? WHERE id = ? AND branch_id = ?`,
                      [newDesc, newUnit, existNewRows[0].id, destId]
                    )
                  } else {
                    await pool.query(
                      `INSERT INTO categories (name, description, default_unit, branch_id) VALUES (?, ?, ?, ?)`,
                      [newName, newDesc, newUnit, destId]
                    )
                  }
                }
              } catch {}
            }
          }
        } catch {}
      }
      const [rows] = await pool.query(`SELECT * FROM categories WHERE id = ? AND branch_id = ?`, [id, branchId])
      sendJson(res, 200, rows[0])
      return
    }
    if (pathname.startsWith('/api/entities/Category/') && method === 'DELETE') {
      const pool = await getPool()
      await ensureTables(pool)
      const id = pathname.split('/').pop()
      await pool.query(`DELETE FROM categories WHERE id = ? AND branch_id = ?`, [id, branchId])
      sendJson(res, 200, { success: true })
      return
    }

    // Entities: Customer
    if (pathname === '/api/entities/Customer' && method === 'GET') {
      const pool = await getPool()
      await ensureTables(pool)
      const [rows] = await pool.query(`SELECT * FROM customers WHERE branch_id = ? ORDER BY created_date DESC`, [branchId])
      sendJson(res, 200, rows)
      return
    }
    if (pathname === '/api/entities/Customer' && method === 'POST') {
      const pool = await getPool()
      await ensureTables(pool)
      const body = await readJsonBody(req)
      const newId = randomUUID()
      const [result] = await pool.query(
        `INSERT INTO customers (id, name, phone, address, total_debt, branch_id) VALUES (?, ?, ?, ?, ?, ?)`,
        [newId, body.name ?? null, body.phone ?? null, body.address ?? null, body.total_debt ?? 0, branchId]
      )
      const [rows] = await pool.query(`SELECT * FROM customers WHERE id = ? AND branch_id = ?`, [newId, branchId])
      sendJson(res, 201, rows[0])
      return
    }
    if (pathname.startsWith('/api/entities/Customer/') && (method === 'PUT' || method === 'PATCH')) {
      const pool = await getPool()
      await ensureTables(pool)
      const id = pathname.split('/').pop()
      const body = await readJsonBody(req)
      const fields = ['name','phone','address','total_debt']
      const setClauses = []
      const values = []
      for (const f of fields) {
        if (body[f] !== undefined) {
          setClauses.push(`${f} = ?`)
          values.push(body[f])
        }
      }
      if (setClauses.length === 0) {
        sendJson(res, 400, { error: 'No fields to update' })
        return
      }
      values.push(id, branchId)
      await pool.query(`UPDATE customers SET ${setClauses.join(', ')} WHERE id = ? AND branch_id = ?`, values)
      const [rows] = await pool.query(`SELECT * FROM customers WHERE id = ? AND branch_id = ?`, [id, branchId])
      sendJson(res, 200, rows[0])
      return
    }
    if (pathname.startsWith('/api/entities/Customer/') && method === 'DELETE') {
      const pool = await getPool()
      await ensureTables(pool)
      const id = pathname.split('/').pop()
      await pool.query(`DELETE FROM customers WHERE id = ? AND branch_id = ?`, [id, branchId])
      sendJson(res, 200, { success: true })
      return
    }

    // Entities: Supplier
    if (pathname === '/api/entities/Supplier' && method === 'GET') {
      const pool = await getPool()
      await ensureTables(pool)
      const [rows] = await pool.query(`SELECT * FROM suppliers WHERE branch_id = ? ORDER BY created_date DESC`, [branchId])
      sendJson(res, 200, rows)
      return
    }
    if (pathname === '/api/entities/Supplier' && method === 'POST') {
      const pool = await getPool()
      await ensureTables(pool)
      const body = await readJsonBody(req)
      const newId = randomUUID()
      const [result] = await pool.query(
        `INSERT INTO suppliers (id, name, phone, address, total_debt, branch_id) VALUES (?, ?, ?, ?, ?, ?)`,
        [newId, body.name ?? null, body.phone ?? null, body.address ?? null, body.total_debt ?? 0, branchId]
      )
      const [rows] = await pool.query(`SELECT * FROM suppliers WHERE id = ? AND branch_id = ?`, [newId, branchId])
      sendJson(res, 201, rows[0])
      return
    }
    if (pathname.startsWith('/api/entities/Supplier/') && (method === 'PUT' || method === 'PATCH')) {
      const pool = await getPool()
      await ensureTables(pool)
      const id = pathname.split('/').pop()
      const body = await readJsonBody(req)
      const fields = ['name','phone','address','total_debt']
      const setClauses = []
      const values = []
      for (const f of fields) {
        if (body[f] !== undefined) {
          setClauses.push(`${f} = ?`)
          values.push(body[f])
        }
      }
      if (setClauses.length === 0) {
        sendJson(res, 400, { error: 'No fields to update' })
        return
      }
      values.push(id, branchId)
      await pool.query(`UPDATE suppliers SET ${setClauses.join(', ')} WHERE id = ? AND branch_id = ?`, values)
      const [rows] = await pool.query(`SELECT * FROM suppliers WHERE id = ? AND branch_id = ?`, [id, branchId])
      sendJson(res, 200, rows[0])
      return
    }
    if (pathname.startsWith('/api/entities/Supplier/') && method === 'DELETE') {
      const pool = await getPool()
      await ensureTables(pool)
      const id = pathname.split('/').pop()
      await pool.query(`DELETE FROM suppliers WHERE id = ? AND branch_id = ?`, [id, branchId])
      sendJson(res, 200, { success: true })
      return
    }

    // Entities: Purchase
    if (pathname === '/api/entities/Purchase' && method === 'GET') {
      const pool = await getPool()
      await ensureTables(pool)
      const sort = parsedUrl.query.sort
      const order = sort === '-purchase_date' ? 'ORDER BY purchase_date DESC' : ''
      const [rows] = await pool.query(`SELECT * FROM purchases WHERE branch_id = ? ${order}`, [branchId])
      // Parse items JSON safely
      const data = rows.map(r => {
        let items = []
        try {
          items = r.items ? (typeof r.items === 'string' ? JSON.parse(r.items) : r.items) : []
        } catch (e) {
          console.error(`[PURCHASE ERROR] Failed to parse items for ID ${r.id}:`, e)
          items = []
        }
        return { ...r, items: Array.isArray(items) ? items : [] }
      })
      sendJson(res, 200, data)
      return
    }
    if (pathname === '/api/entities/Purchase' && method === 'POST') {
      const pool = await getPool()
      await ensureTables(pool)
      const body = await readJsonBody(req)
      const items = Array.isArray(body?.items) ? body.items : []
      const purchaseId = randomUUID();
      
      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        await connection.query(
          `INSERT INTO purchases (id, invoice_number, supplier_id, supplier_name, items, subtotal, total, payment_method, paid_amount, debt_amount, purchase_date, status, branch_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            purchaseId,
            body.invoice_number ?? null,
            body.supplier_id ?? null,
            body.supplier_name ?? null,
            JSON.stringify(items),
            body.subtotal ?? 0,
            body.total ?? 0,
            body.payment_method ?? null,
            body.paid_amount ?? 0,
            body.debt_amount ?? 0,
            body.purchase_date ? new Date(body.purchase_date) : null,
            body.status ?? null,
            branchId
          ]
        )
        
        // FIFO: Create product batches for each item
        for (const it of items) {
          const pid = it.product_id ? String(it.product_id) : null;
          if (!pid || pid === 'NaN' || pid === 'undefined') {
            console.error('[PURCHASE ERROR] Invalid product_id for item:', it);
            continue;
          }
          const unit = String(it?.unit || '').trim().toUpperCase();
          const per = Number(it?.pcs_per_dus || 1) || 1;
          const qtyRaw = Number(it?.qty || 0);
          if (!Number.isFinite(qtyRaw) || qtyRaw <= 0) continue;
          const isPack = unit && unit !== 'PCS' && per > 1;
          const qtyPcs = Math.round(qtyRaw * (isPack ? per : 1));
          const priceRaw = Number(it?.price || 0);
          const buyPricePcs = isPack ? (priceRaw / per) : priceRaw;
          const buyPriceDus = per > 1 ? (isPack ? priceRaw : (buyPricePcs * per)) : buyPricePcs;

          // 1. Insert into product_batches
          await connection.query(
            `INSERT INTO product_batches (product_id, purchase_price, initial_qty, remaining_qty, branch_id, purchase_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [pid, buyPricePcs, qtyPcs, qtyPcs, branchId, purchaseId]
          );

          // 2. Update master stock in products table
          await connection.query(
            `UPDATE products SET stock_pcs = stock_pcs + ?, buy_price_pcs = ?, buy_price_dus = ? WHERE id = ? AND branch_id = ?`,
            [qtyPcs, buyPricePcs, buyPriceDus, pid, branchId]
          );

          // 3. Record stock mutation
          const [prows] = await connection.query(`SELECT name, stock_pcs FROM products WHERE id = ? AND branch_id = ?`, [pid, branchId]);
          const p = prows[0];
          const stockAfter = Number(p?.stock_pcs || 0);
          const stockBefore = stockAfter - qtyPcs;

          await connection.query(
            `INSERT INTO stock_mutations (product_id, product_name, type, qty_pcs, stock_before, stock_after, reference_type, reference_id, notes, branch_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [pid, p?.name || it.product_name, 'in', qtyPcs, stockBefore, stockAfter, 'purchase', String(purchaseId), `Pembelian ${body.invoice_number || purchaseId}`, branchId]
          );
        }

        await connection.commit();
        const [rows] = await pool.query(`SELECT * FROM purchases WHERE id = ? AND branch_id = ?`, [purchaseId, branchId])
        let row = rows[0]
        if (row) {
          row.items = items;
          sendJson(res, 201, row)
        } else {
          sendJson(res, 201, { id: purchaseId, ...body, items, branch_id: branchId })
        }
      } catch (err) {
        await connection.rollback();
        console.error('[PURCHASE ERROR]', err);
        sendError(res, 400, err, 'Gagal menyimpan pembelian')
      } finally {
        connection.release();
      }
      return
    }
    if (pathname.startsWith('/api/entities/Purchase/') && (method === 'PUT' || method === 'PATCH')) {
      const pool = await getPool()
      await ensureTables(pool)
      const id = pathname.split('/').pop()
      const body = await readJsonBody(req)
      const items = Array.isArray(body?.items) ? body.items : []
      const fields = [
        'invoice_number','supplier_id','supplier_name','items',
        'subtotal','total','payment_method','paid_amount','debt_amount',
        'purchase_date','status'
      ]
      const setClauses = []
      const values = []
      for (const f of fields) {
        if (body[f] !== undefined) {
          if (f === 'items') {
            setClauses.push(`items = ?`); values.push(JSON.stringify(items))
          } else if (f === 'purchase_date') {
            setClauses.push(`purchase_date = ?`); values.push(body.purchase_date ? new Date(body.purchase_date) : null)
          } else {
            setClauses.push(`${f} = ?`); values.push(body[f])
          }
        }
      }
      if (setClauses.length === 0) {
        sendJson(res, 400, { error: 'No fields to update' })
        return
      }
      values.push(id, branchId)
      await pool.query(`UPDATE purchases SET ${setClauses.join(', ')} WHERE id = ? AND branch_id = ?`, values)
      const [rows] = await pool.query(`SELECT * FROM purchases WHERE id = ? AND branch_id = ?`, [id, branchId])
      const row = rows[0]
      if (row) {
        let items = []
        try {
          items = row.items ? (typeof row.items === 'string' ? JSON.parse(row.items) : row.items) : []
        } catch (e) { items = [] }
        row.items = Array.isArray(items) ? items : []
      }
      sendJson(res, 200, row)
      return
    }
    if (pathname.startsWith('/api/entities/Purchase/') && method === 'DELETE') {
      const pool = await getPool()
      await ensureTables(pool)
      const rawKey = pathname.split('/').pop()
      const idOrKey = decodeURIComponent(String(rawKey || '').trim())
      const force = String(parsedUrl?.query?.force || '').trim() === '1'
      const connection = await pool.getConnection()
      await connection.beginTransaction()
      try {
        let purchase = null
        let purchaseId = null
        const [prowId] = await connection.query(
          `SELECT * FROM purchases WHERE id = ? OR CAST(id AS CHAR(64)) = ? LIMIT 1 FOR UPDATE`,
          [idOrKey, String(idOrKey)]
        )
        if (prowId && prowId[0]) {
          purchase = prowId[0]
          purchaseId = purchase.id
        }
        if (!purchase) {
          const keyTrim = String(idOrKey).trim()
          const keyUpper = keyTrim.toUpperCase()
          const keyNoDash = keyUpper.replace(/-/g, '').replace(/\s+/g, '')
          const [prow2] = await connection.query(
            `SELECT * FROM purchases 
             WHERE invoice_number = ? 
                OR TRIM(invoice_number) = ? 
                OR UPPER(TRIM(invoice_number)) = ? 
                OR UPPER(REPLACE(TRIM(invoice_number),'–','-')) = ? 
                OR UPPER(REPLACE(TRIM(invoice_number),'—','-')) = ?
                OR UPPER(REPLACE(REPLACE(REPLACE(TRIM(invoice_number),'–','-'),'—','-'),'-','')) = ?
                OR UPPER(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(invoice_number),'–','-'),'—','-'),'-',''),' ','')) = ?
             LIMIT 1 FOR UPDATE`,
            [keyTrim, keyTrim, keyUpper, keyUpper, keyUpper, keyNoDash, keyNoDash]
          )
          if (prow2 && prow2[0]) {
            purchase = prow2[0]
            purchaseId = purchase.id
          }
        }
        if (!purchase) {
          const likeKey = `%${idOrKey}%`
          const [prow3] = await connection.query(
            `SELECT * FROM purchases 
             WHERE invoice_number LIKE ? OR TRIM(invoice_number) LIKE ? 
             ORDER BY id DESC 
             LIMIT 1 FOR UPDATE`,
            [likeKey, likeKey]
          )
          if (prow3 && prow3[0]) {
            purchase = prow3[0]
            purchaseId = purchase.id
          }
        }
        if (!purchase || purchaseId == null) {
          try {
            const [cands] = await connection.query(
              `SELECT id, invoice_number, branch_id FROM purchases ORDER BY id DESC LIMIT 2000`
            )
            const normalize = (s) => {
              const t = String(s || '')
                .replace(/[\u2013\u2014]/g, '-')
                .replace(/\u00A0/g, ' ')
                .replace(/[\u200B-\u200D\uFEFF]/g, '')
                .trim()
              return t.replace(/[\s\t\r\n]+/g, '').toUpperCase()
            }
            const normalizeAlnum = (s) => normalize(s).replace(/[^A-Z0-9]/g, '')
            const keyNorm = normalize(idOrKey)
            const keyAlnum = normalizeAlnum(idOrKey)
            let found = null
            for (const row of cands) {
              const rn = normalize(row.invoice_number)
              if (rn === keyNorm || normalizeAlnum(row.invoice_number) === keyAlnum) { found = row; break }
            }
            if (found) {
              purchase = found
              purchaseId = found.id
            }
          } catch {}
        }
        if (!purchase || purchaseId == null) {
          await connection.rollback()
          sendJson(res, 404, { error: 'Not Found' })
          return
        }
        const targetBranchId = Number(purchase.branch_id || branchId) || branchId
        let items = []
        try {
          items = purchase.items ? (typeof purchase.items === 'string' ? JSON.parse(purchase.items) : purchase.items) : []
        } catch { items = [] }
        const expectedQtyByProduct = {}
        for (const it of (Array.isArray(items) ? items : [])) {
          const pid = it?.product_id != null ? String(it.product_id) : ''
          if (!pid) continue
          const unit = String(it?.unit || '').trim().toUpperCase()
          const per = Number(it?.pcs_per_dus || 1) || 1
          const qty = Number(it?.qty_pcs ?? it?.qty ?? 0)
          if (!Number.isFinite(qty) || qty <= 0) continue
          const qtyPcs = unit && unit !== 'PCS' && per > 1 ? Math.round(qty * per) : Math.round(qty)
          expectedQtyByProduct[pid] = (expectedQtyByProduct[pid] || 0) + qtyPcs
        }
        const [batches] = await connection.query(`SELECT * FROM product_batches WHERE purchase_id = ? AND branch_id = ? FOR UPDATE`, [purchaseId, targetBranchId])
        const usedBatchDetails = []
        for (const b of batches) {
          const initialQty = Number(b.initial_qty || 0)
          const remainingQty = Number(b.remaining_qty || 0)
          const usedQty = initialQty - remainingQty
          if (usedQty > 0) {
            usedBatchDetails.push({
              batch_id: b.id,
              product_id: b.product_id,
              initial_qty: initialQty,
              remaining_qty: remainingQty,
              used_qty: usedQty
            })
          }
        }
        if (usedBatchDetails.length > 0 && !force) {
          await connection.rollback()
          sendJson(res, 400, { error: 'Tidak bisa hapus: stok dari pembelian ini sudah terpakai' })
          return
        }
        const remainingExpected = { ...expectedQtyByProduct }
        for (const b of batches) {
          const pid = b.product_id
          const batchRemaining = Number(b.remaining_qty || 0)
          if (batchRemaining > 0) {
            const cap = remainingExpected[String(pid)] !== undefined ? Number(remainingExpected[String(pid)] || 0) : batchRemaining
            const dec = Math.max(0, Math.min(batchRemaining, cap))
            if (dec > 0) {
              await connection.query(`UPDATE products SET stock_pcs = GREATEST(stock_pcs - ?, 0) WHERE id = ? AND branch_id = ?`, [dec, pid, targetBranchId])
            }
            if (remainingExpected[String(pid)] !== undefined) {
              remainingExpected[String(pid)] = Math.max(0, cap - dec)
            }
          }
        }
        await connection.query(`DELETE FROM product_batches WHERE purchase_id = ? AND branch_id = ?`, [purchaseId, targetBranchId])
        await connection.query(`DELETE FROM stock_mutations WHERE reference_type = 'purchase' AND reference_id = ? AND branch_id = ?`, [purchaseId, targetBranchId])
        if (String(purchase.payment_method || '').trim().toLowerCase() === 'tempo') {
          const debt = Number(purchase.debt_amount || 0)
          const sid = purchase.supplier_id
          if (sid && debt > 0) {
            await connection.query(`UPDATE suppliers SET total_debt = GREATEST(total_debt - ?, 0) WHERE id = ? AND branch_id = ?`, [debt, sid, targetBranchId])
          }
        }
        await connection.query(`DELETE FROM purchases WHERE id = ? AND branch_id = ?`, [purchaseId, targetBranchId])
        await connection.commit()
        sendJson(res, 200, { success: true })
      } catch (e) {
        await connection.rollback()
        sendError(res, 400, e, 'Gagal menghapus pembelian')
      } finally {
        connection.release()
      }
      return
    }

    // Entities: StockMutation
    if (pathname === '/api/entities/StockMutation' && method === 'GET') {
      const pool = await getPool()
      await ensureTables(pool)
      const sort = parsedUrl.query.sort
      const order = sort === '-created_date' ? 'ORDER BY created_date DESC' : ''
      const [rows] = await pool.query(`SELECT * FROM stock_mutations WHERE branch_id = ? ${order}`, [branchId])
      const needEnrich = rows.filter(r => (!r.notes || String(r.notes).trim() === '') && String(r.reference_type || '') === 'stock_transfer' && r.reference_id)
      if (needEnrich.length > 0) {
        const refIds = [...new Set(needEnrich.map(r => String(r.reference_id)))].slice(0, 500)
        if (refIds.length > 0) {
          const placeholders = refIds.map(() => '?').join(',')
          try {
            const [trs] = await pool.query(`SELECT id, doc_number, from_branch_id, to_branch_id FROM stock_transfers WHERE id IN (${placeholders})`, refIds)
            const tmap = new Map(trs.map(t => [String(t.id), t]))
            const bset = new Set()
            for (const t of trs) { bset.add(String(t.from_branch_id)); bset.add(String(t.to_branch_id)) }
            const bids = [...bset]
            let bmap = new Map()
            if (bids.length > 0) {
              const ph = bids.map(() => '?').join(',')
              const [bs] = await pool.query(`SELECT id, name FROM branches WHERE id IN (${ph})`, bids)
              bmap = new Map(bs.map(b => [String(b.id), b.name || `Cabang ${b.id}`]))
            }
            const updates = []
            for (const r of needEnrich) {
              const t = tmap.get(String(r.reference_id))
              if (t) {
                const doc = t.doc_number || `#${t.id}`
                const fromName = bmap.get(String(t.from_branch_id)) || `Cabang ${t.from_branch_id}`
                const toName = bmap.get(String(t.to_branch_id)) || `Cabang ${t.to_branch_id}`
                const note = `${fromName} / ${toName} ${doc}`
                r.notes = note
                updates.push({ id: r.id, notes: note })
              }
            }
            if (updates.length > 0) {
              for (const u of updates) {
                await pool.query(`UPDATE stock_mutations SET notes = ? WHERE id = ? AND branch_id = ?`, [u.notes, u.id, branchId])
              }
            }
          } catch {}
        }
      }
      sendJson(res, 200, rows)
      return
    }
    // Admin backfill notes for stock transfer mutations
    if (pathname === '/api/admin/backfill-transfer-notes' && (method === 'GET' || method === 'POST')) {
      const pool = await getPool()
      await ensureTables(pool)
      const doc = (parsedUrl.query.doc || '').trim()
      try {
        if (doc) {
          await pool.query(`
            UPDATE stock_mutations sm
            JOIN stock_transfers st ON st.id = CAST(sm.reference_id AS UNSIGNED)
            LEFT JOIN branches fb ON fb.id = st.from_branch_id
            LEFT JOIN branches tb ON tb.id = st.to_branch_id
            SET sm.notes = CASE 
              WHEN sm.type = 'in' THEN CONCAT('Transfer ', st.doc_number, ' | Dari: ', COALESCE(fb.name, CONCAT('Cabang ', st.from_branch_id)))
              WHEN sm.type = 'out' THEN CONCAT('Transfer ', st.doc_number, ' | Ke: ', COALESCE(tb.name, CONCAT('Cabang ', st.to_branch_id)))
              ELSE CONCAT('Transfer ', st.doc_number)
            END
            WHERE (sm.notes IS NULL OR TRIM(sm.notes) = '')
              AND sm.reference_type = 'stock_transfer'
              AND st.doc_number = ?
          `, [doc])
        } else {
          await pool.query(`
            UPDATE stock_mutations sm
            JOIN stock_transfers st ON st.id = CAST(sm.reference_id AS UNSIGNED)
            LEFT JOIN branches fb ON fb.id = st.from_branch_id
            LEFT JOIN branches tb ON tb.id = st.to_branch_id
            SET sm.notes = CASE 
              WHEN sm.type = 'in' THEN CONCAT('Transfer ', st.doc_number, ' | Dari: ', COALESCE(fb.name, CONCAT('Cabang ', st.from_branch_id)))
              WHEN sm.type = 'out' THEN CONCAT('Transfer ', st.doc_number, ' | Ke: ', COALESCE(tb.name, CONCAT('Cabang ', st.to_branch_id)))
              ELSE CONCAT('Transfer ', st.doc_number)
            END
            WHERE (sm.notes IS NULL OR TRIM(sm.notes) = '')
              AND sm.reference_type = 'stock_transfer'
          `)
        }
        sendJson(res, 200, { success: true, doc: doc || null })
      } catch (e) {
        sendError(res, 500, e, 'Backfill error')
      }
      return
    }
    if (pathname === '/api/admin/sync-product-names' && (method === 'GET' || method === 'POST')) {
      const pool = await getPool()
      await ensureTables(pool)
      try {
        const pusatId = await getPusatId(pool)
        const [branches] = await pool.query(`SELECT id FROM branches WHERE id <> ?`, [pusatId])
        let totalUpdated = 0
        for (const b of branches) {
          const bid = Number(b.id)
          if (!Number.isFinite(bid) || bid <= 0) continue
          const [r1] = await pool.query(
            `UPDATE products d 
             JOIN products c ON c.branch_id = ? AND c.barcode IS NOT NULL AND TRIM(c.barcode) <> '' AND d.branch_id = ? AND d.barcode = c.barcode
             SET d.name = c.name, d.category = c.category`,
            [pusatId, bid]
          )
          const [r2] = await pool.query(
            `UPDATE products d 
             JOIN products c ON c.branch_id = ? AND (c.barcode IS NULL OR TRIM(c.barcode) = '') AND d.branch_id = ? AND d.name = c.name
             SET d.name = c.name, d.category = c.category`,
            [pusatId, bid]
          )
          totalUpdated += Number(r1?.affectedRows || 0) + Number(r2?.affectedRows || 0)
        }
        sendJson(res, 200, { updated: totalUpdated })
      } catch (e) {
        sendError(res, 500, e, 'Sync error')
      }
      return
    }
    if (pathname === '/api/entities/StockMutation' && method === 'POST') {
      const pool = await getPool()
      await ensureTables(pool)
      const body = await readJsonBody(req)
      const pid = body.product_id !== undefined ? String(body.product_id) : null
      if (pid === null || pid.trim() === '') {
        sendJson(res, 400, { error: 'product_id required' })
        return
      }

      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        // Fetch current stock for adjustment if needed
        const [prows] = await connection.query(`SELECT * FROM products WHERE id = ? AND branch_id = ? LIMIT 1 FOR UPDATE`, [pid, branchId])
        const p = prows[0]
        if (!p) throw new Error('Produk tidak ditemukan');

        const qty = Number(body.qty_pcs || 0)
        const type = String(body.type || 'adjustment')
        const stockBefore = Number(p.stock_pcs || 0)
        let stockAfter = body.stock_after !== undefined ? Number(body.stock_after) : (type === 'out' ? stockBefore - qty : stockBefore + qty)
        
        if (stockAfter < 0) throw new Error('Stok tidak boleh negatif');

        await connection.query(`UPDATE products SET stock_pcs = ? WHERE id = ? AND branch_id = ?`, [stockAfter, pid, branchId])

        // FIFO: Update product_batches
        if (type === 'in' || (type === 'adjustment' && stockAfter > stockBefore)) {
          const addedQty = type === 'in' ? qty : (stockAfter - stockBefore);
          if (addedQty > 0) {
            // Use provided purchase_price or fallback to current buy_price_pcs
            const buyPrice = Number(body.purchase_price || p.buy_price_pcs || 0);
            await connection.query(
              `INSERT INTO product_batches (product_id, purchase_price, initial_qty, remaining_qty, branch_id, notes)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [pid, buyPrice, addedQty, addedQty, branchId, body.notes || `Penyesuaian Masuk (${body.reference_type || 'manual'})`]
            );
          }
        } else if (type === 'out' || (type === 'adjustment' && stockAfter < stockBefore)) {
          const deductedQty = type === 'out' ? qty : (stockBefore - stockAfter);
          if (deductedQty > 0) {
            let remainingToDeduct = deductedQty;
            const [batches] = await connection.query(
              `SELECT * FROM product_batches WHERE product_id = ? AND branch_id = ? AND remaining_qty > 0 ORDER BY id ASC`,
              [pid, branchId]
            );

            for (const batch of batches) {
              if (remainingToDeduct <= 0) break;
              const take = Math.min(remainingToDeduct, batch.remaining_qty);
              await connection.query(
                `UPDATE product_batches SET remaining_qty = remaining_qty - ? WHERE id = ? AND branch_id = ?`,
                [take, batch.id, branchId]
              );
              remainingToDeduct -= take;
            }
          }
        }

        const mutationId = randomUUID();
        await connection.query(
          `INSERT INTO stock_mutations (id, product_id, product_name, type, qty_pcs, stock_before, stock_after, reference_type, reference_id, notes, branch_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            mutationId,
            pid,
            body.product_name ?? p.name,
            type,
            qty,
            stockBefore,
            stockAfter,
            body.reference_type ?? 'adjustment',
            body.reference_id !== undefined ? String(body.reference_id) : null,
            body.notes ?? null,
            branchId
          ]
        )
        
        await connection.commit();
        const [rows] = await pool.query(`SELECT * FROM stock_mutations WHERE id = ? AND branch_id = ?`, [mutationId, branchId])
        sendJson(res, 201, rows[0])
      } catch (err) {
        await connection.rollback();
        sendError(res, 400, err, 'Gagal menyimpan mutasi')
      } finally {
        connection.release();
      }
      return
    }

    // Entities: Sale
    if (pathname === '/api/entities/Sale' && method === 'GET') {
      const pool = await getPool()
      await ensureTables(pool)
      const sort = parsedUrl.query.sort
      const order = sort === '-sale_date' ? 'ORDER BY sale_date DESC' : ''
      const [rows] = await pool.query(`SELECT * FROM sales WHERE branch_id = ? ${order}`, [branchId])
      const data = rows.map(r => ({ ...r, items: r.items ? JSON.parse(r.items) : [] }))
      sendJson(res, 200, data)
      return
    }
    if (pathname === '/api/entities/Sale' && method === 'POST') {
      const pool = await getPool()
      await ensureTables(pool)
      const body = await readJsonBody(req)
      const b = body || {}
      
      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        const items = Array.isArray(b?.items) ? b.items : []
        let totalCost = 0;

        // FIFO: Process each item
        for (const it of items) {
          const pid = it?.product_id ? String(it.product_id) : null;
          const barcode = (it?.barcode ? String(it.barcode).trim() : '');
          
          let prod = null;
          if (pid && pid !== 'NaN') {
            const [prows] = await connection.query(`SELECT id, name, stock_pcs, pcs_per_dus, default_unit, buy_price_pcs, sell_price_pcs, sell_price_dus FROM products WHERE id = ? AND branch_id = ? LIMIT 1 FOR UPDATE`, [pid, branchId]);
            prod = prows?.[0] || null;
          }
          if (!prod && barcode && barcode.length >= 3) {
            const [prows2] = await connection.query(`SELECT id, name, stock_pcs, pcs_per_dus, default_unit, buy_price_pcs, sell_price_pcs, sell_price_dus FROM products WHERE barcode = ? AND branch_id = ? LIMIT 1 FOR UPDATE`, [barcode, branchId]);
            prod = prows2?.[0] || null;
          }
          if (!prod) throw new Error(`Produk tidak ditemukan: ${it.product_name || pid}`);

          const unit = String(it?.unit || '').trim().toUpperCase();
          const per = Number(prod?.pcs_per_dus || 1) || 1;
          let qtyPcs = 0;
          
          // Determine qty in PCS
          let qtyNum = Number(it?.qty);
          if (!Number.isFinite(qtyNum) || qtyNum <= 0) qtyNum = Number(it?.qty_value);
          if (!Number.isFinite(qtyNum) || qtyNum <= 0) qtyNum = Number(it?.qty_pcs);
          
          if (unit && unit !== 'PCS' && per > 1) {
            qtyPcs = Math.round(qtyNum * per);
          } else {
            qtyPcs = Math.round(qtyNum);
          }

          if (qtyPcs > Number(prod.stock_pcs || 0)) {
            throw new Error(`Stok tidak mencukupi untuk ${prod.name}: Tersedia ${prod.stock_pcs}, Minta ${qtyPcs}`);
          }

          // FIFO Deduction from product_batches
          let remainingToDeduct = qtyPcs;
          let itemCost = 0;
          
          // Enhanced FIFO Deduction: Join with Pusat batch if transfer_batch_id exists to get original price
          let [batches] = await connection.query(
            `SELECT pb.*, COALESCE(pusat.purchase_price, pb.purchase_price) as actual_purchase_price
             FROM product_batches pb
             LEFT JOIN product_batches pusat ON pb.transfer_batch_id = pusat.id
             WHERE pb.product_id = ? AND pb.branch_id = ? AND pb.remaining_qty > 0 
             ORDER BY pb.id ASC`,
            [prod.id, branchId]
          );

          // RECONCILIATION: If stock_pcs > 0 but no batches, create a default batch to prevent crash
          if (batches.length === 0 && Number(prod.stock_pcs || 0) > 0) {
            console.log(`[FIFO RECONCILE] Creating default batch for ${prod.name} (ID: ${prod.id}, Branch: ${branchId})`);
            const defaultBuyPrice = Number(prod.buy_price_pcs || 0);
            const currentStock = Number(prod.stock_pcs || 0);
            await connection.query(
              `INSERT INTO product_batches (product_id, purchase_price, initial_qty, remaining_qty, branch_id)
               VALUES (?, ?, ?, ?, ?)`,
              [prod.id, defaultBuyPrice, currentStock, currentStock, branchId]
            );
            // Re-fetch batches with join
            const [reRows] = await connection.query(
              `SELECT pb.*, COALESCE(pusat.purchase_price, pb.purchase_price) as actual_purchase_price
               FROM product_batches pb
               LEFT JOIN product_batches pusat ON pb.transfer_batch_id = pusat.id
               WHERE pb.product_id = ? AND pb.branch_id = ? AND pb.remaining_qty > 0 
               ORDER BY pb.id ASC`,
              [prod.id, branchId]
            );
            batches = reRows;
          }

          console.log(`[FIFO DEBUG] Processing ${prod.name} (Qty: ${qtyPcs} PCS) in Branch ${branchId}`);
          for (const batch of batches) {
            if (remainingToDeduct <= 0) break;
            
            const take = Math.min(remainingToDeduct, batch.remaining_qty);
            // Strictly follow Pusat batch price if transfer_batch_id is present
            const costPerPcs = Number(batch.actual_purchase_price || 0);
            const costForThisBatch = take * costPerPcs;
            itemCost += costForThisBatch;
            
            console.log(`   - Taking ${take} from Batch ID ${batch.id} (Cost/PCS: ${costPerPcs}, Ref Transfer Batch ID: ${batch.transfer_batch_id || 'LOCAL'})`);
            
            await connection.query(
              `UPDATE product_batches SET remaining_qty = remaining_qty - ? WHERE id = ? AND branch_id = ?`,
              [take, batch.id, branchId]
            );
            
            remainingToDeduct -= take;
          }

          if (remainingToDeduct > 0) {
            // If still remaining, it means stock_pcs and batches are really out of sync even after reconcile
            throw new Error(`Gagal memproses FIFO untuk ${prod.name}: Data batch tidak mencukupi (Kurang ${remainingToDeduct} PCS). Silakan hubungi admin.`);
          }

          totalCost += itemCost;
          it.cost_price = qtyPcs > 0 ? (itemCost / qtyPcs) : 0; // Average cost for this item in this sale
          console.log(`   - Final Item Cost/PCS: ${it.cost_price}`);

          // Update product master stock
          const stockBefore = Number(prod.stock_pcs || 0);
          const stockAfter = stockBefore - qtyPcs;
          await connection.query(`UPDATE products SET stock_pcs = ? WHERE id = ? AND branch_id = ?`, [stockAfter, prod.id, branchId]);

          // Record mutation
          await connection.query(
            `INSERT INTO stock_mutations (product_id, product_name, type, qty_pcs, stock_before, stock_after, reference_type, reference_id, notes, branch_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [prod.id, prod.name, 'out', qtyPcs, stockBefore, stockAfter, 'sale', null, `Penjualan`, branchId]
          );
          it._mutation_idx = 0; // Temporary mark for post-update reference_id
        }

        const totalProfit = Number(b.total || 0) - totalCost;
        const saleId = randomUUID();

        // Insert Sale
        const pad = (n) => String(n).padStart(2, '0');
        const now = new Date();
        const sale_date = b.sale_date ? new Date(b.sale_date) : now;
        const y = sale_date.getFullYear();
        const m = pad(sale_date.getMonth() + 1);
        const d = pad(sale_date.getDate());
        
        let invoice_number = b.invoice_number && String(b.invoice_number).trim() !== '' ? String(b.invoice_number).trim() : '';
        if (!invoice_number) {
          const dayStr = `${y}-${m}-${d}`;
          const [cntRows] = await connection.query(
            `SELECT COUNT(*) AS cnt FROM sales WHERE DATE(sale_date) = ? AND branch_id = ?`,
            [dayStr, branchId]
          );
          const seq = ((cntRows && cntRows[0] && cntRows[0].cnt) ? Number(cntRows[0].cnt) : 0) + 1;
          const seqStr = String(seq).padStart(4, '0');
          invoice_number = `INV/${y}/${m}/${d}/${seqStr}`;
        }

        await connection.query(
          `INSERT INTO sales (
             id, invoice_number, customer_id, customer_name, items, 
             subtotal, total, total_cost, total_profit, discount_type, discount_value, discount_amount, 
             tax_percent, tax_amount, payment_method, paid_amount, change_amount, debt_amount,
             due_date, notes, cashier_name, sale_date, status, branch_id
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            saleId,
            invoice_number,
            b.customer_id ?? null,
            b.customer_name ?? null,
            JSON.stringify(items),
            b.subtotal ?? 0,
            b.total ?? 0,
            totalCost,
            totalProfit,
            b.discount_type ?? null,
            b.discount_value ?? 0,
            b.discount_amount ?? 0,
            b.tax_percent ?? 0,
            b.tax_amount ?? 0,
            b.payment_method ?? null,
            b.paid_amount ?? 0,
            b.change_amount ?? 0,
            b.debt_amount ?? 0,
            b.due_date ? new Date(b.due_date) : null,
            b.notes ?? null,
            b.cashier_name ?? null,
            sale_date,
            b.status ?? null,
            branchId
          ]
        );

        // Update mutation notes with invoice number
        await connection.query(
          `UPDATE stock_mutations SET reference_id = ?, notes = CONCAT(notes, ' ', ?) 
           WHERE reference_type = 'sale' AND reference_id IS NULL AND branch_id = ?`,
          [String(saleId), invoice_number, branchId]
        );

        await connection.commit();
        
        const [rows] = await pool.query(`SELECT * FROM sales WHERE id = ? AND branch_id = ?`, [saleId, branchId]);
        let row = rows[0];
        if (row) {
          row.items = items;
          sendJson(res, 201, row);
        } else {
          sendJson(res, 201, { id: saleId, ...b, items, invoice_number, total_cost: totalCost, total_profit: totalProfit, branch_id: branchId });
        }
      } catch (err) {
        await connection.rollback();
        console.error('[SALE ERROR]', err);
        sendError(res, 400, err, 'Gagal menyimpan penjualan')
      } finally {
        connection.release();
      }
      return
    }
    if (pathname.startsWith('/api/entities/Sale/') && (method === 'PUT' || method === 'PATCH')) {
      const pool = await getPool()
      await ensureTables(pool)
      const id = pathname.split('/').pop()
      const body = await readJsonBody(req)
      const b = body || {}
      // Only update fields present in body
      const fields = [
        'invoice_number','customer_id','customer_name','items',
        'subtotal','total','discount_type','discount_value','discount_amount',
        'tax_percent','tax_amount','payment_method','paid_amount','change_amount','debt_amount',
        'due_date','notes','cashier_name','sale_date','status'
      ]
      const setClauses = []
      const values = []
      for (const f of fields) {
        if (b[f] !== undefined) {
          if (f === 'items') {
            setClauses.push(`items = ?`); values.push(JSON.stringify(b?.items ?? []))
          } else if (f === 'sale_date') {
            setClauses.push(`sale_date = ?`); values.push(b.sale_date ? new Date(b.sale_date) : null)
          } else if (f === 'due_date') {
            setClauses.push(`due_date = ?`); values.push(b.due_date ? new Date(b.due_date) : null)
          } else {
            setClauses.push(`${f} = ?`); values.push(b[f])
          }
        }
      }
      if (setClauses.length === 0) {
        sendJson(res, 400, { error: 'No fields to update' })
        return
      }
      values.push(id, branchId)
      await pool.query(`UPDATE sales SET ${setClauses.join(', ')} WHERE id = ? AND branch_id = ?`, values)
      let sel = await pool.query(`SELECT * FROM sales WHERE id = ? AND branch_id = ?`, [id, branchId])
      let rows = sel[0]
      let row = rows?.[0] || null
      if (!row) {
        const [anyRows] = await pool.query(`SELECT * FROM sales WHERE id = ?`, [id])
        row = anyRows?.[0] || null
      }
      if (row) {
        row.items = row.items ? JSON.parse(row.items) : []
        sendJson(res, 200, row)
      } else {
        sendJson(res, 200, { id, ...(b || {}), items: Array.isArray(b?.items) ? b.items : [] })
      }
      return
    }
    if (pathname.startsWith('/api/entities/Sale/') && method === 'DELETE') {
      const pool = await getPool()
      await ensureTables(pool)
      const id = pathname.split('/').pop()
      await pool.query(`DELETE FROM sales WHERE id = ? AND branch_id = ?`, [id, branchId])
      sendJson(res, 200, { success: true })
      return
    }
    if (pathname === '/api/entities/Sale' && method === 'DELETE') {
      const pool = await getPool()
      await ensureTables(pool)
      await pool.query(`DELETE FROM sales WHERE branch_id = ?`, [branchId])
      sendJson(res, 200, { success: true })
      return
    }

    // Entities: Payment
    if (pathname === '/api/entities/Payment' && method === 'GET') {
      const pool = await getPool()
      await ensureTables(pool)
      const sort = parsedUrl.query.sort
      const order = sort === '-payment_date' ? 'ORDER BY payment_date DESC' : 'ORDER BY id DESC'
      const [rows] = await pool.query(`SELECT * FROM payments WHERE branch_id = ? ${order}`, [branchId])
      sendJson(res, 200, rows)
      return
    }
    if (pathname === '/api/entities/Payment' && method === 'POST') {
      const pool = await getPool()
      await ensureTables(pool)
      const body = await readJsonBody(req)
      const newId = randomUUID()
      const [result] = await pool.query(
        `INSERT INTO payments (id, type, party_id, party_name, amount, payment_method, payment_date, notes, branch_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId,
          body.type ?? null,
          body.party_id ?? null,
          body.party_name ?? null,
          body.amount ?? 0,
          body.payment_method ?? null,
          body.payment_date ? new Date(body.payment_date) : null,
          body.notes ?? null,
          branchId
        ]
      )
      const [rows] = await pool.query(`SELECT * FROM payments WHERE id = ? AND branch_id = ?`, [newId, branchId])
      sendJson(res, 201, rows[0])
      return
    }

    // Entities: User
    if (pathname === '/api/entities/User' && method === 'GET') {
      const pool = await getPool()
      await ensureTables(pool)
      const auth = req.headers?.authorization || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (!token) { sendJson(res, 403, { error: 'Forbidden' }); return }
      let uid = null
      try { const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8')); uid = decoded?.uid } catch {}
      if (!uid) { sendJson(res, 403, { error: 'Forbidden' }); return }
      const [urows] = await pool.query(`SELECT id, role FROM users WHERE id = ? LIMIT 1`, [uid])
      const current = urows[0]
      if (!current || !['admin','license_admin','superadmin'].includes(String(current.role))) { sendJson(res, 403, { error: 'Forbidden' }); return }
      
      let query = `SELECT id, username, full_name, role, created_date FROM users WHERE COALESCE(is_system, 0) = 0`
      const currentRole = String(current.role).toLowerCase()
      if (currentRole !== 'superadmin') {
        query += ` AND role NOT IN ('superadmin', 'license_admin')`
      }
      query += ` ORDER BY created_date DESC`
      
      const [rows] = await pool.query(query)
      sendJson(res, 200, rows)
      return
    }
    if (pathname === '/api/entities/User' && method === 'POST') {
      const pool = await getPool()
      await ensureTables(pool)
      const auth = req.headers?.authorization || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (!token) { sendJson(res, 403, { error: 'Forbidden' }); return }
      let uid = null
      try { const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8')); uid = decoded?.uid } catch {}
      if (!uid) { sendJson(res, 403, { error: 'Forbidden' }); return }
      const [urows] = await pool.query(`SELECT id, role FROM users WHERE id = ? LIMIT 1`, [uid])
      const current = urows[0]
      if (!current || !['admin','license_admin','superadmin'].includes(String(current.role))) { sendJson(res, 403, { error: 'Forbidden' }); return }
      let body
      try {
        body = await readJsonBody(req)
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON' })
        return
      }
      const username = typeof body.username === 'string' ? body.username.trim() : ''
      const full_name = typeof body.full_name === 'string' ? body.full_name.trim() : ''
      const role = typeof body.role === 'string' ? body.role.trim().toLowerCase() : 'staf'
      const password = typeof body.password === 'string' ? body.password : ''
      if (!username || !full_name || !password) {
        sendJson(res, 400, { error: 'username, full_name, password wajib diisi' })
        return
      }
      const allowedRoles = new Set(['admin', 'kasir', 'staf', 'license_admin', 'superadmin'])
      const safeRole = allowedRoles.has(role) ? role : 'staf'
      const password_hash = createHash('sha256').update(password).digest('hex')
      try {
        const [result] = await pool.query(
          `INSERT INTO users (username, full_name, role, password_hash) VALUES (?, ?, ?, ?)`,
          [username, full_name, safeRole, password_hash]
        )
        const [rows] = await pool.query(
          `SELECT id, username, full_name, role, created_date FROM users WHERE id = ?`,
          [result.insertId]
        )
        sendJson(res, 201, rows[0])
      } catch (e) {
        if (e && e.code === 'ER_DUP_ENTRY') {
          sendJson(res, 409, { error: 'Username sudah digunakan' })
        } else {
          throw e
        }
      }
      return
    }
    if (pathname.startsWith('/api/entities/User/') && (method === 'PUT' || method === 'PATCH')) {
      const pool = await getPool()
      await ensureTables(pool)
      const id = pathname.split('/').pop()
      const auth = req.headers?.authorization || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (!token) { sendJson(res, 403, { error: 'Forbidden' }); return }
      let uid = null
      try { const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8')); uid = decoded?.uid } catch {}
      if (!uid) { sendJson(res, 403, { error: 'Forbidden' }); return }
      const [urows] = await pool.query(`SELECT id, role FROM users WHERE id = ? LIMIT 1`, [uid])
      const current = urows[0]
      if (!current || !['admin','license_admin','superadmin'].includes(String(current.role))) { sendJson(res, 403, { error: 'Forbidden' }); return }
      let body
      try {
        body = await readJsonBody(req)
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON' })
        return
      }
      const setClauses = []
      const values = []
      if (body.username !== undefined) { setClauses.push(`username = ?`); values.push(String(body.username).trim()) }
      if (body.full_name !== undefined) { setClauses.push(`full_name = ?`); values.push(String(body.full_name).trim()) }
      if (body.role !== undefined) {
        const r = String(body.role).trim().toLowerCase()
        const allowedRoles = new Set(['admin', 'kasir', 'staf', 'license_admin', 'superadmin'])
        setClauses.push(`role = ?`); values.push(allowedRoles.has(r) ? r : 'staf')
      }
      if (body.password !== undefined && String(body.password).length > 0) {
        const password_hash = createHash('sha256').update(String(body.password)).digest('hex')
        setClauses.push(`password_hash = ?`); values.push(password_hash)
      }
      if (setClauses.length === 0) {
        sendJson(res, 400, { error: 'No fields to update' })
        return
      }
      // Prevent updating system user
      const [sysCheck] = await pool.query(`SELECT is_system FROM users WHERE id = ?`, [id])
      if (sysCheck[0] && Number(sysCheck[0].is_system) === 1) {
        sendJson(res, 403, { error: 'Forbidden' }); return
      }
      values.push(id)
      try {
        await pool.query(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ? AND COALESCE(is_system, 0) = 0`, values)
      } catch (e) {
        if (e && e.code === 'ER_DUP_ENTRY') {
          sendJson(res, 409, { error: 'Username sudah digunakan' }); return
        }
        throw e
      }
      const [rows] = await pool.query(
        `SELECT id, username, full_name, role, created_date FROM users WHERE id = ?`,
        [id]
      )
      sendJson(res, 200, rows[0])
      return
    }
    if (pathname.startsWith('/api/entities/User/') && method === 'DELETE') {
      const pool = await getPool()
      await ensureTables(pool)
      const id = pathname.split('/').pop()
      const auth = req.headers?.authorization || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (!token) { sendJson(res, 403, { error: 'Forbidden' }); return }
      let uid = null
      try { const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8')); uid = decoded?.uid } catch {}
      if (!uid) { sendJson(res, 403, { error: 'Forbidden' }); return }
      const [urows] = await pool.query(`SELECT id, role FROM users WHERE id = ? LIMIT 1`, [uid])
      const current = urows[0]
      if (!current || !['admin','license_admin','superadmin'].includes(String(current.role))) { sendJson(res, 403, { error: 'Forbidden' }); return }
      // Prevent deleting system user
      await pool.query(`DELETE FROM users WHERE id = ? AND COALESCE(is_system, 0) = 0`, [id])
      sendJson(res, 200, { success: true })
      return
    }


    sendJson(res, 404, { error: 'Not Found' })
  } catch (err) {
    console.error(err)
    sendError(res, 500, err, 'Terjadi kesalahan pada server')
  }
});

server.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`)
})
