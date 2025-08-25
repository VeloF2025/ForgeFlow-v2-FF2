export interface ArchitecturalDecision {
  issueId: string;
  decisions: {
    overview: string;
    patterns: string[];
    rationale: string;
    scalability: ScalabilityPlan;
    performance: PerformancePlan;
  };
  timestamp: Date;
  constraints: ArchitecturalConstraint[];
}

export interface ComponentStructure {
  issueId: string;
  hierarchy: ComponentHierarchy;
  responsibilities: ComponentResponsibility[];
  dependencies: DependencyMapping;
  fileOrganization: FileStructure;
  interfaces: TypeScriptInterface[];
}

export interface APIContract {
  issueId: string;
  endpoints: RESTEndpoint[];
  requestResponseFormats: DataFormat[];
  errorStructures: ErrorResponse[];
  versioningStrategy: VersioningStrategy;
  securityRequirements: SecurityRequirement[];
}

export interface DataFlowDesign {
  issueId: string;
  stateManagement: StateManagementStrategy;
  transformationPipelines: DataPipeline[];
  cachingStrategy: CachingStrategy;
  errorPropagation: ErrorPropagationPattern;
  validationRules: ValidationRule[];
}

export interface ScalabilityPlan {
  horizontalScaling: boolean;
  verticalScaling: boolean;
  loadBalancing: string;
  caching: string[];
  databaseScaling: string;
  microservicesReady: boolean;
}

export interface PerformancePlan {
  pageLoadTarget: number; // <1.5s
  apiResponseTarget: number; // <200ms
  bundleSize: number;
  coreWebVitals: CoreWebVitalsTargets;
  optimizations: PerformanceOptimization[];
}

export interface CoreWebVitalsTargets {
  lcp: number; // Largest Contentful Paint
  fid: number; // First Input Delay
  cls: number; // Cumulative Layout Shift
}

export interface PerformanceOptimization {
  technique: string;
  impact: 'high' | 'medium' | 'low';
  implementation: string;
  metrics: string[];
}

export interface ArchitecturalConstraint {
  type: 'technical' | 'business' | 'security' | 'performance';
  description: string;
  impact: 'critical' | 'high' | 'medium' | 'low';
  mitigation?: string;
}

export interface ComponentHierarchy {
  root: ComponentNode;
  depth: number;
  totalComponents: number;
}

export interface ComponentNode {
  name: string;
  type: 'container' | 'presentation' | 'utility' | 'service';
  children: ComponentNode[];
  dependencies: string[];
  maxLines: number; // 300 line limit
}

export interface ComponentResponsibility {
  component: string;
  primary: string;
  secondary: string[];
  boundaries: string[];
}

export interface DependencyMapping {
  internal: InternalDependency[];
  external: ExternalDependency[];
  circular: CircularDependency[];
}

export interface InternalDependency {
  from: string;
  to: string;
  type: 'import' | 'composition' | 'inheritance';
  strength: 'tight' | 'loose';
}

export interface ExternalDependency {
  package: string;
  version: string;
  usage: string[];
  justification: string;
  alternatives: string[];
}

export interface CircularDependency {
  cycle: string[];
  severity: 'error' | 'warning';
  resolution: string;
}

export interface FileStructure {
  directories: DirectoryStructure[];
  namingConventions: NamingConvention[];
  maxFileSize: number; // 300 lines
  separationOfConcerns: boolean;
}

export interface DirectoryStructure {
  path: string;
  purpose: string;
  maxDepth: number;
  conventions: string[];
}

export interface NamingConvention {
  fileType: string;
  pattern: string;
  examples: string[];
}

export interface TypeScriptInterface {
  name: string;
  properties: PropertyDefinition[];
  extends?: string[];
  generics?: GenericConstraint[];
  documentation: string;
}

export interface PropertyDefinition {
  name: string;
  type: string;
  required: boolean;
  documentation: string;
  validation?: ValidationConstraint[];
}

export interface GenericConstraint {
  name: string;
  extends?: string;
  default?: string;
}

export interface ValidationConstraint {
  type: 'range' | 'length' | 'pattern' | 'custom';
  rule: string;
  message: string;
}

export interface RESTEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  requestSchema?: object;
  responseSchema: object;
  errorCodes: number[];
  rateLimit?: RateLimit;
  authentication: boolean;
}

export interface RateLimit {
  requests: number;
  window: string; // e.g., '1m', '1h'
  scope: 'ip' | 'user' | 'global';
}

export interface DataFormat {
  name: string;
  schema: object;
  validation: ValidationRule[];
  examples: object[];
}

export interface ErrorResponse {
  code: number;
  type: string;
  message: string;
  details?: object;
  timestamp: boolean;
  requestId: boolean;
}

export interface VersioningStrategy {
  type: 'header' | 'url' | 'parameter';
  current: string;
  supported: string[];
  deprecationPolicy: string;
  migrationGuide: string;
}

export interface SecurityRequirement {
  type: 'authentication' | 'authorization' | 'encryption' | 'validation';
  requirement: string;
  implementation: string;
  level: 'critical' | 'high' | 'medium' | 'low';
}

