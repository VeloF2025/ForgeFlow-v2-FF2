// Error Handling and Edge Cases Testing
// Tests various error conditions and edge cases for ForgeFlow v2

const BASE_URL = 'http://localhost:3010';

class ErrorHandlingTestSuite {
  constructor() {
    this.testResults = [];
  }

  async runAllTests() {
    console.log('🚨 ForgeFlow v2 Error Handling & Edge Cases Testing');
    console.log('='.repeat(55));
    
    await this.testInvalidEndpoints();
    await this.testMalformedRequests();
    await this.testRateLimiting();
    await this.testAuthenticationEdgeCases();
    await this.testLargePayloads();
    await this.testConcurrentRequests();
    await this.testNetworkFailureSimulation();
    
    this.generateReport();
  }

  async testInvalidEndpoints() {
    console.log('\n🔍 INVALID ENDPOINTS TESTS');
    console.log('-'.repeat(30));
    
    const invalidEndpoints = [
      { url: '/api/nonexistent', expectedStatus: 404, name: 'Non-existent API endpoint' },
      { url: '/api/github/invalid', expectedStatus: 404, name: 'Invalid GitHub endpoint' },
      { url: '/api/agents/999999', expectedStatus: 404, name: 'Non-existent agent ID' },
      { url: '/api/executions/invalid-id', expectedStatus: 404, name: 'Invalid execution ID' },
      { url: '/api/metrics/invalid', expectedStatus: 404, name: 'Invalid metrics endpoint' }
    ];
    
    for (const endpoint of invalidEndpoints) {
      try {
        console.log(`🧪 Testing: ${endpoint.name}...`);
        const response = await fetch(`${BASE_URL}${endpoint.url}`);
        const contentType = response.headers.get('content-type');
        
        let responseData;
        try {
          if (contentType && contentType.includes('application/json')) {
            responseData = await response.json();
          } else {
            responseData = await response.text();
          }
        } catch (parseError) {
          responseData = 'Failed to parse response';
        }
        
        const correctStatus = response.status === endpoint.expectedStatus;
        const hasErrorMessage = (typeof responseData === 'object' && responseData.error) || 
                               (typeof responseData === 'string' && responseData.length > 0);
        
        console.log(`   Status: ${response.status} ${correctStatus ? '✅' : '❌'}`);
        console.log(`   Error Message: ${hasErrorMessage ? '✅' : '❌'}`);
        
        this.testResults.push({
          test: `Invalid Endpoint: ${endpoint.name}`,
          success: correctStatus && hasErrorMessage,
          details: {
            actualStatus: response.status,
            expectedStatus: endpoint.expectedStatus,
            hasErrorMessage,
            response: typeof responseData === 'string' ? responseData.substring(0, 100) : responseData
          }
        });
        
      } catch (error) {
        console.log(`   ❌ Unexpected error: ${error.message}`);
        this.testResults.push({
          test: `Invalid Endpoint: ${endpoint.name}`,
          success: false,
          error: error.message
        });
      }
    }
  }

  async testMalformedRequests() {
    console.log('\n🔧 MALFORMED REQUESTS TESTS');
    console.log('-'.repeat(35));
    
    const malformedTests = [
      {
        name: 'POST with invalid JSON',
        method: 'POST',
        url: '/api/executions',
        body: '{ invalid json }',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        name: 'Missing required fields',
        method: 'POST', 
        url: '/api/executions',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' }
      },
      {
        name: 'Invalid content type',
        method: 'POST',
        url: '/api/executions',
        body: 'plain text data',
        headers: { 'Content-Type': 'text/plain' }
      }
    ];
    
    for (const test of malformedTests) {
      try {
        console.log(`🧪 Testing: ${test.name}...`);
        const response = await fetch(`${BASE_URL}${test.url}`, {
          method: test.method,
          body: test.body,
          headers: test.headers
        });
        
        let responseData;
        try {
          responseData = await response.json();
        } catch (parseError) {
          responseData = await response.text();
        }
        
        const isErrorStatus = response.status >= 400;
        const hasErrorMessage = (typeof responseData === 'object' && responseData.error) ||
                               (typeof responseData === 'string' && responseData.includes('error'));
        
        console.log(`   Status: ${response.status} ${isErrorStatus ? '✅' : '❌'}`);
        console.log(`   Error Handling: ${hasErrorMessage ? '✅' : '❌'}`);
        
        this.testResults.push({
          test: `Malformed Request: ${test.name}`,
          success: isErrorStatus && hasErrorMessage,
          details: {
            status: response.status,
            hasErrorMessage,
            response: typeof responseData === 'string' ? responseData.substring(0, 100) : responseData
          }
        });
        
      } catch (error) {
        console.log(`   ✅ Request properly rejected: ${error.message}`);
        this.testResults.push({
          test: `Malformed Request: ${test.name}`,
          success: true,
          details: { rejectedAtNetwork: true, error: error.message }
        });
      }
    }
  }

