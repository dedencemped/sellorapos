import { getPool } from './server/db.js';

async function globalRecalculate() {
  const pool = await getPool();
  console.log('Starting Global Profit Recalculation (FIFO Pusat Sync)...');

  try {
    // 1. Ambil semua penjualan cabang yang statusnya bukan 'returned'
    // Kita join dengan product_batches pusat melalui transfer_batch_id
    const [sales] = await pool.query(`
      SELECT id, items, total, branch_id, invoice_number 
      FROM sales 
      WHERE status != 'returned'
    `);

    console.log(`Found ${sales.length} sales to analyze.`);

    let fixedCount = 0;
    for (const sale of sales) {
      let items = [];
      try {
        items = typeof sale.items === 'string' ? JSON.parse(sale.items) : sale.items;
      } catch (e) { continue; }

      let totalActualCost = 0;
      let isUpdated = false;

      for (const item of items) {
        const pid = item.product_id;
        const qty = Number(item.qty || 0);
        const unit = String(item.unit || '').toUpperCase();
        
        // Cari batch yang digunakan untuk produk ini di cabang tersebut
        // Karena kita tidak punya tabel log penggunaan batch per item penjualan, 
        // kita ambil batch terbaru (sesuai FIFO) yang punya transfer_batch_id untuk produk ini.
        const [batches] = await pool.query(`
          SELECT pb.purchase_price as local_price, pusat.purchase_price as pusat_price, pb.transfer_batch_id
          FROM product_batches pb
          LEFT JOIN product_batches pusat ON pb.transfer_batch_id = pusat.id
          WHERE pb.product_id = ? AND pb.branch_id = ?
          ORDER BY pb.created_date ASC LIMIT 1
        `, [pid, sale.branch_id]);

        if (batches[0]) {
          const actualHppPcs = Number(batches[0].pusat_price || batches[0].local_price || 0);
          
          const [pInfo] = await pool.query('SELECT pcs_per_dus FROM products WHERE id = ?', [pid]);
          const per = Number(pInfo[0]?.pcs_per_dus || 1);
          const qtyPcs = unit === 'DUS' ? qty * per : qty;
          
          const itemHppTotal = actualHppPcs * qtyPcs;
          totalActualCost += itemHppTotal;
          
          // Update metadata item jika berbeda
          if (item.cost_price !== actualHppPcs) {
            item.cost_price = actualHppPcs;
            isUpdated = true;
          }
        }
      }

      if (totalActualCost > 0) {
        const newProfit = Number(sale.total) - totalActualCost;
        
        // Update database jika ada perubahan nilai cost/profit
        await pool.query(
          'UPDATE sales SET total_cost = ?, total_profit = ?, items = ? WHERE id = ?',
          [totalActualCost, newProfit, JSON.stringify(items), sale.id]
        );
        fixedCount++;
      }
    }

    console.log(`Recalculation complete. ${fixedCount} sales updated with Pusat FIFO prices.`);

  } catch (err) {
    console.error('Recalculation failed:', err);
  } finally {
    process.exit(0);
  }
}

globalRecalculate();
