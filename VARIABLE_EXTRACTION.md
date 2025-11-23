# Variable Extraction

**AST-based variable extraction for fine-grained data flow analysis**

## Overview

The Variable Extractor parses TypeScript/JavaScript code using **Babel's AST parser** to extract:
- 📍 **Variable definitions** (parameters, locals, returns, fields, globals)
- 🔗 **Data flow edges** (assignments, returns, function calls)
- 📊 **Scope tracking** (function, class, module-level)
- 🏷️ **Type inference** (basic type detection from initialization)

**No AI required** - pure static analysis from Abstract Syntax Tree (AST).

---

## Quick Example

**Input Code:**
```typescript
function authenticateUser(username: string, password: string) {
  const sanitizedUsername = sanitize(username);
  const hashedPassword = hash(password);

  const user = database.findUser(sanitizedUsername);

  if (user && user.password === hashedPassword) {
    const token = generateToken(user.id);
    return token;
  }

  return null;
}
```

**Extracted Graph:**
```
Nodes (Variables):
├─ username (parameter, authenticateUser)
├─ password (parameter, authenticateUser)
├─ sanitizedUsername (local, authenticateUser)
├─ hashedPassword (local, authenticateUser)
├─ user (local, authenticateUser)
├─ token (local, authenticateUser)
└─ return_token (return, authenticateUser)

Edges (Data Flows):
├─ username → sanitizedUsername (assignment)
├─ password → hashedPassword (assignment)
└─ token → return_token (return)
```

---

## Usage

### Basic Extraction

```typescript
import { extractVariables } from './services/variableExtractor';

const file = {
  name: 'auth.ts',
  content: code,
  language: 'typescript'
};

const { variables, flows } = extractVariables(file);

console.log(`Extracted ${variables.length} variables`);
console.log(`Extracted ${flows.length} data flows`);
```

### Convert to Graph Nodes/Edges

```typescript
import { variablesToNodes, flowsToEdges } from './services/variableExtractor';

const nodes = variablesToNodes(variables);
const edges = flowsToEdges(flows);

// Now ready for graph visualization
```

### Filter Meaningful Variables

```typescript
import { filterMeaningfulVariables } from './services/variableConsistencyChecker';

// Remove noise: temp vars, loop counters, single-char vars
const meaningful = filterMeaningfulVariables(nodes);
```

---

## Extracted Information

### Variable Node Structure

```typescript
interface GraphNode {
  id: string;                    // "var:file.ts:scope:name"
  label: string;                 // Variable name
  type: 'variable';
  description: string;           // "parameter in authenticateUser"
  location: {
    file: string;
    startLine: number;
    endLine: number;
    aiComment?: string;
  };
  variableInfo: {
    symbolName: string;          // "username"
    scope: string;               // "authenticateUser"
    kind: 'parameter' | 'local' | 'return' | 'field' | 'global';
    dataType?: string;           // "string", "number", etc.
    isDef: boolean;              // Is this a definition site?
    isUse: boolean;              // Is this a use site?
    parentFunction?: string;     // "authenticateUser"
    trustBoundary?: boolean;     // Crosses security boundary?
  };
  clusterId?: string;            // For zoom clustering
  clusterLevel?: number;         // 0=var, 1=func, 2=file, 3=intent
}
```

---

## Variable Kinds

### 1. Parameters

Function/method arguments:

```typescript
function login(username: string, password: string) {
  //          ^^^^^^^^         ^^^^^^^^
  //          parameter        parameter
}
```

**Extracted:**
```javascript
{
  symbolName: "username",
  scope: "login",
  kind: "parameter",
  isDef: true,
  isUse: false
}
```

---

### 2. Local Variables

Variables declared within a function:

```typescript
function process(input: string) {
  const sanitized = sanitize(input);
  //    ^^^^^^^^^
  //    local variable

  let result = transform(sanitized);
  //  ^^^^^^
  //  local variable
}
```

**Extracted:**
```javascript
{
  symbolName: "sanitized",
  scope: "process",
  kind: "local",
  isDef: true,
  isUse: false,
  dataType: "string"  // Inferred from sanitize() return
}
```

---

### 3. Return Values

Values returned from functions:

```typescript
function generateToken(userId: string) {
  const token = createJWT(userId);
  return token;
  //     ^^^^^
  //     return value
}
```

**Extracted:**
```javascript
{
  symbolName: "return_token",
  scope: "generateToken",
  kind: "return",
  isDef: false,
  isUse: true
}
```

**Flow Edge:**
```javascript
{
  from: "var:auth.ts:generateToken:token",
  to: "var:auth.ts:generateToken:return_token",
  type: "return"
}
```

---

### 4. Fields (Object Properties)

```typescript
class User {
  private password: string;
  //      ^^^^^^^^
  //      field

  public email: string;
  //     ^^^^^
  //     field
}
```

**Note:** Currently basic field extraction. Full class member analysis is a future enhancement.

---

### 5. Globals (Module-level)

