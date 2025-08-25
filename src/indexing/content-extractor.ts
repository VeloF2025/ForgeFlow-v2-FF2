// Content Extractor - Processes different content types for indexing
// Extracts searchable content from Knowledge Cards, Memory entries, ADRs, etc.

import { readFile, stat } from 'fs/promises';
import { extname, basename, dirname, relative } from 'path';
import { parse as parseYaml } from 'yaml';
import {
  ContentExtractor as IContentExtractor,
  IndexEntry,
  IndexContentType,
  IndexMetadata,
  IndexError,
  IndexErrorCode
} from './types.js';
import type { 
  KnowledgeCardFile, 
  GotchaFile, 
  ADRFile 
} from '../knowledge/types.js';
import type { 
  JobMemory, 
  Decision, 
  Gotcha as MemoryGotcha,
  ContextEntry,
  Outcome 
} from '../memory/types.js';

export class ContentExtractor implements IContentExtractor {
  private readonly maxContentLength = 50000; // 50KB limit
  private readonly supportedCodeExtensions = new Set([
    '.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.cs', '.go', 
    '.rs', '.cpp', '.c', '.h', '.php', '.rb', '.swift', '.kt'
  ]);

  async extractFromKnowledgeCard(cardFile: KnowledgeCardFile): Promise<IndexEntry> {
    try {
      const frontmatter = cardFile.frontmatter;
      const content = this.cleanContent(cardFile.content);
      
      // Extract keywords from content
      const keywords = this.extractKeywords(content);
      
      const metadata: IndexMetadata = {
        tags: frontmatter.tags || [],
        category: frontmatter.category,
        projectId: frontmatter.projectId,
        agentTypes: frontmatter.agentTypes || [],
        difficulty: frontmatter.difficulty,
        scope: frontmatter.scope,
        effectiveness: frontmatter.effectiveness,
        usageCount: frontmatter.usageCount || 0,
        lastUsed: new Date(frontmatter.lastUsed),
        fileSize: content.length,
        relatedIds: frontmatter.relatedIssues || [],
        parentId: undefined,
        childIds: []
      };

      return {
        id: frontmatter.id,
        type: 'knowledge' as IndexContentType,
        title: frontmatter.title,
        content: content + '\n\nKeywords: ' + keywords.join(', '),
        path: `knowledge/${frontmatter.scope}/${frontmatter.id}`,
        metadata,
        lastModified: new Date(frontmatter.updatedAt),
        searchVector: undefined
      };
    } catch (error) {
      throw new IndexError(
        `Failed to extract knowledge card: ${(error as Error).message}`,
        IndexErrorCode.CONTENT_EXTRACTION_FAILED,
        { cardId: cardFile.frontmatter?.id, error }
      );
    }
  }

