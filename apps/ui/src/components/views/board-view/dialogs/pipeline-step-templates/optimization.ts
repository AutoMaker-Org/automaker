export const optimizationTemplate = {
  id: 'optimization',
  name: 'Performance',
  colorClass: 'bg-cyan-500/20',
  instructions: `## Performance Optimization Step

# ⚠️ CRITICAL REQUIREMENT: YOU MUST UPDATE THE CODE WITH OPTIMIZATIONS ⚠️

**THIS IS NOT OPTIONAL. AFTER IDENTIFYING OPTIMIZATION OPPORTUNITIES, YOU MUST UPDATE THE CODE.**

This step has TWO mandatory phases:
1. **REVIEW** the code for performance issues (identify bottlenecks)
2. **UPDATE** the code with optimizations (fix the performance issues)

**You cannot complete this step by only identifying performance issues. You MUST modify the code to optimize it.**

---

### Phase 1: Review Phase
Identify performance bottlenecks and optimization opportunities:

#### Code Performance
- Identify slow algorithms (O(n²) → O(n log n), etc.)
- Find unnecessary computations or redundant operations
- Identify inefficient loops and iterations
- Check for inappropriate data structures

#### Memory Usage
- Check for memory leaks
- Identify memory-intensive operations
- Check for proper cleanup of resources

#### Database/API
- Identify slow database queries (N+1 queries, missing indexes)
- Find opportunities for caching
- Identify API calls that could be batched

#### Frontend (if applicable)
- Identify bundle size issues
- Find render performance problems
- Identify opportunities for lazy loading
- Find expensive computations that need memoization

---

### Phase 2: Update Phase - ⚠️ MANDATORY ACTION REQUIRED ⚠️

**YOU MUST NOW MODIFY THE CODE TO APPLY OPTIMIZATIONS.**

**This is not optional. Every performance issue you identify must be addressed with code changes.**

#### Action Steps (You MUST complete these):

1. **Optimize Code Performance** - UPDATE THE CODE:
   - ✅ Optimize slow algorithms (O(n²) → O(n log n), etc.)
   - ✅ Remove unnecessary computations or redundant operations
   - ✅ Optimize loops and iterations
   - ✅ Use appropriate data structures
   - ✅ **MODIFY THE SOURCE FILES DIRECTLY WITH OPTIMIZATIONS**

2. **Fix Memory Issues** - UPDATE THE CODE:
   - ✅ Fix memory leaks
   - ✅ Optimize memory-intensive operations
   - ✅ Ensure proper cleanup of resources
   - ✅ **MAKE THE ACTUAL CODE CHANGES**

3. **Optimize Database/API** - UPDATE THE CODE:
   - ✅ Optimize database queries (add indexes, reduce N+1 queries)
   - ✅ Implement caching where appropriate
   - ✅ Batch API calls when possible
   - ✅ **MODIFY THE DATABASE/API CODE DIRECTLY**

4. **Optimize Frontend** (if applicable) - UPDATE THE CODE:
   - ✅ Minimize bundle size
   - ✅ Optimize render performance
   - ✅ Implement lazy loading where appropriate
   - ✅ Use memoization for expensive computations
   - ✅ **MODIFY THE FRONTEND CODE DIRECTLY**

5. **Profile and Measure**:
   - ✅ Profile the code to verify bottlenecks are fixed
   - ✅ Measure improvements achieved
   - ✅ **DOCUMENT THE PERFORMANCE IMPROVEMENTS**

---

### Summary Required
After completing BOTH review AND update phases, provide:
- A summary of performance issues identified
- **A detailed list of ALL optimizations applied to the code (this proves you updated the code)**
- Performance improvements achieved (with metrics if possible)
- Any remaining optimization opportunities

---

# ⚠️ FINAL REMINDER ⚠️

**Identifying performance issues without optimizing the code is INCOMPLETE and UNACCEPTABLE.**

**You MUST modify the code files directly with optimizations.**
**You MUST show evidence of optimization changes in your summary.**
**This step is only complete when code has been optimized.**`,
};
