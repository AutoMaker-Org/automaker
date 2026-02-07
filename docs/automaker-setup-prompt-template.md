# Automaker Project Setup Prompt Template

> Truly generic prompt for bootstrapping ANY project in Automaker. The agent roles, context files, tech stack, and governance structure are all determined dynamically by analyzing the project spec — nothing is hardcoded.

---

## The Prompt

````
I want to build a new project using Automaker (located at {AUTOMAKER_PATH}).

**Project spec**: {SPEC_FILE_PATH}
**Project directory**: {AUTOMAKER_PATH}/data/{project-slug}
**Git remote**: {GIT_REMOTE_URL}

Read the ENTIRE spec file first. Then set up the complete Automaker multi-agent orchestration system by working through the steps below. Every section of the spec — including any "Future Enhancements", "Stretch Goals", or aspirational content — must be captured as features. Nothing gets dropped.

---

### Step 1: Analyze the Spec & Determine Project Shape

Before creating anything, analyze the spec and determine:

1. **Tech stack** — What languages, frameworks, databases, and infrastructure does this project need? This drives everything else.

2. **Agent roles** — Based on the project's tech stack and domains, determine what specialist agent roles are needed. Consider:
   - What distinct skill domains does this project span? (e.g., frontend, backend, mobile, ML, data, infra, security, QA)
   - Which roles need persistent memory (long-lived roles that accumulate knowledge across features)?
   - Which roles only need per-worktree scratchpads?
   - Every project should have at minimum: a Planner/PM, a Security Reviewer, a QA/Verifier, and an Integrator. Add domain-specific roles as needed.
   - Assign each role a default model tier (1/2/3) based on the risk level of their decisions.

3. **Epics** — Break the spec into 6-15 epics covering all functional areas. Identify:
   - Dependencies between epics (which must come first?)
   - Critical path (longest chain of dependent epics)
   - Which epics can run in parallel

4. **Security profile** — What security concerns apply? (web security, API auth, encryption, data privacy, payment processing, etc.) This determines the security docs and context files needed.

