// 🟢 WORKING: README Generator Custom Agent Implementation
// Example implementation of a custom agent that generates README files

const fs = require('fs').promises;
const path = require('path');
const { glob } = require('glob');

class ReadmeGeneratorAgent {
  constructor(config = {}) {
    this.config = {
      includeInstallation: true,
      includeUsage: true,
      includeLicense: true,
      includeBadges: true,
      template: 'standard',
      ...config
    };
    this.generatedSections = 0;
  }

  async execute(issueId, worktreeId, context) {
    const { logger, utils } = context;
    
    logger.info('Starting README generation', { 
      issueId, 
      worktreeId, 
      template: this.config.template 
    });

    try {
      // 🟢 WORKING: Analyze project structure
      const projectInfo = await this.analyzeProject(worktreeId, utils);
      
      // 🟢 WORKING: Generate README content
      const readmeContent = await this.generateReadmeContent(projectInfo, logger);
      
      // 🟢 WORKING: Write README file
      const readmePath = path.join(worktreeId, 'README.md');
      await utils.writeFile(readmePath, readmeContent);
      
      // 🟢 WORKING: Validate generated README
      await this.validateReadme(readmeContent, logger);
      
      logger.info('README generation completed successfully', {
        sections: this.generatedSections,
        path: readmePath
      });

    } catch (error) {
      logger.error('README generation failed', error);
      throw error;
    }
  }

  async analyzeProject(worktreeId, utils) {
    const projectInfo = {
      name: '',
      description: '',
      type: 'unknown',
      packageManager: 'npm',
      hasTests: false,
      hasDocumentation: false,
      dependencies: [],
      scripts: {},
      license: '',
      author: '',
      repository: ''
    };

    try {
      // 🟢 WORKING: Check for package.json
      const packageJsonPath = path.join(worktreeId, 'package.json');
      try {
        const packageContent = await utils.readFile(packageJsonPath);
        const packageJson = JSON.parse(packageContent);
        
        projectInfo.name = packageJson.name || path.basename(worktreeId);
        projectInfo.description = packageJson.description || '';
        projectInfo.license = packageJson.license || 'MIT';
        projectInfo.author = packageJson.author || '';
        projectInfo.repository = packageJson.repository?.url || '';
        projectInfo.scripts = packageJson.scripts || {};
        projectInfo.dependencies = Object.keys(packageJson.dependencies || {});
        projectInfo.type = 'nodejs';
      } catch {
        // No package.json found
      }

      // 🟢 WORKING: Detect project type
      if (!projectInfo.type || projectInfo.type === 'unknown') {
        projectInfo.type = await this.detectProjectType(worktreeId, utils);
      }

      // 🟢 WORKING: Check for tests
      const testPatterns = ['test/**/*', 'tests/**/*', '**/*.test.*', '**/*.spec.*'];
      for (const pattern of testPatterns) {
        const testFiles = await glob(pattern, { cwd: worktreeId });
        if (testFiles.length > 0) {
          projectInfo.hasTests = true;
          break;
        }
      }

      // 🟢 WORKING: Check for existing documentation
      const docPatterns = ['docs/**/*', 'documentation/**/*', '*.md'];
      for (const pattern of docPatterns) {
        const docFiles = await glob(pattern, { cwd: worktreeId });
        if (docFiles.length > 0) {
          projectInfo.hasDocumentation = true;
          break;
        }
      }

    } catch (error) {
      console.warn('Error analyzing project:', error.message);
    }

    return projectInfo;
  }

  async detectProjectType(worktreeId, utils) {
    const indicators = [
      { files: ['package.json'], type: 'nodejs' },
      { files: ['requirements.txt', 'setup.py', 'pyproject.toml'], type: 'python' },
      { files: ['Cargo.toml'], type: 'rust' },
      { files: ['go.mod'], type: 'golang' },
      { files: ['pom.xml', 'build.gradle'], type: 'java' },
      { files: ['*.csproj', '*.sln'], type: 'dotnet' },
      { files: ['Dockerfile'], type: 'docker' }
    ];

    for (const indicator of indicators) {
      for (const file of indicator.files) {
        try {
          const files = await glob(file, { cwd: worktreeId });
          if (files.length > 0) {
            return indicator.type;
          }
        } catch {
          // Continue checking
        }
      }
    }

    return 'generic';
  }

