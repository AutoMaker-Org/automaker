export const testingTemplate = {
  id: 'testing',
  name: 'Testing',
  colorClass: 'bg-green-500/20',
  instructions: `## Testing Step

# ⚠️ CRITICAL REQUIREMENT: YOU MUST UPDATE THE CODEBASE WITH TESTS ⚠️

**THIS IS NOT OPTIONAL. YOU MUST WRITE AND ADD TESTS TO THE CODEBASE.**

This step requires you to:
1. **REVIEW** what needs testing
2. **UPDATE** the codebase by writing and adding test files

**You cannot complete this step by only identifying what needs testing. You MUST create test files and write tests.**

---

### Phase 1: Review Phase
Identify what needs test coverage:

- Review new functions, methods, and classes
- Identify new API endpoints
- Check for edge cases that need testing
- Identify integration points that need testing

---

### Phase 2: Update Phase - ⚠️ MANDATORY ACTION REQUIRED ⚠️

**YOU MUST NOW WRITE AND ADD TESTS TO THE CODEBASE.**

**This is not optional. You must create test files and write actual test code.**

#### Action Steps (You MUST complete these):

1. **Write Unit Tests** - CREATE TEST FILES:
   - ✅ Write unit tests for all new functions and methods
   - ✅ Ensure edge cases are covered
   - ✅ Test error handling paths
   - ✅ Aim for high code coverage on new code
   - ✅ **CREATE TEST FILES AND WRITE THE ACTUAL TEST CODE**

2. **Write Integration Tests** - CREATE TEST FILES:
   - ✅ Test interactions between components/modules
   - ✅ Verify API endpoints work correctly
   - ✅ Test database operations if applicable
   - ✅ **CREATE INTEGRATION TEST FILES AND WRITE THE ACTUAL TEST CODE**

3. **Ensure Test Quality** - WRITE QUALITY TESTS:
   - ✅ Tests should be readable and well-documented
   - ✅ Each test should have a clear purpose
   - ✅ Use descriptive test names that explain the scenario
   - ✅ Follow the Arrange-Act-Assert pattern
   - ✅ **WRITE COMPLETE, FUNCTIONAL TESTS**

4. **Run Tests** - VERIFY TESTS WORK:
   - ✅ Run the full test suite and ensure all new tests pass
   - ✅ Verify no existing tests are broken
   - ✅ Check that test coverage meets project standards
   - ✅ **FIX ANY FAILING TESTS**

---

### Summary Required
After completing BOTH review AND update phases, provide:
- A summary of testing needs identified
- **A detailed list of ALL test files created and tests written (this proves you updated the codebase)**
- Test coverage metrics achieved
- Any issues found during testing and how they were resolved

---

# ⚠️ FINAL REMINDER ⚠️

**Identifying what needs testing without writing tests is INCOMPLETE and UNACCEPTABLE.**

**You MUST create test files and write actual test code.**
**You MUST show evidence of test files created in your summary.**
**This step is only complete when tests have been written and added to the codebase.**`,
};
