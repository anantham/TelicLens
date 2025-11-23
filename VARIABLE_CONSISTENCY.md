# Variable Consistency Checker

**Automated data flow validation and security analysis for variable-level graphs**

## Overview

The Variable Consistency Checker performs **structural analysis** on the variable-level data flow graph to detect:
- ✅ **Logic errors** (orphan definitions, unreachable flows)
- ✅ **Security risks** (unsanitized data crossing trust boundaries)
- ✅ **Graph integrity issues** (missing nodes, broken references)

It operates on the **AST-derived ground truth** (no AI required) and validates that every variable has proper data flow connectivity.

---

## Quick Start

```typescript
import { checkVariableConsistency } from './services/variableConsistencyChecker';
import { buildGroundTruth } from './test/groundTruthValidator';

// Build ground truth graph from code
const graph = buildGroundTruth([{
  name: 'auth.ts',
  content: code,
  language: 'typescript'
}]);

// Run consistency check
const report = checkVariableConsistency(graph.nodes, graph.edges);

console.log(report.summary);
// ⚠️ Found 5 consistency issues across 20 variables:
//   - 1 orphan definitions
//   - 2 trust boundary violations
```

---

## The Five Consistency Checks

### 1. Orphan Definitions (Dead Code)

**What it detects:** Variables defined but never used

**Logic:**
```typescript
// Find variables where:
isDef: true  &&  isUse: false  &&  no outgoing edges
```

**Example (Vulnerable):**
```typescript
function processPayment(amount: number) {
  const sanitizedAmount = sanitize(amount);  // ✅ Defined
  const rawAmount = amount;                  // ⚠️ ORPHAN DEF!

  return database.charge(amount);  // ❌ Using raw amount!
}
```

**Report:**
```
Orphan definitions:
  - var:auth.ts:processPayment:rawAmount (defined but never used)
```

**Why it matters:**
- Indicates dead code or incomplete refactoring
- May reveal a bug where the sanitized value is computed but not used
- In security contexts, often means validation was added but not applied

---

### 2. Orphan Uses (Undefined Variables)

**What it detects:** Variables used without a definition

**Logic:**
```typescript
// Find variables where:
isUse: true  &&  isDef: false  &&  no incoming edges

// With scope fallback:
// Check if a definition exists in same/parent scope
```

**Example (Vulnerable):**
```typescript
function login(username: string) {
  const user = database.findUser(username);

  if (user && user.password === hashedPassword) {  // ⚠️ ORPHAN USE!
    return generateToken(user.id);
  }
}
// hashedPassword is used but never defined!
```

**Report:**
```
Orphan uses:
  - var:auth.ts:login:hashedPassword (used but never defined)
```

**Why it matters:**
- May indicate a missing import or parameter
- Could be a typo (e.g., `hashedPasswrd` vs `hashedPassword`)
- External dependencies will show as orphan uses (expected)

---

### 3. Unreachable Flows (Broken Logic)

**What it detects:** Variables with uses that cannot trace back to a definition

**Logic:**
```typescript
// For each use-site:
// 1. Perform backward BFS through incoming edges
// 2. Check if any reached node is a definition (isDef: true)
// 3. Flag as unreachable if no definition found

// Exception: Parameters are excluded (defined externally)
```

**Example (Vulnerable):**
```typescript
function transfer(from: string, to: string, amount: number) {
  const fromAccount = getAccount(from);
  const toAccount = getAccount(to);

  // Missing: const validatedAmount = validateAmount(amount);

  database.debit(fromAccount, amount);   // ⚠️ UNREACHABLE!
  database.credit(toAccount, amount);    // ⚠️ UNREACHABLE!
}
// amount is used but no validation flow exists
```

**Report:**
```
Unreachable flows:
  - var:auth.ts:transfer:amount (at auth.ts:15)
  - var:auth.ts:transfer:amount (at auth.ts:16)
```

**Why it matters:**
- Indicates broken data flow logic
- Variable is used but its value origin is unclear
- May reveal missing validation or transformation steps

---

### 4. Trust Boundary Violations (Security)

**What it detects:** Data crossing trust boundaries without sanitization

**Logic:**
```typescript
// For each edge:
// If source or target has trustBoundary: true
//   Check edge.reason for sanitization keywords:
//     - "sanitize", "encrypt", "validate"
//   Flag if none found
```

**Example (Vulnerable):**
```typescript
function searchUsers(query: string) {  // User input (low trust)
  // ❌ No sanitization!
  const sql = `SELECT * FROM users WHERE name = '${query}'`;
  return database.execute(sql);  // Database (high trust)
}
// SQL Injection vulnerability!
```

**Safe version:**
```typescript
function searchUsers(query: string) {
  const sanitized = sanitizeSQL(query);  // ✅ Sanitized!
  const sql = `SELECT * FROM users WHERE name = '${sanitized}'`;
  return database.execute(sql);
}
```