export interface StateManagementStrategy {
  type: 'redux' | 'zustand' | 'context' | 'local';
  structure: StateStructure;
  actions: ActionDefinition[];
  middleware: string[];
  persistence: boolean;
}

export interface StateStructure {
  entities: EntityDefinition[];
  ui: UIStateDefinition[];
  global: GlobalStateDefinition[];
}

export interface EntityDefinition {
  name: string;
  properties: PropertyDefinition[];
  relationships: EntityRelationship[];
}

export interface EntityRelationship {
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  target: string;
  foreignKey: string;
}

export interface UIStateDefinition {
  component: string;
  state: PropertyDefinition[];
  computed: ComputedProperty[];
}

export interface ComputedProperty {
  name: string;
  dependencies: string[];
  computation: string;
}

export interface GlobalStateDefinition {
  name: string;
  type: string;
  initialValue: any;
  persistence: boolean;
}

export interface ActionDefinition {
  name: string;
  payload?: PropertyDefinition;
  async: boolean;
  effects: string[];
}

export interface DataPipeline {
  name: string;
  input: DataSource;
  transformations: DataTransformation[];
  output: DataDestination;
  errorHandling: ErrorHandlingStrategy;
}

export interface DataSource {
  type: 'api' | 'database' | 'file' | 'stream';
  config: object;
  validation: ValidationRule[];
}

export interface DataTransformation {
  name: string;
  operation: string;
  parameters: object;
  validation: ValidationRule[];
}

export interface DataDestination {
  type: 'state' | 'database' | 'cache' | 'stream';
  config: object;
}

export interface ErrorHandlingStrategy {
  retry: RetryPolicy;
  fallback: FallbackStrategy;
  logging: LoggingStrategy;
  userFeedback: UserFeedbackStrategy;
}

export interface RetryPolicy {
  attempts: number;
  backoff: 'linear' | 'exponential';
  conditions: string[];
}

export interface FallbackStrategy {
  type: 'cache' | 'default' | 'redirect';
  config: object;
}

export interface LoggingStrategy {
  level: 'error' | 'warn' | 'info' | 'debug';
  destination: string[];
  structured: boolean;
}

export interface UserFeedbackStrategy {
  showErrors: boolean;
  messages: Record<string, string>;
  retryOptions: boolean;
}

export interface CachingStrategy {
  layers: CacheLayer[];
  invalidation: InvalidationStrategy;
  consistency: ConsistencyStrategy;
}

export interface CacheLayer {
  name: string;
  type: 'memory' | 'redis' | 'cdn' | 'browser';
  ttl: number;
  maxSize?: number;
  evictionPolicy: 'lru' | 'lfu' | 'ttl';
}

export interface InvalidationStrategy {
  type: 'time' | 'event' | 'manual';
  triggers: string[];
  cascading: boolean;
}

export interface ConsistencyStrategy {
  type: 'strong' | 'eventual' | 'weak';
  conflictResolution: string;
}

export interface ErrorPropagationPattern {
  boundaries: ErrorBoundary[];
  propagation: PropagationRule[];
  recovery: RecoveryStrategy[];
}

export interface ErrorBoundary {
  component: string;
  catches: string[];
  fallback: string;
  logging: boolean;
}

export interface PropagationRule {
  errorType: string;
  action: 'stop' | 'transform' | 'continue';
  target?: string;
}

export interface RecoveryStrategy {
  errorType: string;
  strategy: 'retry' | 'fallback' | 'redirect' | 'ignore';
  config: object;
}

export interface ValidationRule {
  field: string;
  type: 'required' | 'type' | 'format' | 'range' | 'custom';
  constraint: any;
  message: string;
  severity: 'error' | 'warning';
}

export interface MigrationPlan {
  phases: MigrationPhase[];
  rollbackStrategy: RollbackStrategy;
  testingStrategy: TestingStrategy;
  riskMitigation: RiskMitigation[];
}

export interface MigrationPhase {
  name: string;
  order: number;
  description: string;
  steps: MigrationStep[];
  dependencies: string[];
  rollbackPossible: boolean;
}

export interface MigrationStep {
  name: string;
  type: 'create' | 'modify' | 'delete' | 'migrate';
  target: string;
  validation: ValidationRule[];
  rollback: string;
}

export interface RollbackStrategy {
  automatic: boolean;
  triggers: string[];
  steps: RollbackStep[];
}

export interface RollbackStep {
  name: string;
  action: string;
  validation: string;
}

export interface TestingStrategy {
  phases: TestingPhase[];
  coverage: number; // >95%
  types: TestType[];
}

export interface TestingPhase {
  name: string;
  tests: string[];
  passingCriteria: string;
}

export interface TestType {
  type: 'unit' | 'integration' | 'e2e' | 'performance' | 'security';
  framework: string;
  coverage: number;
}

export interface RiskMitigation {
  risk: string;
  probability: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  mitigation: string;
  contingency: string;
}
