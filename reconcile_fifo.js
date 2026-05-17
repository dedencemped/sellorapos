import { getPool } from './server/db.js';

async function reconcile() {
  const pool = await getPool();
  console.log('Starting Full FIFO Reconciliation...');

  try {
    // 1. Get all products with stock > 0 across ALL branches
    const [products] = await pool.query('SELECT id, name, stock_pcs, buy_price_pcs, branch_id FROM products WHERE stock_pcs > 0');
    console.log(`Checking ${products.length} products with positive stock...`);

    let fixedCount = 0;
    for (const p of products) {
      // 2. Check current batch sum
      const [[{totalBatch}]] = await pool.query(
        'SELECT SUM(remaining_qty) as totalBatch FROM product_batches WHERE product_id = ? AND branch_id = ?',
        [p.id, p.branch_id]
      );
      
      const batchSum = Number(totalBatch || 0);
      const masterStock = Number(p.stock_pcs || 0);

      if (batchSum < masterStock) {
        const diff = masterStock - batchSum;
        console.log(`[FIX] Product: ${p.name} (Branch: ${p.branch_id}) | Master: ${masterStock}, Batches: ${batchSum} | Adding ${diff} PCS to a new batch.`);
        
        await pool.query(
          `INSERT INTO product_batches (product_id, purchase_price, initial_qty, remaining_qty, branch_id)
           VALUES (?, ?, ?, ?, ?)`,
          [p.id, p.buy_price_pcs || 0, diff, diff, p.branch_id]
        );
        fixedCount++;
      }
    }

    console.log(`Reconciliation finished. Fixed ${fixedCount} product/branch entries.`);
  } catch (err) {
    console.error('Reconciliation failed:', err);
  } finally {
    process.exit(0);
  }
}

reconcile();
