// Real-time Features and Dashboard Testing
// Tests WebSocket connections, real-time updates, and dashboard functionality

const io = require('socket.io-client');

const BASE_URL = 'http://localhost:3010';

class RealTimeTestSuite {
  constructor() {
    this.socket = null;
    this.testResults = [];
    this.receivedEvents = [];
    this.connectionStatus = 'disconnected';
  }

  async runAllTests() {
    console.log('🚀 ForgeFlow v2 Real-Time & Dashboard Testing');
    console.log('='.repeat(55));
    
    // Test dashboard accessibility
    await this.testDashboardAccess();
    
    // Test WebSocket connection
    await this.testWebSocketConnection();
    
    // Test real-time events
    await this.testRealTimeEvents();
    
    // Test API integration from browser perspective
    await this.testDashboardAPIIntegration();
    
    this.generateReport();
    this.cleanup();
  }

  async testDashboardAccess() {
    console.log('\n📊 DASHBOARD ACCESS TESTS');
    console.log('-'.repeat(30));
    
    try {
      // Test main dashboard
      console.log('🧪 Testing dashboard HTML page...');
      const response = await fetch(`${BASE_URL}/`);
      const html = await response.text();
      
      const hasTitle = html.includes('<title>') && html.includes('ForgeFlow');
      const hasScripts = html.includes('<script>');
      const hasStyles = html.includes('<style>') || html.includes('.css');
      const hasSocketIO = html.includes('socket.io') || html.includes('io(');
      
      console.log(`   Status: ${response.status} ${response.statusText}`);
      console.log(`   Has Title: ${hasTitle ? '✅' : '❌'}`);
      console.log(`   Has Scripts: ${hasScripts ? '✅' : '❌'}`);
      console.log(`   Has Styles: ${hasStyles ? '✅' : '❌'}`);
      console.log(`   Has Socket.IO: ${hasSocketIO ? '✅' : '❌'}`);
      
      this.testResults.push({
        test: 'Dashboard Access',
        success: response.ok && hasTitle && hasScripts,
        details: { status: response.status, hasTitle, hasScripts, hasStyles, hasSocketIO }
      });
      
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
      this.testResults.push({
        test: 'Dashboard Access',
        success: false,
        error: error.message
      });
    }
  }

  async testWebSocketConnection() {
    console.log('\n🔌 WEBSOCKET CONNECTION TESTS');
    console.log('-'.repeat(35));
    
    return new Promise((resolve) => {
      try {
        console.log('🧪 Testing WebSocket connection...');
        this.socket = io(BASE_URL, {
          timeout: 5000,
          transports: ['websocket', 'polling']
        });

        let connectionTimer = setTimeout(() => {
          console.log('   ❌ Connection timeout');
          this.testResults.push({
            test: 'WebSocket Connection',
            success: false,
            error: 'Connection timeout'
          });
          resolve();
        }, 5000);

        this.socket.on('connect', () => {
          clearTimeout(connectionTimer);
          this.connectionStatus = 'connected';
          console.log(`   ✅ Connected with ID: ${this.socket.id}`);
          console.log(`   Transport: ${this.socket.io.engine.transport.name}`);
          
          this.testResults.push({
            test: 'WebSocket Connection',
            success: true,
            details: {
              socketId: this.socket.id,
              transport: this.socket.io.engine.transport.name
            }
          });
          
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          clearTimeout(connectionTimer);
          console.log(`   ❌ Connection error: ${error.message}`);
          this.testResults.push({
            test: 'WebSocket Connection',
            success: false,
            error: error.message
          });
          resolve();
        });

        this.socket.on('disconnect', (reason) => {
          console.log(`   ⚠️ Disconnected: ${reason}`);
          this.connectionStatus = 'disconnected';
        });

      } catch (error) {
        console.log(`   ❌ Failed: ${error.message}`);
        this.testResults.push({
          test: 'WebSocket Connection',
          success: false,
          error: error.message
        });
        resolve();
      }
    });
  }

  async testRealTimeEvents() {
    console.log('\n📡 REAL-TIME EVENTS TESTS');
    console.log('-'.repeat(30));
    
    if (!this.socket || this.connectionStatus !== 'connected') {
      console.log('   ❌ Skipping - WebSocket not connected');
      return;
    }

    return new Promise((resolve) => {
      let eventCount = 0;
      const expectedEvents = ['status', 'system:metrics', 'agents:status'];
      const receivedEvents = new Set();
      
      // Set up event listeners
      expectedEvents.forEach(eventName => {
        this.socket.on(eventName, (data) => {
          eventCount++;
          receivedEvents.add(eventName);
          console.log(`   📥 Received '${eventName}': ${Object.keys(data || {}).length} properties`);
          this.receivedEvents.push({ event: eventName, data, timestamp: new Date() });
        });
      });

      // Test real-time metrics updates
      console.log('🧪 Testing real-time event streams...');
      console.log('   Listening for system events (15 second timeout)...');
      
      const timeout = setTimeout(() => {
        console.log(`   📊 Events received: ${eventCount}`);
        console.log(`   📋 Event types: ${Array.from(receivedEvents).join(', ')}`);
        
        this.testResults.push({
          test: 'Real-Time Events',
          success: eventCount > 0,
          details: {
            eventCount,
            receivedEventTypes: Array.from(receivedEvents),
            expectedEvents
          }
        });
        
        resolve();
      }, 15000);
      
      // If we get at least some events quickly, we can resolve early
      setTimeout(() => {
        if (eventCount >= 2) {
          clearTimeout(timeout);
          console.log(`   ✅ Quick success: ${eventCount} events received`);
          console.log(`   📋 Event types: ${Array.from(receivedEvents).join(', ')}`);
          
          this.testResults.push({
            test: 'Real-Time Events',
            success: true,
            details: {
              eventCount,
              receivedEventTypes: Array.from(receivedEvents),
              expectedEvents
            }
          });
          
          resolve();
        }
      }, 5000);
    });
  }

