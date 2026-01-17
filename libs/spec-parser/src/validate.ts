/**
 * Validation utilities for SpecOutput objects.
 */

import type { SpecOutput } from '@automaker/types';

/**
 * Validation result containing errors if any.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a SpecOutput object for required fields and data integrity.
 *
 * @param spec - The SpecOutput object to validate
 * @returns ValidationResult with errors if validation fails
 */
export function validateSpec(spec: SpecOutput | null | undefined): ValidationResult {
  const errors: string[] = [];

  if (!spec) {
    return { valid: false, errors: ['Spec is null or undefined'] };
  }

  // Required string fields
  if (!spec.project_name || typeof spec.project_name !== 'string') {
    errors.push('project_name is required and must be a string');
  } else if (spec.project_name.trim().length === 0) {
    errors.push('project_name cannot be empty');
  }

  if (!spec.overview || typeof spec.overview !== 'string') {
    errors.push('overview is required and must be a string');
  } else if (spec.overview.trim().length === 0) {
    errors.push('overview cannot be empty');
  }

  // Required array fields
  if (!Array.isArray(spec.technology_stack)) {
    errors.push('technology_stack is required and must be an array');
  } else if (spec.technology_stack.length === 0) {
    errors.push('technology_stack must have at least one item');
  } else if (spec.technology_stack.some((t) => typeof t !== 'string' || t.trim() === '')) {
    errors.push('technology_stack items must be non-empty strings');
  }

  if (!Array.isArray(spec.core_capabilities)) {
    errors.push('core_capabilities is required and must be an array');
  } else if (spec.core_capabilities.length === 0) {
    errors.push('core_capabilities must have at least one item');
  } else if (spec.core_capabilities.some((c) => typeof c !== 'string' || c.trim() === '')) {
    errors.push('core_capabilities items must be non-empty strings');
  }

  // Implemented features
  if (!Array.isArray(spec.implemented_features)) {
    errors.push('implemented_features is required and must be an array');
  } else {
    spec.implemented_features.forEach((f, i) => {
      if (!f.name || typeof f.name !== 'string' || f.name.trim() === '') {
        errors.push(`implemented_features[${i}].name is required and must be a non-empty string`);
      }
      if (!f.description || typeof f.description !== 'string') {
        errors.push(`implemented_features[${i}].description is required and must be a string`);
      }
      if (f.file_locations !== undefined) {
        if (!Array.isArray(f.file_locations)) {
          errors.push(`implemented_features[${i}].file_locations must be an array if provided`);
        } else if (f.file_locations.some((loc) => typeof loc !== 'string' || loc.trim() === '')) {
          errors.push(`implemented_features[${i}].file_locations items must be non-empty strings`);
        }
      }
    });
  }

  // Optional array fields
  if (spec.additional_requirements !== undefined) {
    if (!Array.isArray(spec.additional_requirements)) {
      errors.push('additional_requirements must be an array if provided');
    } else if (spec.additional_requirements.some((r) => typeof r !== 'string' || r.trim() === '')) {
      errors.push('additional_requirements items must be non-empty strings');
    }
  }

  if (spec.development_guidelines !== undefined) {
    if (!Array.isArray(spec.development_guidelines)) {
      errors.push('development_guidelines must be an array if provided');
    } else if (spec.development_guidelines.some((g) => typeof g !== 'string' || g.trim() === '')) {
      errors.push('development_guidelines items must be non-empty strings');
    }
  }

  // Implementation roadmap
  if (spec.implementation_roadmap !== undefined) {
    if (!Array.isArray(spec.implementation_roadmap)) {
      errors.push('implementation_roadmap must be an array if provided');
    } else {
      const validStatuses = ['completed', 'in_progress', 'pending'];
      spec.implementation_roadmap.forEach((r, i) => {
        if (!r.phase || typeof r.phase !== 'string' || r.phase.trim() === '') {
          errors.push(
            `implementation_roadmap[${i}].phase is required and must be a non-empty string`
          );
        }
        if (!r.status || !validStatuses.includes(r.status)) {
          errors.push(
            `implementation_roadmap[${i}].status must be one of: ${validStatuses.join(', ')}`
          );
        }
        if (!r.description || typeof r.description !== 'string') {
          errors.push(`implementation_roadmap[${i}].description is required and must be a string`);
        }
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check if XML content appears to be a valid spec XML (basic structure check).
 * This is a quick check, not a full validation.
 *
 * @param xmlContent - The XML content to check
 * @returns true if the content appears to be valid spec XML
 */
export function isValidSpecXml(xmlContent: string): boolean {
  if (!xmlContent || typeof xmlContent !== 'string') {
    return false;
  }

  // Check for essential elements
  const hasRoot = xmlContent.includes('<project_specification>');
  const hasProjectName = /<project_name>[\s\S]*?<\/project_name>/.test(xmlContent);
  const hasOverview = /<overview>[\s\S]*?<\/overview>/.test(xmlContent);
  const hasTechStack = /<technology_stack>[\s\S]*?<\/technology_stack>/.test(xmlContent);
  const hasCapabilities = /<core_capabilities>[\s\S]*?<\/core_capabilities>/.test(xmlContent);

  return hasRoot && hasProjectName && hasOverview && hasTechStack && hasCapabilities;
}
