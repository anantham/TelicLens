# ADR-001: AI Code Inspector - Dual-View Analysis System

**Status:** Accepted
**Date:** 2025-11-22
**Authors:** TelicLens Team

---

## Problem Statement

AI-generated code often appears correct superficially but may contain bugs, vulnerabilities, or lack genuine intentionality. Unlike human-written code, which embeds purpose and design reasoning, AI code can be "slop" - functionally plausible but conceptually hollow or actively malicious. We need a tool to distinguish intentional, well-structured code from code that merely looks correct.

## Solution Overview

Build a dual-view code analysis interface that allows developers to understand codebases through two complementary lenses:

1. **Causal View**: Reductionist analysis showing how code blocks influence each other from input to output
2. **Telic View**: Purpose-driven analysis showing the functional roles and intentions of code sections

---

## Core Concept: Two Ways of Understanding Code

### Causal View (Mechanistic)

**What it shows**: How the code *works* mechanistically

- Input → Processing → Output flows
- Dependencies and call chains
- Data transformations
- Control flow paths

**Analogy**: Like understanding the human body through biochemistry and physics - neurons fire, muscles contract, blood flows.

**Use case**:
- Finding bugs in specific implementations
- Tracing how data moves through the system
- Understanding dependencies
- Identifying where things break

### Telic View (Functional)

**What it shows**: What the code is *trying to accomplish*

- Functional roles of code blocks
- How smaller functions serve larger purposes
- Hierarchical intention mapping
- Design goals and system-level purposes

**Analogy**: Like understanding the human body through organ systems - lungs and heart collaborate to form the respiratory system, which serves the purpose of oxygenating blood.

**Use case**:
- Detecting code that lacks genuine purpose
- Identifying vulnerabilities disguised as legitimate code
- Verifying AI understood the actual intent
- Finding code that "looks right" but serves the wrong purpose

---

## Key Insight: Intentionality as Security

Human-written code contains **intentionality** - every piece serves a deliberate purpose in a larger design. AI-generated slop often lacks this property, even when syntactically correct. By mapping code to its intended purposes, we can:

- Spot code that has no clear functional role
- Identify malicious code masquerading as legitimate functionality
- Verify that implementations match their stated purposes
- Detect when code solves problems that don't exist (potential backdoors)

---

## Technical Requirements

### 1. Causal View Implementation

**Core Features**:
- Parse codebase into dependency graph
- Visualize call chains and data flow
- Interactive node-based interface

**Interactions**:
- **Zoom in/out**: Focus on specific code blocks with increasing granularity
- **Recenter**: Click any node to make it the focal point, showing all influences to/from it
- **Trace paths**: Follow data/control flow from any point to any other
- **Highlight vulnerabilities**: Identify code blocks where bugs/vulnerabilities likely exist

**Display**:
```
Input → [Block A] → [Block B] → Output
         ↓           ↓
      [Block C]   [Block D]
```

### 2. Telic View Implementation

**Core Features**:
- Generate functional descriptions for code blocks
- Group code by shared purpose (not just by causal proximity)
- Show hierarchical intention mapping
- Provide natural language explanations

**Key Challenge**: Code that is causally separate may serve the same purpose, while causally connected code may serve different purposes.

**Example Mapping**:
```
System Purpose: "User Authentication Service"
├── Block Group 1: "Credential Validation"
│   ├── hash_password() - "Secure password storage"
│   ├── verify_token() - "Session validation"
│   └── check_permissions() - "Access control"
├── Block Group 2: "Security Logging"
│   ├── log_attempt() - "Audit trail maintenance"
│   └── alert_suspicious() - "Threat detection"
└── Block Group 3: "Error Handling"
    └── sanitize_error() - "Prevent information leakage"
```

**Verbal Descriptions** (generated for each block):
- "This function's role is to validate user credentials by comparing hashed passwords, serving the larger purpose of secure authentication"
- "These three functions combine to form the security logging subsystem, which maintains audit trails and detects threats"

**Interactions**:
- **Switch between abstraction levels**: View purposes at function-level, module-level, or system-level
- **Compare intent vs. implementation**: Does this code actually serve its stated purpose?
- **Identify orphaned code**: Code blocks with no clear functional role in the system
- **Detect conflicts**: Code serving contradictory purposes

### 3. UI Layout

```
┌──────────────────────────────────────────────────┐
│  View: [Causal] [Telic]        [Folder Select]  │
├──────────────────────────────────────────────────┤
│                    │                              │
│   Code Panel       │      Visualization Panel    │
│                    │                              │
│   - File tree      │   CAUSAL MODE:              │
│   - Code display   │   - Dependency graph        │
│   - Select/        │   - Flow diagrams           │
│     highlight      │   - Zoom/recenter controls  │
│                    │                              │
│                    │   TELIC MODE:               │
│                    │   - Purpose hierarchy       │
│                    │   - Functional groupings    │
│                    │   - Verbal descriptions     │
│                    │   - Intent verification     │
│                    │                              │
└──────────────────────────────────────────────────┘
```

### 4. Core Interactions

**In Both Views**:
- Upload/select codebase folder
- Navigate file tree in left panel
- Select/highlight code sections
- View corresponding analysis in right panel

