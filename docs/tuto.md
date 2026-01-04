1. Install the project

npm install
npm run build:packages

2. Start it

npm run dev

3. Install all relevant CLI

- Opencode for GLM 4.7
- Codex CLI from openAI
- Claude code for all little task (required for now)
- Cursor agent

4. Use this prompt for your specs projects exemple:

Format specs:

---

```markdown
---
doc: 'Project Spec Generator Template'
purpose: 'Turn a short project idea into a full spec (MD) for an autocoder'
version: '1.0'
output_style: 'structured, exhaustive, implementation-oriented'
---

# Project Spec Generator — Generic Instructions (for Auto-Spec)

## 0. Input

Provide a short idea in 1–2 lines.

**Example input**

> "A simple/intuitive binary option with game-like UI trading terminal"

---

## 1. Output Requirements

Generate a **single Markdown spec** that is:

- **Implementation-oriented** (clear behaviors, states, endpoints, events, UI flows)
- **Non-persistent by default** (unless user asks for persistence)
- **Web-first** (SPA + API + realtime optional)
- **Testable** (acceptance criteria + unit/integration tests)
- **No filler** (every line must create dev constraints or clarity)

**Spec structure must follow this outline (always):**

- Frontmatter (metadata)
- Summary
- Table of Contents
- Chapters I–VII (same naming style as the example)
- Appendices (protocol, schema, test plan, glossary)

---

## 2. Questions to Auto-Infer (no follow-up; choose sensible defaults)

If the user did not specify, assume:

- Target platform: **web SPA**
- Stack: **Full-stack JavaScript**
- Auth: **none** (or guest sessions)
- Persistence: **none**
- Realtime: **WebSocket (socket.io)** only if it adds value
- Theme: minimal + modern, game-like if requested
- Accessibility: keyboard support mandatory
- Internationalization: none unless requested
- Legal/compliance: add disclaimer sections for financial-like products

Record all assumptions explicitly in a section called **Assumptions**.

---

## 3. Spec Generation Algorithm (mandatory)

When generating the spec, do this in order:

### Step A — Extract intent

Parse the idea into:

- Primary user goal
- Secondary goals
- Core loop (what the user repeatedly does)
- Constraints (simplicity, game-like UI, etc.)

### Step B — Define scope boundaries

Create:

- In-scope features (must-have)
- Out-of-scope features (explicitly excluded)
- Non-goals (things not to optimize for)

### Step C — Define system architecture

Specify:

- Client responsibilities
- Server responsibilities (if any)
- Data flow (state machine)
- Realtime needs (events)

### Step D — Define UI/UX flows

Create:

- Primary screens
- Navigation + routing
- Keyboard/mouse interactions
- Game-feel rules (animations, feedback, timers, sounds optional)

### Step E — Define domain model + state machine

Specify:

- Entities (objects)
- State transitions
- Deterministic behaviors (timers, outcomes, fairness rules)

### Step F — Define APIs + events

Specify:

- HTTP endpoints
- WebSocket events (if used)
- Payload schemas
- Error codes
- Idempotency / replay strategy (if relevant)

### Step G — Define testing + acceptance

Write:

- Acceptance criteria per feature
- Coverage thresholds
- Unit/integration/e2e plan
- Edge cases

---

## 4. Mandatory Sections to Always Include

Your generated spec MUST include:

### I. Foreword

1–2 paragraphs of theme framing (short).

### II. Introduction

- What is being built
- Who it’s for
- What “simple/intuitive” means in measurable terms

### III. Objectives

- Learning/engineering objectives
- Performance and reliability objectives

### IV. General Instructions

- Code style constraints
- UI constraints (what is forbidden/required)
- Security constraints
- Testing constraints

### V. Mandatory Part

Break into:

- V.1 Product: The Experience (user-visible behavior)
- V.2 Technical Details (architecture + protocol)
- V.3 UI Details (screens + components + interactions)
- V.4 Testing (coverage + test cases)

### VI. Bonus Part

Optional enhancements (only after mandatory is complete).

### VII. Submission & Evaluation

- Definition of “done”
- Demo checklist
- Folder structure
- Build/run/test commands

---

## 5. Universal Feature Checklist (apply to any project)

Even if the idea is vague, include specs for:

### 5.1 App Shell

- SPA routing
- Layout grid/flex
- App state management
- Error boundaries

### 5.2 Core Loop

- Start → interact → resolve → reset
- Timers / transitions if applicable

### 5.3 Settings

- Preferences (sound on/off, theme)
- Input bindings (keyboard remap optional)

### 5.4 Observability

- Client logs (dev mode)
- Server logs (if any)
- Event tracing keys (correlation IDs)

### 5.5 Security Basics

- No secrets committed
- Input validation
- Rate limiting (if any server endpoints)

### 5.6 Testing

- Unit tests for pure logic
- Integration for protocol
- E2E for primary flow

---

## 6. Output Template (fill in for each new idea)

---

project: "<AUTO>"
subtitle: "<AUTO>"
version: "0.1"
stack: "<AUTO (default Full-Stack JS)>"
persistence: "<AUTO default none>"
realtime: "<AUTO default none or socket.io if needed>"

---

# <PROJECT NAME>

## Summary

- **What:** <1 paragraph>
- **Who:** <target user>
- **Why:** <value>
- **Core loop:** <one line>
- **Non-goals:** <bullets>

## Table of Contents

- I. Foreword
- II. Introduction
- III. Objectives
- IV. General Instructions
- V. Mandatory Part
- VI. Bonus Part
- VII. Submission and Evaluation
- Appendices

---

## I. Foreword

<short theme framing>

## II. Introduction

### Problem statement

### User personas (2–3)

### “Simple/intuitive” definition (measurable)

- Max clicks to action: N
- Time-to-first-interaction: N seconds
- Keyboard-only usable: yes/no

## III. Objectives

### Product objectives

### Engineering objectives

### Quality targets

- Performance budgets
- Reliability targets
- Accessibility targets

## IV. General Instructions

### Language / Stack

### UI constraints

### Prohibited items (if any)

### Data handling / Persistence

### Testing coverage requirements

### Security requirements

## V. Mandatory Part

### V.1 The Experience

#### V.1.1 Core user flow

#### V.1.2 Interaction rules

#### V.1.3 Feedback rules (visual/audio/haptics)

#### V.1.4 Failure states & recovery

### V.2 Technical Details

#### V.2.1 Architecture

- Client responsibilities
- Server responsibilities (if any)

#### V.2.2 State machine

- States
- Transitions
- Determinism / fairness rules

#### V.2.3 Network protocol (if any)

- HTTP endpoints
- WS events
- Payload schemas
- Error handling

### V.3 UI Details

#### Screens

- Screen A: purpose + components + interactions
- Screen B: purpose + components + interactions

#### Components (reusable)

- Component name: props + states + behavior

### V.4 Testing

- Unit tests (logic)
- Integration tests (protocol)
- E2E (happy path + edge cases)
- Coverage thresholds

## VI. Bonus Part

<optional items + evaluation rule>

## VII. Submission and Evaluation

- Definition of done
- Demo script
- Repo structure
- Commands

---

## Appendices

### Appendix A — Data schemas (JSON)

### Appendix B — Event catalog

### Appendix C — Error code catalog

### Appendix D — Glossary

---

## 7. Example: What to do with the user input

Given input:

> "A simple/intuitive binary option with game-like UI trading terminal"

You must:

- Interpret as a **simulated terminal by default** (no real money)
- Define “binary option” mechanics (timeboxed bet, up/down outcome)
- Define fairness + determinism (price feed simulation rules)
- Define game-like UI feedback loop (countdown, streaks, animations)
- Provide complete UX + protocol + tests

Always include a prominent disclaimer:

- **Simulation only** unless explicitly requested otherwise
- No financial advice
- No integration with real exchanges by default
```

5. Create new project in automaker use starter pack

6. Create in context tab copy response of the promps for specs in a md file called OBJECTIVES.md

7. Send spec in the "spec editor tab" copy full specs generated by gpt, ask it to generate 50 features.

8. Open cursor, use composer ask it following prompt.

Clean what's not required for the project:
Everything is explained in @.automaker/context/OBJECTIVES.md and @.automaker/app_spec.txt
A lot of things and exemple are not required clean repo and update tasks in to build the project properly that my autocode will do.
Remove uselss feature for the project specs and update the others one. @.automaker/features

9. Now follow up
