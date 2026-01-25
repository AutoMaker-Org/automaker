/**
 * XML Extraction Utilities
 *
 * Robust XML parsing utilities for extracting and updating sections
 * from app_spec.txt XML content. Uses regex-based parsing which is
 * sufficient for our controlled XML structure.
 *
 * Note: If more complex XML parsing is needed in the future, consider
 * using a library like 'fast-xml-parser' or 'xml2js'.
 */

import { createLogger } from '@automaker/utils';
import type { SpecOutput } from '@automaker/types';

const logger = createLogger('XmlExtractor');

/**
 * Represents an implemented feature extracted from XML
 */
export interface ImplementedFeature {
  name: string;
  description: string;
  file_locations?: string[];
}

/**
 * Logger interface for optional custom logging
 */
export interface XmlExtractorLogger {
  debug: (message: string, ...args: unknown[]) => void;
  warn?: (message: string, ...args: unknown[]) => void;
}

/**
 * Options for XML extraction operations
 */
export interface ExtractXmlOptions {
  /** Custom logger (defaults to internal logger) */
  logger?: XmlExtractorLogger;
}

/**
 * Escape special XML characters
 * Handles undefined/null values by converting them to empty strings
 */
export function escapeXml(str: string | undefined | null): string {
  if (str == null) {
    return '';
  }
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Unescape XML entities back to regular characters
 */
export function unescapeXml(str: string): string {
  return str
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

/**
 * Extract the content of a specific XML section
 *
 * @param xmlContent - The full XML content
 * @param tagName - The tag name to extract (e.g., 'implemented_features')
 * @param options - Optional extraction options
 * @returns The content between the tags, or null if not found
 */
export function extractXmlSection(
  xmlContent: string,
  tagName: string,
  options: ExtractXmlOptions = {}
): string | null {
  const log = options.logger || logger;

  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xmlContent.match(regex);

  if (match) {
    log.debug(`Extracted <${tagName}> section`);
    return match[1];
  }

  log.debug(`Section <${tagName}> not found`);
  return null;
}

/**
 * Extract all values from repeated XML elements
 *
 * @param xmlContent - The XML content to search
 * @param tagName - The tag name to extract values from
 * @param options - Optional extraction options
 * @returns Array of extracted values (unescaped)
 */
export function extractXmlElements(
  xmlContent: string,
  tagName: string,
  options: ExtractXmlOptions = {}
): string[] {
  const log = options.logger || logger;
  const values: string[] = [];

  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'g');
  const matches = xmlContent.matchAll(regex);

  for (const match of matches) {
    values.push(unescapeXml(match[1].trim()));
  }

  log.debug(`Extracted ${values.length} <${tagName}> elements`);
  return values;
}

/**
 * Extract implemented features from app_spec.txt XML content
 *
 * @param specContent - The full XML content of app_spec.txt
 * @param options - Optional extraction options
 * @returns Array of implemented features with name, description, and optional file_locations
 */
export function extractImplementedFeatures(
  specContent: string,
  options: ExtractXmlOptions = {}
): ImplementedFeature[] {
  const log = options.logger || logger;
  const features: ImplementedFeature[] = [];

  // Match <implemented_features>...</implemented_features> section
  const implementedSection = extractXmlSection(specContent, 'implemented_features', options);

  if (!implementedSection) {
    log.debug('No implemented_features section found');
    return features;
  }

  // Extract individual feature blocks
  const featureRegex = /<feature>([\s\S]*?)<\/feature>/g;
  const featureMatches = implementedSection.matchAll(featureRegex);

  for (const featureMatch of featureMatches) {
    const featureContent = featureMatch[1];

    // Extract name
    const nameMatch = featureContent.match(/<name>([\s\S]*?)<\/name>/);
    const name = nameMatch ? unescapeXml(nameMatch[1].trim()) : '';

    // Extract description
    const descMatch = featureContent.match(/<description>([\s\S]*?)<\/description>/);
    const description = descMatch ? unescapeXml(descMatch[1].trim()) : '';

    // Extract file_locations if present
    const locationsSection = extractXmlSection(featureContent, 'file_locations', options);
    const file_locations = locationsSection
      ? extractXmlElements(locationsSection, 'location', options)
      : undefined;

    if (name) {
      features.push({
        name,
        description,
        ...(file_locations && file_locations.length > 0 ? { file_locations } : {}),
      });
    }
  }

  log.debug(`Extracted ${features.length} implemented features`);
  return features;
}

/**
 * Extract only the feature names from implemented_features section
 *
 * @param specContent - The full XML content of app_spec.txt
 * @param options - Optional extraction options
 * @returns Array of feature names
 */
export function extractImplementedFeatureNames(
  specContent: string,
  options: ExtractXmlOptions = {}
): string[] {
  const features = extractImplementedFeatures(specContent, options);
  return features.map((f) => f.name);
}

/**
 * Generate XML for a single implemented feature
 *
 * @param feature - The feature to convert to XML
 * @param indent - The base indentation level (default: 2 spaces)
 * @returns XML string for the feature
 */
export function featureToXml(feature: ImplementedFeature, indent: string = '  '): string {
  const i2 = indent.repeat(2);
  const i3 = indent.repeat(3);
  const i4 = indent.repeat(4);

  let xml = `${i2}<feature>
${i3}<name>${escapeXml(feature.name)}</name>
${i3}<description>${escapeXml(feature.description)}</description>`;

  if (feature.file_locations && feature.file_locations.length > 0) {
    xml += `
${i3}<file_locations>
${feature.file_locations.map((loc) => `${i4}<location>${escapeXml(loc)}</location>`).join('\n')}
${i3}</file_locations>`;
  }

  xml += `
${i2}</feature>`;

  return xml;
}

/**
 * Generate XML for an array of implemented features
 *
 * @param features - Array of features to convert to XML
 * @param indent - The base indentation level (default: 2 spaces)
 * @returns XML string for the implemented_features section content
 */
export function featuresToXml(features: ImplementedFeature[], indent: string = '  '): string {
  return features.map((f) => featureToXml(f, indent)).join('\n');
}

/**
 * Update the implemented_features section in XML content
 *
 * @param specContent - The full XML content
 * @param newFeatures - The new features to set
 * @param options - Optional extraction options
 * @returns Updated XML content with the new implemented_features section
 */
export function updateImplementedFeaturesSection(
  specContent: string,
  newFeatures: ImplementedFeature[],
  options: ExtractXmlOptions = {}
): string {
  const log = options.logger || logger;
  const indent = '  ';

  // Generate new section content
  const newSectionContent = featuresToXml(newFeatures, indent);

  // Build the new section
  const newSection = `<implemented_features>
${newSectionContent}
${indent}</implemented_features>`;

  // Check if section exists
  const sectionRegex = /<implemented_features>[\s\S]*?<\/implemented_features>/;

  if (sectionRegex.test(specContent)) {
    log.debug('Replacing existing implemented_features section');
    return specContent.replace(sectionRegex, newSection);
  }

  // If section doesn't exist, try to insert after core_capabilities
  const coreCapabilitiesEnd = '</core_capabilities>';
  const insertIndex = specContent.indexOf(coreCapabilitiesEnd);

  if (insertIndex !== -1) {
    const insertPosition = insertIndex + coreCapabilitiesEnd.length;
    log.debug('Inserting implemented_features after core_capabilities');
    return (
      specContent.slice(0, insertPosition) +
      '\n\n' +
      indent +
      newSection +
      specContent.slice(insertPosition)
    );
  }

  // As a fallback, insert before </project_specification>
  const projectSpecEnd = '</project_specification>';
  const fallbackIndex = specContent.indexOf(projectSpecEnd);

  if (fallbackIndex !== -1) {
    log.debug('Inserting implemented_features before </project_specification>');
    return (
      specContent.slice(0, fallbackIndex) +
      indent +
      newSection +
      '\n' +
      specContent.slice(fallbackIndex)
    );
  }

  log.warn?.('Could not find appropriate insertion point for implemented_features');
  log.debug('Could not find appropriate insertion point for implemented_features');
  return specContent;
}

/**
 * Add a new feature to the implemented_features section
 *
 * @param specContent - The full XML content
 * @param newFeature - The feature to add
 * @param options - Optional extraction options
 * @returns Updated XML content with the new feature added
 */
export function addImplementedFeature(
  specContent: string,
  newFeature: ImplementedFeature,
  options: ExtractXmlOptions = {}
): string {
  const log = options.logger || logger;

  // Extract existing features
  const existingFeatures = extractImplementedFeatures(specContent, options);

  // Check for duplicates by name
  const isDuplicate = existingFeatures.some(
    (f) => f.name.toLowerCase() === newFeature.name.toLowerCase()
  );

  if (isDuplicate) {
    log.debug(`Feature "${newFeature.name}" already exists, skipping`);
    return specContent;
  }

  // Add the new feature
  const updatedFeatures = [...existingFeatures, newFeature];

  log.debug(`Adding feature "${newFeature.name}"`);
  return updateImplementedFeaturesSection(specContent, updatedFeatures, options);
}

/**
 * Remove a feature from the implemented_features section by name
 *
 * @param specContent - The full XML content
 * @param featureName - The name of the feature to remove
 * @param options - Optional extraction options
 * @returns Updated XML content with the feature removed
 */
export function removeImplementedFeature(
  specContent: string,
  featureName: string,
  options: ExtractXmlOptions = {}
): string {
  const log = options.logger || logger;

  // Extract existing features
  const existingFeatures = extractImplementedFeatures(specContent, options);

  // Filter out the feature to remove
  const updatedFeatures = existingFeatures.filter(
    (f) => f.name.toLowerCase() !== featureName.toLowerCase()
  );

  if (updatedFeatures.length === existingFeatures.length) {
    log.debug(`Feature "${featureName}" not found, no changes made`);
    return specContent;
  }

  log.debug(`Removing feature "${featureName}"`);
  return updateImplementedFeaturesSection(specContent, updatedFeatures, options);
}

/**
 * Update an existing feature in the implemented_features section
 *
 * @param specContent - The full XML content
 * @param featureName - The name of the feature to update
 * @param updates - Partial updates to apply to the feature
 * @param options - Optional extraction options
 * @returns Updated XML content with the feature modified
 */
export function updateImplementedFeature(
  specContent: string,
  featureName: string,
  updates: Partial<ImplementedFeature>,
  options: ExtractXmlOptions = {}
): string {
  const log = options.logger || logger;

  // Extract existing features
  const existingFeatures = extractImplementedFeatures(specContent, options);

  // Find and update the feature
  let found = false;
  const updatedFeatures = existingFeatures.map((f) => {
    if (f.name.toLowerCase() === featureName.toLowerCase()) {
      found = true;
      return {
        ...f,
        ...updates,
        // Preserve the original name if not explicitly updated
        name: updates.name ?? f.name,
      };
    }
    return f;
  });

  if (!found) {
    log.debug(`Feature "${featureName}" not found, no changes made`);
    return specContent;
  }

  log.debug(`Updating feature "${featureName}"`);
  return updateImplementedFeaturesSection(specContent, updatedFeatures, options);
}

/**
 * Check if a feature exists in the implemented_features section
 *
 * @param specContent - The full XML content
 * @param featureName - The name of the feature to check
 * @param options - Optional extraction options
 * @returns True if the feature exists
 */
export function hasImplementedFeature(
  specContent: string,
  featureName: string,
  options: ExtractXmlOptions = {}
): boolean {
  const features = extractImplementedFeatures(specContent, options);
  return features.some((f) => f.name.toLowerCase() === featureName.toLowerCase());
}

/**
 * Convert extracted features to SpecOutput.implemented_features format
 *
 * @param features - Array of extracted features
 * @returns Features in SpecOutput format
 */
export function toSpecOutputFeatures(
  features: ImplementedFeature[]
): SpecOutput['implemented_features'] {
  return features.map((f) => ({
    name: f.name,
    description: f.description,
    ...(f.file_locations && f.file_locations.length > 0
      ? { file_locations: f.file_locations }
      : {}),
  }));
}

/**
 * Convert SpecOutput.implemented_features to ImplementedFeature format
 *
 * @param specFeatures - Features from SpecOutput
 * @returns Features in ImplementedFeature format
 */
export function fromSpecOutputFeatures(
  specFeatures: SpecOutput['implemented_features']
): ImplementedFeature[] {
  return specFeatures.map((f) => ({
    name: f.name,
    description: f.description,
    ...(f.file_locations && f.file_locations.length > 0
      ? { file_locations: f.file_locations }
      : {}),
  }));
}

/**
 * Represents a roadmap phase extracted from XML
 */
export interface RoadmapPhase {
  name: string;
  status: string;
  description?: string;
}

/**
 * Extract the technology stack from app_spec.txt XML content
 *
 * @param specContent - The full XML content
 * @param options - Optional extraction options
 * @returns Array of technology names
 */
export function extractTechnologyStack(
  specContent: string,
  options: ExtractXmlOptions = {}
): string[] {
  const log = options.logger || logger;

  const techSection = extractXmlSection(specContent, 'technology_stack', options);
  if (!techSection) {
    log.debug('No technology_stack section found');
    return [];
  }

  const technologies = extractXmlElements(techSection, 'technology', options);
  log.debug(`Extracted ${technologies.length} technologies`);
  return technologies;
}

/**
 * Update the technology_stack section in XML content
 *
 * @param specContent - The full XML content
 * @param technologies - The new technology list
 * @param options - Optional extraction options
 * @returns Updated XML content
 */
export function updateTechnologyStack(
  specContent: string,
  technologies: string[],
  options: ExtractXmlOptions = {}
): string {
  const log = options.logger || logger;
  const indent = '  ';
  const i2 = indent.repeat(2);

  // Generate new section content
  const techXml = technologies
    .map((t) => `${i2}<technology>${escapeXml(t)}</technology>`)
    .join('\n');
  const newSection = `<technology_stack>\n${techXml}\n${indent}</technology_stack>`;

  // Check if section exists
  const sectionRegex = /<technology_stack>[\s\S]*?<\/technology_stack>/;

  if (sectionRegex.test(specContent)) {
    log.debug('Replacing existing technology_stack section');
    return specContent.replace(sectionRegex, newSection);
  }

  log.debug('No technology_stack section found to update');
  return specContent;
}

/**
 * Extract roadmap phases from app_spec.txt XML content
 *
 * @param specContent - The full XML content
 * @param options - Optional extraction options
 * @returns Array of roadmap phases
 */
export function extractRoadmapPhases(
  specContent: string,
  options: ExtractXmlOptions = {}
): RoadmapPhase[] {
  const log = options.logger || logger;
  const phases: RoadmapPhase[] = [];

  const roadmapSection = extractXmlSection(specContent, 'implementation_roadmap', options);
  if (!roadmapSection) {
    log.debug('No implementation_roadmap section found');
    return phases;
  }

  // Extract individual phase blocks
  const phaseRegex = /<phase>([\s\S]*?)<\/phase>/g;
  const phaseMatches = roadmapSection.matchAll(phaseRegex);

  for (const phaseMatch of phaseMatches) {
    const phaseContent = phaseMatch[1];

    const nameMatch = phaseContent.match(/<name>([\s\S]*?)<\/name>/);
    const name = nameMatch ? unescapeXml(nameMatch[1].trim()) : '';

    const statusMatch = phaseContent.match(/<status>([\s\S]*?)<\/status>/);
    const status = statusMatch ? unescapeXml(statusMatch[1].trim()) : 'pending';

    const descMatch = phaseContent.match(/<description>([\s\S]*?)<\/description>/);
    const description = descMatch ? unescapeXml(descMatch[1].trim()) : undefined;

    if (name) {
      phases.push({ name, status, description });
    }
  }

  log.debug(`Extracted ${phases.length} roadmap phases`);
  return phases;
}

/**
 * Update a roadmap phase status in XML content
 *
 * @param specContent - The full XML content
 * @param phaseName - The name of the phase to update
 * @param newStatus - The new status value
 * @param options - Optional extraction options
 * @returns Updated XML content
 */
export function updateRoadmapPhaseStatus(
  specContent: string,
  phaseName: string,
  newStatus: string,
  options: ExtractXmlOptions = {}
): string {
  const log = options.logger || logger;

  // Find the phase and update its status
  // Match the phase block containing the specific name
  const phaseRegex = new RegExp(
    `(<phase>\\s*<name>\\s*${escapeXml(phaseName)}\\s*<\\/name>\\s*<status>)[\\s\\S]*?(<\\/status>)`,
    'i'
  );

  if (phaseRegex.test(specContent)) {
    log.debug(`Updating phase "${phaseName}" status to "${newStatus}"`);
    return specContent.replace(phaseRegex, `$1${escapeXml(newStatus)}$2`);
  }

  log.debug(`Phase "${phaseName}" not found`);
  return specContent;
}