**Report:**
```
Trust boundary violations:
  - var:auth.ts:searchUsers:query → database.execute
    (crosses trust boundary without sanitization)
```

**Why it matters:**
- **Critical security check**
- Detects potential SQL injection, XSS, command injection
- Flags data exfiltration (internal data → external API)

---

### 5. Missing Nodes (Graph Integrity)

**What it detects:** Edges referencing non-existent nodes

**Logic:**
```typescript
const nodeIds = new Set(nodes.map(n => n.id));

for (edge of edges) {
  if (!nodeIds.has(edge.source))
    flag("missing source node");
  if (!nodeIds.has(edge.target))
    flag("missing target node");
}
```

**Example:**
```typescript
// Edge created:
{
  source: "var:auth.ts:login:username",
  target: "var:auth.ts:login:sanitized"  // ❌ Node doesn't exist!
}
```

**Report:**
```
Missing nodes:
  - var:auth.ts:login:sanitized (referenced in edge but missing node)
```

**Why it matters:**
- Indicates graph construction bug
- May reveal incomplete AST parsing
- External imports will show as missing (expected)

---

## Report Structure

```typescript
interface VariableConsistencyReport {
  orphanDefs: string[];              // Dead code
  orphanUses: string[];              // Undefined variables
  unreachableFlows: string[];        // Broken logic
  trustBoundaryViolations: string[]; // Security risks
  missingNodes: string[];            // Graph integrity
  summary: string;                   // Human-readable summary
}
```

**Example Report:**
```
⚠️ Found 8 consistency issues across 15 variables:
  - 2 orphan definitions
  - 1 orphan uses
  - 3 unreachable flows
  - 2 trust boundary violations
```

---

## Interpreting Results

### ✅ Clean Code (No Issues)

```
✅ All 15 variables are consistent. No data flow issues detected.
```

Indicates:
- All variables have proper definitions and uses
- Data flows are complete and traceable
- No security boundary violations
- Graph structure is valid

---

### ⚠️ Orphan Definitions (Yellow Warning)

**Severity:** Low to Medium

**Action:**
1. Review the variable - is it actually unused?
2. Check if it's the result of incomplete refactoring
3. In security code, verify the validated value is being used

**Example Fix:**
```typescript
// Before: Orphan definition
const sanitized = sanitize(input);
return database.query(input);  // ❌ Using raw input!

// After: Fixed
const sanitized = sanitize(input);
return database.query(sanitized);  // ✅ Using sanitized
```

---

### 🔴 Trust Boundary Violations (Critical)

**Severity:** Critical (Security Risk)

**Action:**
1. **Immediately review** - this is a potential vulnerability
2. Add sanitization/validation before the trust boundary
3. Verify the edge reason indicates proper security handling

**Example Fix:**
```typescript
// Before: Trust boundary violation
function search(userInput: string) {
  return db.query(userInput);  // 🔴 SQL Injection!
}

// After: Fixed
function search(userInput: string) {
  const sanitized = escapeSQL(userInput);  // ✅ Sanitized
  return db.query(sanitized);
}
```

---

### ⚠️ Unreachable Flows (Medium Warning)

**Severity:** Medium (Logic Bug)

**Action:**
1. Trace the variable backwards - where should it be defined?
2. Check if a validation/transformation step is missing
3. Verify the data flow makes logical sense

**Example Fix:**
```typescript
// Before: Unreachable flow
function transfer(amount: number) {
  database.debit(amount);  // ⚠️ Unreachable!
}

// After: Fixed
function transfer(amount: number) {
  const validated = validateAmount(amount);  // ✅ Defined
  database.debit(validated);  // ✅ Reachable!
}
```

---

## Expected Orphan Uses (False Positives)

Some orphan uses are **expected** and not bugs:

### External Imports
```typescript
import { hash, sanitize } from './utils';  // External definitions

function process(input: string) {
  const clean = sanitize(input);  // ⚠️ Orphan use (expected)
  return hash(clean);             // ⚠️ Orphan use (expected)
}
```

**Why:** The definitions are in a different file not analyzed together.

**Action:** Ignore or analyze files together as a bundle.

---

### Built-in Globals
```typescript
const timestamp = Date.now();  // ⚠️ Orphan use (expected)
console.log(payload);          // ⚠️ Orphan use (expected)
```

**Why:** `Date`, `console` are global built-ins without AST definitions.

**Action:** Ignore - these are safe.

---

### Framework Injections
```typescript
// React hooks
const [state, setState] = useState(0);  // ⚠️ Orphan use (expected)

// Dependency injection
database.query(sql);  // ⚠️ Orphan use (expected)
```

**Why:** Values are injected by framework or DI container.

**Action:** Ignore - these are intentional external dependencies.

---

## Integration with TelicLens

### In Analysis Pipeline

The consistency checker runs **automatically** after variable extraction:

