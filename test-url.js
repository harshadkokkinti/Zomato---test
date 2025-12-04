// Quick script to test if Zomato partners URL is accessible
const https = require('https');
const http = require('http');

const testUrl = process.env.ZOMATO_PARTNERS_URL || 'https://partner.zomato.com';
const testPath = '/login';

console.log(`Testing URL: ${testUrl}${testPath}`);
console.log('---');

const url = new URL(testUrl);
const options = {
  hostname: url.hostname,
  port: url.port || (url.protocol === 'https:' ? 443 : 80),
  path: testPath,
  method: 'GET',
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  },
};

const client = url.protocol === 'https:' ? https : http;

const req = client.request(options, (res) => {
  console.log(`✅ Status Code: ${res.statusCode}`);
  console.log(`✅ Headers:`, res.headers);
  console.log(`✅ URL is accessible!`);
  process.exit(0);
});

req.on('error', (error) => {
  console.error(`❌ Error: ${error.message}`);
  if (error.code === 'ENOTFOUND' || error.code === 'ERR_NAME_NOT_RESOLVED') {
    console.error(`\n❌ DNS Resolution Failed!`);
    console.error(`The domain "${url.hostname}" cannot be resolved.`);
    console.error(`\nPossible solutions:`);
    console.error(`1. Check your internet connection`);
    console.error(`2. Verify the domain is correct`);
    console.error(`3. Try using a VPN if the domain is region-restricted`);
    console.error(`4. Check if you need to set ZOMATO_PARTNERS_URL environment variable`);
  } else if (error.code === 'ETIMEDOUT') {
    console.error(`\n❌ Connection Timeout!`);
    console.error(`The server is not responding.`);
  } else {
    console.error(`\n❌ Connection Error: ${error.code}`);
  }
  process.exit(1);
});

req.on('timeout', () => {
  console.error(`❌ Request Timeout!`);
  req.destroy();
  process.exit(1);
});

req.end();

