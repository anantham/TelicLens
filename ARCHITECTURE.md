# TelicLens Architecture & Scaling Strategy

## Current Limitations

### 1. **Single-Pass Analysis Bottleneck**
**Problem:** We send all files in one API call, asking for:
- Causal analysis (data flow)
- Telic analysis (intent mapping)
- Security analysis (suspicious patterns)
- Full graph generation (nodes + edges)

**Issues:**
- Large codebases (>50k chars) hit token limits
- JSON responses can be truncated (we saw error at position 210,485)
- Shallow analysis when AI has too much to process
- Long wait times (no progressive results)

### 2. **Flat Schema Can't Scale**
Current structure:
```typescript
{
  nodes: GraphNode[]  // Flat array - no hierarchy
  edges: GraphEdge[]  // No module/package grouping
  summary: string
}
```

**Problems for multi-file codebases:**
- No file-level grouping
- Can't distinguish local vs cross-file dependencies
- No namespace/module context
- Hard to visualize large systems (100+ nodes)

---

## Recommended Improvements

### Phase 1: Multi-Pass Analysis (Implemented ✓)

**Strategy:** Break large codebases into manageable chunks

**Limits:**
- 50,000 chars per pass (~12k tokens)
- Max 5 files per pass

**Benefits:**
- Stay within token limits
- Deeper analysis per chunk
- Progressive loading (show results as they come)
- Better error handling (one pass fails ≠ total failure)

**Usage:**
```typescript
import { needsMultiPass, runMultiPassAnalysis } from './services/multiPassAnalysis';

if (needsMultiPass(files)) {
  const result = await runMultiPassAnalysis(files, model, (current, total, name) => {
    console.log(`Pass ${current}/${total}: ${name}`);
  });
}
```

---

### Phase 2: Hierarchical Schema (TODO)

**Enhanced Types:**
```typescript
interface ModuleNode extends GraphNode {
  type: 'module';
  children: GraphNode[];  // Files within this module
  exports: string[];      // Public API
  imports: string[];      // External dependencies
}

interface FileNode extends GraphNode {
  type: 'file';
  module?: string;        // Parent module ID
  functions: string[];    // Function IDs in this file
  exports: string[];      // What this file exports
}

interface CrossFileEdge extends GraphEdge {
  scope: 'local' | 'cross-file' | 'cross-module';
  sourceFile: string;
  targetFile: string;
}
```

**Benefits:**
- Collapsible modules in UI
- Clear separation of internal vs external dependencies
- Better visualization of architecture

---

### Phase 3: Specialized Analysis Passes (TODO)

Instead of asking for everything at once, run **focused passes**:

#### **Pass 1: Structure Extraction** (fast, ~5s)
**Goal:** Get the skeleton
- Files, functions, data stores
- Basic call graph (who calls whom)
- No intent analysis yet

**Prompt:** "List all functions, their calls, and data flows. No analysis needed."

#### **Pass 2: Intent Mapping** (deep, ~15s)
**Goal:** Understand purpose
- Why does each function exist?
- What are system-level goals?
- Map functions → intents

**Prompt:** "For each function, explain WHY it exists and what system goal it serves."

#### **Pass 3: Security Analysis** (critical, ~10s)
**Goal:** Find suspicious patterns
- Orphaned functions
- Purpose mismatches
- Hidden side effects

**Prompt:** "Identify code that seems suspicious or doesn't serve a clear purpose."

**Total time:** ~30s, but **progressive results** (user sees structure in 5s)

---

### Phase 4: Incremental Analysis (Advanced)

**Concept:** Only re-analyze what changed

**Cache Strategy:**
```typescript
{
  "file_hash_abc123": {
    nodes: [...],
    edges: [...],
    timestamp: 1234567890
  }
}
```

**Benefits:**
- Fast re-analysis when files change
- Only send changed files to API
- Merge cached + new results

---

## When to Use What

| Codebase Size | Strategy | Estimated Time |
|---------------|----------|----------------|
| < 5 files, < 50k chars | Single-pass | 5-10s |
| 5-20 files, 50k-200k chars | Multi-pass | 15-40s |
| 20+ files, > 200k chars | Multi-pass + Hierarchical | 40s-2min |
| Iterative development | Incremental (cache) | 5-15s |

---

## Prompt Optimization

### Current Prompt: ~500 words
- Asks for 2 analysis types + security + 4 node types + 3 edge types + summary
- **Too broad** for large codebases

### Optimized Prompts:

**Structure-Only Prompt** (150 words):
```
Analyze this code and return:
1. All function definitions
2. Function calls (who calls whom)
3. Data flows (what data moves where)

Output: JSON with nodes (files, functions, data) and edges (dependency, flow).
No intent analysis. No descriptions. Just structure.
```

**Intent-Only Prompt** (200 words):
```
Given these functions: [list]

For each function, answer:
1. WHY does it exist?
2. What system-level goal does it serve?

Output: intent nodes + serves_intent edges.
```

**Security-Only Prompt** (250 words):
```
Review these functions for suspicious patterns:
1. No clear purpose
2. Purpose mismatch (does more than name suggests)
3. Orphaned (not serving any system goal)

Output: List of suspicious node IDs with reasons.
```

---

## Schema Version 2 Proposal

```typescript
interface AnalysisResultV2 {
  version: 2;
  metadata: {
    totalFiles: number;
    totalFunctions: number;
    analysisDate: string;
    passes: number;
  };

  // Hierarchical structure
  modules: ModuleNode[];

  // Graph data (unchanged)
  nodes: GraphNode[];
  edges: GraphEdge[];

  // New: Security findings
  security: {
    score: number;
    orphanedFunctions: string[];  // Node IDs
    suspiciousPatterns: {
      nodeId: string;
      reason: string;
      severity: 'low' | 'medium' | 'high';
    }[];
  };

  // Summaries by category
  summaries: {
    overall: string;
    causal: string;
    telic: string;
    security: string;
  };
}
```

---

## Implementation Priority

1. **Now:** Multi-pass analysis (already implemented)
2. **Next:** Progress UI for multi-pass
3. **Later:** Specialized analysis passes
4. **Future:** Hierarchical schema + incremental caching

---

## Trade-offs

| Approach | Pros | Cons |
|----------|------|------|
| Single-pass | Simple, fast for small codebases | Fails on large codebases |
| Multi-pass | Scales to any size | Longer total time, needs merging |
| Specialized passes | Deep analysis, progressive UI | More API calls, complex orchestration |
| Incremental | Fast re-analysis | Needs caching, invalidation logic |

---

## Conclusion

**Current prompt is fine for:**
- Demo (4 files, ~3k chars) ✓
- Small projects (< 10 files) ✓

**Needs multi-pass for:**
- Medium projects (10-50 files) ⚠️
- Large projects (50+ files) ❌

**Recommendation:** Implement multi-pass with progress UI NOW, defer hierarchical schema until we see real-world usage patterns.
