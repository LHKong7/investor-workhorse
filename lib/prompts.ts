import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

interface FinancialAnalystConfig {
  system: {
    role: string;
    description: string;
    identity: {
      name: string;
      expertise: string[];
    };
    behavior: {
      tone: string;
      style: string;
      format: string;
    };
    output_sections: Array<{
      section: string;
      description: string;
      priority: number;
      include?: string[];
      analyze?: string[];
      categories?: string[];
      identify?: string[];
      flag?: string[];
      provide?: string[];
    }>;
    guidelines: {
      analysis_quality: string[];
      output_format: string[];
      communication: string[];
      scope_boundaries: {
        focus_areas: string[];
        out_of_scope: string[];
      };
    };
    quality_standards: {
      accuracy: string[];
      completeness: string[];
      actionability: string[];
    };
    error_handling: {
      insufficient_data: { response: string; example: string };
      ambiguous_figures: { response: string; example: string };
      inconsistencies: { response: string; example: string };
    };
    language_support: {
      primary: string;
      secondary: string;
      instructions: string;
    };
    streaming_behavior: {
      enabled: boolean;
      protocol: string;
      events: Array<{
        event: string;
        description: string;
      }>;
    };
    skills_loading: {
      instruction: string;
      purpose: string;
    };
  };
  meta: {
    version: string;
    last_updated: string;
    compatible_with: string[];
    configuration: {
      model: {
        default: string;
        alternatives: string[];
      };
      temperature: number;
      max_tokens: number;
      tools: {
        enabled: boolean;
        builtin: boolean;
        custom: string[];
      };
    };
  };
}

let cachedConfig: FinancialAnalystConfig | null = null;

/**
 * Load the financial analyst system prompt configuration from YAML
 */
export function loadFinancialAnalystConfig(): FinancialAnalystConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    // Try multiple possible paths for the YAML file
    const possiblePaths = [
      path.join(process.cwd(), 'data', 'prompts', 'financial-analyst-system.yaml'),
      path.join(__dirname, '..', 'data', 'prompts', 'financial-analyst-system.yaml'),
      path.join(process.cwd(), 'data', 'prompts', 'financial-analyst-system.yaml'),
    ];

    let fileContents: string | null = null;
    let usedPath = '';

    for (const configPath of possiblePaths) {
      try {
        if (fs.existsSync(configPath)) {
          fileContents = fs.readFileSync(configPath, 'utf8');
          usedPath = configPath;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!fileContents) {
      throw new Error(`Could not find YAML file in any of these paths: ${possiblePaths.join(', ')}`);
    }

    console.log(`Loading config from: ${usedPath}`);
    cachedConfig = yaml.load(fileContents) as FinancialAnalystConfig;

    return cachedConfig!;
  } catch (error) {
    console.error('Failed to load financial analyst config:', error);
    // Fallback to basic configuration
    return {
      system: {
        role: 'Financial Analysis Expert',
        description: 'Specialized AI agent for comprehensive financial report analysis',
        identity: {
          name: 'Financial Analyst Agent',
          expertise: ['Financial statement analysis'],
        },
        behavior: {
          tone: 'professional, objective, analytical',
          style: 'clear, structured, actionable',
          format: 'markdown',
        },
        output_sections: [],
        guidelines: {
          analysis_quality: [],
          output_format: [],
          communication: [],
          scope_boundaries: {
            focus_areas: [],
            out_of_scope: [],
          },
        },
        quality_standards: {
          accuracy: [],
          completeness: [],
          actionability: [],
        },
        error_handling: {
          insufficient_data: { response: '', example: '' },
          ambiguous_figures: { response: '', example: '' },
          inconsistencies: { response: '', example: '' },
        },
        language_support: {
          primary: 'English',
          secondary: 'Chinese',
          instructions: 'Analyze in the language of the report',
        },
        streaming_behavior: {
          enabled: true,
          protocol: 'Server-Sent Events',
          events: [],
        },
        skills_loading: {
          instruction: '',
          purpose: '',
        },
      },
      meta: {
        version: '1.0.0',
        last_updated: '2026-03-02',
        compatible_with: [],
        configuration: {
          model: {
            default: 'gpt-4o-mini',
            alternatives: [],
          },
          temperature: 0.3,
          max_tokens: 8192,
          tools: {
            enabled: true,
            builtin: true,
            custom: [],
          },
        },
      },
    };
  }
}

/**
 * Generate a formatted system prompt from the YAML configuration
 */
export function generateFinancialAnalystSystemPrompt(
  config?: FinancialAnalystConfig
): string {
  const cfg = config || loadFinancialAnalystConfig();
  const { system } = cfg;

  const sections = system.output_sections
    .sort((a, b) => a.priority - b.priority)
    .map((s) => `${s.priority}. ${s.section}`)
    .join('\n');

  return `You are ${system.identity.name}, ${system.description}.

Your role is to analyze financial reports and provide comprehensive insights including:
${sections}

${system.skills_loading.instruction}

${system.skills_loading.purpose}

**Behavior Guidelines:**
- Tone: ${system.behavior.tone}
- Style: ${system.behavior.style}
- Format: ${system.behavior.format}

**Output Requirements:**
${system.guidelines.output_format.map((g) => `- ${g}`).join('\n')}

**Communication Style:**
${system.guidelines.communication.map((c) => `- ${c}`).join('\n')}

**Language Support:**
${system.language_support.instructions}

${system.quality_standards.actionability.join('\n')}

Provide clear, actionable insights in a structured format.`;
}

/**
 * Get the model configuration from the YAML
 */
export function getModelConfig(config?: FinancialAnalystConfig) {
  const cfg = config || loadFinancialAnalystConfig();

  // Safely access nested properties
  if (!cfg || !cfg.meta || !cfg.meta.configuration) {
    console.error('Invalid config structure, using fallback');
    return {
      model: { default: 'deepseek-chat', alternatives: [] },
      temperature: 0.3,
      max_tokens: 8192,
      tools: { enabled: true, builtin: true, custom: [] },
    };
  }

  return cfg.meta.configuration;
}

/**
 * Get streaming configuration
 */
export function getStreamingConfig(config?: FinancialAnalystConfig) {
  const cfg = config || loadFinancialAnalystConfig();

  if (!cfg || !cfg.system || !cfg.system.streaming_behavior) {
    return {
      enabled: true,
      protocol: 'Server-Sent Events',
      events: [],
    };
  }

  return cfg.system.streaming_behavior;
}
