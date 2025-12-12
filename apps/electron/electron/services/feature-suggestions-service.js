const { query, AbortError } = require("@anthropic-ai/claude-agent-sdk");
const promptBuilder = require("./prompt-builder");

/**
 * Feature Suggestions Service - Analyzes project and generates feature suggestions
 */
class FeatureSuggestionsService {
  constructor() {
    this.runningAnalysis = null;
  }

  /**
   * Generate feature suggestions by analyzing the project
   * @param {string} projectPath - Path to the project
   * @param {Function} sendToRenderer - Function to send events to renderer
   * @param {Object} execution - Execution context with abort controller
   * @param {string} suggestionType - Type of suggestions: "features", "refactoring", "security", "performance"
   */
  async generateSuggestions(projectPath, sendToRenderer, execution, suggestionType = "features") {
    console.log(
      `[FeatureSuggestions] Generating ${suggestionType} suggestions for: ${projectPath}`
    );

    try {
      const abortController = new AbortController();
      execution.abortController = abortController;

      const options = {
        model: "claude-sonnet-4-20250514",
        systemPrompt: this.getSystemPrompt(suggestionType),
        maxTurns: 50,
        cwd: projectPath,
        allowedTools: ["Read", "Glob", "Grep", "Bash"],
        permissionMode: "acceptEdits",
        sandbox: {
          enabled: true,
          autoAllowBashIfSandboxed: true,
        },
        abortController: abortController,
      };

      const prompt = this.buildAnalysisPrompt(suggestionType);

      sendToRenderer({
        type: "suggestions_progress",
        content: "Starting project analysis...\n",
      });

      const currentQuery = query({ prompt, options });
      execution.query = currentQuery;

      let fullResponse = "";
      for await (const msg of currentQuery) {
        if (!execution.isActive()) break;

        if (msg.type === "assistant" && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === "text") {
              fullResponse += block.text;
              sendToRenderer({
                type: "suggestions_progress",
                content: block.text,
              });
            } else if (block.type === "tool_use") {
              sendToRenderer({
                type: "suggestions_tool",
                tool: block.name,
                input: block.input,
              });
            }
          }
        }
      }

      execution.query = null;
      execution.abortController = null;

      // Parse the suggestions from the response
      const suggestions = this.parseSuggestions(fullResponse);

      sendToRenderer({
        type: "suggestions_complete",
        suggestions: suggestions,
      });

