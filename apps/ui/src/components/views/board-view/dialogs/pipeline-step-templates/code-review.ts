export const codeReviewTemplate = {
  id: 'code-review',
  name: 'Code Review',
  colorClass: 'bg-blue-500/20',
  instructions: `## Code Review & Update

# ⚠️ CRITICAL REQUIREMENT: YOU MUST UPDATE THE CODE ⚠️

**THIS IS NOT OPTIONAL. AFTER REVIEWING, YOU MUST MODIFY THE CODE WITH YOUR FINDINGS.**

This step has TWO mandatory phases:
1. **REVIEW** the code (identify issues)
2. **UPDATE** the code (fix the issues you found)

**You cannot complete this step by only reviewing. You MUST make code changes based on your review findings.**

---

### Phase 1: Review Phase
Perform a thorough code review of the changes made in this feature. Focus on:

#### Code Quality
- **Readability**: Is the code easy to understand? Are variable/function names descriptive?
- **Maintainability**: Will this code be easy to modify in the future?
- **DRY Principle**: Is there any duplicated code that should be abstracted?
- **Single Responsibility**: Do functions and classes have a single, clear purpose?

#### Best Practices
- Follow established patterns and conventions used in the codebase
- Ensure proper error handling is in place
- Check for appropriate logging where needed
- Verify that magic numbers/strings are replaced with named constants

#### Performance
- Identify any potential performance bottlenecks
- Check for unnecessary re-renders (React) or redundant computations
- Ensure efficient data structures are used

#### Testing
- Verify that new code has appropriate test coverage
- Check that edge cases are handled

---

### Phase 2: Update Phase - ⚠️ MANDATORY ACTION REQUIRED ⚠️

**YOU MUST NOW MODIFY THE CODE BASED ON YOUR REVIEW FINDINGS.**

**This is not optional. Every issue you identify must be addressed with code changes.**

#### Action Steps (You MUST complete these):

1. **Fix Issues Immediately**: For every issue you found during review:
   - ✅ Refactor code for better readability
   - ✅ Extract duplicated code into reusable functions
   - ✅ Improve variable/function names for clarity
   - ✅ Add missing error handling
   - ✅ Replace magic numbers/strings with named constants
   - ✅ Optimize performance bottlenecks
   - ✅ Fix any code quality issues you identify
   - ✅ **MAKE THE ACTUAL CODE CHANGES - DO NOT JUST DOCUMENT THEM**

2. **Apply All Improvements**: Don't just identify problems - fix them in code:
   - ✅ Improve code structure and organization
   - ✅ Enhance error handling and logging
   - ✅ Optimize performance where possible
   - ✅ Ensure consistency with codebase patterns
   - ✅ Add or improve comments where needed
   - ✅ **MODIFY THE FILES DIRECTLY WITH YOUR IMPROVEMENTS**

3. **For Complex Issues**: If you encounter issues that require significant refactoring:
   - ✅ Make the improvements you can make safely
   - ✅ Document remaining issues with clear explanations
   - ✅ Provide specific suggestions for future improvements
   - ✅ **STILL MAKE AS MANY CODE CHANGES AS POSSIBLE**

---

### Summary Required
After completing BOTH review AND update phases, provide:
- A summary of issues found during review
- **A detailed list of ALL code changes and improvements made (this proves you updated the code)**
- Any remaining issues that need attention (if applicable)

---

# ⚠️ FINAL REMINDER ⚠️

**Reviewing without updating is INCOMPLETE and UNACCEPTABLE.**

**You MUST modify the code files directly with your improvements.**
**You MUST show evidence of code changes in your summary.**
**This step is only complete when code has been updated.**`,
};