```typescript
// services/geminiService.ts
const { variables, flows } = extractVariables(file);
const nodes = variablesToNodes(variables);
const edges = flowsToEdges(flows);

// Automatic consistency check
const consistency = checkVariableConsistency(nodes, edges);
result.variableConsistency = consistency;
```

---

### In UI (GraphView)

The consistency report displays in the top-right panel:

```
┌─────────────────────────────┐
│ Variable Consistency        │
├─────────────────────────────┤
│ ⚠️ 2 orphan definitions     │
│ ⚠️ 1 orphan uses            │
│ 🚨 3 trust boundary viol.   │
└─────────────────────────────┘
```

**Colors:**
- 🟢 Green: All consistent
- 🟡 Amber: Orphan definitions (dead code)
- 🟠 Orange: Unreachable flows (logic bugs)
- 🔴 Red: Trust boundary violations (security)

---

### In Tests

The consistency checker is used in automated tests:

```typescript
// test/graph-verify.test.ts
it('should detect trust boundary violations', () => {
  const graph = buildGroundTruth([vulnCode]);
  const report = checkVariableConsistency(graph.nodes, graph.edges);

  expect(report.trustBoundaryViolations.length).toBeGreaterThan(0);
});
```

---

## Advanced Usage

### Custom Trust Boundary Markers

Mark variables that cross security boundaries:

```typescript
const userInput = {
  name: req.body.username,
  variableInfo: {
    ...varInfo,
    trustBoundary: true  // Mark as trust boundary
  }
};
```

---

### Filtering Noise

Filter out external dependencies to focus on internal flows:

```typescript
import { filterMeaningfulVariables } from './services/variableConsistencyChecker';

// Remove noise: temp vars, loop counters, externals
const meaningful = filterMeaningfulVariables(allNodes);
const report = checkVariableConsistency(meaningful, edges);
```

---

### Graph Merging

Merge multiple files for cross-file analysis:

```typescript
import { mergeVariableNodes } from './services/variableConsistencyChecker';

const file1Nodes = variablesToNodes(file1Vars);
const file2Nodes = variablesToNodes(file2Vars);

const merged = mergeVariableNodes(file1Nodes, file2Nodes);
const report = checkVariableConsistency(merged, allEdges);
```

---

## Troubleshooting

### "All variables show as orphan uses"

**Cause:** Analyzing a single file with many imports.

**Fix:** Analyze files together or ignore external dependencies:
```typescript
const internal = report.orphanUses.filter(u =>
  !u.includes('import') && !u.includes('external')
);
```

---

### "Flow edges don't match nodes"

**Cause:** ID format mismatch (fixed in v0.0.1).

**Fix:** Ensure edges use scoped IDs:
```typescript
// Correct format
{ source: "var:file.ts:scope:name", target: "var:file.ts:scope:name2" }
```

---

### "Trust boundary violations for safe code"

**Cause:** Sanitization function not recognized.

**Fix:** Ensure edge reason includes keywords:
```typescript
{
  from: "userInput",
  to: "dbQuery",
  reason: "sanitize user input before query"  // Include "sanitize"
}
```

---

## Implementation Details

### Algorithm: Unreachable Flow Detection

```typescript
function findReachableNodes(startId: string, incoming: Map<string, string[]>): string[] {
  const visited = new Set<string>();
  const queue = [startId];

  // BFS backward through graph
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const parents = incoming.get(current) || [];
    for (const parent of parents) {
      if (!visited.has(parent)) queue.push(parent);
    }
  }

  return Array.from(visited);
}
```

**Time Complexity:** O(V + E) where V = nodes, E = edges
**Space Complexity:** O(V) for visited set

---

### Edge Direction Convention

**Data flows:** Definition → Use
```
const sanitized = sanitize(input);
└──────────────────────────────┘
    from: input
    to: sanitized
```

**Return flows:** Local → Return value
```
return token;
└──────────┘
    from: token
    to: return_token
```

---

## Future Enhancements

### Planned Features

1. **Taint Analysis**
   - Track tainted data from source to sink
   - Verify sanitization along all paths

2. **Inter-procedural Analysis**
   - Track flows across function boundaries
   - Validate call-site arguments match parameters

3. **Type-based Validation**
   - Check type compatibility in flows
   - Detect implicit type coercions

4. **Configuration**
   - Custom trust boundary keywords
   - Adjustable severity thresholds
   - Ignore patterns for known false positives

---

## References

- **Source Code:** `services/variableConsistencyChecker.ts`
- **Tests:** `test/graph-verify.test.ts`
- **Fixtures:** `test/fixtures/safe-auth.ts`, `test/fixtures/vulnerable-auth.ts`
- **Architecture:** `ARCHITECTURE.md` (variable-level analysis section)

---

## See Also

- [Variable Extraction](./VARIABLE_EXTRACTION.md) - How variables are extracted from AST
- [Graph Validation](./test/README.md) - Test suite and invariants
- [Multi-Zoom Clustering](./ZOOM_CLUSTERING.md) - Zoom-level graph clustering
