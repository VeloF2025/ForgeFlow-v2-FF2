// Agent Template Engine - Specialized context formatting per agent type
// Provides customizable templates for optimal context delivery to different agent types

import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger';
import type {
  AgentTemplate,
  TemplateDefinition,
  TemplateStructure,
  TemplateSection,
  TemplateFormatting,
  ContentRule,
  TemplateTransformation,
  TemplateCustomization,
  ContextPack,
  ContextContent,
  ContextPackAssemblerConfig,
} from './types';

export interface TemplateRenderContext {
  agentType: string;
  issueId: string;
  projectContext: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  preferences: Record<string, unknown>;
  constraints: string[];
  customizations: TemplateCustomization[];
}

export interface TemplateRenderResult {
  content: string;
  metadata: RenderMetadata;
  performance: RenderPerformance;
  warnings: RenderWarning[];
}

export interface RenderMetadata {
  templateId: string;
  templateVersion: string;
  renderedAt: Date;
  tokenCount: number;
  sectionsRendered: string[];
  customizationsApplied: string[];
  transformationsApplied: string[];
}

export interface RenderPerformance {
  renderTime: number;
  templateLoadTime: number;
  contentProcessingTime: number;
  formatTime: number;
  validationTime: number;
  totalMemoryUsed: number;
}

export interface RenderWarning {
  type: 'missing_section' | 'validation_failed' | 'customization_error' | 'performance_slow';
  severity: 'info' | 'warning' | 'error';
  message: string;
  section?: string;
  recommendation: string;
}

export interface TemplateRegistry {
  templates: Map<string, AgentTemplate>;
  defaultTemplates: Map<string, string>; // agentType -> templateId
  customTemplates: Map<string, AgentTemplate>;
  templateCache: Map<string, string>; // Rendered template cache
}

export class AgentTemplateEngine {
  private config: ContextPackAssemblerConfig;
  private registry: TemplateRegistry;
  private performanceMetrics: Map<string, number[]> = new Map();
  private templateBasePath: string;

  constructor(config: ContextPackAssemblerConfig) {
    this.config = config;
    this.templateBasePath = config.templateBasePath || './templates';
    this.registry = {
      templates: new Map(),
      defaultTemplates: new Map(),
      customTemplates: new Map(),
      templateCache: new Map(),
    };

    this.initializeDefaultTemplates();
    logger.info(
      '[AgentTemplateEngine] Initialized with template base path:',
      this.templateBasePath,
    );
  }

  /**
   * Initialize default templates for all agent types
   */
  private initializeDefaultTemplates(): void {
    const agentTypes = [
      'strategic-planner',
      'system-architect',
      'code-implementer',
      'test-coverage-validator',
      'security-auditor',
      'performance-optimizer',
      'ui-ux-optimizer',
      'database-architect',
      'deployment-automation',
      'code-quality-reviewer',
      'antihallucination-validator',
    ];

    for (const agentType of agentTypes) {
      const template = this.createDefaultTemplate(agentType);
      this.registry.templates.set(template.id, template);
      this.registry.defaultTemplates.set(agentType, template.id);
    }

    logger.info(`[AgentTemplateEngine] Initialized ${agentTypes.length} default templates`);
  }

