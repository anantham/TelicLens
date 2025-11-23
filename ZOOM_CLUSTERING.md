# Multi-Zoom Clustering

**Dynamic graph granularity control for variable-level to intent-level visualization**

## Overview

Multi-Zoom Clustering provides **4 levels of graph granularity**, allowing you to zoom from finest variable-level detail to coarsest intent-level architecture:

- **Level 0 (VAR)**: Every variable visible - parameters, locals, returns
- **Level 1 (FUNC)**: Variables clustered into their parent functions
- **Level 2 (FILE)**: Functions clustered into their files
- **Level 3 (INTENT)**: Files clustered into system intents (telos)

**Edges automatically aggregate** as you zoom out, maintaining logical flow at each level.

---

## Quick Start

```typescript
import { clusterNodesByZoomLevel } from './services/zoomClustering';

// Level 0: Variable-level (finest)
const { nodes, edges } = clusterNodesByZoomLevel(
  originalNodes,
  originalEdges,
  0  // VAR level
);

// Level 1: Function-level
const { nodes, edges } = clusterNodesByZoomLevel(
  originalNodes,
  originalEdges,
  1  // FUNC level
);
```

---

## The Four Zoom Levels

### Level 0: Variable (Finest Granularity)

**Shows:** Every variable, parameter, and return value

**Use Case:** Debugging data flows, tracing specific values

**Example Graph:**
```
authenticateUser:
  ├─ username (parameter)
  ├─ password (parameter)
  ├─ sanitizedUsername (local)
  ├─ hashedPassword (local)
  ├─ user (local)
  ├─ token (local)
  └─ return_token (return)

Edges:
  username → sanitizedUsername
  password → hashedPassword
  token → return_token
```

**Node Count:** ~100-200 for medium codebase

---

### Level 1: Function (Variable Clustering)

**Shows:** Functions with aggregated variable counts

**Use Case:** Understanding function-to-function data flow

**Example Graph:**
```
authenticateUser [7 variables]
  ├─ inputs: username, password
  └─ outputs: token

generateToken [4 variables]
  ├─ inputs: userId
  └─ outputs: jwtToken

Edges:
  authenticateUser → generateToken (data flow: userId)
```

**Node Count:** ~20-40 for medium codebase

**Aggregation Logic:**
- Variables within same function are hidden
- Function node shows variable count in description
- Inter-function flows are preserved
- Intra-function flows are hidden

---

### Level 2: File (Function Clustering)

**Shows:** Files with aggregated function counts

**Use Case:** Module dependencies, architectural overview

**Example Graph:**
```
auth.ts [3 functions]
  └─ Exports: authenticateUser, generateToken

database.ts [5 functions]
  └─ Exports: connect, query, disconnect

utils.ts [2 functions]
  └─ Exports: sanitize, hash

Edges:
  auth.ts → database.ts (file dependency)
  auth.ts → utils.ts (file dependency)
```

**Node Count:** ~5-15 for medium codebase

**Aggregation Logic:**
- Functions within same file are hidden
- File node shows function count
- Inter-file dependencies shown
- Intra-file calls hidden

---

### Level 3: Intent (Coarsest Granularity)

**Shows:** Only intent nodes (system-level purposes)

**Use Case:** Telic analysis, understanding system goals

**Example Graph:**
```
User Authentication [10 components]
  ├─ Supports: System Security
  └─ Serves: User Management

Data Integrity [8 components]
  ├─ Supports: System Reliability
  └─ Serves: Business Logic

System Security (root telos)
  └─ Overarching goal: Protect user data
```

**Node Count:** ~3-8 for medium codebase

**Aggregation Logic:**
- Only intent nodes shown
- Supporting component counts aggregated
- Intent hierarchy preserved
- serves_intent and supports_intent edges shown

---

## UI Integration

### Detail Level Slider

Located in GraphView (top-left):

```
┌───────────────────┐
│ Detail Level      │
├───────────────────┤
│ [VAR   ] ← active │
│ [FUNC  ]          │
│ [FILE  ]          │
│ [INTENT]          │
└───────────────────┘
```

**Interaction:**
- Click button to change detail level
- Graph redraws automatically
- Layout updates to fit new node count

---

### Automatic Zoom Level Selection

Based on viewport width:

```typescript
function calculateZoomLevel(viewBoxWidth: number): ZoomLevel {
  if (viewBoxWidth < 1000) return 0;  // VAR (zoomed in)
  if (viewBoxWidth < 2000) return 1;  // FUNC
  if (viewBoxWidth < 4000) return 2;  // FILE
  return 3;  // INTENT (zoomed out)
}
```

