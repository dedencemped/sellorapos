import { getPool } from './server/db.js';
import { randomUUID } from 'node:crypto';

async function testBroadcast() {
  const pool = await getPool();
  console.log('--- TESTING PRODUCT BROADCAST ---');

  try {
    const [pusatRows] = await pool.query(`SELECT id FROM branches WHERE name = 'Pusat' OR code = 'PST' ORDER BY id ASC LIMIT 1`);
    const pusatId = pusatRows[0]?.id || 6;
    console.log(`Pusat ID: ${pusatId}`);

    const newId = randomUUID();
    const testName = 'TEST PRODUCT ' + new Date().getTime();
    const body = {
      name: testName,
      barcode: 'TEST-' + new Date().getTime(),
      category: 'TEST',
      buy_price_pcs: 1000,
      sell_price_pcs: 2000
    };

    console.log(`Creating product at Pusat (Branch ${pusatId}): ${testName}`);
    
    // Simulate the POST logic from index.js
    const fields = [
      'id','barcode','name','category','buy_price_pcs','sell_price_pcs','branch_id'
    ];
    const values = [newId, body.barcode, body.name, body.category, body.buy_price_pcs, body.sell_price_pcs, pusatId];
    const placeholders = fields.map(() => '?').join(',');
    
    await pool.query(
      `INSERT INTO products (${fields.join(',')}) VALUES (${placeholders})`,
      values
    );
    console.log('Product created at Pusat.');

    // Now the broadcast part
    const [bs] = await pool.query(`SELECT id, name FROM branches WHERE id <> ?`, [pusatId]);
    console.log(`Found ${bs.length} other branches for broadcast.`);

    for (const b of bs) {
      const destId = b.id;
      const branchProdId = randomUUID(); // Explicitly generate ID for branch product
      console.log(`   - Broadcasting to Branch ${destId} (${b.name})...`);
      
      await pool.query(
        `INSERT INTO products (id, barcode, name, category, buy_price_pcs, sell_price_pcs, branch_id, source_product_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [branchProdId, body.barcode, body.name, body.category, body.buy_price_pcs, body.sell_price_pcs, destId, newId]
      );
      console.log(`     Done.`);
    }

    console.log('Broadcast test finished successfully.');

    // Cleanup
    await pool.query(`DELETE FROM products WHERE name = ?`, [testName]);
    console.log('Test product cleaned up.');

  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    process.exit(0);
  }
}

testBroadcast();
