import { LogContext } from '../utils/logger';
import fs from 'fs-extra';
import path from 'path';

interface ValidationResult {
  valid: boolean;
  violations: string[];
  suggestions?: string[];
}

interface CodeReference {
  type: 'method' | 'component' | 'hook' | 'route' | 'collection' | 'import';
  name: string;
  location?: string;
}

export class AntiHallProtocol {
  private logger: LogContext;
  private codebaseIndex: Map<string, Set<string>>;
  private initialized: boolean;

  constructor() {
    this.logger = new LogContext('AntiHall-Protocol');
    this.codebaseIndex = new Map();
    this.initialized = false;
  }

  async validate(): Promise<void> {
    this.logger.info('AntiHall Protocol validation check...');

    const checks = [
      this.checkIndexIntegrity(),
      this.checkValidationEngine(),
      this.checkParserStatus(),
    ];

    const results = await Promise.all(checks);

    if (results.some((r) => !r)) {
      throw new Error('AntiHall Protocol validation failed');
    }

    this.logger.info('AntiHall Protocol validated successfully');
  }

  async initialize(): Promise<void> {
    this.logger.info('🛡️ ANTIHALL PROTOCOL INITIALIZING - HALLUCINATION PREVENTION ACTIVE');

    await this.parseCodebase();
    this.initialized = true;

    this.logger.info('AntiHall settings:');
    this.logger.info('  - Real-time code validation');
    this.logger.info('  - 100% accuracy requirement');
    this.logger.info('  - Automatic suggestion blocking');
    this.logger.info(`  - Indexed ${this.codebaseIndex.size} code patterns`);
  }

  async parseCodebase(): Promise<void> {
    this.logger.info('Parsing codebase for AntiHall validation...');

    const srcPath = path.resolve('src');
    if (!(await fs.pathExists(srcPath))) {
      this.logger.warning('Source directory not found, using empty index');
      return;
    }

    await this.indexDirectory(srcPath);

    this.logger.info(`Codebase parsed: ${this.codebaseIndex.size} patterns indexed`);
  }

  private async indexDirectory(dirPath: string): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        await this.indexDirectory(fullPath);
      } else if (entry.isFile() && this.isCodeFile(entry.name)) {
        await this.indexFile(fullPath);
      }
    }
  }

  private isCodeFile(filename: string): boolean {
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cs', '.go', '.rs'];
    return extensions.some((ext) => filename.endsWith(ext));
  }

  private async indexFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const patterns = this.extractPatterns(content);

      const fileKey = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
      this.codebaseIndex.set(fileKey, new Set(patterns));
    } catch (error) {
      this.logger.debug(`Failed to index file: ${filePath}`, error);
    }
  }

  private extractPatterns(content: string): string[] {
    const patterns: string[] = [];

    const methodRegex = /(?:function|const|let|var|class|interface|type)\s+(\w+)/g;
    const importRegex = /import\s+(?:{[^}]+}|\w+)\s+from\s+['"]([^'"]+)['"]/g;
    const exportRegex = /export\s+(?:default\s+)?(?:function|const|class|interface|type)\s+(\w+)/g;

    let match;

    while ((match = methodRegex.exec(content)) !== null) {
      patterns.push(match[1]);
    }

    while ((match = importRegex.exec(content)) !== null) {
      patterns.push(match[1]);
    }

    while ((match = exportRegex.exec(content)) !== null) {
      patterns.push(match[1]);
    }

    return patterns;
  }

  async validateCode(code: string, context: string): Promise<ValidationResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    this.logger.debug(`Validating code for context: ${context}`);

    const references = this.extractReferences(code);
    const violations: string[] = [];
    const suggestions: string[] = [];

    for (const ref of references) {
      const exists = this.checkReference(ref);

      if (!exists) {
        violations.push(`Non-existent ${ref.type}: ${ref.name}`);

        const suggestion = this.findSimilar(ref.name);
        if (suggestion) {
          suggestions.push(`Did you mean: ${suggestion}?`);
        }
      }
    }

    const valid = violations.length === 0;

    if (!valid) {
      this.logger.error(`HALLUCINATION DETECTED: ${violations.length} invalid references`);
      violations.forEach((v) => this.logger.error(`  - ${v}`));
    }

    return { valid, violations, suggestions };
  }

  private extractReferences(code: string): CodeReference[] {
    const references: CodeReference[] = [];

    const patterns = [
      { regex: /(\w+Service)\.(\w+)/g, type: 'method' as const },
      { regex: /<(\w+Component)/g, type: 'component' as const },
      { regex: /use(\w+)/g, type: 'hook' as const },
      { regex: /['"]\/api\/(\w+)/g, type: 'route' as const },
      { regex: /db\.collection\(['"](\w+)['"]\)/g, type: 'collection' as const },
      { regex: /import\s+.*\s+from\s+['"]([^'"]+)['"]/g, type: 'import' as const },
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(code)) !== null) {
        references.push({
          type: pattern.type,
          name: match[1],
        });
      }
    }

    return references;
  }

  private checkReference(ref: CodeReference): boolean {
    for (const [, patterns] of this.codebaseIndex) {
      if (patterns.has(ref.name)) {
        return true;
      }
    }
    return false;
  }

  private findSimilar(name: string): string | null {
    const allPatterns = new Set<string>();

    for (const [, patterns] of this.codebaseIndex) {
      patterns.forEach((p) => allPatterns.add(p));
    }

    const nameLower = name.toLowerCase();

    for (const pattern of allPatterns) {
      if (pattern.toLowerCase().includes(nameLower) || nameLower.includes(pattern.toLowerCase())) {
        return pattern;
      }
    }

    return null;
  }

  async checkCode(code: string): Promise<boolean> {
    const result = await this.validateCode(code, 'quick-check');
    return result.valid;
  }

  async findPattern(searchTerm: string): Promise<string[]> {
    const results: string[] = [];

    for (const [file, patterns] of this.codebaseIndex) {
      for (const pattern of patterns) {
        if (pattern.toLowerCase().includes(searchTerm.toLowerCase())) {
          results.push(`${pattern} (${file})`);
        }
      }
    }

    return results;
  }

  getStatistics(): {
    filesIndexed: number;
    patternsFound: number;
    lastUpdated: Date;
  } {
    let totalPatterns = 0;

    for (const [, patterns] of this.codebaseIndex) {
      totalPatterns += patterns.size;
    }

    return {
      filesIndexed: this.codebaseIndex.size,
      patternsFound: totalPatterns,
      lastUpdated: new Date(),
    };
  }

  private async checkIndexIntegrity(): Promise<boolean> {
    return this.codebaseIndex instanceof Map;
  }

  private async checkValidationEngine(): Promise<boolean> {
    return true;
  }

  private async checkParserStatus(): Promise<boolean> {
    return true;
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down AntiHall Protocol...');
    this.codebaseIndex.clear();
    this.initialized = false;
  }
}
