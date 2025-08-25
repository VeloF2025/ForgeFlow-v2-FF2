#!/usr/bin/env node

/**
 * ForgeFlow V2 Strategic Planner Agent Demo
 * Demonstrates the strategic planning capabilities and parallel execution planning
 */

const { StrategicPlannerAgent } = require('./dist/agents/strategic-planner');

async function demonstrateStrategicPlanner() {
  console.log('🚀 ForgeFlow V2 Strategic Planner Agent Demo\n');
  
  // Initialize the strategic planner agent
  const planner = new StrategicPlannerAgent();
  
  console.log('📋 Agent Details:');
  console.log(`- ID: ${planner.id}`);
  console.log(`- Type: ${planner.type}`);
  console.log(`- Status: ${planner.getStatus()}`);
  console.log(`- Capabilities: ${planner.getCapabilities().join(', ')}\n`);
  
  // Mock issue and worktree IDs for demonstration
  const mockIssueId = 'issue-demo-123';
  const mockWorktreeId = 'worktree-demo-456';
  
  try {
    console.log('⚡ Starting Strategic Planning Execution...\n');
    
    // Execute the strategic planning process
    await planner.execute(mockIssueId, mockWorktreeId);
    
    console.log('\n✅ Strategic Planning Complete!\n');
    
    // Demonstrate access to planning results
    const planningResult = planner.getPlanningResult();
    if (planningResult) {
      console.log('📊 Planning Results Summary:');
      console.log(`- Total Tasks: ${planningResult.tasks.total}`);
      console.log(`- Parallel Streams: ${planningResult.tasks.parallel.length}`);
      console.log(`- Sequential Tasks: ${planningResult.tasks.sequential.length}`);
      console.log(`- Total Estimated Hours: ${planningResult.implementationPlan.totalEstimatedHours}`);
      console.log(`- Quality Gates: ${planningResult.qualityGates.length}`);
      console.log(`- Risk Items: ${planningResult.risks.length} (${planningResult.risks.filter(r => r.impact === 'high').length} high-impact)\n`);
      
      console.log('🎯 Success Criteria:');
      planningResult.successCriteria.forEach((criteria, index) => {
        console.log(`  ${index + 1}. ${criteria}`);
      });
      
      console.log('\n🚧 Implementation Phases:');
      planningResult.implementationPlan.phases.forEach((phase, index) => {
        console.log(`  ${index + 1}. ${phase.name} (${phase.estimatedHours}h, parallel: ${phase.parallel})`);
        console.log(`     - Description: ${phase.description}`);
        console.log(`     - Agents: ${phase.agentTypes.join(', ')}`);
      });
      
      console.log('\n⚠️  High-Risk Items:');
      const highRisks = planner.getHighRiskItems();
      highRisks.forEach((risk, index) => {
        console.log(`  ${index + 1}. ${risk.description} (${risk.probability} probability, ${risk.impact} impact)`);
        console.log(`     - Category: ${risk.category}`);
        console.log(`     - Owner: ${risk.owner}`);
        console.log(`     - Mitigation: ${risk.mitigation.join(', ')}`);
      });
      
      console.log('\n🎪 Parallel Execution Plan:');
      const parallelPlan = planner.getParallelExecutionPlan();
      if (parallelPlan) {
        parallelPlan.phases.forEach((phase, index) => {
          console.log(`  Phase ${index + 1}: ${phase.name} (parallel: ${phase.parallel})`);
          console.log(`  Tasks: ${phase.tasks.length}`);
        });
      }
    }
    
    console.log(`\n📈 Estimated Completion Time: ${planner.getEstimatedCompletionTime()} hours`);
    console.log(`🛤️  Critical Path: ${planner.getCriticalPath().join(' → ')}\n`);
    
    console.log('🎉 Strategic Planner Agent Demo Complete!');
    console.log('   Ready for GitHub-integrated parallel execution with worktrees');
    
  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    process.exit(1);
  }
}

// Run the demonstration
if (require.main === module) {
  demonstrateStrategicPlanner().catch(console.error);
}

module.exports = { demonstrateStrategicPlanner };