  async generateReadmeContent(projectInfo, logger) {
    let content = '';
    
    // 🟢 WORKING: Generate content based on template
    switch (this.config.template) {
      case 'minimal':
        content = await this.generateMinimalTemplate(projectInfo);
        break;
      case 'comprehensive':
        content = await this.generateComprehensiveTemplate(projectInfo);
        break;
      default:
        content = await this.generateStandardTemplate(projectInfo);
    }

    logger.debug('Generated README content', { 
      length: content.length,
      sections: this.generatedSections 
    });

    return content;
  }

  async generateStandardTemplate(projectInfo) {
    let content = '';
    
    // 🟢 WORKING: Title and badges
    if (this.config.includeBadges) {
      content += this.generateBadges(projectInfo);
      this.generatedSections++;
    }

    content += `# ${projectInfo.name}\n\n`;
    
    if (projectInfo.description) {
      content += `${projectInfo.description}\n\n`;
    }

    // 🟢 WORKING: Table of contents
    content += this.generateTableOfContents();
    this.generatedSections++;

    // 🟢 WORKING: Installation
    if (this.config.includeInstallation) {
      content += this.generateInstallationSection(projectInfo);
      this.generatedSections++;
    }

    // 🟢 WORKING: Usage
    if (this.config.includeUsage) {
      content += this.generateUsageSection(projectInfo);
      this.generatedSections++;
    }

    // 🟢 WORKING: API Documentation
    content += this.generateApiSection(projectInfo);
    this.generatedSections++;

    // 🟢 WORKING: Testing
    if (projectInfo.hasTests) {
      content += this.generateTestingSection(projectInfo);
      this.generatedSections++;
    }

    // 🟢 WORKING: Contributing
    content += this.generateContributingSection();
    this.generatedSections++;

    // 🟢 WORKING: License
    if (this.config.includeLicense) {
      content += this.generateLicenseSection(projectInfo);
      this.generatedSections++;
    }

    return content;
  }

  generateBadges(projectInfo) {
    let badges = '';
    
    // 🟢 WORKING: Common badges
    if (projectInfo.repository) {
      const repoUrl = projectInfo.repository.replace('.git', '');
      badges += `[![Build Status](${repoUrl}/workflows/CI/badge.svg)](${repoUrl}/actions)\n`;
      badges += `[![Coverage Status](https://img.shields.io/codecov/c/github/${this.extractGithubPath(repoUrl)})](https://codecov.io/github/${this.extractGithubPath(repoUrl)})\n`;
    }

    if (projectInfo.type === 'nodejs') {
      badges += `[![npm version](https://img.shields.io/npm/v/${projectInfo.name}.svg)](https://www.npmjs.com/package/${projectInfo.name})\n`;
      badges += `[![Node.js Version](https://img.shields.io/node/v/${projectInfo.name}.svg)](https://nodejs.org/)\n`;
    }

    if (projectInfo.license) {
      badges += `[![License](https://img.shields.io/badge/license-${projectInfo.license}-blue.svg)](LICENSE)\n`;
    }

    return badges + '\n';
  }

  generateTableOfContents() {
    return `## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

`;
  }

  generateInstallationSection(projectInfo) {
    let installation = `## Installation\n\n`;

    switch (projectInfo.type) {
      case 'nodejs':
        installation += `\`\`\`bash\nnpm install ${projectInfo.name}\n\`\`\`\n\n`;
        installation += `Or with yarn:\n\n`;
        installation += `\`\`\`bash\nyarn add ${projectInfo.name}\n\`\`\`\n\n`;
        break;
      
      case 'python':
        installation += `\`\`\`bash\npip install ${projectInfo.name}\n\`\`\`\n\n`;
        break;
        
      case 'rust':
        installation += `Add this to your \`Cargo.toml\`:\n\n`;
        installation += `\`\`\`toml\n[dependencies]\n${projectInfo.name} = "0.1.0"\n\`\`\`\n\n`;
        break;
        
      default:
        installation += `Clone the repository:\n\n`;
        installation += `\`\`\`bash\ngit clone ${projectInfo.repository}\ncd ${projectInfo.name}\n\`\`\`\n\n`;
    }

    return installation;
  }

  generateUsageSection(projectInfo) {
    let usage = `## Usage\n\n`;

    switch (projectInfo.type) {
      case 'nodejs':
        usage += `\`\`\`javascript\nconst ${this.toCamelCase(projectInfo.name)} = require('${projectInfo.name}');\n\n`;
        usage += `// Basic usage example\nconst result = ${this.toCamelCase(projectInfo.name)}.doSomething();\nconsole.log(result);\n\`\`\`\n\n`;
        break;
        
      case 'python':
        usage += `\`\`\`python\nimport ${projectInfo.name.replace('-', '_')}\n\n`;
        usage += `# Basic usage example\nresult = ${projectInfo.name.replace('-', '_')}.do_something()\nprint(result)\n\`\`\`\n\n`;
        break;
        
      default:
        usage += `Basic usage example:\n\n\`\`\`bash\n# Run the application\n./${projectInfo.name}\n\`\`\`\n\n`;
    }

    return usage;
  }