**Manual override:** User can set detail level explicitly

---

## Edge Aggregation

### Level 0 → Level 1 (Variable to Function)

**Before (Level 0):**
```
var:auth.ts:login:username → var:auth.ts:sanitize:input
var:auth.ts:login:password → var:auth.ts:hash:input
```

**After (Level 1):**
```
func:auth.ts:login → func:auth.ts:sanitize (data flow: username)
func:auth.ts:login → func:auth.ts:hash (data flow: password)
```

**Logic:**
- Find all variable-to-variable edges crossing function boundaries
- Create one aggregated edge per unique (sourceFunc, targetFunc) pair
- Label: "data flow (variables)"

---

### Level 1 → Level 2 (Function to File)

**Before (Level 1):**
```
func:auth.ts:login → func:database.ts:query
func:auth.ts:register → func:database.ts:insert
```

**After (Level 2):**
```
file:auth.ts → file:database.ts (file dependency)
```

**Logic:**
- Find all function-to-function edges crossing file boundaries
- Create one aggregated edge per unique (sourceFile, targetFile) pair
- Label: "file dependency"

---

### Level 2 → Level 3 (File to Intent)

**Before (Level 2):**
```
file:auth.ts → serves_intent → User Authentication
file:database.ts → serves_intent → Data Integrity
```

**After (Level 3):**
```
User Authentication → supports_intent → System Security
```

**Logic:**
- Hide all non-intent nodes
- Show only intent-to-intent edges (supports_intent, undermines_intent)
- Preserve intent hierarchy

---

## Implementation Details

### Clustering Algorithm

```typescript
function clusterVariablesIntoFunctions(
  nodes: GraphNode[],
  edges: GraphEdge[]
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const variableNodes = nodes.filter(n => n.type === 'variable');
  const functionNodes = nodes.filter(n => n.type === 'function');

  // Group variables by parent function
  const variablesByFunction = new Map<string, GraphNode[]>();
  for (const varNode of variableNodes) {
    const clusterId = varNode.clusterId || 'global';
    if (!variablesByFunction.has(clusterId)) {
      variablesByFunction.set(clusterId, []);
    }
    variablesByFunction.get(clusterId).push(varNode);
  }

  // Update function nodes with variable counts
  const updatedNodes = functionNodes.map(node => {
    const clusterVars = variablesByFunction.get(node.id) || [];
    return {
      ...node,
      description: `${node.description} [${clusterVars.length} variables]`
    };
  });

  // Aggregate edges
  const edgeMap = new Map<string, GraphEdge>();
  for (const edge of edges) {
    const sourceNode = nodes.find(n => n.id === edge.source);
    const targetNode = nodes.find(n => n.id === edge.target);

    if (sourceNode?.type === 'variable' && targetNode?.type === 'variable') {
      const sourceCluster = sourceNode.clusterId;
      const targetCluster = targetNode.clusterId;

      if (sourceCluster !== targetCluster) {
        const edgeKey = `${sourceCluster}->${targetCluster}`;
        if (!edgeMap.has(edgeKey)) {
          edgeMap.set(edgeKey, {
            source: sourceCluster,
            target: targetCluster,
            type: 'flow',
            label: 'data flow (variables)',
            reason: 'Aggregated from variable flows'
          });
        }
      }
    }
  }

  return { nodes: updatedNodes, edges: Array.from(edgeMap.values()) };
}
```

---

## Cluster Metadata

Each node carries cluster information:

```typescript
interface GraphNode {
  // ...
  clusterId?: string;      // ID of parent cluster
  clusterLevel?: number;   // 0=var, 1=func, 2=file, 3=intent
}
```

**Variable Node Example:**
```typescript
{
  id: "var:auth.ts:login:username",
  type: "variable",
  clusterId: "func:auth.ts:login",  // Parent function
  clusterLevel: 0                   // Variable level
}
```

**Function Node Example:**
```typescript
{
  id: "func:auth.ts:login",
  type: "function",
  clusterId: "file:auth.ts",  // Parent file
  clusterLevel: 1             // Function level
}
```

---

## Edge Preservation Rules

### Intra-Cluster Edges (Hidden)

Edges within the same cluster are hidden at higher zoom levels:

**Level 0:**
```
var:login:username → var:login:sanitized  ✅ Shown (different variables)
```

**Level 1:**
```
(both in func:login cluster)  ❌ Hidden (same cluster)
```

---

### Inter-Cluster Edges (Aggregated)

Edges crossing cluster boundaries are aggregated:

