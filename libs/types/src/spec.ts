/**
 * App specification types
 */

/**
 * TypeScript interface for structured spec output
 */
export interface SpecOutput {
  project_name: string;
  overview: string;
  technology_stack: string[];
  core_capabilities: string[];
  implemented_features: Array<{
    name: string;
    description: string;
    file_locations?: string[];
  }>;
  additional_requirements?: string[];
  development_guidelines?: string[];
  implementation_roadmap?: Array<{
    phase: string;
    status: "completed" | "in_progress" | "pending";
    description: string;
  }>;
}

/**
 * JSON Schema for structured spec output
 * Used with Claude's structured output feature for reliable parsing
 */
export const specOutputSchema = {
  type: "object",
  properties: {
    project_name: {
      type: "string",
      description: "The name of the project",
    },
    overview: {
      type: "string",
      description:
        "A comprehensive description of what the project does, its purpose, and key goals",
    },
    technology_stack: {
      type: "array",
      items: { type: "string" },
      description:
        "List of all technologies, frameworks, libraries, and tools used",
    },
    core_capabilities: {
      type: "array",
      items: { type: "string" },
      description: "List of main features and capabilities the project provides",
    },
    implemented_features: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name of the implemented feature",
          },
          description: {
            type: "string",
            description: "Description of what the feature does",
          },
          file_locations: {
            type: "array",
            items: { type: "string" },
            description: "File paths where this feature is implemented",
          },
        },
        required: ["name", "description"],
      },
      description: "Features that have been implemented based on code analysis",
    },
    additional_requirements: {
      type: "array",
      items: { type: "string" },
      description: "Any additional requirements or constraints",
    },
    development_guidelines: {
      type: "array",
      items: { type: "string" },
      description: "Development standards and practices",
    },
    implementation_roadmap: {
      type: "array",
      items: {
        type: "object",
        properties: {
          phase: {
            type: "string",
            description: "Name of the implementation phase",
          },
          status: {
            type: "string",
            enum: ["completed", "in_progress", "pending"],
            description: "Current status of this phase",
          },
          description: {
            type: "string",
            description: "Description of what this phase involves",
          },
        },
        required: ["phase", "status", "description"],
      },
      description: "Phases or roadmap items for implementation",
    },
  },
  required: [
    "project_name",
    "overview",
    "technology_stack",
    "core_capabilities",
    "implemented_features",
  ],
  additionalProperties: false,
};
