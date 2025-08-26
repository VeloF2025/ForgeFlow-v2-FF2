/**
 * System Hardening Module Index
 * Exports all hardening components for ForgeFlow v2
 */

// Production-grade hardening components
export { ProductionSystemHealthMonitor, DEFAULT_PRODUCTION_HEALTH_CONFIG } from './production-health-monitor';
export { BulletproofSelfHealingSystem, DEFAULT_SELF_HEALING_CONFIG } from './bulletproof-self-healing';
export { ProductionDataProtectionLayer, DEFAULT_DATA_PROTECTION_CONFIG } from './production-data-protection';

// Unified hardening manager
export { UnifiedSystemHardeningManager, DEFAULT_UNIFIED_HARDENING_CONFIG } from './unified-system-hardening-manager';

// Legacy components (for backward compatibility)
export { SystemHealthMonitor, DEFAULT_HEALTH_CONFIG } from './system-health-monitor';
export { SelfHealingSystem, DEFAULT_SELF_HEALING_CONFIG as LEGACY_SELF_HEALING_CONFIG } from './self-healing-system';
export { DataProtectionLayer, DEFAULT_DATA_PROTECTION_CONFIG as LEGACY_DATA_PROTECTION_CONFIG } from './data-protection-layer';
export { GracefulDegradationSystem, DEFAULT_DEGRADATION_CONFIG } from './graceful-degradation';
export { SystemHardeningManager, createDefaultSystemHardeningConfig } from './system-hardening-manager';

// Production hardening types
export type {
  // Production Health Monitor types
  ProductionHealthConfig,
  SystemHealthMetrics,
  ComponentHealth,
  ResourceMetrics,
  DataIntegrityIssue,
  SystemAlert,
} from './production-health-monitor';

export type {
  // Bulletproof Self Healing types
  SelfHealingConfig,
  RecoveryActionType,
  RecoveryTrigger,
  RecoveryContext,
  RecoveryStrategy,
  RecoveryExecution,
  RecoveryPattern,
} from './bulletproof-self-healing';

export type {
  // Production Data Protection types
  DataProtectionConfig,
  DataType,
  BackupType,
  DataBackup,
  DataOperation,
  IntegrityCheck,
  RecoveryPlan,
  RecoveryStep,
  RecoveryTest,
} from './production-data-protection';

export type {
  // Unified Hardening Manager types
  UnifiedHardeningConfig,
  SystemHardeningMetrics,
  SystemHardeningEvent,
  EmergencyProcedure,
} from './unified-system-hardening-manager';

// Legacy types (for backward compatibility)
export type {
  // Legacy Health Monitor types
  SystemHealthConfig,
  HealthIssue,
} from './system-health-monitor';

export type {
  // Legacy Self Healing types
  RecoveryAction,
} from './self-healing-system';

export type {
  // Legacy Data Protection types
  DataRecoveryPlan,
} from './data-protection-layer';

export type {
  // Graceful Degradation types
  DegradationConfig,
  ComponentPriority,
  FallbackStrategy,
  DegradationState,
  DegradationLevel,
  ActiveStrategy,
} from './graceful-degradation';

export type {
  // Legacy System Hardening Manager types
  SystemHardeningConfig,
} from './system-hardening-manager';

// Utility function to create a production-grade hardened system
export async function createHardenedSystem(
  components: {
    orchestrator?: any;
    memoryManager?: any;
    knowledgeManager?: any;
    worktreeManager?: any;
    circuitBreaker?: any;
  },
  customConfig?: Partial<UnifiedHardeningConfig>
) {
  const { UnifiedSystemHardeningManager, DEFAULT_UNIFIED_HARDENING_CONFIG } = await import('./unified-system-hardening-manager');
  
  const config = customConfig 
    ? { ...DEFAULT_UNIFIED_HARDENING_CONFIG, ...customConfig }
    : DEFAULT_UNIFIED_HARDENING_CONFIG;

  const hardeningManager = new UnifiedSystemHardeningManager(config, components);

  await hardeningManager.initialize();

  return {
    hardeningManager,
    getStatus: () => hardeningManager.getSystemStatus(),
    getMetrics: () => hardeningManager.getCurrentMetrics(),
    shutdown: () => hardeningManager.shutdown(),
  };
}

// Legacy function for backward compatibility
export async function createLegacyHardenedSystem(
  components: {
    orchestrator?: any;
    memoryManager?: any;
    knowledgeManager?: any;
    worktreeManager?: any;
    circuitBreaker?: any;
  },
  customConfig?: Partial<SystemHardeningConfig>
) {
  const { SystemHardeningManager, createDefaultSystemHardeningConfig } = await import('./system-hardening-manager');
  
  const config = customConfig 
    ? { ...createDefaultSystemHardeningConfig(), ...customConfig }
    : createDefaultSystemHardeningConfig();

  const hardeningManager = new SystemHardeningManager(
    config,
    components.orchestrator,
    components.memoryManager,
    components.knowledgeManager,
    components.worktreeManager,
    components.circuitBreaker,
  );

  await hardeningManager.initialize();

  return {
    hardeningManager,
    getStatus: () => hardeningManager.getSystemStatus(),
    getMetrics: () => hardeningManager.getCurrentMetrics(),
    shutdown: () => hardeningManager.shutdown(),
  };
}