import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

let poolInstance = null;

export function getDbConfig() {
  const env = process.env || {};
  return {
    connectionString: env.DATABASE_URL || '',
  };
}

export async function setDbConfig({ connectionString }) {
  const env = process.env || {};
  if (connectionString !== undefined) env.DATABASE_URL = String(connectionString);
  try {
    if (poolInstance) {
      await poolInstance.end();
    }
  } catch {}
  poolInstance = null;
}

export async function getPool() {
  if (poolInstance) return poolInstance;

  const cfg = getDbConfig();
  
  const p = new Pool({
    connectionString: cfg.connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  p.on('error', (err) => {
    console.error('[DB POOL ERROR]', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
      poolInstance = null;
    }
  });

  poolInstance = p;
  
  const wrapper = {
    query: async (sql, params = []) => {
      let queryText = sql;
      let queryParams = params;
      
      if (typeof sql === 'object' && sql.sql) {
        queryText = sql.sql;
        queryParams = sql.values || [];
      }
      
      queryText = queryText.replace(/\?/g, (match, offset) => {
        return `$${queryParams.indexOf(params[offset]) + 1}`;
      });
      
      let paramIndex = 1;
      while (queryText.includes('?')) {
        queryText = queryText.replace('?', `$${paramIndex}`);
        paramIndex++;
      }
      
      const result = await p.query(queryText, queryParams);
      return [result.rows, result.fields];
    },
    end: async () => {
      await p.end();
      poolInstance = null;
    }
  };

  return wrapper;
}

export async function initSchema(pool) {
}
