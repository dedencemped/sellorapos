import { getPool } from './server/db.js';
const pool = await getPool();

console.log('--- METADATA SYNC START ---');
try {
  // Get the real Pusat ID
  const [pusatRows] = await pool.query(`SELECT id FROM branches WHERE name = 'Pusat' OR code = 'PST' ORDER BY id ASC LIMIT 1`);
  const pusatId = pusatRows[0]?.id;
  
  if (!pusatId) {
    console.error('Could not find Pusat branch!');
    process.exit(1);
  }
  console.log(`Pusat ID identified as: ${pusatId}`);

  // Get all products from Pusat
  const [pusatProducts] = await pool.query(`SELECT id, barcode, name, default_unit, pcs_per_dus FROM products WHERE branch_id = ?`, [pusatId]);
  console.log(`Found ${pusatProducts.length} products in Pusat.`);

  let updatedCount = 0;

  for (const p of pusatProducts) {
    // Sync to all other branches
    // We match by source_product_id OR barcode OR name
    const [result] = await pool.query(
      `UPDATE products 
       SET default_unit = ?, 
           pcs_per_dus = ? 
       WHERE branch_id <> ? 
         AND (source_product_id = ? OR (barcode IS NOT NULL AND barcode <> "" AND barcode = ?) OR name = ?)`,
      [p.default_unit, p.pcs_per_dus, pusatId, p.id, p.barcode, p.name]
    );
    updatedCount += result.affectedRows;
  }

  console.log(`Successfully updated ${updatedCount} product records across branches.`);
  console.log('--- METADATA SYNC FINISHED ---');
} catch (err) {
  console.error('Sync Error:', err);
}
process.exit(0);