  async extractFromMemoryEntry(memoryEntry: JobMemory): Promise<IndexEntry> {
    try {
      // Combine all memory components into searchable content
      const contentParts: string[] = [];
      
      // Add job metadata
      contentParts.push(`Job ID: ${memoryEntry.jobId}`);
      contentParts.push(`Issue ID: ${memoryEntry.issueId}`);
      contentParts.push(`Status: ${memoryEntry.status}`);
      contentParts.push(`Agents: ${memoryEntry.metadata.agentTypes.join(', ')}`);
      
      // Add decisions
      if (memoryEntry.decisions && memoryEntry.decisions.length > 0) {
        contentParts.push('\n--- DECISIONS ---');
        for (const decision of memoryEntry.decisions) {
          contentParts.push(`Decision: ${decision.description}`);
          contentParts.push(`Category: ${decision.category}`);
          contentParts.push(`Agent: ${decision.agentType}`);
          contentParts.push(`Reasoning: ${decision.reasoning}`);
          
          if (decision.options) {
            decision.options.forEach(option => {
              contentParts.push(`Option: ${option.option} (Selected: ${option.selected})`);
              if (option.pros.length > 0) contentParts.push(`Pros: ${option.pros.join(', ')}`);
              if (option.cons.length > 0) contentParts.push(`Cons: ${option.cons.join(', ')}`);
            });
          }
        }
      }

      // Add gotchas
      if (memoryEntry.gotchas && memoryEntry.gotchas.length > 0) {
        contentParts.push('\n--- GOTCHAS ---');
        for (const gotcha of memoryEntry.gotchas) {
          contentParts.push(`Gotcha: ${gotcha.description}`);
          contentParts.push(`Pattern: ${gotcha.errorPattern}`);
          contentParts.push(`Severity: ${gotcha.severity}`);
          contentParts.push(`Category: ${gotcha.category}`);
          contentParts.push(`Context: ${gotcha.context}`);
          
          if (gotcha.resolution) {
            contentParts.push(`Solution: ${gotcha.resolution.solution}`);
            contentParts.push(`Prevention: ${gotcha.resolution.preventionSteps.join(', ')}`);
          }
        }
      }

      // Add outcomes
      if (memoryEntry.outcomes && memoryEntry.outcomes.length > 0) {
        contentParts.push('\n--- OUTCOMES ---');
        for (const outcome of memoryEntry.outcomes) {
          contentParts.push(`Outcome: ${outcome.description}`);
          contentParts.push(`Type: ${outcome.type}`);
          contentParts.push(`Category: ${outcome.category}`);
          contentParts.push(`Lessons: ${outcome.lessons.join(', ')}`);
        }
      }

      // Add context entries (summarized)
      if (memoryEntry.context && memoryEntry.context.length > 0) {
        contentParts.push('\n--- CONTEXT ---');
        const contextSummary = memoryEntry.context
          .slice(0, 10) // Limit to first 10 context entries
          .map(ctx => `${ctx.type}: ${ctx.source}`)
          .join(', ');
        contentParts.push(contextSummary);
      }

      const content = this.cleanContent(contentParts.join('\n'));
      const summary = this.generateSummary(content, 300);

      const metadata: IndexMetadata = {
        tags: memoryEntry.metadata.tags || [],
        category: `memory-${memoryEntry.status}`,
        projectId: memoryEntry.metadata.relatedIssues[0] || memoryEntry.issueId,
        agentTypes: memoryEntry.metadata.agentTypes,
        difficulty: memoryEntry.metadata.complexity,
        scope: 'project',
        usageCount: 1,
        lastUsed: memoryEntry.endTime || new Date(),
        successRate: memoryEntry.status === 'completed' ? 1.0 : 0.0,
        fileSize: content.length,
        relatedIds: memoryEntry.metadata.relatedIssues,
        parentId: memoryEntry.metadata.parentJobId,
        childIds: memoryEntry.metadata.childJobIds
      };

      return {
        id: `memory-${memoryEntry.jobId}`,
        type: 'memory' as IndexContentType,
        title: `Job Memory: ${memoryEntry.issueId} (${memoryEntry.status})`,
        content: summary + '\n\n' + content,
        path: `memory/${memoryEntry.jobId}`,
        metadata,
        lastModified: memoryEntry.endTime || new Date(),
        searchVector: undefined
      };
    } catch (error) {
      throw new IndexError(
        `Failed to extract memory entry: ${(error as Error).message}`,
        IndexErrorCode.CONTENT_EXTRACTION_FAILED,
        { jobId: memoryEntry.jobId, error }
      );
    }
  }

