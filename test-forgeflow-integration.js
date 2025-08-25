// ForgeFlow Integration Testing
// Tests integration with core ForgeFlow orchestrator, agents, and execution patterns

const io = require('socket.io-client');
const BASE_URL = 'http://localhost:3010';

class ForgeFlowIntegrationTestSuite {
  constructor() {
    this.socket = null;
    this.testResults = [];
    this.executionId = null;
  }

  async runAllTests() {
    console.log('🤖 ForgeFlow v2 Integration Testing');
    console.log('='.repeat(40));
    
    await this.testOrchestratorStatus();
    await this.testAgentPoolIntegration();
    await this.testExecutionPatterns();
    await this.testQualityGatesIntegration();
    await this.testGitHubIntegration();
    await this.testProtocolEnforcement();
    await this.testWebSocketOrchestration();
    
    this.generateIntegrationReport();
    this.cleanup();
  }

  async testOrchestratorStatus() {
    console.log('\n🎯 ORCHESTRATOR STATUS TEST');
    console.log('-'.repeat(30));
    
    try {
      console.log('🧪 Testing orchestrator initialization...');
      const response = await fetch(`${BASE_URL}/api/status`);
      const data = await response.json();
      
      const hasOrchestrator = response.ok && data.executions !== undefined;
      const hasPatterns = data.patterns && Array.isArray(data.patterns);
      const hasHealth = data.health && typeof data.health === 'object';
      const patternCount = hasPatterns ? data.patterns.length : 0;
      
      console.log(`   Status: ${response.status} ${hasOrchestrator ? '✅' : '❌'}`);
      console.log(`   Execution Patterns: ${patternCount} available ${hasPatterns ? '✅' : '❌'}`);
      console.log(`   Health Metrics: ${hasHealth ? '✅' : '❌'}`);
      
      if (hasPatterns && patternCount > 0) {
        console.log(`   Available Patterns: ${data.patterns.map(p => p.name || p.id || p).join(', ')}`);
      }
      
      this.testResults.push({
        test: 'Orchestrator Status',
        success: hasOrchestrator && hasPatterns && hasHealth,
        details: {
          hasOrchestrator,
          patternCount,
          hasHealth,
          patterns: hasPatterns ? data.patterns : null
        }
      });
      
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
      this.testResults.push({
        test: 'Orchestrator Status',
        success: false,
        error: error.message
      });
    }
  }

  async testAgentPoolIntegration() {
    console.log('\n🤖 AGENT POOL INTEGRATION TEST');
    console.log('-'.repeat(35));
    
    try {
      console.log('🧪 Testing agent pool status...');
      const response = await fetch(`${BASE_URL}/api/agents`);
      const data = await response.json();
      
      const hasAgents = response.ok && data.agents && Array.isArray(data.agents);
      const agentCount = hasAgents ? data.agents.length : 0;
      const hasSummary = data.summary && typeof data.summary === 'object';
      const hasAnalytics = data.summary && data.summary.total !== undefined;
      
      console.log(`   Status: ${response.status} ${hasAgents ? '✅' : '❌'}`);
      console.log(`   Agent Count: ${agentCount} ${agentCount > 0 ? '✅' : '❌'}`);
      console.log(`   Summary: ${hasSummary ? '✅' : '❌'}`);
      console.log(`   Analytics: ${hasAnalytics ? '✅' : '❌'}`);
      
      if (hasAgents && agentCount > 0) {
        const agentTypes = [...new Set(data.agents.map(a => a.type || a.name))];
        console.log(`   Agent Types: ${agentTypes.slice(0, 5).join(', ')}${agentTypes.length > 5 ? '...' : ''}`);
      }
      
      // Test agent analytics endpoint
      console.log('🧪 Testing agent analytics...');
      const analyticsResponse = await fetch(`${BASE_URL}/api/agents/analytics`);
      const analyticsData = await analyticsResponse.json();
      const hasAnalyticsData = analyticsResponse.ok && analyticsData.summary;
      
      console.log(`   Analytics Endpoint: ${hasAnalyticsData ? '✅' : '❌'}`);
      
      this.testResults.push({
        test: 'Agent Pool Integration',
        success: hasAgents && agentCount > 0 && hasSummary && hasAnalyticsData,
        details: {
          agentCount,
          hasAgents,
          hasSummary,
          hasAnalytics: hasAnalyticsData,
          agentTypes: hasAgents ? [...new Set(data.agents.map(a => a.type || a.name))] : []
        }
      });
      
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
      this.testResults.push({
        test: 'Agent Pool Integration',
        success: false,
        error: error.message
      });
    }
  }

