import { getPool } from './server/db.js';

async function deepRecalculate() {
  const pool = await getPool();
  console.log('Starting Deep HPP & Profit Synchronization (Branch -> Pusat)...');

  try {
    // 1. Get Pusat Branch ID
    const [pusatRows] = await pool.query('SELECT id FROM branches WHERE name LIKE "%Pusat%" LIMIT 1');
    const pusatId = pusatRows[0]?.id || 1;
    console.log(`Pusat ID: ${pusatId}`);

    // 2. Map all Pusat products to their current buy prices
    const [pusatProds] = await pool.query('SELECT id, buy_price_pcs, buy_price_dus FROM products WHERE branch_id = ?', [pusatId]);
    const pusatPriceMap = new Map();
    pusatProds.forEach(p => pusatPriceMap.set(p.id, { pcs: Number(p.buy_price_pcs || 0), dus: Number(p.buy_price_dus || 0) }));
    console.log(`Pusat prices loaded for ${pusatPriceMap.size} products.`);

    // 3. Update all product_batches in branches
    // A. Sync price from Pusat batch if transfer_batch_id exists
    const [syncBatchResult] = await pool.query(`
      UPDATE product_batches branch_pb
      JOIN product_batches pusat_pb ON branch_pb.transfer_batch_id = pusat_pb.id
      SET branch_pb.purchase_price = pusat_pb.purchase_price
      WHERE branch_pb.branch_id != ? AND branch_pb.transfer_batch_id IS NOT NULL
    `, [pusatId]);
    console.log(`Synced ${syncBatchResult.affectedRows} branch batches with Pusat batch prices.`);

    // B. For orphaned batches (no transfer_batch_id), try to use the Pusat's master price
    // This fixes batches created by reconciliation or manual adjustment that used average prices
    let orphanedFixes = 0;
    const [orphanedBatches] = await pool.query(`
      SELECT pb.id, p.source_product_id 
      FROM product_batches pb
      JOIN products p ON pb.product_id = p.id AND pb.branch_id = p.branch_id
      WHERE pb.branch_id != ? AND pb.transfer_batch_id IS NULL
    `, [pusatId]);
    
    for (const ob of orphanedBatches) {
      const pPrice = pusatPriceMap.get(ob.source_product_id);
      if (pPrice && pPrice.pcs > 0) {
        await pool.query('UPDATE product_batches SET purchase_price = ? WHERE id = ?', [pPrice.pcs, ob.id]);
        orphanedFixes++;
      }
    }
    console.log(`Fixed ${orphanedFixes} orphaned branch batches using Pusat master prices.`);

    // 4. Update branch products table buy_price from their OLDEST available batch (STRICT FIFO)
    const [branchProds] = await pool.query('SELECT id, branch_id FROM products WHERE branch_id != ?', [pusatId]);
    let branchProdFixes = 0;
    for (const bp of branchProds) {
      // Get the oldest batch with remaining quantity
      const [oldestBatch] = await pool.query(
        `SELECT pb.purchase_price, pusat.purchase_price as pusat_price 
         FROM product_batches pb 
         LEFT JOIN product_batches pusat ON pb.transfer_batch_id = pusat.id
         WHERE pb.product_id = ? AND pb.branch_id = ? AND pb.remaining_qty > 0 
         ORDER BY pb.id ASC LIMIT 1`,
        [bp.id, bp.branch_id]
      );

      if (oldestBatch[0]) {
        const fifoPrice = Number(oldestBatch[0].pusat_price || oldestBatch[0].purchase_price || 0);
        if (fifoPrice > 0) {
          const [pMeta] = await pool.query('SELECT pcs_per_dus FROM products WHERE id = ?', [bp.id]);
          const per = Number(pMeta[0]?.pcs_per_dus || 1) || 1;
          await pool.query('UPDATE products SET buy_price_pcs = ?, buy_price_dus = ? WHERE id = ?', [fifoPrice, fifoPrice * per, bp.id]);
          branchProdFixes++;
        }
      } else {
        // Fallback: If no batches, use Pusat reference
        const [pInfo] = await pool.query('SELECT source_product_id FROM products WHERE id = ?', [bp.id]);
        const pPrice = pusatPriceMap.get(pInfo[0]?.source_product_id);
        if (pPrice && pPrice.pcs > 0) {
          await pool.query('UPDATE products SET buy_price_pcs = ?, buy_price_dus = ? WHERE id = ?', [pPrice.pcs, pPrice.dus, bp.id]);
          branchProdFixes++;
        }
      }
    }
    console.log(`Strict FIFO master price updated for ${branchProdFixes} branch products.`);

    // 5. Update remaining 0-price batches using the fixed products table
    const [finalBatchFix] = await pool.query(`
      UPDATE product_batches pb
      JOIN products p ON pb.product_id = p.id AND pb.branch_id = p.branch_id
      SET pb.purchase_price = p.buy_price_pcs
      WHERE pb.purchase_price = 0 AND p.buy_price_pcs > 0
    `);
    console.log(`Fixed ${finalBatchFix.affectedRows} batches with 0 price using local product reference.`);

    // 6. NOW, recalculate ALL sales in branches
    const [salesToFix] = await pool.query(`
      SELECT s.id, s.items, s.total, s.branch_id, s.invoice_number 
      FROM sales s 
      WHERE s.branch_id != ? AND s.status != 'returned'
      AND s.sale_date >= DATE_SUB(NOW(), INTERVAL 90 DAY)
    `, [pusatId]);
    console.log(`Analyzing ${salesToFix.length} sales for HPP accuracy (last 90 days)...`);

    let salesUpdated = 0;
    for (const sale of salesToFix) {
      let items = [];
      try {
        items = typeof sale.items === 'string' ? JSON.parse(sale.items) : sale.items;
      } catch (e) { continue; }

      let totalCost = 0;
      let hasValidItems = false;
      let isChanged = false;

      for (const item of items) {
        // Find the BEST available cost for this product in this branch
        // 1. Try to find the batch that matches the transfer_batch_id if it was recorded
        // Since we don't have a direct link per sale item to batch id in old data,
        // we use the FIFO order to estimate which batch was used.
        // But for a simple fix, let's at least ensure we use the actual batch price if available.
        
        const [batches] = await pool.query(
          `SELECT pb.purchase_price, pusat.purchase_price as pusat_price 
           FROM product_batches pb 
           LEFT JOIN product_batches pusat ON pb.transfer_batch_id = pusat.id
           WHERE pb.product_id = ? AND pb.branch_id = ? 
           ORDER BY pb.id ASC LIMIT 1`,
          [item.product_id, sale.branch_id]
        );
        
        let buyPrice = 0;
        if (batches[0]) {
          buyPrice = Number(batches[0].pusat_price || batches[0].purchase_price || 0);
        }
        
        if (buyPrice === 0) {
          // 2. Try the products table (which we fixed above)
          const [pRow] = await pool.query('SELECT buy_price_pcs FROM products WHERE id = ?', [item.product_id]);
          buyPrice = Number(pRow[0]?.buy_price_pcs || 0);
        }

        if (buyPrice > 0) {
          const [pMeta] = await pool.query('SELECT pcs_per_dus FROM products WHERE id = ?', [item.product_id]);
          const per = Number(pMeta[0]?.pcs_per_dus || 1) || 1;
          const qty = Number(item.qty || 0);
          const unit = String(item.unit || '').toUpperCase();
          const qtyPcs = unit === 'DUS' ? qty * per : qty;
          
          const itemTotalCost = buyPrice * qtyPcs;
          totalCost += itemTotalCost;
          
          if (Number(item.cost_price) !== buyPrice) {
            item.cost_price = buyPrice;
            isChanged = true;
          }
          hasValidItems = true;
        }
      }

      if (hasValidItems && (totalCost > 0 || isChanged)) {
        const currentTotalCost = Number(sale.total_cost || 0);
        // Only update if there's a significant difference or items metadata changed
        if (Math.abs(currentTotalCost - totalCost) > 1 || isChanged) {
          const totalProfit = Number(sale.total) - totalCost;
          await pool.query(
            'UPDATE sales SET total_cost = ?, total_profit = ?, items = ? WHERE id = ?',
            [totalCost, totalProfit, JSON.stringify(items), sale.id]
          );
          salesUpdated++;
        }
      }
    }
    console.log(`Global recalculation complete. ${salesUpdated} sales records updated with accurate HPP.`);

  } catch (err) {
    console.error('Recalculation failed:', err);
  } finally {
    process.exit(0);
  }
}

deepRecalculate();
