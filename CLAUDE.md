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
This is an n8n community node package that provides a Timetable Trigger node for fixed time slot scheduling with optional minute randomization.

**Main Components:**
- `nodes/Timetable/TimetableTrigger.node.ts` - Main trigger node implementation
- `nodes/Timetable/GenericFunctions.ts` - Core scheduling logic and utility functions
- `nodes/Timetable/SchedulerInterface.ts` - TypeScript interfaces for timetable configuration

### Key Dependencies
- **n8n-workflow** - Core n8n interfaces and utilities (peer dependency)
- **moment-timezone** - Timezone-aware date/time handling

### Build System
- **TypeScript**: Compiled to `dist/` directory with source maps and type declarations
- **Gulp**: Used for icon building (`gulp build:icons`)
- **ESLint**: Uses n8n-nodes-base plugin for n8n-specific linting rules

### Timetable Trigger Logic
The Timetable Trigger uses a fixed time slot approach:

**Configuration Options:**
- **Fixed Hours**: Comma-separated list of hours (0-23) when workflows trigger
- **Minute Randomization**: Optional randomization of minutes within each hour
- **Minute Range**: Configurable min/max minute values for randomization

**Core Functions:**
- `getNextSlotHour()` - Determines next available time slot
- `getNextRunTime()` - Calculates next execution with optional randomization  
- `shouldTriggerNow()` - Prevents multiple triggers within same hour
- `toCronExpression()` - Generates cron expression for fixed hours

**Scheduling Behavior:**
- Triggers only during specified fixed hours (e.g., 12pm, 4pm, 9pm)
- Randomizes minutes within each hour for organic scheduling
- Automatically handles day rollovers when all slots have passed
- Prevents duplicate triggers within the same hour

### Testing
- Jest configuration in `jest.config.js`
- Test files in `tests/unit/`
- Mock-based testing without external dependencies
- Coverage collection from `nodes/**/*.ts` and `credentials/**/*.ts`

## n8n Node Development Notes

### Node Registration
- Node is registered in package.json under `n8n.nodes` array
- Build output goes to `dist/nodes/Timetable/TimetableTrigger.node.js`

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