  async extractFromADR(adrFile: ADRFile): Promise<IndexEntry> {
    try {
      const frontmatter = adrFile.frontmatter;
      const content = this.cleanContent(adrFile.content);

      // Parse ADR sections
      const sections = this.parseADRContent(content);
      
      // Create enhanced content with structured sections
      const enhancedContent = [
        content,
        `\nStatus: ${frontmatter.status}`,
        `Decision Date: ${frontmatter.date}`,
        `Deciders: ${frontmatter.deciders.join(', ')}`,
        `Impact: ${frontmatter.impact}`,
        `Complexity: ${frontmatter.complexity}`,
        `Reversible: ${frontmatter.reversible ? 'Yes' : 'No'}`
      ].join('\n');

      const metadata: IndexMetadata = {
        tags: frontmatter.tags || [],
        category: `adr-${frontmatter.status}`,
        agentTypes: ['system-architect', 'strategic-planner'], // ADRs typically involve these agents
        difficulty: frontmatter.complexity,
        scope: frontmatter.impact === 'local' ? 'project' : 'global',
        usageCount: 1,
        lastUsed: new Date(frontmatter.date),
        status: frontmatter.status,
        fileSize: content.length,
        relatedIds: frontmatter.relatedDecisions,
        parentId: frontmatter.supersededBy,
        childIds: []
      };

      return {
        id: frontmatter.id,
        type: 'adr' as IndexContentType,
        title: `ADR: ${frontmatter.title}`,
        content: enhancedContent,
        path: `adr/${frontmatter.id}`,
        metadata,
        lastModified: new Date(frontmatter.date),
        searchVector: undefined
      };
    } catch (error) {
      throw new IndexError(
        `Failed to extract ADR: ${(error as Error).message}`,
        IndexErrorCode.CONTENT_EXTRACTION_FAILED,
        { adrId: adrFile.frontmatter?.id, error }
      );
    }
  }

  async extractFromGotcha(gotchaFile: GotchaFile): Promise<IndexEntry> {
    try {
      const frontmatter = gotchaFile.frontmatter;
      const content = this.cleanContent(gotchaFile.content);

      // Enhance content with structured information
      const enhancedContent = [
        content,
        `\nPattern: ${frontmatter.pattern}`,
        `Severity: ${frontmatter.severity}`,
        `Category: ${frontmatter.category}`,
        `Occurrences: ${frontmatter.occurrenceCount}`,
        `Prevention Steps: ${frontmatter.preventionSteps.join(', ')}`
      ];

      if (frontmatter.solution) {
        enhancedContent.push(`Solution: ${frontmatter.solution}`);
      }

      const metadata: IndexMetadata = {
        tags: [frontmatter.category, frontmatter.severity, 'gotcha'],
        category: frontmatter.category,
        agentTypes: ['antihallucination-validator', 'code-quality-reviewer'],
        severity: frontmatter.severity,
        scope: frontmatter.promoted ? 'global' : 'project',
        usageCount: frontmatter.occurrenceCount,
        lastUsed: new Date(frontmatter.updatedAt),
        fileSize: content.length,
        relatedIds: [],
        parentId: undefined,
        childIds: []
      };

      return {
        id: frontmatter.id,
        type: 'gotcha' as IndexContentType,
        title: `Gotcha: ${frontmatter.description}`,
        content: enhancedContent.join('\n'),
        path: `gotcha/${frontmatter.id}`,
        metadata,
        lastModified: new Date(frontmatter.updatedAt),
        searchVector: undefined
      };
    } catch (error) {
      throw new IndexError(
        `Failed to extract gotcha: ${(error as Error).message}`,
        IndexErrorCode.CONTENT_EXTRACTION_FAILED,
        { gotchaId: gotchaFile.frontmatter?.id, error }
      );
    }
  }

  async extractFromCodeFile(filePath: string): Promise<IndexEntry> {
    try {
      const stats = await stat(filePath);
      const content = await readFile(filePath, 'utf-8');
      const cleanedContent = this.cleanContent(content);

      // Extract code metadata
      const extension = extname(filePath);
      const language = this.detectLanguage(extension);
      const fileName = basename(filePath);
      
      // Extract code elements
      const codeElements = this.extractCodeElements(cleanedContent, language);
      
      // Generate summary
      const summary = this.generateCodeSummary(cleanedContent, language, codeElements);

      const metadata: IndexMetadata = {
        tags: [language, 'code', ...codeElements.types],
        category: 'code',
        agentTypes: ['code-implementer', 'code-quality-reviewer'],
        language,
        extension: extension.substring(1), // Remove the dot
        scope: 'project',
        usageCount: 0,
        lastUsed: new Date(),
        fileSize: cleanedContent.length,
        relatedIds: [],
        parentId: undefined,
        childIds: []
      };

      const enhancedContent = [
        summary,
        `\nFile: ${fileName}`,
        `Language: ${language}`,
        `Functions: ${codeElements.functions.join(', ')}`,
        `Classes: ${codeElements.classes.join(', ')}`,
        `Interfaces: ${codeElements.interfaces.join(', ')}`,
        '\n--- CODE ---',
        cleanedContent
      ].join('\n');

      return {
        id: `code-${this.generateFileId(filePath)}`,
        type: 'code' as IndexContentType,
        title: `Code: ${fileName}`,
        content: enhancedContent,
        path: filePath,
        metadata,
        lastModified: stats.mtime,
        searchVector: undefined
      };
    } catch (error) {
      throw new IndexError(
        `Failed to extract code file: ${(error as Error).message}`,
        IndexErrorCode.CONTENT_EXTRACTION_FAILED,
        { filePath, error }
      );
    }
  }

