import { getPool } from './server/db.js';
import { randomUUID } from 'node:crypto';

async function forceSync() {
  const pool = await getPool();
  console.log('--- FORCING PRODUCT SYNC (PUSAT -> ALL BRANCHES) ---');

  try {
    // 1. Identify Pusat
    const [pusatRows] = await pool.query(`SELECT id FROM branches WHERE name = 'Pusat' OR code = 'PST' ORDER BY id ASC LIMIT 1`);
    const pusatId = pusatRows[0]?.id;
    if (!pusatId) {
      console.error('Pusat branch not found!');
      return;
    }
    console.log(`Pusat ID: ${pusatId}`);

    // 2. Get all branches
    const [bs] = await pool.query(`SELECT id, name FROM branches WHERE id <> ?`, [pusatId]);
    console.log(`Found ${bs.length} target branches.`);

    // 3. Get all products from Pusat
    const [pusatProds] = await pool.query(`SELECT * FROM products WHERE branch_id = ?`, [pusatId]);
    console.log(`Found ${pusatProds.length} products in Pusat.`);

    let createdCount = 0;
    let updatedCount = 0;

    for (const p of pusatProds) {
      for (const b of bs) {
        const destId = b.id;
        
        // Check if exists in branch
        let exists = null;
        if (p.barcode) {
          const [e1] = await pool.query(`SELECT id FROM products WHERE branch_id = ? AND barcode = ? LIMIT 1`, [destId, p.barcode]);
          exists = e1[0] || null;
        }
        if (!exists && p.name) {
          const [e2] = await pool.query(`SELECT id FROM products WHERE branch_id = ? AND name = ? LIMIT 1`, [destId, p.name]);
          exists = e2[0] || null;
        }

        if (exists) {
          // Update
          await pool.query(
            `UPDATE products 
             SET name = ?, category = ?, brand = ?, image_url = ?, default_unit = ?, 
                 pcs_per_dus = ?, buy_price_pcs = ?, buy_price_dus = ?, 
                 sell_price_pcs = ?, sell_price_dus = ?, min_stock_pcs = ?, 
                 source_product_id = COALESCE(source_product_id, ?)
             WHERE id = ? AND branch_id = ?`,
            [
              p.name, p.category, p.brand, p.image_url, p.default_unit,
              p.pcs_per_dus, p.buy_price_pcs, p.buy_price_dus,
              p.sell_price_pcs, p.sell_price_dus, p.min_stock_pcs,
              p.id, exists.id, destId
            ]
          );
          updatedCount++;
        } else {
          // Create
          const branchProdId = randomUUID();
          await pool.query(
            `INSERT INTO products (id, custom_id, barcode, name, category, brand, image_url, default_unit, pcs_per_dus, buy_price_pcs, buy_price_dus, sell_price_pcs, sell_price_dus, stock_pcs, min_stock_pcs, is_active, branch_id, source_product_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?)`,
            [
              branchProdId, p.custom_id, p.barcode, p.name, p.category, p.brand, p.image_url, p.default_unit,
              p.pcs_per_dus, p.buy_price_pcs, p.buy_price_dus, p.sell_price_pcs, p.sell_price_dus,
              p.min_stock_pcs, destId, p.id
            ]
          );
          createdCount++;
        }
      }
    }

    console.log(`Sync finished. Created: ${createdCount}, Updated: ${updatedCount}`);

  } catch (err) {
    console.error('Sync failed:', err);
  } finally {
    process.exit(0);
  }
}

forceSync();
