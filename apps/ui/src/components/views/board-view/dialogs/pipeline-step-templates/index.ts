import { codeReviewTemplate } from './code-review';
import { securityReviewTemplate } from './security-review';
import { uxReviewTemplate } from './ux-review';
import { testingTemplate } from './testing';
import { documentationTemplate } from './documentation';
import { optimizationTemplate } from './optimization';

export interface PipelineStepTemplate {
  id: string;
  name: string;
  colorClass: string;
  instructions: string;
}

export const STEP_TEMPLATES: PipelineStepTemplate[] = [
  codeReviewTemplate,
  securityReviewTemplate,
  uxReviewTemplate,
  testingTemplate,
  documentationTemplate,
  optimizationTemplate,
];

// Helper to get template color class
export const getTemplateColorClass = (templateId: string): string => {
  const template = STEP_TEMPLATES.find((t) => t.id === templateId);
  return template?.colorClass || 'bg-blue-500/20';
};