  generateApiSection(projectInfo) {
    return `## API Reference

### Methods

#### \`methodName(param1, param2)\`

Description of what this method does.

**Parameters:**
- \`param1\` (Type): Description of parameter 1
- \`param2\` (Type): Description of parameter 2

**Returns:**
- \`Type\`: Description of return value

**Example:**
\`\`\`javascript
const result = methodName('value1', 'value2');
\`\`\`

`;
  }

  generateTestingSection(projectInfo) {
    let testing = `## Testing\n\n`;

    if (projectInfo.scripts.test) {
      testing += `Run the test suite:\n\n`;
      testing += `\`\`\`bash\nnpm test\n\`\`\`\n\n`;
    }

    if (projectInfo.scripts['test:coverage']) {
      testing += `Run tests with coverage:\n\n`;
      testing += `\`\`\`bash\nnpm run test:coverage\n\`\`\`\n\n`;
    }

    testing += `Test files are located in the \`test/\` directory.\n\n`;

    return testing;
  }

  generateContributingSection() {
    return `## Contributing

1. Fork the repository
2. Create your feature branch (\`git checkout -b feature/amazing-feature\`)
3. Commit your changes (\`git commit -m 'Add some amazing feature'\`)
4. Push to the branch (\`git push origin feature/amazing-feature\`)
5. Open a Pull Request

Please make sure to update tests as appropriate and follow the code style guidelines.

`;
  }

  generateLicenseSection(projectInfo) {
    return `## License

This project is licensed under the ${projectInfo.license} License - see the [LICENSE](LICENSE) file for details.

`;
  }

  generateMinimalTemplate(projectInfo) {
    let content = `# ${projectInfo.name}\n\n`;
    
    if (projectInfo.description) {
      content += `${projectInfo.description}\n\n`;
    }

    content += `## Installation\n\n`;
    if (projectInfo.type === 'nodejs') {
      content += `\`\`\`bash\nnpm install ${projectInfo.name}\n\`\`\`\n\n`;
    } else {
      content += `\`\`\`bash\ngit clone ${projectInfo.repository}\n\`\`\`\n\n`;
    }

    content += `## Usage\n\nBasic usage instructions go here.\n\n`;
    
    if (projectInfo.license) {
      content += `## License\n\n${projectInfo.license}\n`;
    }

    this.generatedSections = 4;
    return content;
  }

  generateComprehensiveTemplate(projectInfo) {
    // 🟡 PARTIAL: Comprehensive template - could be expanded
    let content = this.generateStandardTemplate(projectInfo);
    
    // Add additional sections for comprehensive template
    content += `## Architecture\n\nArchitecture overview goes here.\n\n`;
    content += `## Deployment\n\nDeployment instructions go here.\n\n`;
    content += `## Troubleshooting\n\nCommon issues and solutions.\n\n`;
    content += `## Changelog\n\nSee [CHANGELOG.md](CHANGELOG.md) for details.\n\n`;

    this.generatedSections += 4;
    return content;
  }

  async validateReadme(content, logger) {
    const issues = [];

    // 🟢 WORKING: Basic validation checks
    if (content.length < 100) {
      issues.push('README is too short');
    }

    if (!content.includes('# ')) {
      issues.push('Missing main heading');
    }

    if (!content.includes('## Installation') && this.config.includeInstallation) {
      issues.push('Missing installation section');
    }

    if (!content.includes('## Usage') && this.config.includeUsage) {
      issues.push('Missing usage section');
    }

    if (issues.length > 0) {
      logger.warn('README validation issues found', { issues });
    } else {
      logger.info('README validation passed');
    }

    return issues.length === 0;
  }

  // 🟢 WORKING: Helper methods
  toCamelCase(str) {
    return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
  }

  extractGithubPath(url) {
    const match = url.match(/github\.com\/(.+)/);
    return match ? match[1] : '';
  }
}

// 🟢 WORKING: Export for both CommonJS and ES modules
module.exports = ReadmeGeneratorAgent;
module.exports.ReadmeGeneratorAgent = ReadmeGeneratorAgent;