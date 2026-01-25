/**
 * XML Template Format Specification for app_spec.txt
 *
 * This format must be included in all prompts that generate, modify, or regenerate
 * app specifications to ensure consistency across the application.
 */

// Import and re-export spec types from shared package
export type { SpecOutput } from '@automaker/types';
export { specOutputSchema } from '@automaker/types';

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
 * Convert structured spec output to XML format
 */
export function specToXml(spec: import('@automaker/types').SpecOutput): string {
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

/**
 * Get prompt instruction for structured output (simpler than XML instructions)
 */
export function getStructuredSpecPromptInstruction(): string {
  return `
Analyze the project and provide a comprehensive specification with:

1. **project_name**: The name of the project
2. **overview**: A comprehensive description of what the project does, its purpose, and key goals
3. **technology_stack**: List all technologies, frameworks, libraries, and tools used
4. **core_capabilities**: List the main features and capabilities the project provides
5. **implemented_features**: For each implemented feature, provide:
   - name: Feature name
   - description: What it does
   - file_locations: Key files where it's implemented (optional)
6. **additional_requirements**: Any system requirements, dependencies, or constraints (optional)
7. **development_guidelines**: Development standards and best practices (optional)
8. **implementation_roadmap**: Project phases with status (completed/in_progress/pending) (optional)

Be thorough in your analysis. The output will be automatically formatted as structured JSON.
`;
}
export const APP_SPEC_XML_FORMAT = `
The app_spec.txt file MUST follow this exact XML format:

<project_specification>
  <project_name>Project Name</project_name>

  <overview>
    A comprehensive description of what the project does, its purpose, and key goals.
  </overview>

  <technology_stack>
    <technology>Technology 1</technology>
    <technology>Technology 2</technology>
    <!-- List all technologies, frameworks, libraries, and tools used -->
  </technology_stack>

  <core_capabilities>
    <capability>Core capability 1</capability>
    <capability>Core capability 2</capability>
    <!-- List main features and capabilities the project provides -->
  </core_capabilities>

  <implemented_features>
    <!-- Features that have been implemented (populated by AI agent based on code analysis) -->
  </implemented_features>

  <!-- Optional sections that may be included: -->
  <additional_requirements>
    <!-- Any additional requirements or constraints -->
  </additional_requirements>

  <development_guidelines>
    <guideline>Guideline 1</guideline>
    <guideline>Guideline 2</guideline>
    <!-- Development standards and practices -->
  </development_guidelines>

  <implementation_roadmap>
    <!-- Phases or roadmap items for implementation -->
  </implementation_roadmap>
</project_specification>

IMPORTANT: 
- All content must be wrapped in valid XML tags
- Use proper XML escaping for special characters (&lt;, &gt;, &amp;)
- Maintain proper indentation (2 spaces)
- All sections should be populated based on project analysis
- The format must be strictly followed - do not use markdown, JSON, or any other format
`;

/**
 * Returns a prompt suffix that instructs the AI to format the response as XML
 * following the app_spec.txt template format.
 */
export function getAppSpecFormatInstruction(): string {
  return `
${APP_SPEC_XML_FORMAT}

CRITICAL FORMATTING REQUIREMENTS:
- Do NOT use the Write, Edit, or Bash tools to create files - just OUTPUT the XML in your response
- Your ENTIRE response MUST be valid XML following the exact template structure above
- Do NOT use markdown formatting (no # headers, no **bold**, no - lists, etc.)
- Do NOT include any explanatory text, prefix, or suffix outside the XML tags
- Do NOT include phrases like "Based on my analysis...", "I'll create...", "Let me analyze..." before the XML
- Do NOT include any text before <project_specification> or after </project_specification>
- Your response must start IMMEDIATELY with <project_specification> with no preceding text
- Your response must end IMMEDIATELY with </project_specification> with no following text
- Use ONLY XML tags as shown in the template
- Properly escape XML special characters (&lt; for <, &gt; for >, &amp; for &)
- Maintain 2-space indentation for readability
- The output will be saved directly to app_spec.txt and must be parseable as valid XML
- The response must contain exactly ONE root XML element: <project_specification>
- Do not include code blocks, markdown fences, or any other formatting

VERIFICATION: Before responding, verify that:
1. Your response starts with <project_specification> (no spaces, no text before it)
2. Your response ends with </project_specification> (no spaces, no text after it)
3. There is exactly one root XML element
4. There is no explanatory text, analysis, or commentary outside the XML tags

Your response should be ONLY the XML content, nothing else.
`;
}