Variables declared at module scope:

```typescript
const API_KEY = process.env.API_KEY;
//    ^^^^^^^
//    global

let cache = new Map();
//  ^^^^^
//  global
```

---

## Data Flow Edges

### 1. Assignment Flows

Variable-to-variable assignments:

```typescript
const sanitized = sanitize(input);
//                         ^^^^^
//                         flow: input → sanitized
```

**Edge:**
```javascript
{
  from: "var:auth.ts:process:input",
  to: "var:auth.ts:process:sanitized",
  type: "assignment",
  reason: "input assigned to sanitized"
}
```

---

### 2. Return Flows

Local variable to return value:

```typescript
function hash(password: string) {
  const hashed = crypto.hash(password);
  return hashed;
  //     ^^^^^^
  //     flow: hashed → return_hashed
}
```

**Edge:**
```javascript
{
  from: "var:auth.ts:hash:hashed",
  to: "var:auth.ts:hash:return_hashed",
  type: "return",
  reason: "hashed returned from hash"
}
```

---

### 3. Assignment Expressions

Reassignments and updates:

```typescript
let count = 0;
count = count + 1;
//      ^^^^^
//      flow: count → count (self-assignment)
```

---

## Scope Tracking

The extractor maintains a **scope stack** during AST traversal:

### Scope Hierarchy

```typescript
// Scope: global
const API_URL = "https://api.example.com";

function authenticateUser(username: string) {
  // Scope: authenticateUser
  const sanitized = sanitize(username);

  function generateToken(userId: string) {
    // Scope: generateToken (nested)
    const payload = { userId, timestamp: Date.now() };
    return signJWT(payload);
  }

  const token = generateToken(user.id);
  return token;
}
```

**Scope Stack Evolution:**
```
global
  → authenticateUser (enters function)
    → generateToken (enters nested function)
    ← generateToken (exits function)
  ← authenticateUser (exits function)
```

**Result:**
- `username` → scope: `authenticateUser`
- `sanitized` → scope: `authenticateUser`
- `userId` → scope: `generateToken`
- `payload` → scope: `generateToken`

---

## Type Inference

Basic type inference from initialization:

```typescript
const name = "Alice";        // type: string
const age = 30;              // type: number
const active = true;         // type: boolean
const items = [];            // type: array
const user = {};             // type: object
const fn = () => {};         // type: function
```

**Inference Logic:**
```typescript
function inferType(node: Expression): string {
  if (isStringLiteral(node)) return 'string';
  if (isNumericLiteral(node)) return 'number';
  if (isBooleanLiteral(node)) return 'boolean';
  if (isArrayExpression(node)) return 'array';
  if (isObjectExpression(node)) return 'object';
  if (isFunctionExpression(node)) return 'function';

  // Constructor calls
  if (isCallExpression(node)) {
    if (node.callee.name === 'Array') return 'array';
    if (node.callee.name === 'Object') return 'object';
  }

  return 'unknown';
}
```

---

## Noise Filtering

Some variables are **filtered out** to reduce noise:

### Filtered Variables

```typescript
// Temporary variables
const tmp = getValue();         // ❌ Filtered (tmp*)
const temp123 = process();      // ❌ Filtered (temp*)

// Single-character loop counters
for (let i = 0; i < n; i++) {}  // ❌ Filtered (single char)

// Underscore-prefixed short vars
const _ = require('lodash');    // ❌ Filtered (_*)
```

### Kept Variables

```typescript
// Meaningful names
const sanitizedInput = clean(input);  // ✅ Kept (3+ chars)
const userId = user.id;               // ✅ Kept (meaningful)

// Parameters (always kept)
function process(i: number) {}  // ✅ Kept (parameter)

// Return values (always kept)
const return_value = ...;       // ✅ Kept (return)
```

**Filter Logic:**
```typescript
function filterMeaningfulVariables(variables: GraphNode[]): GraphNode[] {
  return variables.filter(v => {
    const name = v.variableInfo?.symbolName || '';

    // Skip noise
    if (name.startsWith('_') && name.length < 3) return false;
    if (/^tmp\d*$/.test(name)) return false;
    if (/^temp\d*$/.test(name)) return false;
    if (name.length === 1 && name !== name.toLowerCase()) return false;

    // Keep meaningful
    return (
      v.variableInfo?.kind === 'parameter' ||
      v.variableInfo?.kind === 'return' ||
      v.variableInfo?.kind === 'field' ||
      v.variableInfo?.kind === 'global' ||
      (v.variableInfo?.kind === 'local' && name.length > 2)
    );
  });
}
```

---

## AST Traversal Details

### Visitor Pattern

The extractor uses Babel's **visitor pattern** to traverse the AST:

```typescript
traverse(ast, {
  FunctionDeclaration: {
    enter(path) {
      // Push scope, extract parameters
      scopeStack.push(funcName);
      extractParameters(path.node.params);
    },
    exit() {
      // Pop scope
      scopeStack.pop();
    }
  },

  VariableDeclarator(path) {
    // Extract local variables
    extractVariable(path.node.id, currentScope);
  },

  ReturnStatement(path) {
    // Extract return flows
    extractReturnFlow(path.node.argument, currentScope);
  }
});
```

