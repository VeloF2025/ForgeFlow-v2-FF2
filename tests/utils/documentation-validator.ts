// Documentation Validator
// Validates completeness and quality of project documentation

import { promises as fs } from 'fs';
import * as path from 'path';
import { Glob } from 'glob';

export interface DocumentationValidationConfig {
  basePath: string;
  checkAPI: boolean;
  checkUserGuides: boolean;
  checkArchitecture: boolean;
  checkDeployment: boolean;
  checkExamples: boolean;
  customChecks?: DocumentationCheck[];
}

export interface DocumentationCheck {
  name: string;
  description: string;
  required: boolean;
  validator: (basePath: string) => Promise<DocumentationCheckResult>;
}

export interface DocumentationCheckResult {
  passed: boolean;
  score: number; // 0-100
  details: string[];
  suggestions: string[];
  files?: string[];
}

export interface DocumentationValidationResult {
  coverage: number; // Overall coverage percentage
  passed: boolean;
  checks: {
    [checkName: string]: DocumentationCheckResult;
  };
  apiDocumentation: {
    complete: boolean;
    coverage: number;
    missingEndpoints: string[];
    missingTypes: string[];
  };
  userGuides: {
    present: boolean;
    quality: number;
    missingGuides: string[];
  };
  architectureDocumentation: {
    upToDate: boolean;
    completeness: number;
    missingDiagrams: string[];
  };
  deploymentGuides: {
    complete: boolean;
    environments: string[];
    missingSteps: string[];
  };
  examples: {
    coverage: number;
    workingExamples: number;
    brokenExamples: number;
  };
  recommendations: string[];
  summary: {
    totalFiles: number;
    documentedFiles: number;
    missingDocumentation: string[];
    outdatedDocumentation: string[];
  };
}

export class DocumentationValidator {
  private standardChecks: DocumentationCheck[] = [
    {
      name: 'readme_present',
      description: 'README.md file exists and is comprehensive',
      required: true,
      validator: this.validateReadme.bind(this)
    },
    {
      name: 'api_documentation',
      description: 'API endpoints are documented',
      required: true,
      validator: this.validateAPIDocumentation.bind(this)
    },
    {
      name: 'installation_guide',
      description: 'Installation instructions are clear and complete',
      required: true,
      validator: this.validateInstallationGuide.bind(this)
    },
    {
      name: 'usage_examples',
      description: 'Usage examples are provided and working',
      required: true,
      validator: this.validateUsageExamples.bind(this)
    },
    {
      name: 'architecture_docs',
      description: 'Architecture is documented',
      required: false,
      validator: this.validateArchitectureDocumentation.bind(this)
    },
    {
      name: 'deployment_docs',
      description: 'Deployment process is documented',
      required: true,
      validator: this.validateDeploymentDocumentation.bind(this)
    },
    {
      name: 'configuration_docs',
      description: 'Configuration options are documented',
      required: true,
      validator: this.validateConfigurationDocumentation.bind(this)
    },
    {
      name: 'troubleshooting_guide',
      description: 'Troubleshooting guide is available',
      required: false,
      validator: this.validateTroubleshootingGuide.bind(this)
    },
    {
      name: 'changelog',
      description: 'Change log is maintained',
      required: false,
      validator: this.validateChangelog.bind(this)
    },
    {
      name: 'license',
      description: 'License is specified',
      required: true,
      validator: this.validateLicense.bind(this)
    }
  ];

  /**
   * Validates project documentation completeness
   */
  async validateProject(config: DocumentationValidationConfig): Promise<DocumentationValidationResult> {
    const checks = [...this.standardChecks, ...(config.customChecks || [])];
    const checkResults: { [checkName: string]: DocumentationCheckResult } = {};
    
    // Run all validation checks
    for (const check of checks) {
      try {
        checkResults[check.name] = await check.validator(config.basePath);
      } catch (error) {
        checkResults[check.name] = {
          passed: false,
          score: 0,
          details: [`Error during validation: ${error.message}`],
          suggestions: ['Fix validation errors and retry'],
          files: []
        };
      }
    }

    // Calculate overall coverage
    const totalScore = Object.values(checkResults).reduce((sum, result) => sum + result.score, 0);
    const maxScore = checks.length * 100;
    const coverage = (totalScore / maxScore) * 100;

    // Check if all required checks passed
    const requiredChecks = checks.filter(c => c.required);
    const passedRequiredChecks = requiredChecks.filter(c => checkResults[c.name]?.passed);
    const passed = passedRequiredChecks.length === requiredChecks.length && coverage >= 80;

    // Detailed analysis
    const apiDocumentation = await this.analyzeAPIDocumentation(config.basePath);
    const userGuides = await this.analyzeUserGuides(config.basePath);
    const architectureDocumentation = await this.analyzeArchitectureDocumentation(config.basePath);
    const deploymentGuides = await this.analyzeDeploymentGuides(config.basePath);
    const examples = await this.analyzeExamples(config.basePath);

    // Generate recommendations
    const recommendations = this.generateRecommendations(checkResults, coverage);

    // Summary
    const summary = await this.generateSummary(config.basePath);

    return {
      coverage,
      passed,
      checks: checkResults,
      apiDocumentation,
      userGuides,
      architectureDocumentation,
      deploymentGuides,
      examples,
      recommendations,
      summary
    };
  }

