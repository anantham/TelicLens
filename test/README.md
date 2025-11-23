# TelicLens Test Suite

Automated validation framework for variable-level graph extraction and consistency checking.

## Overview

This test suite provides **ground-truth validation** using AST-based analysis (no AI required) to ensure:

1. **Correctness**: Variable extraction captures all defs/uses/flows
2. **Consistency**: All variables have nodes, all uses have reachable defs
3. **Security**: Trust boundary violations and data exfiltration are detected
4. **Regression prevention**: Snapshots catch unexpected changes

## Running Tests

```bash
# Run all tests
npm test

# Run tests once (CI mode)
npm run test:run

# Run with UI
npm run test:ui

# Run with coverage
npm run test:coverage
```

## Test Categories

### 1. Ground Truth Extraction
- Extracts parameters, locals, returns
- Builds data flow edges
- Tracks scopes correctly

### 2. Safe Code Invariants
- No orphan uses (except external imports)
- No unreachable flows
- User inputs sanitized before database

### 3. Vulnerable Code Detection
- Orphan definitions (dead code)
- Trust boundary violations
- Data exfiltration patterns

### 4. Snapshot Tests
- Node type distribution
- Edge type distribution
- Consistency issue counts

See test/README.md for full documentation.
