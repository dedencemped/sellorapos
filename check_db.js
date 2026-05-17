
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const config = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'basee_app',
};

async function checkSchema() {
  let connection;
  try {
    connection = await mysql.createConnection(config);
    console.log(`Connected to database: ${config.database}`);

    const [licRows] = await connection.query(`SHOW CREATE TABLE app_licenses`);
    console.log('--- app_licenses ---');
    console.log(licRows[0]['Create Table']);

    const [subRows] = await connection.query(`SHOW CREATE TABLE app_subscriptions`);
    console.log('\n--- app_subscriptions ---');
    console.log(subRows[0]['Create Table']);

  } catch (err) {
    console.error('Check failed:', err.message);
  } finally {
    if (connection) await connection.end();
  }
}

checkSchema();
