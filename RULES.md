# KILO TOOLS - SYSTEM CONSTITUTION & DEVELOPMENT RULES

This document is the **single source of truth** for all development rules and principles in this repository.

---

## 🟥 SUPREME RULE: REALITY OVER APPEARANCE

The system must reflect reality, not convenience.

If something is hard, slow, complex, or inconvenient:

- → You handle it correctly
- → You do not bypass it
- → You do not fake it

**A system that "works" by lying is worse than broken.**

---

## 🟥 FUNDAMENTAL MANDATES

### RULE 1 — NO STUBS. EVER. FULL IMPLEMENTATION MANDATE

**❌ FORBIDDEN:**

- Stubs, placeholders, TODO logic
- "return None for now", "pass"
- Fake data paths or dummy outputs
- Commented-out critical logic

**✅ REQUIRED:**

- FULLY IMPLEMENTED production-quality logic
- Complete error handling
- All edge cases covered
- Tests written and passing
- NO partial implementations

**If logic is not ready → fully develop it first → then add it. Never ship incomplete code.**

**PARTIAL IMPLEMENTATION IS SYSTEM CORRUPTION.**

---

### RULE 2 — IMPLEMENT, DON'T REMOVE (DEFAULT RULE)

**DEFAULT DECISION: ALWAYS IMPLEMENT.**

**✅ IMPLEMENT IT** when:

- Feature is partially implemented → Finish it
- Feature has bugs → Fix them
- Code is messy → Clean it up
- You're not sure how → Learn and implement
- Tests are missing → Write tests

**⚠️ REMOVE ONLY** if ALL are true:

1. **Technically Impossible**: No algorithm exists, dependency unavailable, platform incapable
2. **Dead Code**: No references anywhere, no tests, no documentation mentions it
3. **Architectural Contradiction**: Fundamentally conflicts with core system, requires complete rewrite
4. **External Blocking**: Legal/regulatory prohibition, unavailable license, security requirement

**❌ NEVER REMOVE** because:

- "It's half-implemented"
- "It's too complex"
- "We don't have time"
- "There's bugs"
- "It's messy"

**Loss of functionality is failure, not simplification.**

---

### RULE 3 — ERRORS ARE SIGNALS, NOT INCONVENIENCES

**❌ FORBIDDEN:**

- Suppressing or swallowing exceptions
- Blanket try/catch without rethrow
- Ignoring warnings
- Logging and continuing blindly
- "Best effort" execution

**✅ REQUIRED:**

- STOP workflow immediately on error
- IDENTIFY root cause (not symptom)
- FIX the cause, not the symptom
- RESUME only after validation
- If unfixable → degrade safely, never silently continue

---

### RULE 4 — NO SILENT FALLBACKS

Every fallback must be:

- Explicit
- Logged
- Visible in UI/output
- Require confirmation if critical

**If a fallback changes behavior → it's a state change, not a convenience.**

---

### RULE 5 — EVERY WARNING IS A BUG

- Performance warnings → Bug
- Data warnings → Bug
- API warnings → Bug
- Deprecation warnings → Bug
- Numerical warnings → Bug

If you don't fix a warning → document WHY, document RISK, accept RESPONSIBILITY, make it VISIBLE.

---

### RULE 6 — FAIL LOUDLY, FAIL EARLY

Every critical component must:

- Fail loudly
- Fail explicitly
- Fail early

**❌ FORBIDDEN:**

- Silent degradation
- Partial success without notice
- "Best guess" execution

**If failure cannot be detected → component is unacceptable.**

---

### RULE 7 — NO MAGIC OR HIDDEN BEHAVIOR

**❌ FORBIDDEN:**

- Hidden defaults
- Implicit assumptions
- Undocumented behavior
- Side effects
- "It just works" logic

**✅ REQUIRED:**

- Every behavior is explainable
- Every behavior is traceable
- Every behavior is logged
- Every behavior is visible

**If you cannot explain why something happened → system is broken.**

---

### RULE 8 — YOU VERIFY EVERYTHING

**YOUR RESPONSIBILITY:**

- Verify every class you ship
- Verify every function you write
- Verify entire codebase collectively
- Verify all test files

**❌ NEVER ASK USER:**

