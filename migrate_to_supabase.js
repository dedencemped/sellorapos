import mysql from 'mysql2/promise';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'basee_app',
};

async function migrate() {
  console.log('🚀 Starting migration from MySQL to Supabase...\n');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in .env');
    console.error('Please add SUPABASE_SERVICE_ROLE_KEY to your .env file');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const mysqlConn = await mysql.createConnection(MYSQL_CONFIG);

  try {
    const tables = [
      { name: 'branches', conflictKey: 'id' },
      { name: 'units', conflictKey: 'id' },
      { name: 'categories', conflictKey: 'id' },
      { name: 'customers', conflictKey: 'id' },
      { name: 'suppliers', conflictKey: 'id' },
      { name: 'products', conflictKey: 'id' },
      { name: 'product_batches', conflictKey: 'id' },
      { name: 'stock_mutations', conflictKey: 'id' },
      { name: 'stock_transfers', conflictKey: 'id' },
      { name: 'purchases', conflictKey: 'id' },
      { name: 'sales', conflictKey: 'id' },
      { name: 'payments', conflictKey: 'id' },
      { name: 'users', conflictKey: 'id' },
      { name: 'user_branches', conflictKey: 'user_id, branch_id' },
      { name: 'app_subscriptions', conflictKey: 'id' },
      { name: 'app_licenses', conflictKey: 'id' }
    ];

    for (const { name: table, conflictKey } of tables) {
      console.log(`📦 Migrating table: ${table}`);
      
      const [rows] = await mysqlConn.execute(`SELECT * FROM ${table}`);
      
      if (rows.length === 0) {
        console.log(`   ⚪ No data in ${table}`);
        continue;
      }

      console.log(`   🔍 Found ${rows.length} records`);

      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        
        const { error } = await supabase
          .from(table)
          .upsert(batch, { onConflict: conflictKey });

        if (error) {
          console.error(`   ❌ Error migrating batch ${i}-${i + batch.length}:`, error.message);
          throw error;
        }

        console.log(`   ✅ Migrated ${Math.min(i + batchSize, rows.length)}/${rows.length}`);
      }

      console.log(`   ✅ ${table} migrated successfully!\n`);
    }

    console.log('🎉 Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await mysqlConn.end();
  }
}

migrate().catch(console.error);
