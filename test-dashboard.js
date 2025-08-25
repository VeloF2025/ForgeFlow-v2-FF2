// Quick test script for ForgeFlow v2 Dashboard APIs
// Using built-in fetch (Node.js 18+)

const BASE_URL = 'http://localhost:3010';

async function testAPI(endpoint, description) {
  try {
    console.log(`\n🧪 Testing: ${description}`);
    console.log(`   URL: ${BASE_URL}${endpoint}`);
    
    const response = await fetch(`${BASE_URL}${endpoint}`);
    const contentType = response.headers.get('content-type');
    
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Content-Type: ${contentType}`);
    
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      console.log(`   Response Keys: ${Object.keys(data).join(', ')}`);
      
      if (data.error) {
        console.log(`   ❌ Error: ${data.error}`);
        return { success: false, error: data.error, endpoint };
      } else {
        console.log(`   ✅ Success: Got valid JSON response`);
        // Log some sample data if available
        if (Array.isArray(data) && data.length > 0) {
          console.log(`   📊 Sample: Array with ${data.length} items`);
        } else if (typeof data === 'object' && data !== null) {
          const sampleKeys = Object.keys(data).slice(0, 3);
          console.log(`   📊 Sample keys: ${sampleKeys.join(', ')}${sampleKeys.length < Object.keys(data).length ? '...' : ''}`);
        }
        return { success: true, data, endpoint };
      }
    } else {
      // Check if it's HTML (dashboard fallback)
      const text = await response.text();
      const isHtml = text.trim().startsWith('<!DOCTYPE html') || text.trim().startsWith('<html');
      
      if (isHtml) {
        console.log(`   ⚠️ Warning: Got HTML response (likely dashboard fallback)`);
        console.log(`   🔍 This suggests the API endpoint may not be properly configured`);
        return { success: false, error: 'API returned HTML instead of JSON', endpoint, isHtml: true };
      } else {
        console.log(`   ✅ Success: Non-JSON response (${text.length} chars)`);
        return { success: true, data: text, endpoint };
      }
    }
    
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);
    return { success: false, error: error.message, endpoint };
  }
}

async function runTests() {
  console.log('🚀 ForgeFlow v2 Dashboard API Tests\n');
  console.log('Make sure the dashboard server is running on port 3010');
  console.log('npm run dev or npm start\n');
  
  const results = [];
  
  // Test basic endpoints
  results.push(await testAPI('/health', 'Health Check'));
  results.push(await testAPI('/api/github/user', 'GitHub User Info'));
  results.push(await testAPI('/api/github/repositories', 'GitHub Repositories'));
  results.push(await testAPI('/api/executions', 'Executions List'));
  results.push(await testAPI('/api/agents', 'Agents Status'));
  results.push(await testAPI('/api/metrics/current', 'Current System Metrics'));
  results.push(await testAPI('/api/metrics/health', 'System Health'));
  
  // Test additional endpoints
  console.log('\n📋 Testing additional endpoints...');
  results.push(await testAPI('/api/executions/patterns', 'Execution Patterns'));
  results.push(await testAPI('/api/executions/history', 'Execution History'));
  results.push(await testAPI('/api/agents/analytics', 'Agent Analytics'));
  results.push(await testAPI('/api/metrics/performance', 'Performance Metrics'));
  
  // Summary
  console.log('\n📊 TEST SUMMARY');
  console.log('================');
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const htmlResponses = results.filter(r => !r.success && r.isHtml).length;
  
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⚠️ HTML Responses (API issues): ${htmlResponses}`);
  
  if (failed > 0) {
    console.log('\n🔍 FAILED ENDPOINTS:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`   • ${r.endpoint}: ${r.error}`);
    });
  }
  
  console.log('\n💡 RECOMMENDATIONS:');
  if (htmlResponses > 0) {
    console.log('1. Some API endpoints are returning HTML instead of JSON');
    console.log('2. This suggests routing issues in the server configuration');
    console.log('3. Check the server.ts file for proper API route definitions');
  }
  if (results.some(r => r.error && r.error.includes('GitHub'))) {
    console.log('4. Make sure GITHUB_TOKEN is set in your .env file');
  }
  if (results.some(r => r.error && r.error.includes('ECONNREFUSED'))) {
    console.log('5. Make sure the ForgeFlow server is running on port 3010');
  }
  
  console.log('\n🏁 Test completed!');
  return { successful, failed, results };
}

runTests().catch(console.error);