  async testDashboardAPIIntegration() {
    console.log('\n🔗 DASHBOARD API INTEGRATION TESTS');
    console.log('-'.repeat(40));
    
    const apiEndpoints = [
      { url: '/api/github/user', name: 'GitHub User' },
      { url: '/api/github/repositories', name: 'GitHub Repos' },
      { url: '/api/agents', name: 'Agents Status' },
      { url: '/api/metrics/current', name: 'Current Metrics' }
    ];
    
    let successCount = 0;
    
    for (const endpoint of apiEndpoints) {
      try {
        console.log(`🧪 Testing ${endpoint.name}...`);
        const response = await fetch(`${BASE_URL}${endpoint.url}`);
        const data = await response.json();
        
        const isValid = response.ok && typeof data === 'object' && !data.error;
        const hasData = this.hasRealData(data);
        
        console.log(`   Status: ${response.status} ${isValid ? '✅' : '❌'}`);
        console.log(`   Has Data: ${hasData ? '✅' : '❌'}`);
        
        if (isValid) successCount++;
        
      } catch (error) {
        console.log(`   ❌ Failed: ${error.message}`);
      }
    }
    
    this.testResults.push({
      test: 'Dashboard API Integration',
      success: successCount === apiEndpoints.length,
      details: {
        successCount,
        totalEndpoints: apiEndpoints.length,
        successRate: Math.round((successCount / apiEndpoints.length) * 100)
      }
    });
    
    console.log(`   📊 Success Rate: ${Math.round((successCount / apiEndpoints.length) * 100)}% (${successCount}/${apiEndpoints.length})`);
  }

  hasRealData(data) {
    if (Array.isArray(data)) return data.length > 0;
    if (typeof data !== 'object' || !data) return false;
    
    // Check for common real data indicators
    if (data.user?.login) return true;
    if (data.repositories?.length > 0) return true;
    if (data.agents?.length > 0) return true;
    if (data.system?.cpu !== undefined) return true;
    
    return Object.keys(data).length > 3;
  }

  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 REAL-TIME & DASHBOARD TEST RESULTS');
    console.log('='.repeat(60));
    
    const successful = this.testResults.filter(r => r.success).length;
    const total = this.testResults.length;
    const successRate = Math.round((successful / total) * 100);
    
    console.log(`✅ Successful: ${successful}/${total}`);
    console.log(`📈 Success Rate: ${successRate}%`);
    console.log(`📡 Real-time Events: ${this.receivedEvents.length} total`);
    console.log(`🔌 WebSocket Status: ${this.connectionStatus}`);
    
    // Detailed results
    console.log('\n📋 DETAILED RESULTS:');
    this.testResults.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      console.log(`${index + 1}. ${status} ${result.test}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
      if (result.details) {
        const details = Object.entries(result.details)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');
        console.log(`   Details: ${details}`);
      }
    });
    
    // Real-time event summary
    if (this.receivedEvents.length > 0) {
      console.log('\n📡 REAL-TIME EVENTS RECEIVED:');
      const eventTypes = {};
      this.receivedEvents.forEach(event => {
        eventTypes[event.event] = (eventTypes[event.event] || 0) + 1;
      });
      
      Object.entries(eventTypes).forEach(([event, count]) => {
        console.log(`   • ${event}: ${count} times`);
      });
    }
    
    // Final assessment
    console.log('\n🏥 SYSTEM HEALTH ASSESSMENT:');
    if (successRate >= 80) {
      console.log('🟢 Status: EXCELLENT - All systems operational');
    } else if (successRate >= 60) {
      console.log('🟡 Status: GOOD - Minor issues detected');
    } else {
      console.log('🔴 Status: NEEDS ATTENTION - Multiple issues detected');
    }
    
    console.log('\n🎯 FORGEFLOW V2 DASHBOARD STATUS:');
    const hasRealTime = this.receivedEvents.length > 0;
    const hasAPI = this.testResults.some(r => r.test === 'Dashboard API Integration' && r.success);
    const hasConnection = this.connectionStatus === 'connected';
    
    console.log(`   📊 Dashboard Access: ${this.testResults.find(r => r.test === 'Dashboard Access')?.success ? '✅' : '❌'}`);
    console.log(`   🔌 WebSocket Connection: ${hasConnection ? '✅' : '❌'}`);
    console.log(`   📡 Real-time Updates: ${hasRealTime ? '✅' : '❌'}`);
    console.log(`   🔗 API Integration: ${hasAPI ? '✅' : '❌'}`);
  }

  cleanup() {
    if (this.socket) {
      console.log('\n🧹 Cleaning up WebSocket connection...');
      this.socket.disconnect();
    }
  }
}

// Run the test suite
if (require.main === module) {
  const testSuite = new RealTimeTestSuite();
  testSuite.runAllTests().catch(console.error);
}

module.exports = RealTimeTestSuite;