  async testExecutionPatterns() {
    console.log('\n⚡ EXECUTION PATTERNS TEST');
    console.log('-'.repeat(30));
    
    try {
      console.log('🧪 Testing execution patterns...');
      const response = await fetch(`${BASE_URL}/api/executions/patterns`);
      const data = await response.json();
      
      const hasPatterns = response.ok && data.patterns && Array.isArray(data.patterns);
      const patternCount = hasPatterns ? data.patterns.length : 0;
      const hasMetadata = hasPatterns && data.patterns.some(p => p.name && p.description);
      
      console.log(`   Status: ${response.status} ${hasPatterns ? '✅' : '❌'}`);
      console.log(`   Pattern Count: ${patternCount} ${patternCount > 0 ? '✅' : '❌'}`);
      console.log(`   Has Metadata: ${hasMetadata ? '✅' : '❌'}`);
      
      if (hasPatterns && patternCount > 0) {
        data.patterns.forEach((pattern, index) => {
          console.log(`   ${index + 1}. ${pattern.name || pattern.id} - ${pattern.description || 'No description'}`);
        });
      }
      
      // Test execution history
      console.log('🧪 Testing execution history...');
      const historyResponse = await fetch(`${BASE_URL}/api/executions/history`);
      const historyData = await historyResponse.json();
      const hasHistory = historyResponse.ok && historyData.executions;
      
      console.log(`   History Endpoint: ${hasHistory ? '✅' : '❌'}`);
      
      this.testResults.push({
        test: 'Execution Patterns',
        success: hasPatterns && patternCount > 0 && hasHistory,
        details: {
          patternCount,
          hasPatterns,
          hasMetadata,
          hasHistory,
          patterns: hasPatterns ? data.patterns.map(p => p.name || p.id) : []
        }
      });
      
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
      this.testResults.push({
        test: 'Execution Patterns',
        success: false,
        error: error.message
      });
    }
  }

  async testQualityGatesIntegration() {
    console.log('\n🛡️ QUALITY GATES INTEGRATION TEST');
    console.log('-'.repeat(40));
    
    try {
      console.log('🧪 Testing quality gates...');
      const response = await fetch(`${BASE_URL}/api/metrics/health`);
      const data = await response.json();
      
      const hasHealth = response.ok && data.overall;
      const hasCategories = data.categories && typeof data.categories === 'object';
      const hasSummary = data.summary && typeof data.summary === 'object';
      const hasQualityGates = hasCategories && (data.categories.linting || data.categories.testing || data.categories.security);
      
      console.log(`   Status: ${response.status} ${hasHealth ? '✅' : '❌'}`);
      console.log(`   Health Categories: ${hasCategories ? '✅' : '❌'}`);
      console.log(`   Quality Gates: ${hasQualityGates ? '✅' : '❌'}`);
      console.log(`   Summary: ${hasSummary ? '✅' : '❌'}`);
      
      if (hasCategories) {
        const categories = Object.keys(data.categories);
        console.log(`   Categories: ${categories.join(', ')}`);
      }
      
      this.testResults.push({
        test: 'Quality Gates Integration',
        success: hasHealth && hasCategories && hasSummary,
        details: {
          hasHealth,
          hasCategories,
          hasQualityGates,
          hasSummary,
          categories: hasCategories ? Object.keys(data.categories) : []
        }
      });
      
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
      this.testResults.push({
        test: 'Quality Gates Integration',
        success: false,
        error: error.message
      });
    }
  }