**Level 0:**
```
var:login:username → var:sanitize:input
var:login:password → var:hash:input
```

**Level 1:**
```
func:login → func:sanitize (aggregated)
func:login → func:hash (aggregated)
```

---

### Intent Edges (Always Shown)

Intent-related edges are preserved at all levels:

```
serves_intent
supports_intent
undermines_intent
```

---

## Performance Considerations

### Node Count Reduction

| Level | Typical Node Count | Reduction |
|-------|-------------------|-----------|
| 0 (VAR) | 100-200 | - |
| 1 (FUNC) | 20-40 | **80-90%** |
| 2 (FILE) | 5-15 | **95-98%** |
| 3 (INTENT) | 3-8 | **98-99%** |

### Layout Performance

**Level 0:** ~500ms (Dagre layout for 200 nodes)
**Level 3:** ~50ms (Dagre layout for 5 nodes)

**Recommendation:** Use Level 1-2 for large codebases, zoom to Level 0 for specific areas.

---

## Use Cases

### Debugging a Specific Function

1. Start at **Level 1** (Function) to see function boundaries
2. Identify suspicious function
3. Zoom to **Level 0** (Variable) to see internal data flows
4. Trace specific variable through its uses

---

### Understanding Module Dependencies

1. Zoom to **Level 2** (File) to see module structure
2. Identify high-coupling files (many incoming/outgoing edges)
3. Zoom to **Level 1** (Function) to see which functions create the coupling
4. Consider refactoring to reduce dependencies

---

### Telic Analysis (Purpose)

1. Zoom to **Level 3** (Intent) to see system goals
2. Identify orphan intents (no connection to root telos)
3. Check for undermines_intent edges (contradictions)
4. Zoom to **Level 2** (File) to see which files serve each intent

---

## Integration with GraphView

### State Management

```typescript
const [detailLevel, setDetailLevel] = useState<ZoomLevel>(1);

const clusteredData = useMemo(() => {
  if (!data) return null;
  const { nodes, edges } = clusterNodesByZoomLevel(
    data.nodes,
    data.edges,
    detailLevel
  );
  return { ...data, nodes, edges };
}, [data, detailLevel]);
```

### Rendering

```typescript
// Graph uses clusteredData instead of raw data
<svg>
  {clusteredData.nodes.map(node => (
    <Node node={node} />
  ))}
  {clusteredData.edges.map(edge => (
    <Edge edge={edge} />
  ))}
</svg>
```

---

## Future Enhancements

### Planned Features

1. **Smooth Transitions**
   - Animate nodes as they cluster/uncluster
   - Fade in/out during zoom level changes

2. **Selective Expansion**
   - Click function to expand only its variables
   - Click file to expand only its functions
   - Mixed zoom levels in same graph

3. **Cluster Highlighting**
   - Hover cluster to highlight contained nodes
   - Click cluster to focus on that subgraph

4. **Custom Clustering**
   - User-defined cluster groups
   - Tag-based clustering (e.g., "authentication", "database")

5. **Automatic Zoom Suggestions**
   - Detect optimal zoom level based on graph density
   - Suggest zoom level for specific analysis tasks

---

## Configuration

### Default Zoom Level

Set in GraphView component:

```typescript
const [detailLevel, setDetailLevel] = useState<ZoomLevel>(1);  // FUNC
```

---

### Cluster Thresholds

Configure when automatic zoom occurs:

```typescript
const ZOOM_THRESHOLDS = {
  VAR_TO_FUNC: 1000,   // Switch to FUNC at 1000px viewport
  FUNC_TO_FILE: 2000,  // Switch to FILE at 2000px viewport
  FILE_TO_INTENT: 4000 // Switch to INTENT at 4000px viewport
};
```

---

## Testing

See `test/graph-verify.test.ts`:

```typescript
it('should cluster variables into functions', () => {
  const { nodes, edges } = clusterNodesByZoomLevel(
    variableNodes,
    variableEdges,
    1  // FUNC level
  );

  // Variables should be hidden
  const varNodes = nodes.filter(n => n.type === 'variable');
  expect(varNodes.length).toBe(0);

  // Function nodes should remain
  const funcNodes = nodes.filter(n => n.type === 'function');
  expect(funcNodes.length).toBeGreaterThan(0);
});
```

---

## See Also

- [Variable Extraction](./VARIABLE_EXTRACTION.md) - How variables are extracted
- [Variable Consistency](./VARIABLE_CONSISTENCY.md) - Consistency checks on variables
- [GraphView Component](./components/GraphView.tsx) - Rendering and interaction