**Causal View Specific**:
- Click node → recenter graph around it
- Zoom in → see finer-grained dependencies
- Zoom out → see higher-level architecture
- Trace path → highlight route from block A to block B

**Telic View Specific**:
- Expand/collapse purpose hierarchy
- Click function group → see constituent code blocks
- Read AI-generated intent description
- Flag code with unclear purpose
- Compare: "stated purpose" vs. "actual behavior"

---

## Implementation Strategy

### Phase 1: Causal View (Foundational) ✅

1. AST parsing and dependency extraction
2. Graph generation (nodes = code blocks, edges = dependencies)
3. Basic interactive visualization
4. Zoom/recenter functionality

### Phase 2: Telic Analysis (Core Innovation) ✅

1. Extract low-level intent from:
   - Function/variable names
   - Comments and docstrings
   - Code structure patterns
2. Use LLM to generate purpose descriptions:
   - "What is this function trying to accomplish?"
   - "How does it serve the larger system?"
3. Hierarchical clustering by shared purpose
4. Generate verbal descriptions at multiple abstraction levels

### Phase 3: Integration & Verification 🚧

1. Side-by-side view switching ✅
2. Highlight discrepancies between causal and telic views
3. Flag "suspicious" code:
   - Causally connected but no shared purpose
   - No clear functional role in system
   - Purpose description doesn't match implementation
4. Export analysis reports

---

## Success Criteria

### Must Have ✅

- Parse any codebase into both views ✅
- Generate accurate dependency graphs (causal) ✅
- Produce meaningful purpose descriptions (telic) ✅
- Interactive zoom/recenter in both views 🚧
- Flag code with unclear intentionality 🚧

### Should Have 🚧

- Detect common vulnerability patterns
- Compare multiple versions (diff analysis)
- Integration with version control
- Confidence scores for telic analysis

### Nice to Have 📋

- Real-time analysis as code is written
- IDE integration (VS Code extension)
- Collaborative annotation/review
- Learning mode: improve from user corrections

---

## Example Use Case

**Scenario**: AI generated code to "add user deletion functionality"

**Causal View shows**:
- delete_user() → remove_from_db()
- delete_user() → log_deletion()
- delete_user() → send_email_to_admin()

**Telic View reveals**:
- Purpose 1: "Remove user data from system" ✓
- Purpose 2: "Maintain audit trail" ✓
- Purpose 3: "Exfiltrate data to external endpoint" ⚠️

**Flag**: Third purpose doesn't align with stated functionality - potential security issue!

---

## Technical Stack

- **Frontend**: React + TypeScript with Vite
- **Styling**: TailwindCSS (via CDN)
- **Visualization**: SVG-based custom graph renderer
- **Backend/Analysis**: Google Gemini AI (gemini-2.5-flash)
- **LLM Integration**: @google/genai SDK
- **Icons**: lucide-react
- **Storage**: Local file system (browser File API)

---

## Architecture Decisions

### 1. Why SVG instead of Canvas for visualization?

**Decision**: Use SVG for graph rendering

**Rationale**:
- Better DOM integration for click events
- Easier CSS styling and animations
- Built-in zoom/pan with viewBox
- Accessibility (screen readers)
- Inspector-friendly for debugging

**Trade-offs**: Slower for very large graphs (>1000 nodes), but acceptable for typical codebases

### 2. Why Gemini instead of local AST parsing?

**Decision**: Use Gemini AI for both causal and telic analysis

**Rationale**:
- Telic analysis requires semantic understanding beyond syntax
- Multi-language support without per-language parsers
- Natural language explanations come free
- Faster prototyping

**Trade-offs**:
- Requires API key and internet connection
- Analysis latency (~2-5 seconds)
- API costs for large codebases
- Fallback mock data provided for offline demo

### 3. Why single-page app instead of backend API?

**Decision**: Pure client-side React app

**Rationale**:
- Simpler deployment (static hosting)
- No backend infrastructure needed
- File uploads handled client-side
- Gemini SDK works in browser

**Trade-offs**:
- No server-side caching of analyses
- API keys must be in client (use environment variables)
- Limited to browser file size limits

---

## Security Considerations

- Tool itself must be auditable (open source)
- LLM analysis should be transparent (show reasoning)
- Multiple passes/models for verification
- Human-in-the-loop for critical infrastructure
- API keys via environment variables, not hardcoded
- File uploads processed entirely client-side (no server storage)

---

## Future Enhancements

1. **Multi-Model Verification**: Compare Gemini analysis with local AST parsing for validation
2. **Historical Analysis**: Track how code intentionality changes over commits
3. **Collaborative Review**: Allow teams to annotate and flag suspicious patterns
4. **IDE Integration**: VS Code extension for inline telic analysis
5. **Custom Rules**: User-defined intentionality patterns (e.g., "all DB writes must log")
6. **Diff Mode**: Compare two versions of codebase side-by-side

---

## References

- Original ADR specification: [User-provided requirements]
- Teleological vs Causal thinking: [Aristotle's Four Causes]
- Code intentionality research: [Semantic Code Analysis]
- Graph visualization best practices: [D3.js, Cytoscape.js]

---

## Changelog

- **2025-11-22**: Initial ADR created, project structure established
- **Phase 1-2**: Implemented basic causal and telic views
- **Phase 3**: In progress - enhancements and verification features
