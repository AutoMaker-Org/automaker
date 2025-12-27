/**
 * Security Pipeline Step Implementation
 * Performs security analysis including OWASP Top 10, vulnerability patterns, and security best practices
 */

import type { PipelineStepConfig, PipelineStepResult, Feature } from '@automaker/types';
import type { AutoModeService } from '../services/auto-mode-service.js';

export interface SecurityStepConfig {
  checklist: string[];
  minSeverity: 'low' | 'medium' | 'high' | 'critical';
  excludeTests?: boolean;
  checkDependencies?: boolean;
}

export class SecurityStep {
  private autoModeService: AutoModeService;

  constructor(autoModeService: AutoModeService) {
    this.autoModeService = autoModeService;
  }

  async execute(
    feature: Feature,
    stepConfig: PipelineStepConfig & { config: SecurityStepConfig },
    signal: AbortSignal,
    projectPath?: string
  ): Promise<PipelineStepResult> {
    const { config } = stepConfig;
    const prompt = this.buildSecurityPrompt(feature, config);

    try {
      // Get the model to use
      const model = this.autoModeService.getStepModel(feature, stepConfig);

      // Execute the security check using the AI model
      const result = await this.autoModeService.executeAIStep({
        feature,
        stepConfig,
        signal,
        prompt,
        projectPath,
        onProgress: (message) => {
          console.log(`[Security Step] ${message}`);
        },
      });

      // Parse and validate the result
      const parsedResult = this.parseSecurityResult(result.output);

      // Filter by minimum severity
      const filteredIssues = this.filterIssuesBySeverity(
        parsedResult.vulnerabilities,
        config.minSeverity
      );

      return {
        status: result.status,
        output: result.output,
        issues: filteredIssues.map((vuln: Record<string, unknown>) => ({
          hash: this.generateIssueHash(vuln),
          summary: String(vuln.title || vuln.description || ''),
          location: vuln.file ? `${vuln.file}:${vuln.line || 0}` : undefined,
          severity: this.mapSeverity(String(vuln.severity || 'medium')),
        })),
        metadata: {
          vulnerabilities: filteredIssues,
          recommendations: parsedResult.recommendations,
          securityScore: parsedResult.securityScore,
        },
      };
    } catch (error) {
      return {
        status: 'failed',
        output: error instanceof Error ? error.message : 'Security step failed',
        metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  private buildSecurityPrompt(feature: Feature, config: SecurityStepConfig): string {
    let prompt = `Perform a comprehensive security review of the implemented feature.

Feature Details:
- Title: ${feature.title}
- Description: ${feature.description}
- Status: ${feature.status}

Security Review Checklist:
`;

    // Add custom checklist items
    if (config.checklist && config.checklist.length > 0) {
      config.checklist.forEach((item) => {
        prompt += `- ${item}\n`;
      });
    } else {
      // Default security checklist
      prompt += `- OWASP Top 10 vulnerabilities (2021)
- Injection flaws (SQL, NoSQL, OS command, LDAP)
- Broken authentication and session management
- Sensitive data exposure and encryption
- XML external entities (XXE)
- Broken access control
- Security misconfiguration
- Cross-site scripting (XSS)
- Insecure deserialization
- Using components with known vulnerabilities
- Insufficient logging and monitoring
- Input validation and sanitization
- Output encoding and escaping
- Authentication and authorization checks
- Security headers implementation
- CORS configuration
- CSRF protection
- Secure cookie handling
- File upload security
- API rate limiting
- Error handling and information disclosure
`;
    }

    if (config.checkDependencies) {
      prompt += `
- Third-party dependency vulnerabilities
- Outdated packages with known CVEs
- License compliance issues
`;
    }

    prompt += `
Minimum severity level to report: ${config.minSeverity}

Please analyze the code and provide your security review in the following JSON format:
{
  "summary": "Brief summary of security posture",
  "vulnerabilities": [
    {
      "severity": "critical|high|medium|low|info",
      "category": "injection|auth|data|config|xss|access|crypto|dependency|other",
      "cwe": "CWE number if applicable",
      "file": "file path",
      "line": line_number,
      "title": "Vulnerability title",
      "description": "Detailed description of the vulnerability",
      "impact": "Potential impact if exploited",
      "recommendation": "How to fix the vulnerability",
      "code": "Vulnerable code snippet (optional)"
    }
  ],
  "recommendations": [
    {
      "priority": "high|medium|low",
      "type": "preventive|detective|corrective",
      "description": "Security improvement recommendation",
      "implementation": "How to implement"
    }
  ],
  "securityScore": number (0-100),
  "compliance": {
    "owasp": boolean,
    "gdpr": boolean,
    "pci": boolean,
    "hipaa": boolean
  }
}

Focus on finding real security vulnerabilities that could impact the application.
`;

    if (!config.excludeTests) {
      prompt += `
Include test files in the security review as they might contain security-related test cases.
`;
    }

    return prompt;
  }

  private parseSecurityResult(output: string): {
    vulnerabilities: Array<Record<string, unknown>>;
    recommendations: Array<Record<string, unknown>>;
    securityScore: number;
  } {
    try {
      // Try to extract JSON from the output
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in output');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        vulnerabilities: parsed.vulnerabilities || [],
        recommendations: parsed.recommendations || [],
        securityScore: parsed.securityScore || 0,
      };
    } catch (error) {
      console.error('[Security Step] Failed to parse result:', error);
      return {
        vulnerabilities: [],
        recommendations: [],
        securityScore: 0,
      };
    }
  }

  private filterIssuesBySeverity(
    vulnerabilities: Record<string, unknown>[],
    minSeverity: string
  ): Record<string, unknown>[] {
    const severityOrder: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
      info: 0,
    };

    const minLevel = severityOrder[minSeverity] || 0;

    return vulnerabilities.filter((vuln) => {
      const level = severityOrder[String(vuln.severity)] || 0;
      return level >= minLevel;
    });
  }

  private generateIssueHash(vuln: Record<string, unknown>): string {
    const normalized = [
      String(vuln.title || vuln.description || '')
        .toLowerCase()
        .trim(),
      String(vuln.file || '').toLowerCase(),
      String(vuln.line || 0),
      String(vuln.category || '').toLowerCase(),
    ].join('|');

    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  private mapSeverity(severity: string): 'low' | 'medium' | 'high' {
    switch (severity.toLowerCase()) {
      case 'critical':
      case 'high':
        return 'high';
      case 'medium':
        return 'medium';
      default:
        return 'low';
    }
  }
}