  async extractFromPath(filePath: string, contentType: IndexContentType): Promise<IndexEntry | null> {
    try {
      // Determine extraction method based on content type and file extension
      switch (contentType) {
        case 'code':
          return await this.extractFromCodeFile(filePath);
        
        case 'knowledge':
        case 'adr':
        case 'gotcha':
          // These would typically be YAML/Markdown files with frontmatter
          const content = await readFile(filePath, 'utf-8');
          const parsed = this.parseFrontmatterFile(content);
          
          switch (contentType) {
            case 'knowledge':
              return await this.extractFromKnowledgeCard(parsed as KnowledgeCardFile);
            case 'adr':
              return await this.extractFromADR(parsed as ADRFile);
            case 'gotcha':
              return await this.extractFromGotcha(parsed as GotchaFile);
          }
          break;
          
        case 'config':
          return await this.extractFromConfigFile(filePath);
          
        default:
          console.warn(`Unsupported content type: ${contentType} for path: ${filePath}`);
          return null;
      }
    } catch (error) {
      console.error(`Failed to extract from path ${filePath}:`, error);
      return null;
    }
  }

  cleanContent(content: string): string {
    if (!content) return '';
    
    // Remove excessive whitespace
    let cleaned = content.replace(/\s+/g, ' ').trim();
    
    // Remove control characters but keep newlines and tabs
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // Limit content length
    if (cleaned.length > this.maxContentLength) {
      cleaned = cleaned.substring(0, this.maxContentLength) + '...';
    }
    
    return cleaned;
  }

  extractKeywords(content: string): string[] {
    if (!content) return [];
    
    // Simple keyword extraction
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !this.isStopWord(word));

