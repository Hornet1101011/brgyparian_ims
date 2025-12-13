/**
 * Test script to verify analytics endpoints are working
 */

const http = require('http');

function testEndpoint(endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: endpoint,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  try {
    console.log('Testing /api/analytics/personal-info...');
    const result1 = await testEndpoint('/api/analytics/personal-info');
    console.log('Status:', result1.status);
    console.log('Response:', JSON.stringify(result1.data, null, 2).substring(0, 500));
    
    console.log('\nTesting /api/analytics/document-requests...');
    const result2 = await testEndpoint('/api/analytics/document-requests');
    console.log('Status:', result2.status);
    console.log('Response:', JSON.stringify(result2.data, null, 2).substring(0, 500));
    
    if (result1.status === 200 && result2.status === 200) {
      console.log('\n✅ Both endpoints working!');
    } else {
      console.log('\n❌ Endpoints still failing');
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
