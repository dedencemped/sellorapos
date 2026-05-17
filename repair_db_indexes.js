import { getPool } from './server/db.js';

async function fixIndex() {
  const pool = await getPool();
  console.log('--- REPAIRING PRODUCT INDEXES ---');

  try {
    // 1. Check current indexes
    const [indexes] = await pool.query('SHOW INDEX FROM products');
    console.log('Current indexes:', indexes.map(idx => ({ name: idx.Key_name, column: idx.Column_name, unique: !idx.Non_unique })));

    // 2. Drop the old global unique index on custom_id if it exists
    const hasGlobalCustomId = indexes.some(idx => idx.Key_name === 'custom_id' && idx.Non_unique === 0);
    if (hasGlobalCustomId) {
      console.log('Dropping global unique index "custom_id"...');
      await pool.query('ALTER TABLE products DROP INDEX custom_id');
    }

    // 3. Create the new composite unique index (custom_id + branch_id)
    const hasCompositeCustomId = indexes.some(idx => idx.Key_name === 'idx_custom_id_branch');
    if (!hasCompositeCustomId) {
      console.log('Creating composite unique index "idx_custom_id_branch"...');
      await pool.query('CREATE UNIQUE INDEX idx_custom_id_branch ON products(custom_id, branch_id)');
    }

    // 4. Also check for barcode unique index (might have same issue)
    const hasGlobalBarcode = indexes.some(idx => idx.Key_name === 'barcode' && idx.Non_unique === 0);
    if (hasGlobalBarcode) {
      console.log('Dropping global unique index "barcode"...');
      await pool.query('ALTER TABLE products DROP INDEX barcode');
    }
    
    const hasCompositeBarcode = indexes.some(idx => idx.Key_name === 'idx_barcode_branch');
    if (!hasCompositeBarcode) {
      console.log('Creating composite unique index "idx_barcode_branch"...');
      await pool.query('CREATE UNIQUE INDEX idx_barcode_branch ON products(barcode, branch_id)');
    }

    console.log('Database indexes repaired successfully.');

  } catch (err) {
    console.error('Repair failed:', err);
  } finally {
    process.exit(0);
  }
}

fixIndex();
