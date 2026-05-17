import { getPool } from './server/db.js';

async function syncAllPrices() {
  const pool = await getPool();
  console.log('Starting Full Price Synchronization (Pusat -> Branches)...');

  try {
    // 1. Get Pusat ID
    const [branches] = await pool.query('SELECT id FROM branches WHERE name LIKE "%Pusat%" LIMIT 1');
    const pusatId = branches[0]?.id || 1;
    console.log(`Pusat ID identified as: ${pusatId}`);

    // 2. Get all products from Pusat
    const [pusatProducts] = await pool.query('SELECT id, buy_price_pcs, buy_price_dus, sell_price_pcs, sell_price_dus FROM products WHERE branch_id = ?', [pusatId]);
    const pusatPriceMap = new Map();
    pusatProducts.forEach(p => {
      pusatPriceMap.set(p.id, { 
        buy_pcs: p.buy_price_pcs, 
        buy_dus: p.buy_price_dus,
        sell_pcs: p.sell_price_pcs,
        sell_dus: p.sell_price_dus
      });
    });
    console.log(`Reference prices loaded for ${pusatPriceMap.size} products from Pusat.`);

    // 3. Update all branch products that have source_product_id
    const [allBranchProducts] = await pool.query('SELECT id, source_product_id, branch_id, name FROM products WHERE branch_id != ? AND source_product_id IS NOT NULL', [pusatId]);
    console.log(`Syncing prices for ${allBranchProducts.length} branch products...`);

    let updatedCount = 0;
    for (const bp of allBranchProducts) {
      const pPrice = pusatPriceMap.get(bp.source_product_id);
      if (pPrice) {
        await pool.query(
          `UPDATE products SET 
            buy_price_pcs = ?, 
            buy_price_dus = ?, 
            sell_price_pcs = ?, 
            sell_price_dus = ? 
           WHERE id = ?`,
          [pPrice.buy_pcs, pPrice.buy_dus, pPrice.sell_pcs, pPrice.sell_dus, bp.id]
        );
        updatedCount++;
      }
    }
    console.log(`Products table sync complete: ${updatedCount} rows updated.`);

    // 4. Update any remaining 0-price batches
    const [batchesFixed] = await pool.query(
      `UPDATE product_batches pb
       JOIN products p ON pb.product_id = p.id AND pb.branch_id = p.branch_id
       SET pb.purchase_price = p.buy_price_pcs
       WHERE (pb.purchase_price = 0 OR pb.purchase_price IS NULL) AND p.buy_price_pcs > 0`
    );
    console.log(`Batches fixed from local product table: ${batchesFixed.affectedRows}`);

  } catch (err) {
    console.error('Sync failed:', err);
  } finally {
    process.exit(0);
  }
}

syncAllPrices();