  /**
   * Create a default template for an agent type
   */
  private createDefaultTemplate(agentType: string): AgentTemplate {
    const baseStructure = this.getBaseTemplateStructure();
    const agentSpecificSections = this.getAgentSpecificSections(agentType);

    const template: AgentTemplate = {
      id: `default-${agentType}`,
      name: `Default ${agentType} Template`,
      agentType,
      version: '1.0.0',
      description: `Optimized context template for ${agentType} agent`,
      template: {
        structure: {
          sections: [...baseStructure.sections, ...agentSpecificSections],
          requiredFields: baseStructure.requiredFields,
          optionalFields: baseStructure.optionalFields,
          conditionalFields: this.getConditionalFields(agentType),
        },
        formatting: this.getAgentFormatting(agentType),
        contentRules: this.getAgentContentRules(agentType),
        transformations: this.getAgentTransformations(agentType),
      },
      customizations: [],
      performance: {
        averageRenderTime: 100,
        tokenEfficiency: 0.85,
        userSatisfaction: 0.8,
        errorRate: 0.05,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return template;
  }

  /**
   * Get base template structure common to all agents
   */
  private getBaseTemplateStructure(): TemplateStructure {
    return {
      sections: [
        {
          id: 'executive_summary',
          name: 'Executive Summary',
          order: 1,
          required: true,
          maxTokens: 200,
          contentType: 'text',
          validation: [
            {
              type: 'required',
              parameters: {},
              errorMessage: 'Executive summary is required',
            },
            {
              type: 'range',
              parameters: { min: 50, max: 200 },
              errorMessage: 'Executive summary must be 50-200 tokens',
            },
          ],
        },
        {
          id: 'key_insights',
          name: 'Key Insights',
          order: 2,
          required: true,
          maxTokens: 150,
          contentType: 'list',
          validation: [
            {
              type: 'required',
              parameters: {},
              errorMessage: 'Key insights are required',
            },
          ],
        },
        {
          id: 'critical_actions',
          name: 'Critical Actions',
          order: 3,
          required: true,
          maxTokens: 100,
          contentType: 'list',
          validation: [
            {
              type: 'required',
              parameters: {},
              errorMessage: 'Critical actions are required',
            },
          ],
        },
      ],
      requiredFields: ['executive_summary', 'key_insights', 'critical_actions'],
      optionalFields: ['related_contexts'],
      conditionalFields: [],
    };
  }

  /**
   * Get agent-specific template sections
   */
  private getAgentSpecificSections(agentType: string): TemplateSection[] {
    const sections: TemplateSection[] = [];

    switch (agentType) {
      case 'strategic-planner':
        sections.push(
          {
            id: 'planning_context',
            name: 'Planning Context',
            order: 10,
            required: true,
            maxTokens: 300,
            contentType: 'text',
            validation: [],
          },
          {
            id: 'task_breakdown',
            name: 'Task Breakdown',
            order: 11,
            required: true,
            maxTokens: 400,
            contentType: 'list',
            validation: [],
          },
          {
            id: 'dependencies',
            name: 'Dependencies',
            order: 12,
            required: false,
            maxTokens: 200,
            contentType: 'list',
            validation: [],
          },
        );
        break;

      case 'system-architect':
        sections.push(
          {
            id: 'architecture_context',
            name: 'Architecture Context',
            order: 10,
            required: true,
            maxTokens: 350,
            contentType: 'text',
            validation: [],
          },
          {
            id: 'design_patterns',
            name: 'Relevant Design Patterns',
            order: 11,
            required: true,
            maxTokens: 300,
            contentType: 'list',
            validation: [],
          },
          {
            id: 'adrs',
            name: 'Architecture Decision Records',
            order: 12,
            required: false,
            maxTokens: 400,
            contentType: 'json',
            validation: [],
          },
        );
        break;

      case 'code-implementer':
        sections.push(
          {
            id: 'implementation_context',
            name: 'Implementation Context',
            order: 10,
            required: true,
            maxTokens: 300,
            contentType: 'text',
            validation: [],
          },
          {
            id: 'code_patterns',
            name: 'Code Patterns',
            order: 11,
            required: true,
            maxTokens: 400,
            contentType: 'code',
            validation: [],
          },
          {
            id: 'gotchas',
            name: 'Known Gotchas',
            order: 12,
            required: true,
            maxTokens: 200,
            contentType: 'list',
            validation: [],
          },
        );
        break;

      case 'security-auditor':
        sections.push(
          {
            id: 'security_context',
            name: 'Security Context',
            order: 10,
            required: true,
            maxTokens: 250,
            contentType: 'text',
            validation: [],
          },
          {
            id: 'vulnerability_patterns',
            name: 'Vulnerability Patterns',
            order: 11,
            required: true,
            maxTokens: 300,
            contentType: 'list',
            validation: [],
          },
          {
            id: 'compliance_requirements',
            name: 'Compliance Requirements',
            order: 12,
            required: false,
            maxTokens: 200,
            contentType: 'list',
            validation: [],
          },
        );
        break;

      case 'performance-optimizer':
        sections.push(
          {
            id: 'performance_context',
            name: 'Performance Context',
            order: 10,
            required: true,
            maxTokens: 250,
            contentType: 'text',
            validation: [],
          },
          {
            id: 'optimization_patterns',
            name: 'Optimization Patterns',
            order: 11,
            required: true,
            maxTokens: 350,
            contentType: 'list',
            validation: [],
          },
          {
            id: 'performance_metrics',
            name: 'Performance Metrics',
            order: 12,
            required: false,
            maxTokens: 150,
            contentType: 'json',
            validation: [],
          },
        );
        break;

      // Add more agent-specific sections as needed
      default:
        sections.push({
          id: 'agent_specific_context',
          name: 'Agent Specific Context',
          order: 10,
          required: false,
          maxTokens: 300,
          contentType: 'text',
          validation: [],
        });
    }

    return sections;
  }

  /**
   * Get agent-specific formatting preferences
   */
  private getAgentFormatting(agentType: string): TemplateFormatting {
    const base: TemplateFormatting = {
      style: 'markdown',
      indentation: 2,
      lineBreaks: 'normalize',
      codeHighlighting: false,
    };

    switch (agentType) {
      case 'code-implementer':
      case 'test-coverage-validator':
      case 'performance-optimizer':
        return {
          ...base,
          style: 'markdown',
          codeHighlighting: true,
          customDelimiters: {
            codeStart: '```typescript',
            codeEnd: '```',
            listItem: '- ',
          },
        };

      case 'system-architect':
        return {
          ...base,
          style: 'markdown',
          customDelimiters: {
            sectionStart: '## ',
            subsectionStart: '### ',
            listItem: '* ',
          },
        };

      case 'strategic-planner':
        return {
          ...base,
          style: 'markdown',
          customDelimiters: {
            phaseStart: '## Phase: ',
            taskStart: '### Task: ',
            listItem: '- [ ] ',
          },
        };

      default:
        return base;
    }
  }

  /**
   * Get agent-specific content rules
   */
  private getAgentContentRules(agentType: string): ContentRule[] {
    const baseRules: ContentRule[] = [
      {
        id: 'no_empty_sections',
        type: 'validate',
        condition: 'section.content.length > 0',
        action: 'exclude_section',
        parameters: {},
      },
      {
        id: 'token_limit',
        type: 'validate',
        condition: 'section.tokenCount <= section.maxTokens',
        action: 'truncate_content',
        parameters: { preserveEnding: true },
      },
    ];

    const agentSpecificRules: ContentRule[] = [];

    switch (agentType) {
      case 'code-implementer':
        agentSpecificRules.push(
          {
            id: 'prioritize_code_examples',
            type: 'include',
            condition: 'content.type === "code" || content.includes("```")',
            action: 'increase_priority',
            parameters: { boost: 0.2 },
          },
          {
            id: 'exclude_theoretical_content',
            type: 'exclude',
            condition: 'content.category === "theory" && content.practical === false',
            action: 'exclude_content',
            parameters: {},
          },
        );
        break;

      case 'security-auditor':
        agentSpecificRules.push(
          {
            id: 'prioritize_security_content',
            type: 'include',
            condition: 'content.tags.includes("security") || content.category === "vulnerability"',
            action: 'increase_priority',
            parameters: { boost: 0.3 },
          },
          {
            id: 'include_compliance_info',
            type: 'include',
            condition: 'content.tags.includes("compliance") || content.tags.includes("audit")',
            action: 'increase_priority',
            parameters: { boost: 0.2 },
          },
        );
        break;

      case 'performance-optimizer':
        agentSpecificRules.push(
          {
            id: 'prioritize_performance_content',
            type: 'include',
            condition:
              'content.tags.includes("performance") || content.category === "optimization"',
            action: 'increase_priority',
            parameters: { boost: 0.3 },
          },
          {
            id: 'include_metrics',
            type: 'include',
            condition: 'content.type === "metrics" || content.includes("benchmark")',
            action: 'increase_priority',
            parameters: { boost: 0.15 },
          },
        );
        break;
    }

    return [...baseRules, ...agentSpecificRules];
  }

  /**
   * Get agent-specific transformations
   */
  private getAgentTransformations(agentType: string): TemplateTransformation[] {
    const transformations: TemplateTransformation[] = [];

    switch (agentType) {
      case 'strategic-planner':
        transformations.push({
          id: 'format_tasks',
          type: 'format',
          input: 'task_list',
          output: 'formatted_tasks',
          parameters: {
            format: 'checkbox_list',
            includeEstimates: true,
            includeDependencies: true,
          },
        });
        break;

      case 'code-implementer':
        transformations.push(
          {
            id: 'highlight_code_blocks',
            type: 'format',
            input: 'code_content',
            output: 'highlighted_code',
            parameters: {
              language: 'typescript',
              showLineNumbers: true,
              highlightImportant: true,
            },
          },
          {
            id: 'summarize_long_gotchas',
            type: 'summarize',
            input: 'gotcha_descriptions',
            output: 'concise_gotchas',
            parameters: {
              maxLength: 100,
              preserveKeywords: ['error', 'fix', 'solution'],
            },
          },
        );
        break;

      case 'security-auditor':
        transformations.push({
          id: 'categorize_vulnerabilities',
          type: 'enhance',
          input: 'vulnerability_list',
          output: 'categorized_vulnerabilities',
          parameters: {
            categories: ['injection', 'authentication', 'encryption', 'access_control'],
            includeSeverity: true,
            includeRemediation: true,
          },
        });
        break;
    }

    return transformations;
  }

  /**
   * Get conditional fields for an agent type
   */
  private getConditionalFields(agentType: string): any[] {
    const conditionalFields: any[] = [];

    switch (agentType) {
      case 'code-implementer':
        conditionalFields.push({
          field: 'testing_context',
          condition: 'priority === "high" || priority === "critical"',
          value: 'include_test_examples',
        });
        break;

      case 'security-auditor':
        conditionalFields.push({
          field: 'detailed_scan_results',
          condition: 'issue.category === "security" || priority === "critical"',
          value: 'include_full_scan',
        });
        break;
    }

    return conditionalFields;
  }

  /**
   * Render a context pack using the appropriate template
   */
  async renderContextPack(
    contextPack: ContextPack,
    renderContext: TemplateRenderContext,
  ): Promise<TemplateRenderResult> {
    const startTime = Date.now();
    logger.info(
      `[AgentTemplateEngine] Rendering context pack for agent: ${renderContext.agentType}`,
    );

    try {
      // Get the appropriate template
      const template = await this.getTemplateForAgent(renderContext.agentType);
      const loadTime = Date.now() - startTime;

      // Apply customizations
      const customizedTemplate = this.applyCustomizations(template, renderContext.customizations);

      // Process content according to template rules
      const processStartTime = Date.now();
      const processedContent = await this.processContent(
        contextPack.content,
        customizedTemplate,
        renderContext,
      );
      const processTime = Date.now() - processStartTime;

      // Render the template
      const renderStartTime = Date.now();
      const renderedContent = await this.renderTemplate(
        processedContent,
        customizedTemplate,
        renderContext,
      );
      const renderTime = Date.now() - renderStartTime;

      // Validate the result
      const validateStartTime = Date.now();
      const validation = await this.validateRenderedContent(renderedContent, customizedTemplate);
      const validateTime = Date.now() - validateStartTime;

      const totalTime = Date.now() - startTime;
      this.recordPerformance('template_render', totalTime);

      const result: TemplateRenderResult = {
        content: renderedContent,
        metadata: {
          templateId: template.id,
          templateVersion: template.version,
          renderedAt: new Date(),
          tokenCount: this.estimateTokenCount(renderedContent),
          sectionsRendered: this.getRenderedSections(customizedTemplate),
          customizationsApplied: renderContext.customizations.map((c) => c.id),
          transformationsApplied: customizedTemplate.template.transformations.map((t) => t.id),
        },
        performance: {
          renderTime: totalTime,
          templateLoadTime: loadTime,
          contentProcessingTime: processTime,
          formatTime: renderTime,
          validationTime: validateTime,
          totalMemoryUsed: process.memoryUsage().heapUsed,
        },
        warnings: validation.warnings,
      };

      logger.info(
        `[AgentTemplateEngine] Rendered context pack in ${totalTime}ms with ${validation.warnings.length} warnings`,
      );
      return result;
    } catch (error) {
      logger.error('[AgentTemplateEngine] Template rendering failed:', error);
      throw new Error(
        `Template rendering failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get template for a specific agent type
   */
  private async getTemplateForAgent(agentType: string): Promise<AgentTemplate> {
    // Check for custom templates first
    for (const [id, template] of this.registry.customTemplates) {
      if (template.agentType === agentType) {
        logger.debug(`[AgentTemplateEngine] Using custom template ${id} for ${agentType}`);
        return template;
      }
    }

    // Use default template
    const defaultTemplateId = this.registry.defaultTemplates.get(agentType);
    if (defaultTemplateId) {
      const template = this.registry.templates.get(defaultTemplateId);
      if (template) {
        logger.debug(
          `[AgentTemplateEngine] Using default template ${defaultTemplateId} for ${agentType}`,
        );
        return template;
      }
    }

    // Fallback to generic template
    logger.warn(`[AgentTemplateEngine] No template found for ${agentType}, using generic template`);
    return this.createGenericTemplate(agentType);
  }

  /**
   * Create a generic template for unknown agent types
   */
  private createGenericTemplate(agentType: string): AgentTemplate {
    return {
      id: `generic-${agentType}`,
      name: `Generic Template for ${agentType}`,
      agentType,
      version: '1.0.0',
      description: `Generic context template for ${agentType} agent`,
      template: {
        structure: this.getBaseTemplateStructure(),
        formatting: {
          style: 'markdown',
          indentation: 2,
          lineBreaks: 'normalize',
          codeHighlighting: false,
        },
        contentRules: [],
        transformations: [],
      },
      customizations: [],
      performance: {
        averageRenderTime: 150,
        tokenEfficiency: 0.7,
        userSatisfaction: 0.6,
        errorRate: 0.1,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Apply customizations to a template
   */
  private applyCustomizations(
    template: AgentTemplate,
    customizations: TemplateCustomization[],
  ): AgentTemplate {
    let customizedTemplate = { ...template };

    for (const customization of customizations) {
      try {
        switch (customization.type) {
          case 'override':
            customizedTemplate = this.applyOverride(customizedTemplate, customization);
            break;
          case 'extend':
            customizedTemplate = this.applyExtension(customizedTemplate, customization);
            break;
          case 'replace':
            customizedTemplate = this.applyReplacement(customizedTemplate, customization);
            break;
        }
      } catch (error) {
        logger.warn(
          `[AgentTemplateEngine] Failed to apply customization ${customization.id}:`,
          error,
        );
      }
    }

    return customizedTemplate;
  }

  /**
   * Apply override customization
   */
  private applyOverride(
    template: AgentTemplate,
    customization: TemplateCustomization,
  ): AgentTemplate {
    const parts = customization.target.split('.');
    let current: any = template;

    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }

    current[parts[parts.length - 1]] = customization.value;
    return template;
  }

  /**
   * Apply extension customization
   */
  private applyExtension(
    template: AgentTemplate,
    customization: TemplateCustomization,
  ): AgentTemplate {
    // Add to arrays or merge objects
    const parts = customization.target.split('.');
    let current: any = template;

    for (let i = 0; i < parts.length - 1; i++) {
      current = current[parts[i]];
    }

    const targetArray = current[parts[parts.length - 1]];
    if (Array.isArray(targetArray)) {
      targetArray.push(customization.value);
    } else if (typeof targetArray === 'object') {
      Object.assign(targetArray, customization.value);
    }

    return template;
  }

  /**
   * Apply replacement customization
   */
  private applyReplacement(
    template: AgentTemplate,
    customization: TemplateCustomization,
  ): AgentTemplate {
    // Replace entire sections or structures
    return this.applyOverride(template, customization);
  }

  /**
   * Process content according to template rules
   */
  private async processContent(
    content: ContextContent,
    template: AgentTemplate,
    renderContext: TemplateRenderContext,
  ): Promise<ContextContent> {
    let processedContent = { ...content };

    // Apply content rules
    for (const rule of template.template.contentRules) {
      processedContent = await this.applyContentRule(processedContent, rule, renderContext);
    }

    return processedContent;
  }

  /**
   * Apply a content rule
   */
  private async applyContentRule(
    content: ContextContent,
    rule: ContentRule,
    renderContext: TemplateRenderContext,
  ): Promise<ContextContent> {
    // Simplified rule application
    // In production, this would use a proper rule engine

    switch (rule.type) {
      case 'include':
        // Boost priority of matching content
        if (rule.parameters.boost) {
          // Apply boost logic here
        }
        break;
      case 'exclude':
        // Remove matching content
        break;
      case 'transform':
        // Apply transformations
        break;
      case 'validate':
        // Validate content
        break;
    }

    return content;
  }

  /**
   * Render the template with processed content
   */
  private async renderTemplate(
    content: ContextContent,
    template: AgentTemplate,
    renderContext: TemplateRenderContext,
  ): Promise<string> {
    const sections = template.template.structure.sections.sort((a, b) => a.order - b.order);
    const renderedSections: string[] = [];

    for (const section of sections) {
      try {
        const sectionContent = await this.renderSection(section, content, template, renderContext);
        if (sectionContent.trim()) {
          renderedSections.push(sectionContent);
        }
      } catch (error) {
        logger.warn(`[AgentTemplateEngine] Failed to render section ${section.id}:`, error);
        if (section.required) {
          renderedSections.push(`[ERROR: Failed to render required section ${section.name}]`);
        }
      }
    }

    return renderedSections.join('\n\n');
  }

  /**
   * Render a specific section
   */
  private async renderSection(
    section: TemplateSection,
    content: ContextContent,
    template: AgentTemplate,
    renderContext: TemplateRenderContext,
  ): Promise<string> {
    const formatting = template.template.formatting;
    let sectionContent = '';

    // Add section header
    switch (formatting.style) {
      case 'markdown':
        sectionContent += `## ${section.name}\n\n`;
        break;
      case 'plain':
        sectionContent += `${section.name}:\n`;
        break;
    }

    // Get content for this section
    const sectionData = this.getSectionData(section, content);

    if (!sectionData && section.required) {
      sectionContent += '[No data available for required section]\n';
    } else if (sectionData) {
      // Format content based on type
      switch (section.contentType) {
        case 'text':
          sectionContent += this.formatTextContent(sectionData, formatting);
          break;
        case 'list':
          sectionContent += this.formatListContent(sectionData, formatting);
          break;
        case 'code':
          sectionContent += this.formatCodeContent(sectionData, formatting);
          break;
        case 'json':
          sectionContent += this.formatJsonContent(sectionData, formatting);
          break;
        case 'markdown':
          sectionContent += sectionData;
          break;
        default:
          sectionContent += String(sectionData);
      }
    }

    return sectionContent;
  }

  /**
   * Get data for a specific section
   */
  private getSectionData(section: TemplateSection, content: ContextContent): any {
    switch (section.id) {
      case 'executive_summary':
        return content.executiveSummary;
      case 'key_insights':
        return content.keyInsights;
      case 'critical_actions':
        return content.criticalActions;
      case 'job_memory':
        return content.jobMemory;
      case 'knowledge_base':
        return content.knowledgeBase;
      case 'realtime_data':
        return content.realtimeData;
      case 'agent_specific':
        return content.agentSpecific;
      default:
        return null;
    }
  }

  /**
   * Format text content
   */
  private formatTextContent(data: any, formatting: TemplateFormatting): string {
    if (typeof data === 'string') {
      return data + '\n';
    }
    return String(data) + '\n';
  }

  /**
   * Format list content
   */
  private formatListContent(data: any, formatting: TemplateFormatting): string {
    if (!Array.isArray(data)) {
      return String(data) + '\n';
    }

    const listItem = formatting.customDelimiters?.listItem || '- ';
    return data.map((item) => `${listItem}${item}`).join('\n') + '\n';
  }

  /**
   * Format code content
   */
  private formatCodeContent(data: any, formatting: TemplateFormatting): string {
    const codeStart = formatting.customDelimiters?.codeStart || '```';
    const codeEnd = formatting.customDelimiters?.codeEnd || '```';
    return `${codeStart}\n${String(data)}\n${codeEnd}\n`;
  }

  /**
   * Format JSON content
   */
  private formatJsonContent(data: any, formatting: TemplateFormatting): string {
    try {
      const jsonString = JSON.stringify(data, null, formatting.indentation);
      return this.formatCodeContent(jsonString, formatting);
    } catch {
      return String(data) + '\n';
    }
  }

  /**
   * Validate rendered content
   */
  private async validateRenderedContent(
    content: string,
    template: AgentTemplate,
  ): Promise<{ warnings: RenderWarning[] }> {
    const warnings: RenderWarning[] = [];

    // Check token count
    const tokenCount = this.estimateTokenCount(content);
    if (tokenCount > 5000) {
      warnings.push({
        type: 'performance_slow',
        severity: 'warning',
        message: `Rendered content exceeds 5000 tokens (${tokenCount})`,
        recommendation: 'Consider reducing content or optimizing template',
      });
    }

    // Check for empty required sections
    for (const section of template.template.structure.sections) {
      if (section.required) {
        const sectionPattern = new RegExp(`## ${section.name}\\s*\\n\\s*\\[No data available`, 'i');
        if (sectionPattern.test(content)) {
          warnings.push({
            type: 'missing_section',
            severity: 'error',
            message: `Required section '${section.name}' has no data`,
            section: section.id,
            recommendation: 'Ensure content is available for all required sections',
          });
        }
      }
    }

    return { warnings };
  }

  /**
   * Estimate token count for content
   */
  private estimateTokenCount(content: string): number {
    return Math.ceil(content.length * 0.25); // Simple character-based estimation
  }

  /**
   * Get list of rendered sections
   */
  private getRenderedSections(template: AgentTemplate): string[] {
    return template.template.structure.sections.map((s) => s.id);
  }

  /**
   * Record performance metrics
   */
  private recordPerformance(operation: string, duration: number): void {
    if (!this.performanceMetrics.has(operation)) {
      this.performanceMetrics.set(operation, []);
    }

    const metrics = this.performanceMetrics.get(operation);
    metrics.push(duration);

    // Keep only last 100 measurements
    if (metrics.length > 100) {
      metrics.shift();
    }
  }

  /**
   * Load custom template from file
   */
  async loadCustomTemplate(templatePath: string): Promise<AgentTemplate> {
    try {
      const templateData = await fs.readFile(templatePath, 'utf-8');
      const template: AgentTemplate = JSON.parse(templateData);

      // Validate template
      if (!this.validateTemplate(template)) {
        throw new Error('Invalid template structure');
      }

      // Register template
      this.registry.customTemplates.set(template.id, template);

      logger.info(`[AgentTemplateEngine] Loaded custom template: ${template.id}`);
      return template;
    } catch (error) {
      logger.error(`[AgentTemplateEngine] Failed to load template from ${templatePath}:`, error);
      throw error;
    }
  }

  /**
   * Validate template structure
   */
  private validateTemplate(template: AgentTemplate): boolean {
    return !!(
      template.id &&
      template.name &&
      template.agentType &&
      template.template &&
      template.template.structure &&
      template.template.structure.sections &&
      Array.isArray(template.template.structure.sections)
    );
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): Record<string, { avg: number; p95: number; p99: number }> {
    const stats: Record<string, { avg: number; p95: number; p99: number }> = {};

    for (const [operation, measurements] of this.performanceMetrics) {
      const sorted = [...measurements].sort((a, b) => a - b);
      const avg = measurements.reduce((sum, val) => sum + val, 0) / measurements.length;
      const p95Index = Math.floor(sorted.length * 0.95);
      const p99Index = Math.floor(sorted.length * 0.99);

      stats[operation] = {
        avg: Math.round(avg),
        p95: sorted[p95Index] || avg,
        p99: sorted[p99Index] || avg,
      };
    }

    return stats;
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.registry.templateCache.clear();
    this.performanceMetrics.clear();
    logger.info('[AgentTemplateEngine] Cleaned up resources');
  }
}

export default AgentTemplateEngine;