5. **Context files needed** — Based on the project, determine what context files agents need injected into every prompt. At minimum include:
   - Agent workflow (mandatory steps for all agents)
   - Coding standards (language-specific rules, naming, formatting)
   - Security rules (non-negotiable security requirements)
   - Project structure (what's built vs not built)
   - Worktree rules (git isolation, branch naming)
   - Governance (approval gates, model selection)
   - Add domain-specific context as needed (e.g., ML pipeline rules, API design guidelines, mobile platform guidelines, game design constraints)

6. **Feature categories** — What categories make sense for this project's features? (e.g., Backend, Frontend, ML Pipeline, Data, Infrastructure, Testing, Documentation — whatever fits)

7. **CI/CD pipeline** — What build, test, and deploy stages does this tech stack need?

Present your analysis for my approval before proceeding.

---

### Step 2: Create Documentation

Based on the analysis from Step 1, create:

**Product & Planning:**
- docs/product/product-spec.md — Scope boundaries, constraints, tech decisions
- docs/work-breakdown/epics.md — All epics with priorities, complexity, effort, dependencies
- docs/work-breakdown/dependency-dag.md — ASCII DAG with critical path
- docs/work-breakdown/parallelization-plan.md — Phased execution with agent assignments
- docs/work-breakdown/stories/ — Detailed stories per epic with acceptance criteria

**Agents** (roles determined in Step 1):
- docs/agents/roster.md — All roles, hierarchy, communication flows, escalation chains
- docs/agents/shared-foundation.md — Mission, tech stack, security policy, coding standards, universal DoD
- docs/agents/role-cards/{role}.md — One per role with: responsibilities, decision authority, escalation rules, model tier guidance

**Governance:**
- docs/governance/kanban-workflow.md — 9-column board (Backlog → Ready → Assigned → In Progress → Blocked → In Review → Waiting Approval → Verified → Done)
- docs/governance/model-selection-policy.md — 3-tier policy with decision matrix
- docs/governance/human-interaction-protocol.md — When/how agents ask humans
- docs/governance/approval-gates.md — Review stages with timeouts and escalation

**Security** (scope determined in Step 1):
- docs/security/security-baseline.md — Access controls, credential handling, dependency security
- docs/security/threat-model.md — Asset sensitivity, threat categories, mitigations
- docs/security/security-policy.md — Non-negotiable rules, incident response

**Memory:**
- docs/memory/project-memory.md — ADRs, patterns, conventions, known risks
- docs/memory/decisions-log.md — Significant decisions with rationale
- docs/memory/agent-memory/{role}.md — One per role (persistent memory for long-lived roles, templates for per-task roles)

**Other:**
- docs/rag/doc-strategy.md — Documentation retrieval strategy
- CLAUDE.md — Root context: project overview, agent system, workflow, key docs table, tech stack, security quick ref
- .github/PULL_REQUEST_TEMPLATE.md — Checklist, risk assessment, model tier tracking
- .github/workflows/ci.yml — Pipeline matching the tech stack
- .github/CODEOWNERS — Security-sensitive paths require security reviewer
- .gitignore — Exclude .automaker/, secrets, build artifacts
- worktrees/README.md — Worktree isolation strategy
- kanban/board.md — Placeholder (populated after features are created)

---

### Step 3: Configure Automaker (.automaker/)

**settings.json:**
```json
{
  "autoLoadClaudeMd": true,
  "defaultModel": "claude-opus-4-6",
  "autoLoadMemory": true,
  "maxMemoryFiles": 5
}
````

**categories.json** — The categories determined in Step 1.

**pipeline.json** — Review pipeline (minimum 3 steps):

1. Code Review — Enforce project coding standards
2. Security Review — MANDATORY security checklist (items determined by project's security profile)
3. QA & Testing — Build verification, test execution, coverage gates

Add additional pipeline steps if the project warrants it (e.g., ML model validation, performance benchmarking, accessibility audit).

**Pipeline model & role pattern:**

- Pipeline steps use the SAME model as the feature being reviewed (not a separate model)
- Role differentiation is achieved through detailed instructions in each step, not different models
- Each step's instructions should start with "You are a [role]" to set the agent's perspective (e.g., "You are a Security Reviewer...")

**Context files** (.automaker/context/) — The files determined in Step 1. Each must be:

- Actionable (tells agents exactly what to do, not just guidelines)
- Enforced (violations labeled as BLOCKING where appropriate)
- Maintained (project-structure.md updated as features are completed)

Include context-metadata.json indexing all files with descriptions.

**Memory files** (.automaker/memory/) — Brain files for roles that need persistent knowledge. Include at minimum:

- {planner-role}-brain.md — Velocity, decisions, risk register
- {security-role}-brain.md — Vulnerabilities, security decisions, audit patterns
- {integrator-role}-brain.md — Deployment history, merge patterns
- patterns files for major tech domains (e.g., backend-patterns.md, frontend-patterns.md)
- decisions-and-adrs.md — Architecture Decision Records
- gotchas.md — Common pitfalls and lessons learned

---

### Step 4: Implement Foundation Code

Build the foundation code in waves appropriate to the project. General pattern:

- Wave 1: Data layer (schema, models, config)
- Wave 2: Auth & security layer
- Wave 3: Core business logic
- Wave 4: UI/interface layer + real-time features

After each wave: run tests, fix errors, verify builds.
After ALL waves: run full test suite, ensure everything passes.

The goal is to establish enough working code that agents can build ON TOP of it rather than from scratch. This foundation becomes the "verified" feature set.

---

### Step 5: Load Features

Create feature.json files in .automaker/features/ for EVERY feature in the spec.

**Every feature.json MUST include ALL of these fields:**

```json
{
  "id": "feature-{v|b}{number}-{slug}",
  "title": "Human-readable title",
  "category": "From categories.json",
  "description": "Detailed — what to build, referencing spec requirements",
  "status": "verified|backlog",
  "priority": 1,
  "model": "opus|sonnet|haiku",
  "dependencies": ["other-feature-ids"],
  "branchName": null,
  "skipTests": false,
  "thinkingLevel": "ultrathink|high|medium|low|none",
  "planningMode": "full|spec|lite|skip",
  "requirePlanApproval": true,
  "epicId": "E01",
  "epicName": "Epic Name",
  "assignedAgent": "role-from-roster",
  "complexity": "XL|L|M|S",
  "modelTier": 1,
  "tierJustification": "Why this tier was chosen"
}
```

**Model Selection — 3-Tier Policy (apply per-feature):**

| Tier | Model  | Use When                                                              | Target  |
| ---- | ------ | --------------------------------------------------------------------- | ------- |
| 1    | opus   | Security, architecture, complex algorithms, hard-to-reverse decisions | ~20-30% |
| 2    | sonnet | Standard implementation, UI, tests, well-scoped tasks                 | ~55-65% |
| 3    | haiku  | Docs, config, boilerplate, mechanical/deterministic tasks             | ~10-15% |

Rule: If wrong decision is expensive or hard to reverse → Tier 1.

**Thinking Level — Map from tier × complexity:**

| Tier       | Complexity | thinkingLevel | Token Budget |
| ---------- | ---------- | ------------- | ------------ |
| 1 (opus)   | XL         | ultrathink    | 32K          |
| 1 (opus)   | L or M     | high          | 16K          |
| 2 (sonnet) | XL or L    | medium        | 10K          |
| 2 (sonnet) | M or S     | low           | 1K           |
| 3 (haiku)  | any        | none          | disabled     |

**Planning Mode — Map from complexity:**

| Complexity                                           | planningMode | requirePlanApproval |
| ---------------------------------------------------- | ------------ | ------------------- |
| XL                                                   | full         | true                |
| L + high-impact (security, architecture, algorithms) | full         | true                |
| L + standard (UI, tests, CRUD)                       | spec         | true                |
| M                                                    | lite         | false               |
| S                                                    | skip         | false               |

**skipTests:**

- `false` (default) — all features that produce code
- `true` — ONLY documentation-only, config-only, infrastructure setup, checklists

**Feature Categories:**

1. **Verified** (prefix: v) — Foundation code built in Step 4. Status "verified". Auto-mode skips these. They unblock dependent backlog features.

2. **Core backlog** (prefix: b, priority 1-2) — Features needed for launch, from core spec.

3. **Future backlog** (prefix: b, priority 3) — From "Future Enhancements" / aspirational spec sections. Lower priority but still tracked.

**branchName — Worktree Isolation:**

- Set `branchName: null` on ALL features (both verified and backlog)
- Automaker auto-generates a branch name (`feature/{feature-id}`) and creates the worktree automatically when execution starts
- Do NOT pre-set branchName on backlog features — this causes them to be filtered out of the main worktree view in the UI, making them invisible on the kanban board

**Dependencies:** Must form a valid DAG. Verified features satisfy dependencies for backlog features.

**Security Pattern — OAuth One-Time Code Exchange:**
When implementing OAuth callbacks, never pass JWTs as URL query parameters. Instead, store a one-time code in Redis on the backend, redirect the user with that code as the query parameter, and have the frontend exchange the code for the actual JWT via a POST request. This prevents token leakage through browser history, referrer headers, and server logs.

---

### Step 6: Finalize & Verify

1. **Update kanban/board.md** — All features by epic, verified features in Verified column.

2. **Update project-structure.md** — Mark verified code as BUILT with feature IDs. Add "DO NOT REBUILD" warning. Mark backlog as NOT BUILT.

3. **Verification checklist** (ALL must pass):
   - [ ] Every spec section maps to at least one feature
   - [ ] Every future/aspirational spec item maps to a priority-3 backlog feature
   - [ ] Every feature.json has ALL required fields
   - [ ] Dependencies form valid DAG (no cycles)
   - [ ] Verified features properly unblock dependents
   - [ ] Model tier matches policy (security/arch/algorithms → Tier 1)
   - [ ] Thinking level matches tier × complexity table
   - [ ] Planning mode matches complexity table
   - [ ] skipTests true ONLY for non-code features
   - [ ] Distribution roughly matches targets (~25% opus, ~60% sonnet, ~15% haiku)
   - [ ] All agent roles have role cards AND memory files
   - [ ] All docs referenced in CLAUDE.md exist and are non-empty
   - [ ] Pipeline has at least 3 steps (code review, security, QA)
   - [ ] Context files cover: workflow, standards, security, structure, worktrees, governance
   - [ ] categories.json includes all categories used by features
   - [ ] CI pipeline matches tech stack
   - [ ] .gitignore excludes .automaker/
   - [ ] All tests pass

4. Commit and push.

---

Proceed step by step. Present your Step 1 analysis for my approval before continuing. Commit after each major step. Confirm with me before pushing.

```

---

## What Makes This Generic

- **No hardcoded agent roles** — roles are determined by analyzing the spec's tech domains
- **No hardcoded tech stack** — works for web apps, mobile, CLI tools, ML pipelines, games, anything
- **No hardcoded context files** — the set of context files is determined by project needs
- **No hardcoded categories** — derived from the project
- **No hardcoded security profile** — threat model scoped to actual project risks
- **No hardcoded CI pipeline** — stages match the tech stack
- **Step 1 is an analysis gate** — agent presents its understanding for human approval before building anything

## What IS Fixed (Automaker Platform Constants)

These are Automaker platform features that apply to every project:
- 3-tier model selection (opus/sonnet/haiku) with thinking level mapping
- Planning modes (full/spec/lite/skip) with complexity mapping
- 9-column kanban board workflow
- Feature.json schema with all required fields
- .automaker/ directory structure (settings, context, memory, pipeline, features)
- Worktree isolation strategy
- Git worktree auto-creation at execution time (branchName auto-generated, do NOT pre-set)
- Pipeline uses single-agent, multi-role pattern (same model for all review steps, role differentiation via instructions)
- The principle that foundation code becomes "verified" features
```
