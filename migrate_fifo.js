import { getPool } from './server/db.js';

async function migrate() {
  const pool = await getPool();
  console.log('Starting FIFO Migration...');

  try {
    // Ensure table exists first
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_batches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id VARCHAR(64) NOT NULL,
        purchase_price DECIMAL(12,2) DEFAULT 0,
        initial_qty INT DEFAULT 0,
        remaining_qty INT DEFAULT 0,
        branch_id INT DEFAULT 1,
        purchase_id INT NULL,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_product_branch (product_id, branch_id),
        INDEX idx_created (created_date)
      );
    `);

    // 1. Get all products with stock > 0
    const [products] = await pool.query('SELECT id, name, stock_pcs, buy_price_pcs, branch_id FROM products WHERE stock_pcs > 0');
    console.log(`Found ${products.length} products with stock.`);

    let migratedCount = 0;
    for (const p of products) {
      // 2. Check if this product already has batches
      const [existing] = await pool.query('SELECT id FROM product_batches WHERE product_id = ? AND branch_id = ? LIMIT 1', [p.id, p.branch_id]);
      
      if (existing.length === 0) {
        // 3. Create a migration batch for the current stock
        await pool.query(
          `INSERT INTO product_batches (product_id, purchase_price, initial_qty, remaining_qty, branch_id, purchase_id, created_date)
           VALUES (?, ?, ?, ?, ?, NULL, NOW())`,
          [p.id, p.buy_price_pcs || 0, p.stock_pcs, p.stock_pcs, p.branch_id]
        );
        migratedCount++;
      }
    }

    console.log(`Migration finished. Created ${migratedCount} initial batches.`);
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    process.exit(0);
  }
}

migrate();