  async testGitHubIntegration() {
    console.log('\n🐙 GITHUB INTEGRATION TEST');
    console.log('-'.repeat(30));
    
    try {
      console.log('🧪 Testing GitHub connection...');
      const userResponse = await fetch(`${BASE_URL}/api/github/user`);
      const userData = await userResponse.json();
      
      const hasUser = userResponse.ok && userData.user && userData.user.login;
      
      console.log('🧪 Testing repository access...');
      const repoResponse = await fetch(`${BASE_URL}/api/github/repositories`);
      const repoData = await repoResponse.json();
      
      const hasRepos = repoResponse.ok && repoData.repositories && Array.isArray(repoData.repositories);
      const repoCount = hasRepos ? repoData.repositories.length : 0;
      
      console.log(`   User Connection: ${hasUser ? '✅' : '❌'} ${hasUser ? `(${userData.user.login})` : ''}`);
      console.log(`   Repository Access: ${hasRepos ? '✅' : '❌'} (${repoCount} repos)`);
      
      if (hasUser && userData.user) {
        console.log(`   User Details: ${userData.user.name || 'No name'}, ${userData.user.publicRepos || 0} public repos`);
      }
      
      this.testResults.push({
        test: 'GitHub Integration',
        success: hasUser && hasRepos,
        details: {
          hasUser,
          hasRepos,
          repoCount,
          username: hasUser ? userData.user.login : null,
          userDetails: hasUser ? userData.user : null
        }
      });
      
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
      this.testResults.push({
        test: 'GitHub Integration',
        success: false,
        error: error.message
      });
    }
  }

  async testProtocolEnforcement() {
    console.log('\n🔐 PROTOCOL ENFORCEMENT TEST');
    console.log('-'.repeat(35));
    
    try {
      console.log('🧪 Testing protocol status...');
      const response = await fetch(`${BASE_URL}/api/metrics/current`);
      const data = await response.json();
      
      const hasForgeFlow = response.ok && data.forgeflow;
      const hasProtocols = hasForgeFlow && data.forgeflow.protocols;
      const protocolCount = hasProtocols && data.forgeflow.protocols ? Object.keys(data.forgeflow.protocols).length : 0;
      
      console.log(`   Status: ${response.status} ${hasForgeFlow ? '✅' : '❌'}`);
      console.log(`   Protocol Data: ${hasProtocols ? '✅' : '❌'}`);
      console.log(`   Protocol Count: ${protocolCount}`);
      
      if (hasProtocols && data.forgeflow.protocols) {
        const protocols = Object.entries(data.forgeflow.protocols);
        protocols.forEach(([name, status]) => {
          console.log(`   • ${name}: ${status === true || status === 'ACTIVE' ? '✅' : '❌'}`);
        });
      }
      
      this.testResults.push({
        test: 'Protocol Enforcement',
        success: hasForgeFlow && hasProtocols && protocolCount > 0,
        details: {
          hasForgeFlow,
          hasProtocols,
          protocolCount,
          protocols: hasProtocols ? data.forgeflow.protocols : null
        }
      });
      
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
      this.testResults.push({
        test: 'Protocol Enforcement',
        success: false,
        error: error.message
      });
    }
  }

