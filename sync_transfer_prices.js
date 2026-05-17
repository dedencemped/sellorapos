import { getPool } from './server/db.js';

async function syncTransferPrices() {
  const pool = await getPool();
  console.log('Starting Deep FIFO Price Synchronization (Pusat Batch -> Branch Batch)...');

  try {
    // 1. Update all product_batches in branches where transfer_batch_id is present
    // Join with Pusat's batch to get the REAL purchase price
    const [result] = await pool.query(`
      UPDATE product_batches branch_batch
      JOIN product_batches pusat_batch ON branch_batch.transfer_batch_id = pusat_batch.id
      SET branch_batch.purchase_price = pusat_batch.purchase_price
      WHERE branch_batch.transfer_batch_id IS NOT NULL 
      AND branch_batch.purchase_price != pusat_batch.purchase_price
    `);

    console.log(`Updated ${result.affectedRows} branch batches with original Pusat purchase prices.`);

    // 2. Fix Sales records that were already created using old/wrong prices
    console.log('Recalculating P&L for past branch sales...');
    
    // Get sales that might need fixing (those in branches, not Pusat)
    const [sales] = await pool.query(`
      SELECT s.id, s.items, s.total, s.branch_id 
      FROM sales s 
      WHERE s.sale_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      AND s.status != 'returned'
    `);

    let fixedSalesCount = 0;
    for (const sale of sales) {
      let items = [];
      try {
        items = typeof sale.items === 'string' ? JSON.parse(sale.items) : sale.items;
      } catch (e) { continue; }

      let totalCost = 0;
      let hasValidItems = false;

      for (const item of items) {
        const [prodBatches] = await pool.query(
          'SELECT purchase_price FROM product_batches WHERE product_id = ? AND branch_id = ? ORDER BY created_date ASC LIMIT 1',
          [item.product_id, sale.branch_id]
        );

        if (prodBatches[0]) {
          const buyPrice = Number(prodBatches[0].purchase_price);
          const [pInfo] = await pool.query('SELECT pcs_per_dus FROM products WHERE id = ?', [item.product_id]);
          const per = Number(pInfo[0]?.pcs_per_dus || 1);
          const qty = Number(item.qty || 0);
          const unit = String(item.unit || '').toUpperCase();
          const qtyPcs = unit === 'DUS' ? qty * per : qty;
          
          totalCost += buyPrice * qtyPcs;
          item.cost_price = buyPrice;
          hasValidItems = true;
        }
      }

      if (hasValidItems && totalCost > 0) {
        const totalProfit = Number(sale.total) - totalCost;
        await pool.query(
          'UPDATE sales SET total_cost = ?, total_profit = ?, items = ? WHERE id = ?',
          [totalCost, totalProfit, JSON.stringify(items), sale.id]
        );
        fixedSalesCount++;
      }
    }

    console.log(`P&L Synchronization complete. ${fixedSalesCount} sales records updated.`);

  } catch (err) {
    console.error('Price Sync failed:', err);
  } finally {
    process.exit(0);
  }
}

syncTransferPrices();