      return {
        success: true,
        suggestions: suggestions,
      };
    } catch (error) {
      if (error instanceof AbortError || error?.name === "AbortError") {
        console.log("[FeatureSuggestions] Analysis aborted");
        if (execution) {
          execution.abortController = null;
          execution.query = null;
        }
        return {
          success: false,
          message: "Analysis aborted",
          suggestions: [],
        };
      }

      console.error(
        "[FeatureSuggestions] Error generating suggestions:",
        error
      );
      if (execution) {
        execution.abortController = null;
        execution.query = null;
      }
      throw error;
    }
  }

  /**
   * Parse suggestions from the LLM response
   * Looks for JSON array in the response
   */
  parseSuggestions(response) {
    try {
      // Try to find JSON array in the response
      // Look for ```json ... ``` blocks first
      const jsonBlockMatch = response.match(/```json\s*([\s\S]*?)```/);
      if (jsonBlockMatch) {
        const parsed = JSON.parse(jsonBlockMatch[1].trim());
        if (Array.isArray(parsed)) {
          return this.validateSuggestions(parsed);
        }
      }

      // Try to find a raw JSON array
      const jsonArrayMatch = response.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonArrayMatch) {
        const parsed = JSON.parse(jsonArrayMatch[0]);
        if (Array.isArray(parsed)) {
          return this.validateSuggestions(parsed);
        }
      }

      console.warn(
        "[FeatureSuggestions] Could not parse suggestions from response"
      );
      return [];
    } catch (error) {
      console.error("[FeatureSuggestions] Error parsing suggestions:", error);
      return [];
    }
  }

  /**
   * Validate and normalize suggestions
   */
  validateSuggestions(suggestions) {
    return suggestions
      .filter((s) => s && typeof s === "object")
      .map((s, index) => ({
        id: `suggestion-${Date.now()}-${index}`,
        category: s.category || "Uncategorized",
        description: s.description || s.title || "No description",
        steps: Array.isArray(s.steps) ? s.steps : [],
        priority: typeof s.priority === "number" ? s.priority : index + 1,
        reasoning: s.reasoning || "",
      }))
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get the system prompt for feature suggestion analysis
   * @param {string} suggestionType - Type of suggestions: "features", "refactoring", "security", "performance"
   */
  getSystemPrompt(suggestionType = "features") {
    const basePrompt = `You are an expert software architect. Your job is to analyze a codebase and provide actionable suggestions.

You have access to file reading and search tools. Use them to understand the codebase.

When analyzing, look at:
- README files and documentation
- Package.json, cargo.toml, or similar config files for tech stack
- Source code structure and organization
- Existing code patterns and implementation styles`;

    switch (suggestionType) {
      case "refactoring":
        return `${basePrompt}

Your specific focus is on **refactoring suggestions**. You should:
1. Identify code smells and areas that need cleanup
2. Find duplicated code that could be consolidated
3. Spot overly complex functions or classes that should be broken down
4. Look for inconsistent naming conventions or coding patterns
5. Find opportunities to improve code organization and modularity
6. Identify violations of SOLID principles or common design patterns
7. Look for dead code or unused dependencies

Prioritize suggestions by:
- Impact on maintainability
- Risk level (lower risk refactorings first)
- Complexity of the refactoring`;

      case "security":
        return `${basePrompt}

Your specific focus is on **security vulnerabilities and improvements**. You should:
1. Identify potential security vulnerabilities (OWASP Top 10)
2. Look for hardcoded secrets, API keys, or credentials
3. Check for proper input validation and sanitization
4. Identify SQL injection, XSS, or command injection risks
5. Review authentication and authorization patterns
6. Check for secure communication (HTTPS, encryption)
7. Look for insecure dependencies or outdated packages
8. Review error handling that might leak sensitive information
9. Check for proper session management
10. Identify insecure file handling or path traversal risks

Prioritize by severity:
- Critical: Exploitable vulnerabilities with high impact
- High: Security issues that could lead to data exposure
- Medium: Best practice violations that weaken security
- Low: Minor improvements to security posture`;

      case "performance":
        return `${basePrompt}

Your specific focus is on **performance issues and optimizations**. You should:
1. Identify N+1 query problems or inefficient database access
2. Look for unnecessary re-renders in React/frontend code
3. Find opportunities for caching or memoization
4. Identify large bundle sizes or unoptimized imports
5. Look for blocking operations that could be async
6. Find memory leaks or inefficient memory usage
7. Identify slow algorithms or data structure choices
8. Look for missing indexes in database schemas
9. Find opportunities for lazy loading or code splitting
10. Identify unnecessary network requests or API calls

Prioritize by:
- Impact on user experience
- Frequency of the slow path
- Ease of implementation`;

      default: // "features"
        return `${basePrompt}

Your specific focus is on **missing features and improvements**. You should:
1. Identify what the application does and what features it currently has
2. Look at the .automaker/app_spec.txt file if it exists
3. Generate a comprehensive list of missing features that would be valuable to users
4. Consider user experience improvements
5. Consider developer experience improvements
6. Look at common patterns in similar applications

Prioritize features by:
- Impact on users
- Alignment with project goals
- Complexity of implementation`;
    }
  }

  /**
   * Build the prompt for analyzing the project
   * @param {string} suggestionType - Type of suggestions: "features", "refactoring", "security", "performance"
   */
  buildAnalysisPrompt(suggestionType = "features") {
    const commonIntro = `Analyze this project and generate a list of actionable suggestions.

**Your Task:**

1. First, explore the project structure:
   - Read README.md, package.json, or similar config files
   - Scan the source code directory structure
   - Identify the tech stack and frameworks used
   - Look at existing code and how it's implemented

2. Identify what the application does:
   - What is the main purpose?
   - What patterns and conventions are used?
`;

    const commonOutput = `
**CRITICAL: Output your suggestions as a JSON array** at the end of your response, formatted like this:

\`\`\`json
[
  {
    "category": "Category Name",
    "description": "Clear description of the suggestion",
    "steps": [
      "Step 1 to implement",
      "Step 2 to implement",
      "Step 3 to implement"
    ],
    "priority": 1,
    "reasoning": "Why this is important"
  }
]
\`\`\`

**Important Guidelines:**
- Generate at least 10-15 suggestions
- Order them by priority (1 = highest priority)
- Each suggestion should have clear, actionable steps
- Be specific about what files might need to be modified
- Consider the existing tech stack and patterns

Begin by exploring the project structure.`;

    switch (suggestionType) {
      case "refactoring":
        return `${commonIntro}
3. Look for refactoring opportunities:
   - Find code duplication across the codebase
   - Identify functions or classes that are too long or complex
   - Look for inconsistent patterns or naming conventions
   - Find tightly coupled code that should be decoupled
   - Identify opportunities to extract reusable utilities
   - Look for dead code or unused exports
   - Check for proper separation of concerns

Categories to use: "Code Smell", "Duplication", "Complexity", "Architecture", "Naming", "Dead Code", "Coupling", "Testing"
${commonOutput}`;

      case "security":
        return `${commonIntro}
3. Look for security issues:
   - Check for hardcoded secrets or API keys
   - Look for potential injection vulnerabilities (SQL, XSS, command)
   - Review authentication and authorization code
   - Check input validation and sanitization
   - Look for insecure dependencies
   - Review error handling for information leakage
   - Check for proper HTTPS/TLS usage
   - Look for insecure file operations

Categories to use: "Critical", "High", "Medium", "Low" (based on severity)
${commonOutput}`;

      case "performance":
        return `${commonIntro}
3. Look for performance issues:
   - Find N+1 queries or inefficient database access patterns
   - Look for unnecessary re-renders in React components
   - Identify missing memoization opportunities
   - Check bundle size and import patterns
   - Look for synchronous operations that could be async
   - Find potential memory leaks
   - Identify slow algorithms or data structures
   - Look for missing caching opportunities
   - Check for unnecessary network requests

Categories to use: "Database", "Rendering", "Memory", "Bundle Size", "Caching", "Algorithm", "Network"
${commonOutput}`;

      default: // "features"
        return `${commonIntro}
3. Generate feature suggestions:
   - Think about what's missing compared to similar applications
   - Consider user experience improvements
   - Consider developer experience improvements
   - Think about performance, security, and reliability
   - Consider testing and documentation improvements

Categories to use: "User Experience", "Performance", "Security", "Testing", "Documentation", "Developer Experience", "Accessibility", etc.
${commonOutput}`;
    }
  }

  /**
   * Stop the current analysis
   */
  stop() {
    if (this.runningAnalysis && this.runningAnalysis.abortController) {
      this.runningAnalysis.abortController.abort();
    }
    this.runningAnalysis = null;
  }
}

module.exports = new FeatureSuggestionsService();
