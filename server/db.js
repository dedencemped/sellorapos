import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

let poolInstance = null;
let initPromise = null;

export function getDbConfig() {
  const env = process.env || {};
  return {
    host: env.MYSQL_HOST || 'localhost',
    port: Number(env.MYSQL_PORT || '3306'),
    user: env.MYSQL_USER || 'root',
    password: env.MYSQL_PASSWORD || '',
    database: env.MYSQL_DATABASE || 'basee_app',
  };
}

export async function setDbConfig({ host, port, user, password, database }) {
  const env = process.env || {};
  if (host !== undefined) env.MYSQL_HOST = String(host);
  if (port !== undefined) env.MYSQL_PORT = String(port);
  if (user !== undefined) env.MYSQL_USER = String(user);
  if (password !== undefined) env.MYSQL_PASSWORD = String(password);
  if (database !== undefined) env.MYSQL_DATABASE = String(database);
  try {
    if (poolInstance) {
      await poolInstance.end();
    }
  } catch {}
  poolInstance = null;
  initPromise = null;
}

export async function getPool() {
  if (poolInstance) return poolInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const cfg = getDbConfig();
      const bootstrap = await mysql.createConnection({
        host: cfg.host,
        port: Number(cfg.port),
        user: cfg.user,
        password: cfg.password,
        connectTimeout: 10000,
      });
      await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${cfg.database}\``);
      await bootstrap.end();

      const p = mysql.createPool({
        host: cfg.host,
        port: Number(cfg.port),
        user: cfg.user,
        password: cfg.password,
        database: cfg.database,
        waitForConnections: true,
        connectionLimit: 20,
        maxIdle: 20,
        idleTimeout: 60000,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        connectTimeout: 20000,
      });

      p.on('error', (err) => {
        console.error('[DB POOL ERROR]', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
          poolInstance = null;
          initPromise = null;
        }
      });

      poolInstance = p;
      return p;
    } catch (err) {
      console.error('[DB INIT ERROR]', err);
      initPromise = null; // Allow retry on next call
      throw err;
    }
  })();

  return initPromise;
}

export async function initSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT DEFAULT NULL,
      created_date DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(50) DEFAULT NULL,
      address TEXT DEFAULT NULL,
      total_debt DOUBLE DEFAULT 0,
      created_date DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(50) DEFAULT NULL,
      address TEXT DEFAULT NULL,
      total_debt DOUBLE DEFAULT 0,
      created_date DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      sku VARCHAR(64) DEFAULT NULL,
      category_id VARCHAR(36) DEFAULT NULL,
      category_name VARCHAR(255) DEFAULT NULL,
      price DOUBLE DEFAULT 0,
      cost DOUBLE DEFAULT 0,
      stock INT DEFAULT 0,
      is_active TINYINT(1) DEFAULT 1,
      created_date DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_mutations (
      id VARCHAR(36) PRIMARY KEY,
      product_id VARCHAR(36) NOT NULL,
      product_name VARCHAR(255) DEFAULT NULL,
      qty INT NOT NULL,
      type ENUM('in','out') NOT NULL,
      notes TEXT DEFAULT NULL,
      created_date DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id VARCHAR(36) PRIMARY KEY,
      party_type ENUM('customer','supplier') NOT NULL,
      party_id VARCHAR(36) NOT NULL,
      party_name VARCHAR(255) DEFAULT NULL,
      amount DOUBLE NOT NULL,
      payment_method ENUM('cash','transfer','qris') DEFAULT 'cash',
      payment_date DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchases (
      id VARCHAR(36) PRIMARY KEY,
      supplier_id VARCHAR(36) DEFAULT NULL,
      supplier_name VARCHAR(255) DEFAULT NULL,
      items JSON DEFAULT NULL,
      total DOUBLE DEFAULT 0,
      payment_method ENUM('cash','transfer','qris','tempo') DEFAULT 'cash',
      status VARCHAR(50) DEFAULT 'completed',
      purchase_date DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales (
      id VARCHAR(36) PRIMARY KEY,
      customer_id VARCHAR(36) DEFAULT NULL,
      customer_name VARCHAR(255) DEFAULT NULL,
      items JSON DEFAULT NULL,
      total DOUBLE DEFAULT 0,
      payment_method ENUM('cash','transfer','qris','tempo') DEFAULT 'cash',
      status VARCHAR(50) DEFAULT 'completed',
      sale_date DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}