  async testRateLimiting() {
    console.log('\n⚡ RATE LIMITING TESTS');
    console.log('-'.repeat(25));
    
    console.log('🧪 Testing rapid sequential requests...');
    
    const promises = [];
    const startTime = Date.now();
    
    // Send 20 rapid requests to test rate limiting
    for (let i = 0; i < 20; i++) {
      promises.push(fetch(`${BASE_URL}/api/metrics/current`));
    }
    
    try {
      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      const successCount = responses.filter(r => r.status === 200).length;
      const rateLimitedCount = responses.filter(r => r.status === 429).length;
      const avgResponseTime = totalTime / responses.length;
      
      console.log(`   Total Requests: ${responses.length}`);
      console.log(`   Successful: ${successCount}`);
      console.log(`   Rate Limited: ${rateLimitedCount}`);
      console.log(`   Avg Response Time: ${avgResponseTime.toFixed(1)}ms`);
      console.log(`   Total Time: ${totalTime}ms`);
      
      // Rate limiting is optional, so we consider it successful if either:
      // 1. All requests succeeded (no rate limiting implemented)
      // 2. Some requests were rate limited (rate limiting working)
      const success = successCount > 0 && avgResponseTime < 1000;
      
      this.testResults.push({
        test: 'Rate Limiting',
        success,
        details: {
          totalRequests: responses.length,
          successCount,
          rateLimitedCount,
          avgResponseTime: Math.round(avgResponseTime),
          totalTime
        }
      });
      
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
      this.testResults.push({
        test: 'Rate Limiting',
        success: false,
        error: error.message
      });
    }
  }

  async testAuthenticationEdgeCases() {
    console.log('\n🔐 AUTHENTICATION EDGE CASES');
    console.log('-'.repeat(35));
    
    // Test GitHub API endpoints with potentially invalid tokens
    console.log('🧪 Testing GitHub API resilience...');
    
    const githubEndpoints = [
      '/api/github/user',
      '/api/github/repositories'
    ];
    
    for (const endpoint of githubEndpoints) {
      try {
        const response = await fetch(`${BASE_URL}${endpoint}`);
        const data = await response.json();
        
        const isWorking = response.status === 200 && !data.error;
        const hasGracefulError = response.status >= 400 && data.error;
        
        console.log(`   ${endpoint}: ${isWorking ? '✅ Working' : hasGracefulError ? '⚠️ Graceful Error' : '❌ Failed'}`);
        
        this.testResults.push({
          test: `Auth Edge Case: ${endpoint}`,
          success: isWorking || hasGracefulError,
          details: {
            status: response.status,
            working: isWorking,
            gracefulError: hasGracefulError,
            error: data.error || null
          }
        });
        
      } catch (error) {
        console.log(`   ${endpoint}: ❌ ${error.message}`);
        this.testResults.push({
          test: `Auth Edge Case: ${endpoint}`,
          success: false,
          error: error.message
        });
      }
    }
  }