- "Does this work?"
- "Can you test it?"
- "Is this correct?"

**When you ship code → it MUST be verified. Not optional.**

---

### RULE 9 — ROOT CAUSE OR NOTHING

When something breaks, ask: **"What actually caused this?"**

**❌ FORBIDDEN FIXES:**

- Retry loops without cause
- Arbitrary timeout increases
- Sleeps to hide race conditions
- Catching errors and moving on

**✅ ALLOWED:**

- Structural correction
- Architectural correction
- Explicit handling of real root cause

**If you cannot identify root cause → cannot ship the fix.**

---

### RULE 10 — DON'T SHIP UNEXPLAINED CODE

Before shipping code, you MUST:

- Explain the logic
- Explain failure modes
- Explain risks
- Trace execution path

**If you cannot do these → code is not allowed in system.**

---

### RULE 11 — UI MUST NEVER LIE

**❌ FORBIDDEN:**

- UI showing "OK" when system is degraded
- Hiding errors to keep UI clean
- Optimistic status displays

**UI must reflect ground truth, even if ugly.**

---

### RULE 12 — THIS IS NOT A DEMO

**Final law:** This system is built for reality, not presentation.

**Choice between:**

- Looking impressive
- Being correct

**Choose CORRECT every time.**

---

## 🟥 DECISION MATRIX

```
INCOMPLETE FEATURE FOUND
         ↓
    ┌─────────────────────────────┐
    │ Is it IMPOSSIBLE to │
    │ implement?             │
    └──────────┬──────────────┘
               │ NO
      YES │     │
         ↓      ↓
    Consider │ FULLY IMPLEMENT
    removal  │
         │      ↓
         │  ✅ PRODUCTION CODE
```

**DEFAULT: IMPLEMENT. ALWAYS.**

Removal is only for:

- Genuine impossibility
- Truly dead code
- Architectural impossibility
- External blocking forces

**Hardness → Implement**
**Incomplete → Implement**
**Not sure → Learn and Implement**

---

## 🏛 ARCHITECTURAL LAWS (Non-Negotiable)

These are the core invariants that define the Lance System:

### 1. Content-Addressed Storage (CAS)

All artifacts are immutable. Every input/output has a cryptographic hash (BLAKE3). Any change produces a new artifact. No in-place mutation.

### 2. Task Graph (DAG, Not Linear)

All work is expressed as a Directed Acyclic Graph. No implicit dependencies. No cycles. No reordered execution for convenience.

### 3. Git Is a Verifier, Not a Sandbox

Git is used for validation and inspection only. Git is never the execution environment. Git conflicts are not "resolved" - they are failures.

### 4. Agents Are Pure

Inputs → Outputs. No shared mutable state. No hidden side effects. No guessing.

---

## 🚫 ABSOLUTE PROHIBITIONS

You must NEVER:

- Create stubs
- Add TODOs
- Mock core logic
- Fake outputs
- Hardcode dummy values
- Simplify reality to "make it work"
- Hide complexity
- Claim success without proof

If a feature cannot be implemented correctly end-to-end:
→ It is disabled or removed, not postponed.

---

## 📋 FINAL CHECKLIST

Before making implementation decisions:

- [ ] Is this feature VISION-ALIGNING?
- [ ] Is this feature GENUINELY IMPOSSIBLE? (Not just hard)
- [ ] Is this feature DEAD CODE? (Truly unused everywhere)
- [ ] Will removal lose functionality forever? (Yes → Implement)
- [ ] Will removal harm users? (Yes → Implement)
- [ ] Will removal abandon architecture? (Yes → Implement)
- [ ] Can I explain every part? (No → Don't ship)

**If any "Implement" answer exists → IMPLEMENT.**

---

## 💬 CORE MANTRA

```
IMPLEMENT. DO NOT REMOVE.
Hardness is a challenge, not a blocker.
Incomplete is corruption, not progress.
Removal is failure of vision, not simplification.
If we can implement it, we must implement it.
If we can't implement it honestly, we don't ship it at all.
```

---

## 🛑 FINAL ENFORCEMENT RULE

If you are ever forced to choose between:

- Looking impressive
- Being correct

**You choose CORRECT, every time.**

A system that fails honestly can be fixed.
A system that lies will destroy its users.
