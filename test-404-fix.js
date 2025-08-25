// Quick 404 Fix Verification Test
const BASE_URL = 'http://localhost:3010';

async function test404Fix() {
  console.log('🔍 Testing 404 Fix for Invalid API Endpoints\n');
  
  const invalidEndpoints = [
    '/api/nonexistent',
    '/api/github/invalid',
    '/api/metrics/invalid'
  ];
  
  for (const endpoint of invalidEndpoints) {
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`);
      const data = await response.json();
      
      const correct404 = response.status === 404;
      const hasError = data.error && data.error.includes('not found');
      
      console.log(`${endpoint}:`);
      console.log(`   Status: ${response.status} ${correct404 ? '✅' : '❌'}`);
      console.log(`   Error Message: ${hasError ? '✅' : '❌'}`);
      console.log(`   Response: ${JSON.stringify(data, null, 2)}\n`);
      
    } catch (error) {
      console.log(`${endpoint}: ❌ ${error.message}\n`);
    }
  }
}

test404Fix().catch(console.error);