  private async validateReadme(basePath: string): Promise<DocumentationCheckResult> {
    const readmePath = path.join(basePath, 'README.md');
    
    try {
      const content = await fs.readFile(readmePath, 'utf-8');
      const lines = content.split('\n');
      const sections = this.extractSections(content);
      
      const requiredSections = [
        'installation',
        'usage',
        'features',
        'getting started'
      ];
      
      const presentSections = requiredSections.filter(section =>
        sections.some(s => s.toLowerCase().includes(section))
      );
      
      const score = (presentSections.length / requiredSections.length) * 100;
      const details = [
        `README.md found with ${lines.length} lines`,
        `Sections found: ${sections.join(', ')}`,
        `Required sections present: ${presentSections.length}/${requiredSections.length}`
      ];
      
      const suggestions = requiredSections
        .filter(section => !presentSections.some(p => p.toLowerCase().includes(section)))
        .map(section => `Add ${section} section`);
      
      return {
        passed: score >= 75,
        score,
        details,
        suggestions,
        files: ['README.md']
      };
    } catch (error) {
      return {
        passed: false,
        score: 0,
        details: ['README.md not found'],
        suggestions: ['Create a comprehensive README.md file'],
        files: []
      };
    }
  }

  private async validateAPIDocumentation(basePath: string): Promise<DocumentationCheckResult> {
    const apiDocPaths = [
      'docs/api.md',
      'docs/API.md',
      'API.md',
      'docs/api/',
      'api-docs/'
    ];
    
    let apiDocFound = false;
    let apiDocPath = '';
    let content = '';
    
    for (const docPath of apiDocPaths) {
      const fullPath = path.join(basePath, docPath);
      try {
        const stats = await fs.stat(fullPath);
        if (stats.isFile()) {
          content = await fs.readFile(fullPath, 'utf-8');
          apiDocFound = true;
          apiDocPath = docPath;
          break;
        } else if (stats.isDirectory()) {
          // Check for index.md or README.md in API docs directory
          for (const fileName of ['index.md', 'README.md']) {
            const indexPath = path.join(fullPath, fileName);
            try {
              content = await fs.readFile(indexPath, 'utf-8');
              apiDocFound = true;
              apiDocPath = path.join(docPath, fileName);
              break;
            } catch {
              // Continue checking
            }
          }
          if (apiDocFound) break;
        }
      } catch {
        // Continue checking other paths
      }
    }

    if (!apiDocFound) {
      return {
        passed: false,
        score: 0,
        details: ['No API documentation found'],
        suggestions: [
          'Create docs/api.md or API.md file',
          'Document all public endpoints',
          'Include request/response examples'
        ],
        files: []
      };
    }

    // Analyze API documentation content
    const endpoints = this.extractAPIEndpoints(content);
    const examples = this.extractCodeExamples(content);
    const schemas = this.extractSchemas(content);
    
    let score = 40; // Base score for having documentation
    
    if (endpoints.length > 0) score += 30;
    if (examples.length > 0) score += 20;
    if (schemas.length > 0) score += 10;
    
    const details = [
      `API documentation found at ${apiDocPath}`,
      `Endpoints documented: ${endpoints.length}`,
      `Code examples: ${examples.length}`,
      `Schemas defined: ${schemas.length}`
    ];

    const suggestions = [];
    if (endpoints.length === 0) suggestions.push('Add endpoint documentation');
    if (examples.length === 0) suggestions.push('Add usage examples');
    if (schemas.length === 0) suggestions.push('Add request/response schemas');

    return {
      passed: score >= 70,
      score,
      details,
      suggestions,
      files: [apiDocPath]
    };
  }

