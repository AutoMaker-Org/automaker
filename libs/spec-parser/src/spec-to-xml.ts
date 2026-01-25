/**
 * SpecOutput to XML converter.
 * Converts a structured SpecOutput object back to XML format.
 */

import type { SpecOutput } from '@automaker/types';
import { escapeXml } from './xml-utils.js';

/**
 * Convert structured spec output to XML format.
 *
 * @param spec - The SpecOutput object to convert
 * @returns XML string formatted for app_spec.txt
 */
export function specToXml(spec: SpecOutput): string {
  const indent = '  ';

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<project_specification>
${indent}<project_name>${escapeXml(spec.project_name)}</project_name>

${indent}<overview>
${indent}${indent}${escapeXml(spec.overview)}
${indent}</overview>

${indent}<technology_stack>
${spec.technology_stack.map((t) => `${indent}${indent}<technology>${escapeXml(t)}</technology>`).join('\n')}
${indent}</technology_stack>

${indent}<core_capabilities>
${spec.core_capabilities.map((c) => `${indent}${indent}<capability>${escapeXml(c)}</capability>`).join('\n')}
${indent}</core_capabilities>

${indent}<implemented_features>
${spec.implemented_features
  .map(
    (f) => `${indent}${indent}<feature>
${indent}${indent}${indent}<name>${escapeXml(f.name)}</name>
${indent}${indent}${indent}<description>${escapeXml(f.description)}</description>${
      f.file_locations && f.file_locations.length > 0
        ? `\n${indent}${indent}${indent}<file_locations>
${f.file_locations.map((loc) => `${indent}${indent}${indent}${indent}<location>${escapeXml(loc)}</location>`).join('\n')}
${indent}${indent}${indent}</file_locations>`
        : ''
    }
${indent}${indent}</feature>`
  )
  .join('\n')}
${indent}</implemented_features>`;

  // Optional sections
  if (spec.additional_requirements && spec.additional_requirements.length > 0) {
    xml += `

${indent}<additional_requirements>
${spec.additional_requirements.map((r) => `${indent}${indent}<requirement>${escapeXml(r)}</requirement>`).join('\n')}
${indent}</additional_requirements>`;
  }

  if (spec.development_guidelines && spec.development_guidelines.length > 0) {
    xml += `

${indent}<development_guidelines>
${spec.development_guidelines.map((g) => `${indent}${indent}<guideline>${escapeXml(g)}</guideline>`).join('\n')}
${indent}</development_guidelines>`;
  }

  if (spec.implementation_roadmap && spec.implementation_roadmap.length > 0) {
    xml += `

${indent}<implementation_roadmap>
${spec.implementation_roadmap
  .map(
    (r) => `${indent}${indent}<phase>
${indent}${indent}${indent}<name>${escapeXml(r.phase)}</name>
${indent}${indent}${indent}<status>${escapeXml(r.status)}</status>
${indent}${indent}${indent}<description>${escapeXml(r.description)}</description>
${indent}${indent}</phase>`
  )
  .join('\n')}
${indent}</implementation_roadmap>`;
  }

  xml += `
</project_specification>`;

  return xml;
}
