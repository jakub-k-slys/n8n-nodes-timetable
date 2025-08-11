# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Build and Development
```bash
npm run build          # Build the project (clean dist, compile TypeScript, build icons)
npm run dev           # Watch mode for TypeScript compilation
npm run format        # Format code with Prettier
npm run lint          # Lint code with ESLint
npm run lintfix       # Fix ESLint issues automatically
```

### Testing
```bash
npm test              # Run all Jest unit tests
npm run test:watch    # Run tests in watch mode
npm run test:unit     # Run unit tests (same as npm test)
npm run test:unit:watch # Run unit tests in watch mode
```

### Publishing
```bash
npm run prepublishOnly # Full build and lint check for publishing
```

## Architecture

### Node Structure
This is an n8n community node package that provides a Schedule Trigger node for timetable-based workflow triggers.

**Main Components:**
- `nodes/Timetable/ScheduleTrigger.node.ts` - Main trigger node implementation
- `nodes/Timetable/GenericFunctions.ts` - Utility functions for cron expression handling and recurrence logic
- `nodes/Timetable/SchedulerInterface.ts` - TypeScript interfaces for scheduling rules

### Key Dependencies
- **n8n-workflow** - Core n8n interfaces and utilities (peer dependency)
- **cron** - CRON expression parsing and scheduling
- **moment-timezone** - Timezone-aware date/time handling

### Build System
- **TypeScript**: Compiled to `dist/` directory with source maps and type declarations
- **Gulp**: Used for icon building (`gulp build:icons`)
- **ESLint**: Uses n8n-nodes-base plugin for n8n-specific linting rules

### Schedule Trigger Logic
The Schedule Trigger supports multiple interval types:
- Seconds, minutes, hours (simple intervals)
- Days, weeks, months (with time specifications)
- Custom cron expressions
- Multiple trigger rules per node

**Recurrence Handling**: Uses `recurrenceCheck()` to prevent over-triggering when cron expressions fire more frequently than intended intervals (e.g., daily triggers that need to respect multi-day intervals).

### Testing
- Jest configuration in `jest.config.js`
- Test files in `tests/unit/`
- Mock-based testing without external dependencies
- Coverage collection from `nodes/**/*.ts` and `credentials/**/*.ts`

## n8n Node Development Notes

### Node Registration
- Node is registered in package.json under `n8n.nodes` array
- Build output goes to `dist/nodes/Timetable/Substack.node.js` (note: package.json references this incorrectly - should be ScheduleTrigger)

### Trigger Node Pattern
This implements the n8n trigger node pattern:
- Implements `ITriggerFunctions` interface
- Uses `this.helpers.registerCron()` for scheduling
- Emits workflow data via `this.emit()`
- Supports manual execution mode for testing

### Data Output Format
The trigger outputs structured data including:
- ISO timestamp
- Human-readable date/time formats
- Individual time components (year, month, day, hour, etc.)
- Timezone information