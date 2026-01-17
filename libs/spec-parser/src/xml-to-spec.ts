/**
 * XML to SpecOutput parser.
 * Parses app_spec.txt XML content into a structured SpecOutput object.
 * Uses fast-xml-parser for robust XML parsing.
 */

import { XMLParser } from 'fast-xml-parser';
import type { SpecOutput } from '@automaker/types';

/**
 * Result of parsing XML content.
 */
export interface ParseResult {
  success: boolean;
  spec: SpecOutput | null;
  errors: string[];
}

// Configure the XML parser
const parser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
  // Preserve arrays for elements that can have multiple values
  isArray: (name) => {
    return [
      'technology',
      'capability',
      'feature',
      'location',
      'requirement',
      'guideline',
      'phase',
    ].includes(name);
  },
});

/**
 * Safely get a string value from parsed XML, handling various input types.
 */
function getString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (value === null || value === undefined) return '';
  return '';
}

/**
 * Safely get an array of strings from parsed XML.
 */
function getStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => getString(item)).filter((s) => s.length > 0);
  }
  const str = getString(value);
  return str ? [str] : [];
}

/**
 * Parse implemented features from the parsed XML object.
 */
function parseImplementedFeatures(featuresSection: unknown): SpecOutput['implemented_features'] {
  const features: SpecOutput['implemented_features'] = [];

  if (!featuresSection || typeof featuresSection !== 'object') {
    return features;
  }

  const section = featuresSection as Record<string, unknown>;
  const featureList = section.feature;

  if (!featureList) return features;

  const featureArray = Array.isArray(featureList) ? featureList : [featureList];

  for (const feature of featureArray) {
    if (typeof feature !== 'object' || feature === null) continue;

    const f = feature as Record<string, unknown>;
    const name = getString(f.name);
    const description = getString(f.description);

    if (!name) continue;

    const locationsSection = f.file_locations as Record<string, unknown> | undefined;
    const file_locations = locationsSection ? getStringArray(locationsSection.location) : undefined;

    features.push({
      name,
      description,
      ...(file_locations && file_locations.length > 0 ? { file_locations } : {}),
    });
  }

  return features;
}

/**
 * Parse implementation roadmap phases from the parsed XML object.
 */
function parseImplementationRoadmap(roadmapSection: unknown): SpecOutput['implementation_roadmap'] {
  if (!roadmapSection || typeof roadmapSection !== 'object') {
    return undefined;
  }

  const section = roadmapSection as Record<string, unknown>;
  const phaseList = section.phase;

  if (!phaseList) return undefined;

  const phaseArray = Array.isArray(phaseList) ? phaseList : [phaseList];
  const roadmap: NonNullable<SpecOutput['implementation_roadmap']> = [];

  for (const phase of phaseArray) {
    if (typeof phase !== 'object' || phase === null) continue;

    const p = phase as Record<string, unknown>;
    const phaseName = getString(p.name);
    const statusRaw = getString(p.status);
    const description = getString(p.description);

    if (!phaseName) continue;

    const status = (
      ['completed', 'in_progress', 'pending'].includes(statusRaw) ? statusRaw : 'pending'
    ) as 'completed' | 'in_progress' | 'pending';

    roadmap.push({ phase: phaseName, status, description });
  }

  return roadmap.length > 0 ? roadmap : undefined;
}

/**
 * Parse XML content into a SpecOutput object.
 *
 * @param xmlContent - The raw XML content from app_spec.txt
 * @returns ParseResult with the parsed spec or errors
 */
export function xmlToSpec(xmlContent: string): ParseResult {
  const errors: string[] = [];

  // Check for root element before parsing
  if (!xmlContent.includes('<project_specification>')) {
    return {
      success: false,
      spec: null,
      errors: ['Missing <project_specification> root element'],
    };
  }

  // Parse the XML
  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(xmlContent) as Record<string, unknown>;
  } catch (e) {
    return {
      success: false,
      spec: null,
      errors: [`XML parsing error: ${e instanceof Error ? e.message : 'Unknown error'}`],
    };
  }

  const root = parsed.project_specification as Record<string, unknown> | undefined;

  if (!root) {
    return {
      success: false,
      spec: null,
      errors: ['Missing <project_specification> root element'],
    };
  }

  // Extract required fields
  const project_name = getString(root.project_name);
  if (!project_name) {
    errors.push('Missing or empty <project_name>');
  }

  const overview = getString(root.overview);
  if (!overview) {
    errors.push('Missing or empty <overview>');
  }

  // Extract technology stack
  const techSection = root.technology_stack as Record<string, unknown> | undefined;
  const technology_stack = techSection ? getStringArray(techSection.technology) : [];
  if (technology_stack.length === 0) {
    errors.push('Missing or empty <technology_stack>');
  }

  // Extract core capabilities
  const capSection = root.core_capabilities as Record<string, unknown> | undefined;
  const core_capabilities = capSection ? getStringArray(capSection.capability) : [];
  if (core_capabilities.length === 0) {
    errors.push('Missing or empty <core_capabilities>');
  }

  // Extract implemented features
  const implemented_features = parseImplementedFeatures(root.implemented_features);

  // Extract optional sections
  const reqSection = root.additional_requirements as Record<string, unknown> | undefined;
  const additional_requirements = reqSection ? getStringArray(reqSection.requirement) : undefined;

  const guideSection = root.development_guidelines as Record<string, unknown> | undefined;
  const development_guidelines = guideSection ? getStringArray(guideSection.guideline) : undefined;

  const implementation_roadmap = parseImplementationRoadmap(root.implementation_roadmap);

  // Build spec object
  const spec: SpecOutput = {
    project_name,
    overview,
    technology_stack,
    core_capabilities,
    implemented_features,
    ...(additional_requirements && additional_requirements.length > 0
      ? { additional_requirements }
      : {}),
    ...(development_guidelines && development_guidelines.length > 0
      ? { development_guidelines }
      : {}),
    ...(implementation_roadmap ? { implementation_roadmap } : {}),
  };

  return {
    success: errors.length === 0,
    spec,
    errors,
  };
}
