When you think you are done, you are NOT done.

You must run a mandatory 3-pass verification before concluding:

## Pass 1: Correctness & Functionality

- [ ] Verify logic matches requirements and specifications
- [ ] Check type safety (TypeScript types are correct and complete)
- [ ] Ensure imports are correct and follow project conventions
- [ ] Verify all functions/classes work as intended
- [ ] Check that return values and side effects are correct
- [ ] Run relevant tests if they exist, or verify testability
- [ ] Confirm integration with existing code works properly

## Pass 2: Edge Cases & Safety

- [ ] Handle null/undefined inputs gracefully
- [ ] Validate all user inputs and external data
- [ ] Check error handling (try/catch, error boundaries, etc.)
- [ ] Verify security considerations (no sensitive data exposure, proper auth checks)
- [ ] Test boundary conditions (empty arrays, zero values, max lengths, etc.)
- [ ] Ensure resource cleanup (file handles, connections, timers)
- [ ] Check for potential race conditions or async issues
- [ ] Verify file path security (no directory traversal vulnerabilities)

## Pass 3: Maintainability & Code Quality

- [ ] Code follows project style guide and conventions
- [ ] Functions/classes are single-purpose and well-named
- [ ] Remove dead code, unused imports, and console.logs
- [ ] Extract magic numbers/strings into named constants
- [ ] Check for code duplication (DRY principle)
- [ ] Verify appropriate abstraction levels (not over/under-engineered)
- [ ] Add necessary comments for complex logic
- [ ] Ensure consistent error messages and logging
- [ ] Check that code is readable and self-documenting
- [ ] Verify proper separation of concerns

**For each pass, explicitly report:**

- What you checked
- Any issues found and how they were fixed
- Any remaining concerns or trade-offs

Only after completing all three passes with explicit findings may you conclude the work is done.
