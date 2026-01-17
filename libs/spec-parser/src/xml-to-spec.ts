/**
 * XML to SpecOutput parser.
 * Parses app_spec.txt XML content into a structured SpecOutput object.
 */

import type { SpecOutput } from '@automaker/types';
import { extractXmlSection, extractXmlElements, unescapeXml } from './xml-utils.js';

/**
 * Result of parsing XML content.
 */
export interface ParseResult {
  success: boolean;
  spec: SpecOutput | null;
  errors: string[];
}

/**
 * Parse implemented features from the XML content.
 */
function parseImplementedFeatures(xmlContent: string): SpecOutput['implemented_features'] {
  const features: SpecOutput['implemented_features'] = [];
  const section = extractXmlSection(xmlContent, 'implemented_features');

  if (!section) {
    return features;
  }

  const featureRegex = /<feature>([\s\S]*?)<\/feature>/g;
  const featureMatches = section.matchAll(featureRegex);

  for (const featureMatch of featureMatches) {
    const featureContent = featureMatch[1];

    const nameMatch = featureContent.match(/<name>([\s\S]*?)<\/name>/);
    const name = nameMatch ? unescapeXml(nameMatch[1].trim()) : '';

    const descMatch = featureContent.match(/<description>([\s\S]*?)<\/description>/);
    const description = descMatch ? unescapeXml(descMatch[1].trim()) : '';

    const locationsSection = extractXmlSection(featureContent, 'file_locations');
    const file_locations = locationsSection
      ? extractXmlElements(locationsSection, 'location')
      : undefined;

    if (name) {
      features.push({
        name,
        description,
        ...(file_locations && file_locations.length > 0 ? { file_locations } : {}),
      });
    }
  }

  return features;
}

/**
 * Parse implementation roadmap phases from XML content.
 */
function parseImplementationRoadmap(xmlContent: string): SpecOutput['implementation_roadmap'] {
  const roadmap: NonNullable<SpecOutput['implementation_roadmap']> = [];
  const section = extractXmlSection(xmlContent, 'implementation_roadmap');

  if (!section) {
    return undefined;
  }

  const phaseRegex = /<phase>([\s\S]*?)<\/phase>/g;
  const phaseMatches = section.matchAll(phaseRegex);

  for (const phaseMatch of phaseMatches) {
    const phaseContent = phaseMatch[1];

    const nameMatch = phaseContent.match(/<name>([\s\S]*?)<\/name>/);
    const phase = nameMatch ? unescapeXml(nameMatch[1].trim()) : '';

    const statusMatch = phaseContent.match(/<status>([\s\S]*?)<\/status>/);
    const statusRaw = statusMatch ? unescapeXml(statusMatch[1].trim()) : 'pending';
    const status = (
      ['completed', 'in_progress', 'pending'].includes(statusRaw) ? statusRaw : 'pending'
    ) as 'completed' | 'in_progress' | 'pending';

    const descMatch = phaseContent.match(/<description>([\s\S]*?)<\/description>/);
    const description = descMatch ? unescapeXml(descMatch[1].trim()) : '';

    if (phase) {
      roadmap.push({ phase, status, description });
    }
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

  // Check for root element
  if (!xmlContent.includes('<project_specification>')) {
    return {
      success: false,
      spec: null,
      errors: ['Missing <project_specification> root element'],
    };
  }

  // Extract required fields
  const projectNameSection = extractXmlSection(xmlContent, 'project_name');
  const project_name = projectNameSection ? unescapeXml(projectNameSection.trim()) : '';

  if (!project_name) {
    errors.push('Missing or empty <project_name>');
  }

  const overviewSection = extractXmlSection(xmlContent, 'overview');
  const overview = overviewSection ? unescapeXml(overviewSection.trim()) : '';

  if (!overview) {
    errors.push('Missing or empty <overview>');
  }

  // Extract technology stack
  const techSection = extractXmlSection(xmlContent, 'technology_stack');
  const technology_stack = techSection ? extractXmlElements(techSection, 'technology') : [];

  if (technology_stack.length === 0) {
    errors.push('Missing or empty <technology_stack>');
  }

  // Extract core capabilities
  const capabilitiesSection = extractXmlSection(xmlContent, 'core_capabilities');
  const core_capabilities = capabilitiesSection
    ? extractXmlElements(capabilitiesSection, 'capability')
    : [];

  if (core_capabilities.length === 0) {
    errors.push('Missing or empty <core_capabilities>');
  }

  // Extract implemented features
  const implemented_features = parseImplementedFeatures(xmlContent);

  // Extract optional sections
  const requirementsSection = extractXmlSection(xmlContent, 'additional_requirements');
  const additional_requirements = requirementsSection
    ? extractXmlElements(requirementsSection, 'requirement')
    : undefined;

  const guidelinesSection = extractXmlSection(xmlContent, 'development_guidelines');
  const development_guidelines = guidelinesSection
    ? extractXmlElements(guidelinesSection, 'guideline')
    : undefined;

  const implementation_roadmap = parseImplementationRoadmap(xmlContent);

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