### AST Node Types Handled

| AST Node | Extraction |
|----------|-----------|
| `FunctionDeclaration` | Scope tracking, parameters |
| `FunctionExpression` | Scope tracking, parameters |
| `ArrowFunctionExpression` | Scope tracking, parameters |
| `VariableDeclarator` | Local variables, type inference |
| `Identifier` | Variable uses |
| `ReturnStatement` | Return flows |
| `AssignmentExpression` | Assignment flows |

---

## ID Format Convention

**Variable Node IDs:**
```
var:${file}:${scope}:${name}

Examples:
- var:auth.ts:authenticateUser:username
- var:auth.ts:generateToken:payload
- var:auth.ts:global:API_KEY
```

**Flow Edge IDs:**
```
${source_id} → ${target_id}

Example:
- var:auth.ts:login:password → var:auth.ts:login:hashed
```

**Critical:** Scope segment is required for edges to match nodes!

---

## Error Handling

### Parse Failures

If Babel can't parse the code:

```typescript
try {
  const ast = parse(file.content, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
    errorRecovery: true  // Continue on syntax errors
  });
} catch (error) {
  console.warn(`Failed to parse ${file.name}:`, error);
  return { variables: [], flows: [] };  // Return empty
}
```

### Missing Location Info

If AST nodes lack location data:

```typescript
line: param.loc?.start.line || 0  // Fallback to 0
```

---

## Limitations

### Current Limitations

1. **Single-file Analysis**
   - Doesn't track imports across files
   - External dependencies show as orphan uses

2. **Basic Type Inference**
   - Only literal-based type detection
   - No TypeScript type system integration

3. **Limited Flow Detection**
   - Tracks simple assignments and returns
   - Doesn't track complex expressions (e.g., `a + b`)

4. **No Alias Tracking**
   - Doesn't track object property flows
   - Doesn't handle destructuring assignments

### Future Enhancements

1. **Multi-file Analysis**
   - Cross-file import resolution
   - Module-level flow tracking

2. **TypeScript Integration**
   - Use TypeScript compiler API for full type info
   - Infer types from function signatures

3. **Advanced Flow Detection**
   - Expression-level flows (a + b → c)
   - Object property tracking ({ x: a } → obj.x)
   - Destructuring ({ x, y } = obj)

4. **Control Flow Analysis**
   - Conditional flows (if/else branches)
   - Loop iteration flows
   - Exception handling flows

---

## Performance

### Benchmarks

| File Size | Variables | Flows | Parse Time | Memory |
|-----------|-----------|-------|------------|--------|
| 100 LOC   | ~20       | ~10   | < 10ms     | < 1MB  |
| 500 LOC   | ~100      | ~50   | < 50ms     | < 5MB  |
| 1000 LOC  | ~200      | ~100  | < 100ms    | < 10MB |

### Optimization

For large codebases:

```typescript
// Process files in parallel
const results = await Promise.all(
  files.map(file => extractVariables(file))
);

// Merge results
const allVariables = results.flatMap(r => r.variables);
const allFlows = results.flatMap(r => r.flows);
```

---

## Integration

### With Consistency Checker

```typescript
import { extractVariables, variablesToNodes, flowsToEdges } from './services/variableExtractor';
import { checkVariableConsistency } from './services/variableConsistencyChecker';

const { variables, flows } = extractVariables(file);
const nodes = variablesToNodes(variables);
const edges = flowsToEdges(flows);

const report = checkVariableConsistency(nodes, edges);
console.log(report.summary);
```

### With Graph Visualization

```typescript
import { clusterNodesByZoomLevel } from './services/zoomClustering';

// Extract variables
const nodes = variablesToNodes(variables);
const edges = flowsToEdges(flows);

// Apply clustering for zoom level
const { nodes: clustered, edges: clusteredEdges } =
  clusterNodesByZoomLevel(nodes, edges, zoomLevel);

// Render in GraphView
<GraphView data={{ nodes: clustered, edges: clusteredEdges }} />
```

---

## Testing

See `test/graph-verify.test.ts` for comprehensive tests:

```typescript
it('should extract parameters', () => {
  const file = loadFixture('safe-auth.ts');
  const { variables } = extractVariables(file);

  const params = variables.filter(v => v.kind === 'parameter');
  expect(params.length).toBeGreaterThan(0);

  const hasUsername = params.some(p => p.name === 'username');
  expect(hasUsername).toBe(true);
});
```

---

## See Also

- [Variable Consistency](./VARIABLE_CONSISTENCY.md) - Consistency checking on extracted variables
- [Zoom Clustering](./ZOOM_CLUSTERING.md) - Multi-level graph clustering
- [Test Suite](./test/README.md) - Ground truth validation
