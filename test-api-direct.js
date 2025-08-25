// Direct API Testing Script - Bypasses Routing Issues
// Tests ForgeFlow v2 API endpoints with detailed error reporting

const BASE_URL = 'http://localhost:3010';

async function testDirectAPI(endpoint, description, expectJson = true) {
  try {
    console.log(`\n🧪 Testing: ${description}`);
    console.log(`   URL: ${BASE_URL}${endpoint}`);
    
    const response = await fetch(`${BASE_URL}${endpoint}`);
    const contentType = response.headers.get('content-type');
    
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Content-Type: ${contentType}`);
    
    const text = await response.text();
    const isJson = text.trim().startsWith('{') || text.trim().startsWith('[');
    const isHtml = text.trim().startsWith('<!DOCTYPE html') || text.trim().startsWith('<html');
    
    if (expectJson && isJson) {
      try {
        const data = JSON.parse(text);
        console.log(`   ✅ Success: Valid JSON response`);
        if (data.error) {
          console.log(`   ⚠️ API Error: ${data.error}`);
          return { success: false, error: data.error, endpoint, apiError: true };
        } else {
          const keys = Object.keys(data);
          console.log(`   📊 Response keys: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`);
          
          // Show sample data
          if (Array.isArray(data)) {
            console.log(`   📈 Array length: ${data.length}`);
          } else if (data.repositories && Array.isArray(data.repositories)) {
            console.log(`   📈 Repositories count: ${data.repositories.length}`);
          } else if (data.user) {
            console.log(`   👤 User: ${data.user.login || data.user.name || 'Unknown'}`);
          }
          
          return { success: true, data, endpoint, isRealData: !isEmptyData(data) };
        }
      } catch (parseError) {
        console.log(`   ❌ Invalid JSON: ${parseError.message}`);
        return { success: false, error: `Invalid JSON: ${parseError.message}`, endpoint };
      }
    } else if (isHtml) {
      console.log(`   ⚠️ Warning: HTML response (routing fallback)`);
      console.log(`   🔍 Text preview: ${text.substring(0, 100).replace(/\n/g, ' ')}...`);
      return { success: false, error: 'HTML response instead of JSON', endpoint, isHtml: true };
    } else {
      console.log(`   ✅ Text response: ${text.length} characters`);
      console.log(`   📝 Preview: ${text.substring(0, 200)}`);
      return { success: true, data: text, endpoint };
    }
    
  } catch (error) {
    console.log(`   ❌ Network Error: ${error.message}`);
    return { success: false, error: error.message, endpoint, networkError: true };
  }
}

function isEmptyData(data) {
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data === 'object' && data !== null) {
    if (data.repositories) return Array.isArray(data.repositories) && data.repositories.length === 0;
    if (data.agents) return Array.isArray(data.agents) && data.agents.length === 0;
    if (data.executions) return Array.isArray(data.executions) && data.executions.length === 0;
    return Object.keys(data).length === 0;
  }
  return false;
}

async function runComprehensiveTests() {
  console.log('🚀 ForgeFlow v2 API Direct Testing\n');
  console.log('Testing server at:', BASE_URL);
  console.log('='.repeat(50));
  
  const results = [];
  
  // Core API Tests
  console.log('\n📋 CORE ENDPOINTS');
  results.push(await testDirectAPI('/health', 'Health Check'));
  results.push(await testDirectAPI('/api/status', 'System Status'));
  
  // GitHub API Tests
  console.log('\n🐙 GITHUB INTEGRATION');
  results.push(await testDirectAPI('/api/github/user', 'GitHub User Info'));
  results.push(await testDirectAPI('/api/github/repositories', 'GitHub Repositories'));
  
  // ForgeFlow Specific Tests  
  console.log('\n🤖 FORGEFLOW FEATURES');
  results.push(await testDirectAPI('/api/executions', 'Executions List'));
  results.push(await testDirectAPI('/api/agents', 'Agents Status'));
  results.push(await testDirectAPI('/api/metrics/current', 'Current Metrics'));
  results.push(await testDirectAPI('/api/metrics/health', 'System Health'));
  
  // Additional endpoint tests
  console.log('\n🔧 EXTENDED FEATURES');
  results.push(await testDirectAPI('/api/agents/analytics', 'Agent Analytics'));
  results.push(await testDirectAPI('/api/executions/patterns', 'Execution Patterns'));
  results.push(await testDirectAPI('/api/metrics/performance', 'Performance Metrics'));
  
  // Analysis
  console.log('\n' + '='.repeat(60));
  console.log('📊 COMPREHENSIVE TEST RESULTS');
  console.log('='.repeat(60));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const htmlResponses = results.filter(r => r.isHtml);
  const apiErrors = results.filter(r => r.apiError);
  const networkErrors = results.filter(r => r.networkError);
  const realData = results.filter(r => r.success && r.isRealData);
  
  console.log(`✅ Successful: ${successful.length}/${results.length}`);
  console.log(`❌ Failed: ${failed.length}/${results.length}`);
  console.log(`📄 HTML Fallbacks: ${htmlResponses.length}/${results.length}`);
  console.log(`🚫 API Errors: ${apiErrors.length}/${results.length}`);
  console.log(`🌐 Network Errors: ${networkErrors.length}/${results.length}`);
  console.log(`📈 Real Data: ${realData.length}/${results.length}`);
  
  if (htmlResponses.length > 0) {
    console.log('\n🔍 HTML RESPONSE ENDPOINTS (Routing Issues):');
    htmlResponses.forEach(r => console.log(`   • ${r.endpoint}`));
  }
  
  if (apiErrors.length > 0) {
    console.log('\n⚠️ API ERROR ENDPOINTS:');
    apiErrors.forEach(r => console.log(`   • ${r.endpoint}: ${r.error}`));
  }
  
  if (networkErrors.length > 0) {
    console.log('\n🚨 NETWORK ERROR ENDPOINTS:');
    networkErrors.forEach(r => console.log(`   • ${r.endpoint}: ${r.error}`));
  }
  
  if (successful.length > 0) {
    console.log('\n✅ WORKING ENDPOINTS:');
    successful.forEach(r => {
      const dataInfo = r.isRealData ? ' (Real Data)' : ' (Mock/Empty)';
      console.log(`   • ${r.endpoint}${dataInfo}`);
    });
  }
  
  console.log('\n🎯 RECOMMENDATIONS:');
  if (htmlResponses.length > 0) {
    console.log('1. Fix API routing - endpoints returning HTML instead of JSON');
    console.log('2. Check server.ts API route registration');
    console.log('3. Verify API modules are properly imported and mounted');
  }
  if (apiErrors.length > 0) {
    console.log('4. Check GitHub token configuration for GitHub API errors');
    console.log('5. Verify environment variables are properly set');
  }
  
  const healthScore = Math.round((successful.length / results.length) * 100);
  console.log(`\n🏥 API Health Score: ${healthScore}%`);
  
  if (healthScore >= 80) {
    console.log('🟢 Status: HEALTHY - Most endpoints working');
  } else if (healthScore >= 50) {
    console.log('🟡 Status: DEGRADED - Some endpoints have issues');
  } else {
    console.log('🔴 Status: CRITICAL - Major API issues detected');
  }
  
  console.log('\n🏁 Testing completed!');
  return { results, healthScore, successful: successful.length, failed: failed.length };
}

// Run the tests
runComprehensiveTests().catch(console.error);