    // Count word frequency
    const wordCounts = new Map<string, number>();
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }

    // Return top keywords
    return Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);
  }

  generateSummary(content: string, maxLength = 200): string {
    if (!content || content.length <= maxLength) return content;
    
    // Find natural break points
    const sentences = content.split(/[.!?]+/);
    let summary = '';
    
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;
      
      if (summary.length + trimmed.length + 1 <= maxLength) {
        summary += (summary ? '. ' : '') + trimmed;
      } else {
        break;
      }
    }
    
    return summary || content.substring(0, maxLength) + '...';
  }

  // Private helper methods
  private detectLanguage(extension: string): string {
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.cs': 'csharp',
      '.go': 'go',
      '.rs': 'rust',
      '.cpp': 'cpp',
      '.c': 'c',
      '.h': 'c',
      '.php': 'php',
      '.rb': 'ruby',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.md': 'markdown'
    };
    
    return languageMap[extension.toLowerCase()] || 'text';
  }

  private extractCodeElements(content: string, language: string): {
    functions: string[];
    classes: string[];
    interfaces: string[];
    types: string[];
  } {
    const elements = {
      functions: [] as string[],
      classes: [] as string[],
      interfaces: [] as string[],
      types: [] as string[]
    };

    switch (language) {
      case 'typescript':
      case 'javascript':
        this.extractTypeScriptElements(content, elements);
        break;
      case 'python':
        this.extractPythonElements(content, elements);
        break;
      case 'java':
        this.extractJavaElements(content, elements);
        break;
      // Add more language-specific extraction as needed
    }

    return elements;
  }

  private extractTypeScriptElements(content: string, elements: any): void {
    // Extract functions
    const functionMatches = content.matchAll(/(?:function\s+|const\s+|let\s+|var\s+)?(\w+)\s*[=:]?\s*(?:async\s+)?(?:function|\(.*?\)\s*=>)/g);
    for (const match of functionMatches) {
      if (match[1] && !elements.functions.includes(match[1])) {
        elements.functions.push(match[1]);
      }
    }

    // Extract classes
    const classMatches = content.matchAll(/class\s+(\w+)/g);
    for (const match of classMatches) {
      if (match[1] && !elements.classes.includes(match[1])) {
        elements.classes.push(match[1]);
      }
    }

    // Extract interfaces
    const interfaceMatches = content.matchAll(/interface\s+(\w+)/g);
    for (const match of interfaceMatches) {
      if (match[1] && !elements.interfaces.includes(match[1])) {
        elements.interfaces.push(match[1]);
      }
    }

    // Extract types
    const typeMatches = content.matchAll(/type\s+(\w+)/g);
    for (const match of typeMatches) {
      if (match[1] && !elements.types.includes(match[1])) {
        elements.types.push(match[1]);
      }
    }
  }

  private extractPythonElements(content: string, elements: any): void {
    // Extract functions
    const functionMatches = content.matchAll(/def\s+(\w+)\s*\(/g);
    for (const match of functionMatches) {
      if (match[1] && !elements.functions.includes(match[1])) {
        elements.functions.push(match[1]);
      }
    }

    // Extract classes
    const classMatches = content.matchAll(/class\s+(\w+)/g);
    for (const match of classMatches) {
      if (match[1] && !elements.classes.includes(match[1])) {
        elements.classes.push(match[1]);
      }
    }
  }

  private extractJavaElements(content: string, elements: any): void {
    // Extract methods
    const methodMatches = content.matchAll(/(?:public|private|protected)?\s*(?:static)?\s*\w+\s+(\w+)\s*\(/g);
    for (const match of methodMatches) {
      if (match[1] && !elements.functions.includes(match[1])) {
        elements.functions.push(match[1]);
      }
    }

    // Extract classes
    const classMatches = content.matchAll(/(?:public|private)?\s*class\s+(\w+)/g);
    for (const match of classMatches) {
      if (match[1] && !elements.classes.includes(match[1])) {
        elements.classes.push(match[1]);
      }
    }

    // Extract interfaces
    const interfaceMatches = content.matchAll(/(?:public)?\s*interface\s+(\w+)/g);
    for (const match of interfaceMatches) {
      if (match[1] && !elements.interfaces.includes(match[1])) {
        elements.interfaces.push(match[1]);
      }
    }
  }

  private generateCodeSummary(content: string, language: string, elements: any): string {
    const parts = [];
    
    if (elements.classes.length > 0) {
      parts.push(`Classes: ${elements.classes.slice(0, 5).join(', ')}`);
    }
    
    if (elements.interfaces.length > 0) {
      parts.push(`Interfaces: ${elements.interfaces.slice(0, 5).join(', ')}`);
    }
    
    if (elements.functions.length > 0) {
      parts.push(`Functions: ${elements.functions.slice(0, 10).join(', ')}`);
    }
    
    if (elements.types.length > 0) {
      parts.push(`Types: ${elements.types.slice(0, 5).join(', ')}`);
    }
    
    const lines = content.split('\n').length;
    parts.push(`${lines} lines of ${language} code`);
    
    return parts.join('. ') + '.';
  }

  private parseFrontmatterFile(content: string): any {
    // Parse YAML frontmatter from Markdown files
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    
    if (!frontmatterMatch) {
      throw new Error('Invalid frontmatter format');
    }
    
    const yamlContent = frontmatterMatch[1];
    const markdownContent = frontmatterMatch[2];
    
    const frontmatter = parseYaml(yamlContent);
    
    return {
      frontmatter,
      content: markdownContent
    };
  }

  private parseADRContent(content: string): Record<string, string> {
    const sections: Record<string, string> = {};
    
    // Common ADR section patterns
    const sectionPatterns = [
      /## Status\n([\s\S]*?)(?=\n##|$)/i,
      /## Context\n([\s\S]*?)(?=\n##|$)/i,
      /## Decision\n([\s\S]*?)(?=\n##|$)/i,
      /## Consequences\n([\s\S]*?)(?=\n##|$)/i,
      /## Alternatives\n([\s\S]*?)(?=\n##|$)/i
    ];
    
    const sectionNames = ['status', 'context', 'decision', 'consequences', 'alternatives'];
    
    sectionPatterns.forEach((pattern, index) => {
      const match = content.match(pattern);
      if (match) {
        sections[sectionNames[index]] = match[1].trim();
      }
    });
    
    return sections;
  }

  private async extractFromConfigFile(filePath: string): Promise<IndexEntry> {
    const stats = await stat(filePath);
    const content = await readFile(filePath, 'utf-8');
    const fileName = basename(filePath);
    const extension = extname(filePath);

    // Parse config based on file type
    let configData: any = {};
    let configType = 'unknown';
    
    try {
      switch (extension.toLowerCase()) {
        case '.json':
          configData = JSON.parse(content);
          configType = 'json';
          break;
        case '.yaml':
        case '.yml':
          configData = parseYaml(content);
          configType = 'yaml';
          break;
        case '.env':
          configData = this.parseEnvFile(content);
          configType = 'env';
          break;
        default:
          configType = 'text';
      }
    } catch {
      // If parsing fails, treat as text
      configType = 'text';
    }

    const summary = this.generateConfigSummary(fileName, configType, configData);
    
    const metadata: IndexMetadata = {
      tags: ['config', configType, fileName.replace(/\.[^/.]+$/, '')],
      category: 'configuration',
      agentTypes: ['system-architect', 'deployment-automation'],
      extension: extension.substring(1),
      scope: 'project',
      usageCount: 0,
      lastUsed: new Date(),
      fileSize: content.length,
      relatedIds: [],
      parentId: undefined,
      childIds: []
    };

    return {
      id: `config-${this.generateFileId(filePath)}`,
      type: 'config' as IndexContentType,
      title: `Config: ${fileName}`,
      content: summary + '\n\n' + this.cleanContent(content),
      path: filePath,
      metadata,
      lastModified: stats.mtime,
      searchVector: undefined
    };
  }

  private parseEnvFile(content: string): Record<string, string> {
    const env: Record<string, string> = {};
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          env[key.trim()] = valueParts.join('=').trim();
        }
      }
    }
    
    return env;
  }

  private generateConfigSummary(fileName: string, configType: string, configData: any): string {
    const parts = [`${configType.toUpperCase()} configuration file`];
    
    if (configType === 'json' || configType === 'yaml') {
      const keys = Object.keys(configData || {});
      if (keys.length > 0) {
        parts.push(`Contains ${keys.length} configuration keys`);
        parts.push(`Main sections: ${keys.slice(0, 10).join(', ')}`);
      }
    } else if (configType === 'env') {
      const keys = Object.keys(configData || {});
      if (keys.length > 0) {
        parts.push(`Contains ${keys.length} environment variables`);
      }
    }
    
    return parts.join('. ') + '.';
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been',
      'have', 'has', 'had', 'will', 'would', 'could', 'should', 'can', 'may',
      'from', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
      'function', 'class', 'interface', 'type', 'const', 'let', 'var', 'return',
      'import', 'export', 'default', 'async', 'await', 'promise', 'string', 'number',
      'boolean', 'object', 'array', 'null', 'undefined', 'void'
    ]);
    
    return stopWords.has(word.toLowerCase());
  }

  private generateFileId(filePath: string): string {
    // Generate consistent ID from file path
    return Buffer.from(filePath).toString('base64').replace(/[/+=]/g, '').substring(0, 16);
  }
}