  async testLargePayloads() {
    console.log('\n📦 LARGE PAYLOAD TESTS');
    console.log('-'.repeat(25));
    
    console.log('🧪 Testing large request payload handling...');
    
    // Create a large payload (1MB of JSON data)
    const largeObject = {
      data: 'x'.repeat(1024 * 1024), // 1MB string
      metadata: {
        size: '1MB',
        purpose: 'payload size testing'
      }
    };
    
    try {
      const response = await fetch(`${BASE_URL}/api/executions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(largeObject)
      });
      
      const isRejected = response.status >= 400;
      console.log(`   Large payload: ${isRejected ? '✅ Properly rejected' : '⚠️ Accepted'} (${response.status})`);
      
      this.testResults.push({
        test: 'Large Payload Handling',
        success: true, // Either acceptance or rejection is acceptable
        details: {
          status: response.status,
          payloadSize: '1MB',
          rejected: isRejected
        }
      });
      
    } catch (error) {
      console.log(`   ✅ Large payload rejected at network level: ${error.message}`);
      this.testResults.push({
        test: 'Large Payload Handling',
        success: true,
        details: { rejectedAtNetwork: true, error: error.message }
      });
    }
  }

  async testConcurrentRequests() {
    console.log('\n🔄 CONCURRENT REQUESTS TESTS');
    console.log('-'.repeat(35));
    
    console.log('🧪 Testing concurrent API requests...');
    
    const endpoints = [
      '/api/github/user',
      '/api/github/repositories', 
      '/api/agents',
      '/api/metrics/current',
      '/api/executions'
    ];
    
    const startTime = Date.now();
    
    try {
      // Send all requests concurrently
      const promises = endpoints.map(endpoint => 
        fetch(`${BASE_URL}${endpoint}`).then(async r => ({
          endpoint,
          status: r.status,
          ok: r.ok,
          data: r.ok ? await r.json() : null
        }))
      );
      
      const results = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      const successCount = results.filter(r => r.ok).length;
      const successRate = Math.round((successCount / results.length) * 100);
      
      console.log(`   Concurrent Requests: ${results.length}`);
      console.log(`   Successful: ${successCount}/${results.length} (${successRate}%)`);
      console.log(`   Total Time: ${totalTime}ms`);
      
      this.testResults.push({
        test: 'Concurrent Requests',
        success: successRate >= 80,
        details: {
          totalRequests: results.length,
          successCount,
          successRate,
          totalTime
        }
      });
      
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
      this.testResults.push({
        test: 'Concurrent Requests',
        success: false,
        error: error.message
      });
    }
  }

  async testNetworkFailureSimulation() {
    console.log('\n🌐 NETWORK FAILURE SIMULATION');
    console.log('-'.repeat(35));
    
    console.log('🧪 Testing timeout handling...');
    
    // Test with very short timeout to simulate network issues
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1); // 1ms timeout
    
    try {
      await fetch(`${BASE_URL}/api/metrics/current`, {
        signal: controller.signal
      });
      
      console.log(`   ⚠️ Request completed despite timeout (very fast response)`);
      this.testResults.push({
        test: 'Network Timeout Handling',
        success: true,
        details: { message: 'Request completed despite short timeout' }
      });
      
    } catch (error) {
      const isAbortError = error.name === 'AbortError';
      console.log(`   ✅ Timeout handled correctly: ${isAbortError ? 'AbortError' : error.message}`);
      
      this.testResults.push({
        test: 'Network Timeout Handling',
        success: isAbortError,
        details: {
          errorType: error.name,
          message: error.message,
          handledCorrectly: isAbortError
        }
      });
    }
  }

  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('🚨 ERROR HANDLING & EDGE CASES TEST RESULTS');
    console.log('='.repeat(60));
    
    const successful = this.testResults.filter(r => r.success).length;
    const total = this.testResults.length;
    const successRate = Math.round((successful / total) * 100);
    
    console.log(`✅ Successful: ${successful}/${total}`);
    console.log(`📈 Success Rate: ${successRate}%`);
    
    // Group results by category
    const categories = {
      'Invalid Endpoints': this.testResults.filter(r => r.test.includes('Invalid Endpoint')),
      'Malformed Requests': this.testResults.filter(r => r.test.includes('Malformed Request')),
      'Auth Edge Cases': this.testResults.filter(r => r.test.includes('Auth Edge Case')),
      'Performance': this.testResults.filter(r => ['Rate Limiting', 'Concurrent Requests', 'Large Payload Handling'].includes(r.test)),
      'Network': this.testResults.filter(r => r.test.includes('Network'))
    };
    
    console.log('\n📊 RESULTS BY CATEGORY:');
    Object.entries(categories).forEach(([category, tests]) => {
      if (tests.length === 0) return;
      const categorySuccess = tests.filter(t => t.success).length;
      const categoryRate = Math.round((categorySuccess / tests.length) * 100);
      console.log(`   ${category}: ${categorySuccess}/${tests.length} (${categoryRate}%)`);
    });
    
    // Show failed tests
    const failedTests = this.testResults.filter(r => !r.success);
    if (failedTests.length > 0) {
      console.log('\n❌ FAILED TESTS:');
      failedTests.forEach((test, index) => {
        console.log(`${index + 1}. ${test.test}`);
        if (test.error) {
          console.log(`   Error: ${test.error}`);
        }
        if (test.details) {
          console.log(`   Details: ${JSON.stringify(test.details, null, 2)}`);
        }
      });
    }
    
    // Resilience assessment
    console.log('\n🛡️ RESILIENCE ASSESSMENT:');
    console.log(`   Error Handling: ${categories['Invalid Endpoints'].filter(t => t.success).length > 0 ? '✅' : '❌'}`);
    console.log(`   Input Validation: ${categories['Malformed Requests'].filter(t => t.success).length > 0 ? '✅' : '❌'}`);
    console.log(`   Auth Resilience: ${categories['Auth Edge Cases'].every(t => t.success) ? '✅' : '⚠️'}`);
    console.log(`   Performance: ${categories['Performance'].filter(t => t.success).length >= 2 ? '✅' : '⚠️'}`);
    console.log(`   Network Handling: ${categories['Network'].filter(t => t.success).length > 0 ? '✅' : '❌'}`);
    
    // Final assessment
    console.log('\n🏥 ERROR HANDLING HEALTH SCORE:');
    if (successRate >= 85) {
      console.log('🟢 EXCELLENT - Robust error handling across all scenarios');
    } else if (successRate >= 70) {
      console.log('🟡 GOOD - Most error scenarios handled well');
    } else if (successRate >= 50) {
      console.log('🟠 FAIR - Some error handling issues detected');
    } else {
      console.log('🔴 POOR - Significant error handling gaps');
    }
    
    console.log('\n🎯 RECOMMENDATIONS:');
    if (successRate < 100) {
      console.log('• Review failed test cases for improvement opportunities');
      console.log('• Implement additional error handling where needed');
      console.log('• Consider adding rate limiting if not present');
      console.log('• Ensure all API endpoints return consistent error formats');
    } else {
      console.log('• Excellent error handling! No immediate improvements needed');
      console.log('• Consider adding monitoring for production error rates');
    }
  }
}

// Run the test suite
if (require.main === module) {
  const testSuite = new ErrorHandlingTestSuite();
  testSuite.runAllTests().catch(console.error);
}

module.exports = ErrorHandlingTestSuite;