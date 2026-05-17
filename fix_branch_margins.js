import { getPool } from './server/db.js';

async function fixMargins() {
  const pool = await getPool();
  console.log('Starting Global Price & Batch Reconciliation...');

  try {
    // 1. Get Pusat ID (usually 1, but let's be safe)
    const [branches] = await pool.query('SELECT id FROM branches WHERE name LIKE "%Pusat%" LIMIT 1');
    const pusatId = branches[0]?.id || 1;
    console.log(`Pusat ID identified as: ${pusatId}`);

    // 2. Get all products from Pusat to use as price reference
    const [pusatProducts] = await pool.query('SELECT id, buy_price_pcs, buy_price_dus FROM products WHERE branch_id = ?', [pusatId]);
    const pusatPriceMap = new Map();
    pusatProducts.forEach(p => {
      pusatPriceMap.set(p.id, { pcs: p.buy_price_pcs, dus: p.buy_price_dus });
    });
    console.log(`Reference prices loaded for ${pusatPriceMap.size} products from Pusat.`);

    // 3. Get all products in branches that have source_product_id
    const [branchProducts] = await pool.query('SELECT id, source_product_id, branch_id, name, buy_price_pcs FROM products WHERE branch_id != ? AND source_product_id IS NOT NULL', [pusatId]);
    console.log(`Checking ${branchProducts.length} products in branches for price sync...`);

    let productsUpdated = 0;
    let batchesUpdated = 0;

    for (const bp of branchProducts) {
      const pusatPrice = pusatPriceMap.get(bp.source_product_id);
      
      if (pusatPrice) {
        // Sync product table price if it's 0 or significantly different (optional, but good for fallback)
        if (Number(bp.buy_price_pcs) === 0) {
          await pool.query('UPDATE products SET buy_price_pcs = ?, buy_price_dus = ? WHERE id = ?', [pusatPrice.pcs, pusatPrice.dus, bp.id]);
          productsUpdated++;
        }

        // CRITICAL: Sync batches that have 0 purchase_price
        const [result] = await pool.query(
          'UPDATE product_batches SET purchase_price = ? WHERE product_id = ? AND branch_id = ? AND (purchase_price = 0 OR purchase_price IS NULL)',
          [pusatPrice.pcs, bp.id, bp.branch_id]
        );
        batchesUpdated += result.affectedRows;
      }
    }

    console.log(`Sync complete.`);
    console.log(`- Products price fixed: ${productsUpdated}`);
    console.log(`- Batches price fixed: ${batchesUpdated}`);

    // 4. One more thing: Fix sales that were already made with 0 cost but have items
    console.log('Fixing past sales with 0 cost...');
    const [zeroCostSales] = await pool.query('SELECT id, items, branch_id FROM sales WHERE total_cost = 0 AND status != "returned"');
    console.log(`Found ${zeroCostSales.length} sales with 0 cost to re-evaluate.`);

    let salesFixed = 0;
    for (const sale of zeroCostSales) {
      let items = [];
      try {
        items = typeof sale.items === 'string' ? JSON.parse(sale.items) : sale.items;
      } catch (e) { continue; }

      let recalculatedCost = 0;
      let hasValidItems = false;

      for (const it of items) {
        const prodId = it.product_id;
        const [pInfo] = await pool.query('SELECT buy_price_pcs, pcs_per_dus FROM products WHERE id = ?', [prodId]);
        
        if (pInfo[0]) {
          const per = Number(pInfo[0].pcs_per_dus || 1) || 1;
          const buyPrice = Number(pInfo[0].buy_price_pcs || 0);
          const qty = Number(it.qty || 0);
          const unit = String(it.unit || '').toUpperCase();
          const qtyPcs = unit === 'DUS' ? qty * per : qty;
          
          recalculatedCost += buyPrice * qtyPcs;
          it.cost_price = buyPrice; // Update item metadata too
          hasValidItems = true;
        }
      }

      if (hasValidItems && recalculatedCost > 0) {
        await pool.query(
          'UPDATE sales SET total_cost = ?, total_profit = total - ?, items = ? WHERE id = ?',
          [recalculatedCost, recalculatedCost, JSON.stringify(items), sale.id]
        );
        salesFixed++;
      }
    }
    console.log(`Past sales fixed: ${salesFixed}`);

  } catch (err) {
    console.error('Reconciliation failed:', err);
  } finally {
    process.exit(0);
  }
}

fixMargins();
