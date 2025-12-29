# Pipeline Feature

Custom pipeline steps that run automatically after a feature completes "In Progress", creating a sequential workflow for code review, security audits, testing, and more.

## Overview

The pipeline feature allows users to define custom workflow steps that execute automatically after the main implementation phase. Each step prompts the agent with specific instructions while maintaining the full conversation context.

## How It Works

1. **Feature completes "In Progress"** - When the agent finishes implementing a feature
2. **Pipeline steps execute sequentially** - Each configured step runs in order
3. **Agent receives instructions** - The step's instructions are sent to the agent
4. **Context preserved** - Full chat history is maintained between steps
5. **Final status** - After all steps complete, the feature moves to "Waiting Approval" or "Verified"

## Configuration

### Accessing Pipeline Settings

- Click the **gear icon** on the "In Progress" column header
- Or click the gear icon on any pipeline step column

### Adding Pipeline Steps

1. Click **"Add Pipeline Step"**
2. Optionally select a **pre-built template** from the dropdown:
   - Code Review
   - Security Review
   - Testing
   - Documentation
   - Performance Optimization
3. Customize the **Step Name**
4. Choose a **Color** for the column
5. Write or modify the **Agent Instructions**
6. Click **"Add Step"**

### Managing Steps

- **Reorder**: Use the up/down arrows to change step order
- **Edit**: Click the pencil icon to modify a step
- **Delete**: Click the trash icon to remove a step
- **Load from file**: Upload a `.md` or `.txt` file for instructions

## Storage

Pipeline configuration is stored per-project at:

```
{project}/.automaker/pipeline.json
```

## Pre-built Templates

### Code Review

Comprehensive code quality review covering:

- Readability and maintainability
- DRY principle and single responsibility
- Best practices and conventions
- Performance considerations
- Test coverage

### Security Review

OWASP-focused security audit including:

- Input validation and sanitization
- SQL injection and XSS prevention
- Authentication and authorization
- Data protection
- Common vulnerability checks (OWASP Top 10)

### Testing

Test coverage verification:

- Unit test requirements
- Integration testing
- Test quality standards
- Running and validating tests

### Documentation

Documentation requirements:

- Code documentation (JSDoc/docstrings)
- API documentation
- README updates
- Changelog entries

### Performance Optimization

Performance review covering:

- Algorithm optimization
- Memory usage
- Database/API optimization
- Frontend performance (if applicable)

## UI Changes

### Kanban Board

- Pipeline columns appear between "In Progress" and "Waiting Approval"
- Each pipeline column shows features currently in that step
- Gear icon on columns opens pipeline settings

### Horizontal Scrolling

- Board supports horizontal scrolling when many columns exist
- Minimum window width reduced to 600px to accommodate various screen sizes

## Technical Details

### Files Modified

**Types:**

- `libs/types/src/pipeline.ts` - PipelineStep, PipelineConfig types
- `libs/types/src/index.ts` - Export pipeline types

**Server:**

- `apps/server/src/services/pipeline-service.ts` - CRUD operations, status transitions
- `apps/server/src/routes/pipeline/` - API endpoints
- `apps/server/src/services/auto-mode-service.ts` - Pipeline execution integration

**UI:**

- `apps/ui/src/store/app-store.ts` - Pipeline state management
- `apps/ui/src/lib/http-api-client.ts` - Pipeline API client
- `apps/ui/src/components/views/board-view/constants.ts` - Dynamic column generation
- `apps/ui/src/components/views/board-view/kanban-board.tsx` - Pipeline props, scrolling
- `apps/ui/src/components/views/board-view/dialogs/pipeline-settings-dialog.tsx` - Settings UI
- `apps/ui/src/hooks/use-responsive-kanban.ts` - Scroll support

### API Endpoints

```
POST /api/pipeline/config          - Get pipeline config
POST /api/pipeline/config/save     - Save pipeline config
POST /api/pipeline/steps/add       - Add a step
POST /api/pipeline/steps/update    - Update a step
POST /api/pipeline/steps/delete    - Delete a step
POST /api/pipeline/steps/reorder   - Reorder steps
```

### Status Flow

```
backlog → in_progress → pipeline_step1 → pipeline_step2 → ... → verified/waiting_approval
```

Pipeline statuses use the format `pipeline_{stepId}` to support unlimited dynamic steps.