  async testWebSocketOrchestration() {
    console.log('\n🔌 WEBSOCKET ORCHESTRATION TEST');
    console.log('-'.repeat(40));
    
    return new Promise((resolve) => {
      try {
        console.log('🧪 Testing WebSocket integration...');
        this.socket = io(BASE_URL, {
          timeout: 5000,
          transports: ['websocket', 'polling']
        });

        let eventCount = 0;
        const orchestrationEvents = ['execution:started', 'execution:progress', 'execution:completed', 'agent:started', 'agent:completed'];
        const receivedEvents = new Set();

        orchestrationEvents.forEach(eventName => {
          this.socket.on(eventName, (data) => {
            eventCount++;
            receivedEvents.add(eventName);
            console.log(`   📥 Orchestration Event: '${eventName}'`);
          });
        });

        // Also listen for system events
        this.socket.on('system:metrics', (data) => {
          console.log(`   📊 System Metrics Event received`);
        });

        this.socket.on('connect', () => {
          console.log(`   ✅ WebSocket Connected: ${this.socket.id}`);
          
          // Give some time to receive events
          setTimeout(() => {
            const hasConnection = true;
            const receivedOrchestrationEvents = receivedEvents.size > 0;
            
            console.log(`   Orchestration Events: ${receivedOrchestrationEvents ? '✅' : '⚠️'} (${receivedEvents.size} types)`);
            console.log(`   Event Types: ${Array.from(receivedEvents).join(', ') || 'None yet'}`);
            
            this.testResults.push({
              test: 'WebSocket Orchestration',
              success: hasConnection, // Connection is the key requirement
              details: {
                connected: hasConnection,
                orchestrationEvents: Array.from(receivedEvents),
                eventCount,
                socketId: this.socket.id
              }
            });
            
            resolve();
          }, 3000);
        });

        this.socket.on('connect_error', (error) => {
          console.log(`   ❌ Connection failed: ${error.message}`);
          this.testResults.push({
            test: 'WebSocket Orchestration',
            success: false,
            error: error.message
          });
          resolve();
        });

        // Timeout fallback
        setTimeout(() => {
          if (this.testResults.findIndex(r => r.test === 'WebSocket Orchestration') === -1) {
            console.log(`   ⚠️ WebSocket test timeout`);
            this.testResults.push({
              test: 'WebSocket Orchestration',
              success: false,
              error: 'Connection timeout'
            });
            resolve();
          }
        }, 5000);

      } catch (error) {
        console.log(`   ❌ Failed: ${error.message}`);
        this.testResults.push({
          test: 'WebSocket Orchestration',
          success: false,
          error: error.message
        });
        resolve();
      }
    });
  }

