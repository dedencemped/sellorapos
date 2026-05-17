// Simple script to call the admin cleanup endpoint (ESM)
import http from 'http';

function callCleanup() {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: 'localhost',
        port: 3001,
        path: '/api/admin/cleanup-purchase-returns',
        method: 'POST',
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  try {
    const result = await callCleanup();
    console.log('Response:', result.status, result.body);
    if (result.status >= 400) {
      process.exit(1);
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