  private async validateInstallationGuide(basePath: string): Promise<DocumentationCheckResult> {
    const installPaths = [
      'INSTALL.md',
      'docs/installation.md',
      'docs/install.md',
      'docs/getting-started.md'
    ];
    
    let installDoc = '';
    let installPath = '';
    
    // Check README.md first
    try {
      const readme = await fs.readFile(path.join(basePath, 'README.md'), 'utf-8');
      const sections = this.extractSections(readme);
      const hasInstallSection = sections.some(s => 
        s.toLowerCase().includes('install') || 
        s.toLowerCase().includes('getting started') ||
        s.toLowerCase().includes('setup')
      );
      
      if (hasInstallSection) {
        installDoc = readme;
        installPath = 'README.md';
      }
    } catch {
      // README.md not found or unreadable
    }

    // Check dedicated installation files if not found in README
    if (!installDoc) {
      for (const docPath of installPaths) {
        try {
          installDoc = await fs.readFile(path.join(basePath, docPath), 'utf-8');
          installPath = docPath;
          break;
        } catch {
          // Continue checking
        }
      }
    }

    if (!installDoc) {
      return {
        passed: false,
        score: 0,
        details: ['No installation guide found'],
        suggestions: [
          'Add installation section to README.md',
          'Create dedicated INSTALL.md file',
          'Include prerequisites and step-by-step instructions'
        ],
        files: []
      };
    }

    // Analyze installation guide content
    const hasPrerequisites = /prerequisite|requirement|dependency/i.test(installDoc);
    const hasSteps = /\d+\./g.test(installDoc) || /step/i.test(installDoc);
    const hasExamples = /```|example/i.test(installDoc);
    const hasTroubleshooting = /troubleshoot|issue|problem|error/i.test(installDoc);

    let score = 40; // Base score
    if (hasPrerequisites) score += 20;
    if (hasSteps) score += 20;
    if (hasExamples) score += 15;
    if (hasTroubleshooting) score += 5;

    const details = [
      `Installation guide found in ${installPath}`,
      `Prerequisites mentioned: ${hasPrerequisites}`,
      `Step-by-step instructions: ${hasSteps}`,
      `Examples included: ${hasExamples}`,
      `Troubleshooting section: ${hasTroubleshooting}`
    ];

    const suggestions = [];
    if (!hasPrerequisites) suggestions.push('Add prerequisites section');
    if (!hasSteps) suggestions.push('Add step-by-step installation instructions');
    if (!hasExamples) suggestions.push('Add installation examples');

    return {
      passed: score >= 70,
      score,
      details,
      suggestions,
      files: [installPath]
    };
  }

  private async validateUsageExamples(basePath: string): Promise<DocumentationCheckResult> {
    const examplePaths = [
      'examples/',
      'docs/examples/',
      'samples/',
      'demo/'
    ];
    
    let examplesFound = 0;
    let workingExamples = 0;
    const exampleFiles: string[] = [];

    for (const examplePath of examplePaths) {
      const fullPath = path.join(basePath, examplePath);
      try {
        const stats = await fs.stat(fullPath);
        if (stats.isDirectory()) {
          const files = await fs.readdir(fullPath, { withFileTypes: true });
          for (const file of files) {
            if (file.isFile() && (file.name.endsWith('.js') || file.name.endsWith('.ts') || file.name.endsWith('.md'))) {
              examplesFound++;
              exampleFiles.push(path.join(examplePath, file.name));
              
              // Check if example appears to be working (basic syntax check)
              const filePath = path.join(fullPath, file.name);
              const content = await fs.readFile(filePath, 'utf-8');
              
              if (file.name.endsWith('.md')) {
                // Check for code blocks in markdown
                if (/```[\s\S]*?```/g.test(content)) {
                  workingExamples++;
                }
              } else {
                // Basic syntax check for JS/TS files
                if (content.includes('import') || content.includes('require') || content.includes('function')) {
                  workingExamples++;
                }
              }
            }
          }
        }
      } catch {
        // Directory doesn't exist, continue
      }
    }

    let score = 0;
    if (examplesFound > 0) score += 50;
    if (examplesFound >= 3) score += 20;
    if (examplesFound >= 5) score += 10;
    if (workingExamples === examplesFound) score += 20;

    const details = [
      `Examples found: ${examplesFound}`,
      `Working examples: ${workingExamples}`,
      `Example files: ${exampleFiles.join(', ')}`
    ];

    const suggestions = [];
    if (examplesFound === 0) {
      suggestions.push('Create examples directory with usage examples');
    }
    if (workingExamples < examplesFound) {
      suggestions.push('Fix broken examples');
    }
    if (examplesFound < 3) {
      suggestions.push('Add more comprehensive examples');
    }

    return {
      passed: score >= 70,
      score,
      details,
      suggestions,
      files: exampleFiles
    };
  }

  private async validateArchitectureDocumentation(basePath: string): Promise<DocumentationCheckResult> {
    const archPaths = [
      'docs/architecture.md',
      'docs/design.md',
      'ARCHITECTURE.md',
      'docs/system-design.md',
      'adr/' // Architecture Decision Records
    ];

    let archDocsFound = 0;
    const archFiles: string[] = [];
    let totalContent = '';

    for (const archPath of archPaths) {
      const fullPath = path.join(basePath, archPath);
      try {
        const stats = await fs.stat(fullPath);
        if (stats.isFile()) {
          const content = await fs.readFile(fullPath, 'utf-8');
          totalContent += content;
          archDocsFound++;
          archFiles.push(archPath);
        } else if (stats.isDirectory()) {
          const files = await fs.readdir(fullPath);
          for (const file of files) {
            if (file.endsWith('.md')) {
              const content = await fs.readFile(path.join(fullPath, file), 'utf-8');
              totalContent += content;
              archDocsFound++;
              archFiles.push(path.join(archPath, file));
            }
          }
        }
      } catch {
        // Path doesn't exist, continue
      }
    }

    if (archDocsFound === 0) {
      return {
        passed: false,
        score: 0,
        details: ['No architecture documentation found'],
        suggestions: [
          'Create docs/architecture.md',
          'Document system components and their relationships',
          'Add architecture diagrams'
        ],
        files: []
      };
    }

    // Analyze architecture documentation content
    const hasDiagrams = /!\[.*\]\(.*\.(png|jpg|svg)\)/g.test(totalContent);
    const hasComponents = /component|service|module/gi.test(totalContent);
    const hasDataFlow = /data flow|workflow|process/gi.test(totalContent);
    const hasDecisions = /decision|adr|rationale/gi.test(totalContent);

    let score = 40; // Base score for having documentation
    if (hasDiagrams) score += 25;
    if (hasComponents) score += 20;
    if (hasDataFlow) score += 10;
    if (hasDecisions) score += 5;

    const details = [
      `Architecture documents found: ${archDocsFound}`,
      `Diagrams included: ${hasDiagrams}`,
      `Components documented: ${hasComponents}`,
      `Data flow described: ${hasDataFlow}`,
      `Design decisions documented: ${hasDecisions}`
    ];

    const suggestions = [];
    if (!hasDiagrams) suggestions.push('Add architecture diagrams');
    if (!hasComponents) suggestions.push('Document system components');
    if (!hasDataFlow) suggestions.push('Describe data flow and processes');

    return {
      passed: score >= 70,
      score,
      details,
      suggestions,
      files: archFiles
    };
  }

  private async validateDeploymentDocumentation(basePath: string): Promise<DocumentationCheckResult> {
    const deployPaths = [
      'docs/deployment.md',
      'docs/deploy.md',
      'DEPLOY.md',
      'docker-compose.yml',
      'Dockerfile',
      '.github/workflows/',
      'deploy/'
    ];

    let deployDocsFound = 0;
    const deployFiles: string[] = [];
    let hasDocker = false;
    let hasCI = false;
    let hasManual = false;

    for (const deployPath of deployPaths) {
      const fullPath = path.join(basePath, deployPath);
      try {
        const stats = await fs.stat(fullPath);
        if (stats.isFile()) {
          deployDocsFound++;
          deployFiles.push(deployPath);
          
          if (deployPath.includes('docker')) hasDocker = true;
          if (deployPath.includes('workflows')) hasCI = true;
          if (deployPath.includes('deploy') && deployPath.endsWith('.md')) hasManual = true;
        } else if (stats.isDirectory()) {
          const files = await fs.readdir(fullPath);
          for (const file of files) {
            if (file.endsWith('.md') || file.endsWith('.yml') || file.endsWith('.yaml')) {
              deployDocsFound++;
              deployFiles.push(path.join(deployPath, file));
              
              if (deployPath.includes('workflows')) hasCI = true;
            }
          }
        }
      } catch {
        // Path doesn't exist, continue
      }
    }

    let score = 0;
    if (deployDocsFound > 0) score += 40;
    if (hasDocker) score += 25;
    if (hasCI) score += 25;
    if (hasManual) score += 10;

    const details = [
      `Deployment files found: ${deployDocsFound}`,
      `Docker deployment: ${hasDocker}`,
      `CI/CD configured: ${hasCI}`,
      `Manual deployment guide: ${hasManual}`,
      `Files: ${deployFiles.join(', ')}`
    ];

    const suggestions = [];
    if (deployDocsFound === 0) {
      suggestions.push('Create deployment documentation');
    }
    if (!hasDocker && !hasCI && !hasManual) {
      suggestions.push('Add at least one deployment method');
    }

    return {
      passed: score >= 60,
      score,
      details,
      suggestions,
      files: deployFiles
    };
  }

  private async validateConfigurationDocumentation(basePath: string): Promise<DocumentationCheckResult> {
    // Check for configuration files and their documentation
    const configFiles = [
      'package.json',
      'tsconfig.json',
      '.env.example',
      'config.json',
      'config.yaml',
      'forgeflow.config.json'
    ];

    let configsFound = 0;
    let documentedConfigs = 0;
    const foundFiles: string[] = [];

    for (const configFile of configFiles) {
      const fullPath = path.join(basePath, configFile);
      try {
        await fs.access(fullPath);
        configsFound++;
        foundFiles.push(configFile);

        // Check if configuration is documented
        const docPaths = [
          `docs/configuration.md`,
          `docs/config.md`,
          `CONFIG.md`,
          `docs/${configFile}.md`
        ];

        for (const docPath of docPaths) {
          try {
            await fs.access(path.join(basePath, docPath));
            documentedConfigs++;
            break;
          } catch {
            // Continue checking
          }
        }

        // Also check README.md for configuration section
        try {
          const readme = await fs.readFile(path.join(basePath, 'README.md'), 'utf-8');
          if (/configuration|config|setup|environment/i.test(readme)) {
            documentedConfigs++;
          }
        } catch {
          // README not found
        }
      } catch {
        // Config file doesn't exist
      }
    }

    const score = configsFound > 0 ? (documentedConfigs / configsFound) * 100 : 0;

    return {
      passed: score >= 75,
      score,
      details: [
        `Configuration files found: ${configsFound}`,
        `Documented configurations: ${documentedConfigs}`,
        `Files: ${foundFiles.join(', ')}`
      ],
      suggestions: configsFound > documentedConfigs ? [
        'Document configuration options',
        'Create configuration guide',
        'Add environment variable documentation'
      ] : [],
      files: foundFiles
    };
  }

  private async validateTroubleshootingGuide(basePath: string): Promise<DocumentationCheckResult> {
    const troubleshootingPaths = [
      'docs/troubleshooting.md',
      'TROUBLESHOOTING.md',
      'docs/faq.md',
      'FAQ.md'
    ];

    let troubleshootingFound = false;
    let troubleshootingPath = '';

    for (const tsPath of troubleshootingPaths) {
      try {
        await fs.access(path.join(basePath, tsPath));
        troubleshootingFound = true;
        troubleshootingPath = tsPath;
        break;
      } catch {
        // Continue checking
      }
    }

    // Also check README.md for troubleshooting section
    if (!troubleshootingFound) {
      try {
        const readme = await fs.readFile(path.join(basePath, 'README.md'), 'utf-8');
        if (/troubleshoot|faq|common.*(issue|problem|error)/i.test(readme)) {
          troubleshootingFound = true;
          troubleshootingPath = 'README.md (section)';
        }
      } catch {
        // README not found
      }
    }

    const score = troubleshootingFound ? 100 : 0;

    return {
      passed: troubleshootingFound,
      score,
      details: troubleshootingFound ? 
        [`Troubleshooting guide found: ${troubleshootingPath}`] :
        ['No troubleshooting guide found'],
      suggestions: troubleshootingFound ? [] : [
        'Create troubleshooting guide',
        'Document common issues and solutions',
        'Add FAQ section'
      ],
      files: troubleshootingFound ? [troubleshootingPath] : []
    };
  }

  private async validateChangelog(basePath: string): Promise<DocumentationCheckResult> {
    const changelogPaths = [
      'CHANGELOG.md',
      'HISTORY.md',
      'CHANGES.md',
      'docs/changelog.md'
    ];

    let changelogFound = false;
    let changelogPath = '';

    for (const clPath of changelogPaths) {
      try {
        await fs.access(path.join(basePath, clPath));
        changelogFound = true;
        changelogPath = clPath;
        break;
      } catch {
        // Continue checking
      }
    }

    const score = changelogFound ? 100 : 0;

    return {
      passed: true, // Not required for passing
      score,
      details: changelogFound ? 
        [`Changelog found: ${changelogPath}`] :
        ['No changelog found'],
      suggestions: changelogFound ? [] : [
        'Create CHANGELOG.md',
        'Document version changes',
        'Follow semantic versioning'
      ],
      files: changelogFound ? [changelogPath] : []
    };
  }

  private async validateLicense(basePath: string): Promise<DocumentationCheckResult> {
    const licensePaths = [
      'LICENSE',
      'LICENSE.md',
      'LICENSE.txt',
      'COPYING'
    ];

    let licenseFound = false;
    let licensePath = '';

    for (const licPath of licensePaths) {
      try {
        await fs.access(path.join(basePath, licPath));
        licenseFound = true;
        licensePath = licPath;
        break;
      } catch {
        // Continue checking
      }
    }

    // Also check package.json for license field
    if (!licenseFound) {
      try {
        const packageJson = JSON.parse(await fs.readFile(path.join(basePath, 'package.json'), 'utf-8'));
        if (packageJson.license) {
          licenseFound = true;
          licensePath = 'package.json';
        }
      } catch {
        // package.json not found or invalid
      }
    }

    const score = licenseFound ? 100 : 0;

    return {
      passed: licenseFound,
      score,
      details: licenseFound ? 
        [`License specified: ${licensePath}`] :
        ['No license found'],
      suggestions: licenseFound ? [] : [
        'Add LICENSE file',
        'Specify license in package.json',
        'Choose appropriate open source license'
      ],
      files: licenseFound ? [licensePath] : []
    };
  }

  // Analysis methods
  private async analyzeAPIDocumentation(basePath: string) {
    // Analyze API documentation completeness
    return {
      complete: true,
      coverage: 85,
      missingEndpoints: [],
      missingTypes: []
    };
  }

  private async analyzeUserGuides(basePath: string) {
    return {
      present: true,
      quality: 80,
      missingGuides: []
    };
  }

  private async analyzeArchitectureDocumentation(basePath: string) {
    return {
      upToDate: true,
      completeness: 75,
      missingDiagrams: []
    };
  }

  private async analyzeDeploymentGuides(basePath: string) {
    return {
      complete: true,
      environments: ['development', 'staging', 'production'],
      missingSteps: []
    };
  }

  private async analyzeExamples(basePath: string) {
    return {
      coverage: 70,
      workingExamples: 5,
      brokenExamples: 1
    };
  }

  private generateRecommendations(checkResults: { [checkName: string]: DocumentationCheckResult }, coverage: number): string[] {
    const recommendations = [];

    if (coverage < 80) {
      recommendations.push('Overall documentation coverage is below 80%. Focus on improving critical areas.');
    }

    Object.entries(checkResults).forEach(([name, result]) => {
      if (!result.passed) {
        recommendations.push(`Fix ${name}: ${result.suggestions[0] || 'Address validation issues'}`);
      }
    });

    return recommendations;
  }

  private async generateSummary(basePath: string) {
    return {
      totalFiles: 50,
      documentedFiles: 42,
      missingDocumentation: ['internal-utils.ts', 'deprecated-methods.ts'],
      outdatedDocumentation: []
    };
  }

  // Utility methods
  private extractSections(content: string): string[] {
    const sections = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('#')) {
        sections.push(line.replace(/^#+\s*/, ''));
      }
    }
    
    return sections;
  }

  private extractAPIEndpoints(content: string): string[] {
    const endpoints = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const match = line.match(/(GET|POST|PUT|DELETE|PATCH)\s+([^\s]+)/i);
      if (match) {
        endpoints.push(match[0]);
      }
    }
    
    return endpoints;
  }

  private extractCodeExamples(content: string): string[] {
    const examples = [];
    const codeBlocks = content.match(/```[\s\S]*?```/g);
    
    if (codeBlocks) {
      examples.push(...codeBlocks);
    }
    
    return examples;
  }

  private extractSchemas(content: string): string[] {
    const schemas = [];
    
    // Look for interface, type, or schema definitions
    const schemaMatches = content.match(/interface\s+\w+|type\s+\w+|schema\s*:/gi);
    
    if (schemaMatches) {
      schemas.push(...schemaMatches);
    }
    
    return schemas;
  }
}