  generateIntegrationReport() {
    console.log('\n' + '='.repeat(50));
    console.log('🤖 FORGEFLOW INTEGRATION TEST RESULTS');
    console.log('='.repeat(50));
    
    const successful = this.testResults.filter(r => r.success).length;
    const total = this.testResults.length;
    const successRate = Math.round((successful / total) * 100);
    
    console.log(`✅ Successful: ${successful}/${total}`);
    console.log(`📈 Integration Score: ${successRate}%`);
    
    // Core system integration
    const coreTests = ['Orchestrator Status', 'Agent Pool Integration', 'Execution Patterns'];
    const coreSuccess = this.testResults.filter(r => coreTests.includes(r.test) && r.success).length;
    const coreScore = Math.round((coreSuccess / coreTests.length) * 100);
    
    console.log(`🎯 Core System Integration: ${coreScore}% (${coreSuccess}/${coreTests.length})`);
    
    // External integrations
    const externalTests = ['GitHub Integration', 'Quality Gates Integration'];
    const externalSuccess = this.testResults.filter(r => externalTests.includes(r.test) && r.success).length;
    const externalScore = Math.round((externalSuccess / externalTests.length) * 100);
    
    console.log(`🌐 External Integration: ${externalScore}% (${externalSuccess}/${externalTests.length})`);
    
    // Detailed results
    console.log('\n📋 DETAILED INTEGRATION RESULTS:');
    this.testResults.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      console.log(`${index + 1}. ${status} ${result.test}`);
      
      if (result.details) {
        const keyDetails = this.getKeyDetails(result.test, result.details);
        if (keyDetails.length > 0) {
          console.log(`   ${keyDetails.join(', ')}`);
        }
      }
      
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });
    
    // Integration health assessment
    console.log('\n🏥 FORGEFLOW INTEGRATION HEALTH:');
    console.log(`   📊 Orchestrator: ${this.getTestStatus('Orchestrator Status')}`);
    console.log(`   🤖 Agent Pool: ${this.getTestStatus('Agent Pool Integration')}`);
    console.log(`   ⚡ Execution Engine: ${this.getTestStatus('Execution Patterns')}`);
    console.log(`   🛡️ Quality Gates: ${this.getTestStatus('Quality Gates Integration')}`);
    console.log(`   🐙 GitHub: ${this.getTestStatus('GitHub Integration')}`);
    console.log(`   🔐 Protocols: ${this.getTestStatus('Protocol Enforcement')}`);
    console.log(`   🔌 WebSocket: ${this.getTestStatus('WebSocket Orchestration')}`);
    
    // Overall assessment
    console.log('\n🎯 OVERALL FORGEFLOW INTEGRATION STATUS:');
    if (successRate >= 85 && coreScore >= 90) {
      console.log('🟢 EXCELLENT - Full ForgeFlow integration operational');
      console.log('   All core systems integrated and functioning properly');
    } else if (successRate >= 70 && coreScore >= 75) {
      console.log('🟡 GOOD - Most ForgeFlow systems integrated');
      console.log('   Minor integration issues detected');
    } else if (successRate >= 50) {
      console.log('🟠 PARTIAL - Some ForgeFlow systems working');
      console.log('   Significant integration work needed');
    } else {
      console.log('🔴 CRITICAL - Major ForgeFlow integration issues');
      console.log('   Core systems not properly integrated');
    }
    
    // Recommendations
    console.log('\n💡 INTEGRATION RECOMMENDATIONS:');
    const failedTests = this.testResults.filter(r => !r.success);
    if (failedTests.length === 0) {
      console.log('• Excellent integration! All systems operational');
      console.log('• Consider performance monitoring and logging');
      console.log('• Ready for production deployment');
    } else {
      console.log(`• Fix ${failedTests.length} failed integration test(s)`);
      failedTests.forEach(test => {
        console.log(`  - ${test.test}: ${test.error || 'Review implementation'}`);
      });
      if (coreScore < 100) {
        console.log('• Focus on core system integration first');
      }
    }
  }

  getKeyDetails(testName, details) {
    const keyInfo = [];
    
    switch (testName) {
      case 'Orchestrator Status':
        if (details.patternCount) keyInfo.push(`${details.patternCount} patterns`);
        break;
      case 'Agent Pool Integration':
        if (details.agentCount) keyInfo.push(`${details.agentCount} agents`);
        if (details.agentTypes) keyInfo.push(`${details.agentTypes.length} types`);
        break;
      case 'Execution Patterns':
        if (details.patternCount) keyInfo.push(`${details.patternCount} patterns`);
        break;
      case 'GitHub Integration':
        if (details.username) keyInfo.push(`User: ${details.username}`);
        if (details.repoCount) keyInfo.push(`${details.repoCount} repos`);
        break;
      case 'Protocol Enforcement':
        if (details.protocolCount) keyInfo.push(`${details.protocolCount} protocols`);
        break;
      case 'WebSocket Orchestration':
        if (details.socketId) keyInfo.push(`ID: ${details.socketId}`);
        if (details.orchestrationEvents?.length) keyInfo.push(`${details.orchestrationEvents.length} event types`);
        break;
    }
    
    return keyInfo;
  }

  getTestStatus(testName) {
    const result = this.testResults.find(r => r.test === testName);
    return result ? (result.success ? '✅' : '❌') : '⚠️';
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
  const testSuite = new ForgeFlowIntegrationTestSuite();
  testSuite.runAllTests().catch(console.error);
}

module.exports = ForgeFlowIntegrationTestSuite;