import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, TraceResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Cache utility functions
const generateCacheKey = (files: { name: string; content: string }[]): string => {
  // Create a simple hash from file names and content lengths
  const signature = files
    .map(f => `${f.name}:${f.content.length}:${f.content.substring(0, 100)}`)
    .join('|');

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < signature.length; i++) {
    const char = signature.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `analysis_${Math.abs(hash).toString(36)}`;
};

const getCachedAnalysis = (cacheKey: string): AnalysisResult | null => {
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const data = JSON.parse(cached);
      // Check if cache is less than 24 hours old
      const cacheAge = Date.now() - (data.timestamp || 0);
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      if (cacheAge < maxAge) {
        return data.result;
      } else {
        // Remove stale cache
        localStorage.removeItem(cacheKey);
      }
    }
  } catch (error) {
    console.warn("Cache read error:", error);
  }
  return null;
};

const setCachedAnalysis = (cacheKey: string, result: AnalysisResult): void => {
  try {
    const cacheData = {
      result,
      timestamp: Date.now()
    };
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
  } catch (error) {
    console.warn("Cache write error:", error);
  }
};

export const clearAnalysisCache = () => {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('analysis_') || k.startsWith('trace_'))
      .forEach(k => localStorage.removeItem(k));
    console.log("🗑️ Cleared TelicLens analysis/trace cache");
  } catch (error) {
    console.warn("Cache clear error:", error);
  }
};

const generateTraceCacheKey = (snippet: string, fileName: string, graphId: string): string => {
  const signature = `${fileName}:${snippet.substring(0, 50)}:${graphId}`;
  let hash = 0;
  for (let i = 0; i < signature.length; i++) {
    const char = signature.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `trace_${Math.abs(hash).toString(36)}`;
};

export const analyzeCodebase = async (files: { name: string; content: string }[], model: string = 'gemini-2.5-pro'): Promise<AnalysisResult> => {
  // Check cache first
  const cacheKey = generateCacheKey(files);
  const cachedResult = getCachedAnalysis(cacheKey);

  if (cachedResult) {
    console.log("💾 Using cached analysis (saves API call!)");
    console.log(`📊 Cached: ${cachedResult.nodes.length} nodes, ${cachedResult.edges.length} edges`);
    return cachedResult;
  }

  const fileContext = files.map(f => `File: ${f.name}\nContent:\n${f.content}\n---`).join('\n');

  const prompt = `
    You are "TelicLens" - an advanced code intentionality analyzer designed to detect AI-generated code "slop" and hidden vulnerabilities.

    Analyze the following codebase through TWO COMPLEMENTARY LENSES:

    ## 1. CAUSAL ANALYSIS (Mechanistic)
    - Trace data flow: Input → Processing → Output
    - Identify function calls, dependencies, and control flow
    - Map how data transforms through the system
    - Detect dead code and unreachable paths

    ## 2. TELIC ANALYSIS (Teleological - Most Important!)
    - **What is each code block TRYING to accomplish?**
    - **Why does this code exist in the larger system design?**
    - **Does every function serve a CLEAR, LEGITIMATE purpose?**
    - **Are there code blocks that "look right" but serve no real purpose?**

    ## SECURITY FOCUS: Detect Suspicious Patterns

    **Flag code as suspicious if:**
    1. **No clear purpose**: Code that doesn't contribute to any system goal
    2. **Purpose mismatch**: Implementation doesn't match stated intent (e.g., "delete_user" that sends data externally)
    3. **Orphaned functionality**: Code disconnected from the main purpose hierarchy
    4. **Excessive complexity**: Overly complex solutions for simple problems (potential obfuscation)
    5. **Hidden side effects**: Functions doing more than their name/comments suggest

    ## OUTPUT REQUIREMENTS:

    **Nodes**: Create nodes for:
    - Files (type: 'file')
    - Major functions (type: 'function')
    - Data stores/databases (type: 'data')
    - **System-level intents** (type: 'intent') - e.g., "User Authentication", "Data Integrity", "Privacy Protection"

    **For each function node, provide:**
    - Clear description of WHAT it does (mechanistic)
    - Clear "intent" field explaining WHY it exists (teleological)
    - Inputs/outputs for data flow tracking
    - **CRITICAL: Exact source location** with line numbers and AI-generated comment:
      * "file": The exact filename where this function is defined
      * "startLine": Line number where function definition starts (e.g., "def function_name" or "function function_name")
      * "endLine": Line number where function definition ends (closing brace/last line)
      * "aiComment": One-sentence explanation of how this code relates to its parent node in the graph
        - For functions serving intents: "Serves '{IntentName}' by {how it does it}"
        - For functions called by others: "Called by {parent} to {purpose}"
        - Keep under 100 characters
        - Example: "Serves 'System Security' by verifying JWT signature before granting access"

    **For intent nodes:**
    - Declare 1-3 ROOT TELOS entries (rootIntents) that represent the system's overarching goals.
    - Build a HIERARCHY: supporting intents must connect upward to a root intent via supports_intent edges.
    - Use imperative language: "Authenticate Users", "Prevent Fraud", "Maintain Data Consistency"

    **Edges**: Create FIVE types with **RICH, INVESTIGATIVE labels** (see examples below). For EACH edge also provide a "reason" explaining why this connection exists (condition, guard, purpose).
    - 'dependency': Function A calls Function B
      * Label format: "WHY → WHAT" (reason for call → data passed)
      * Examples:
        - "validates auth → JWT token" (not just "JWT token")
        - "checks fraud risk → user_id, amount"
        - "required for compliance → transaction_metadata"
        - "enforces rate limit → request_count"

    - 'flow': Data flows from A to B
      * Label format: "TRANSFORMATION → DATA" or just "DATA" if no transformation
      * Examples:
        - "encrypts with AES-256 → plaintext_amount" (shows HOW)
        - "sanitizes input → raw_user_input"
        - "hashes with SHA-256 → password"
        - "aggregates from multiple sources → transaction_history"
        - "validates format → email_address"
        - "user_id, session_token" (simple data passing)

    - 'serves_intent': Function/Data serves this system-level intent (POSITIVE)
      * Label: HOW it serves the intent (mechanism)
      * Examples:
        - "verifies JWT signature" (for "Authenticate Users")
        - "runs ML risk model" (for "Detect Fraud")
        - "encrypts at rest" (for "Protect Privacy")
        - "enforces ACID properties" (for "Data Integrity")

    - 'supports_intent': Lower-level intent supports a higher-level intent (POSITIVE polarity)
      * Label: HOW the supporting intent contributes
      * Examples:
        - "by verifying identity before access"
        - "through continuous monitoring"
        - "via encryption at rest and in transit"

    - 'undermines_intent': Code or intent that **conflicts with or erodes** the parent intent (NEGATIVE polarity)
      * Label: HOW it undermines (e.g., "exfiltrates PII externally", "bypasses auth", "sends unencrypted data")
      * Use when a function or sub-intent works against the higher telos

    **CRITICAL INVESTIGATIVE GUIDELINES**:

    1. **User Journey Tracking**: When data represents user actions, include context:
       - "user submits form → name, email, payment_info"
       - "after successful login → session_token"
       - "on error → error_code, retry_count"

    2. **Security-Relevant Flows**: Highlight transformations that affect security:
       - "sanitizes to prevent XSS → user_input"
       - "validates against SQL injection → query_params"
       - "encrypts before external API call → customer_data"
       - "removes PII before logging → request_metadata"

    3. **Conditional Logic**: Show when things happen conditionally:
       - "if suspicious flag set → fraud_check_result"
       - "only after auth success → protected_resource"
       - "on payment failure → rollback_transaction"

    4. **Suspicious Pattern Detection**: Flag unusual flows:
       - "sends to external endpoint → user_credentials" ⚠️ SUSPICIOUS
       - "bypasses validation → direct_db_write" ⚠️ DANGEROUS
       - "copies to hidden variable → sensitive_data" ⚠️ HIDDEN SIDE EFFECT

    5. **Data Transformations**: Show HOW data changes (critical for security):
       - NOT: "password" ❌
       - YES: "hashes with bcrypt → password" ✓
       - NOT: "api_key" ❌
       - YES: "masks all but last 4 chars → api_key" ✓

    **EXAMPLES OF GOOD vs SUSPICIOUS EDGE LABELS**:

    🟢 GOOD (Clear purpose + transformation):
    - "validates schema before processing → user_input"
    - "encrypts with customer key → payment_data"
    - "after auth check passes → user_session"
    - "aggregates for analytics → anonymized_usage_data"

    🔴 SUSPICIOUS (Red flags for investigation):
    - "copies for unknown purpose → user_credentials"
    - "sends without encryption → sensitive_info"
    - "bypasses normal flow → direct_write"
    - "obfuscated encoding → metadata"

    **REMEMBER**: Someone using TelicLens is investigating potentially AI-generated "slop code"
    that might have hidden vulnerabilities or lack clear purpose. Your labels should help them:
    - Trace user data through the system (where does PII go?)
    - Identify security transformations (is data sanitized? encrypted?)
    - Spot unusual flows (why is this sending data externally?)
    - Understand conditional logic (what happens on error paths?)
    - Find orphaned code (what is this code actually doing?)

    **Root Telos & Audit**:
    - Return rootIntents (1-3 top-level intents).
    - Provide a telicAudit:
      * orphanNodes: intents/functions with NO path to a root intent
      * contradictions: nodes/edges that **undermine** their parent telos (use "source->target" edge keys or node IDs)
      * closedLoops: cycles of intents that never reach a root intent
      * suspiciousCapture: nodes collecting data without serving root telos (exfiltration/phishing/telemetry without purpose)

    **Summary**: Provide an executive summary that highlights:
    - Overall system purpose and root telos
    - How sub-intents support the root telos
    - Suspicious/contradictory or orphaned components
    - Security-sensitive data flows and external calls

    The output must strictly follow the JSON schema provided.
  `;

  console.log("🔍 Starting codebase analysis...");
  console.log(`📂 Analyzing ${files.length} files`);
  console.log(`🤖 Using model: ${model}`);
  console.log(`🔑 API Key present:`, !!process.env.API_KEY);

  try {
    console.log("🌐 Sending request to Gemini API...");
    const response = await ai.models.generateContent({
      model: model,
      contents: fileContext + "\n" + prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING, description: "A high level executive summary of what this system does." },
            rootIntents: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Top-level telos intents" },
            telicAudit: {
              type: Type.OBJECT,
              properties: {
                orphanNodes: { type: Type.ARRAY, items: { type: Type.STRING } },
                contradictions: { type: Type.ARRAY, items: { type: Type.STRING } },
                closedLoops: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.STRING } } }
              }
            },
            nodes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  label: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ['file', 'function', 'data', 'intent'] },
                  description: { type: Type.STRING },
                  intent: { type: Type.STRING, description: "The teleological purpose of this node" },
                  inputs: { type: Type.ARRAY, items: { type: Type.STRING } },
                  outputs: { type: Type.ARRAY, items: { type: Type.STRING } },
                  location: {
                    type: Type.OBJECT,
                    description: "Exact source code location for this node",
                    properties: {
                      file: { type: Type.STRING },
                      startLine: { type: Type.NUMBER },
                      endLine: { type: Type.NUMBER },
                      aiComment: { type: Type.STRING, description: "AI-generated contextual explanation" }
                    }
                  }
                },
                required: ['id', 'label', 'type']
              }
            },
            edges: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  source: { type: Type.STRING },
                  target: { type: Type.STRING },
                  label: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ['dependency', 'flow', 'serves_intent', 'supports_intent', 'undermines_intent'] },
                  reason: { type: Type.STRING, description: "Explicit rationale/condition for this edge" },
                  role: { type: Type.STRING, description: "Polarity of telic edge", enum: ['supports', 'undermines'] }
                },
                required: ['source', 'target', 'type']
              }
            }
          },
          required: ['nodes', 'edges', 'summary']
        }
      }
    });

    if (response.text) {
      console.log("✅ Analysis complete!");
      console.log("📄 Raw response (first 1000 chars):", response.text.substring(0, 1000));
      console.log("📏 Response length:", response.text.length, "characters");

      try {
        const result = JSON.parse(response.text) as AnalysisResult;
        console.log(`📊 Found ${result.nodes.length} nodes, ${result.edges.length} edges`);

        // Cache the result
        setCachedAnalysis(cacheKey, result);
        console.log("💾 Result cached for future use");

        return result;
      } catch (parseError) {
        console.error("❌ JSON Parse Error:", parseError);
        console.log("📄 Full raw response:", response.text);
        throw parseError;
      }
    }
    throw new Error("No response from Gemini");
  } catch (error) {
    console.error("❌ Analysis failed:", error);
    console.log("⚠️ Falling back to mock data");
    // Fallback mock data for demo if API fails or key missing
    return mockAnalysis;
  }
};

export const traceCodeSelection = async (
  codeSnippet: string,
  fileName: string,
  currentGraph: AnalysisResult,
  model: string = 'gemini-2.5-pro',
  mode: 'data' | 'journey' = 'data'
): Promise<TraceResult> => {
  // Generate a simple graph ID for cache key
  const graphId = currentGraph.nodes.map(n => n.id).join(',').substring(0, 50);
  const cacheKey = generateTraceCacheKey(codeSnippet, fileName, graphId);

  // Check cache
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const data = JSON.parse(cached);
      const cacheAge = Date.now() - (data.timestamp || 0);
      if (cacheAge < 24 * 60 * 60 * 1000) { // 24 hours
        console.log("💾 Using cached trace result");
        return data.result;
      } else {
        localStorage.removeItem(cacheKey);
      }
    }
  } catch (error) {
    console.warn("Trace cache read error:", error);
  }

  console.log("🔍 Tracing code flow...");
  console.log(`🤖 Using model: ${model}`);

  const prompt = `
    You are TelicLens, a code flow tracer.

    ## Context
    I have a codebase graph with the following Nodes:
    ${JSON.stringify(currentGraph.nodes.map(n => ({ id: n.id, label: n.label, type: n.type, description: n.description })))}

    ## User Selection
    The user has selected the following code snippet in file "${fileName}":
    \`\`\`
    ${codeSnippet}
    \`\`\`

    ## Mode
    The user chose trace mode: "${mode}".

    - If mode = "data": focus on data/control flow between functions/data/files. Return nodes/edges/paths showing how data moves and transforms.
    - If mode = "journey": focus on user journey / state transitions. Return nodes/edges/paths that describe an ordered journey (states/screens/actions), including branches/conditions, and the purposes they serve.

    ## Task
    Perform a comprehensive trace to identify:
    1. **Direct nodes**: Nodes explicitly mentioned or called in the snippet
    2. **Upstream nodes**: Dependencies leading TO this code
    3. **Downstream nodes**: Components affected BY this code
    4. **Paths**: Ordered sequences of node IDs showing the flow (source → ... → sink)

    ## Output
    Return a JSON object with:
    - 'relatedNodeIds': Array of node IDs that are part of this flow trace
    - 'relatedEdges': Array of { source, target, reason } edges that connect these nodes
    - 'paths': Array of arrays, each an ordered list of node IDs showing a flow path
    - 'explanation': Clear explanation of how these nodes relate (2-3 sentences)

    Be thorough but focused - include only nodes/edges with direct causal or intentional relationships.
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            relatedNodeIds: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "IDs of nodes that are relevant to this code snippet" 
            },
            relatedEdges: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  source: { type: Type.STRING },
                  target: { type: Type.STRING },
                  reason: { type: Type.STRING }
                },
                required: ['source', 'target']
              }
            },
            paths: {
              type: Type.ARRAY,
              items: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            explanation: { type: Type.STRING }
          },
          required: ['relatedNodeIds', 'explanation']
        }
      }
    });

    if (response.text) {
      const data = JSON.parse(response.text);

      // Map relatedEdges to edge ids present in the current graph (source->target)
      const relatedEdgeIds: string[] = [];
      if (Array.isArray(data.relatedEdges) && currentGraph?.edges) {
        data.relatedEdges.forEach((edge: { source: string; target: string }) => {
          const match = currentGraph.edges.find(
            e => e.source === edge.source && e.target === edge.target
          );
          if (match) {
            relatedEdgeIds.push(`${match.source}->${match.target}`);
          }
        });
      }

      const result: TraceResult = {
        relatedNodeIds: data.relatedNodeIds || [],
        relatedEdgeIds,
        paths: data.paths,
        explanation: data.explanation
      };

      // Cache the trace result
      try {
        const cacheData = {
          result,
          timestamp: Date.now()
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        console.log("💾 Trace result cached");
      } catch (error) {
        console.warn("Trace cache write error:", error);
      }

      return result;
    }
    throw new Error("No response");
  } catch (error) {
    console.error("❌ Trace failed:", error);
    return { relatedNodeIds: [], relatedEdgeIds: [], explanation: "Trace failed" };
  }
};

const mockAnalysis: AnalysisResult = {
  summary: "Aegis Payment Processor: A secure financial transaction system focusing on fraud prevention and atomic data persistence.",
  rootIntents: ["System Security", "Financial Integrity", "User Privacy"],
  telicAudit: {
    orphanNodes: [],
    contradictions: ["fn6->i3"],
    closedLoops: []
  },
  nodes: [
    // Files
    { id: "f1", label: "main.py", type: "file", description: "Orchestration layer for transactions" },
    { id: "f2", label: "fraud_detection.py", type: "file", description: "Risk analysis logic" },
    { id: "f3", label: "ledger.py", type: "file", description: "Database transaction management" },
    { id: "f4", label: "auth_service.py", type: "file", description: "Identity verification" },
    
    // Functions
    {
      id: "fn1",
      label: "process_transaction",
      type: "function",
      description: "Main workflow controller",
      intent: "Execute Business Logic",
      location: { file: "main.py", startLine: 18, endLine: 41, aiComment: "Main transaction orchestrator - calls auth, fraud check, and ledger in sequence" }
    },
    {
      id: "fn2",
      label: "is_suspicious",
      type: "function",
      description: "Heuristic & ML risk check",
      intent: "Detect Threats",
      location: { file: "fraud_detection.py", startLine: 50, endLine: 60, aiComment: "Serves 'Detect Fraud' by running ML model on transaction patterns" }
    },
    {
      id: "fn3",
      label: "create_entry",
      type: "function",
      description: "Inserts raw record into DB",
      intent: "Persist Data",
      location: { file: "ledger.py", startLine: 73, endLine: 82, aiComment: "Serves 'Financial Integrity' by ensuring ACID transaction properties" }
    },
    {
      id: "fn4",
      label: "verify_token",
      type: "function",
      description: "JWT validation",
      intent: "Verify Identity",
      location: { file: "auth_service.py", startLine: 99, endLine: 105, aiComment: "Serves 'Authenticate Users' by verifying JWT signature and expiration" }
    },
    {
      id: "fn5",
      label: "encrypt_value",
      type: "function",
      description: "AES-256 encryption",
      intent: "Protect Data Privacy",
      location: { file: "ledger.py", startLine: 30, endLine: 40, aiComment: "Serves 'Encrypt Sensitive Data' by encrypting with AES-256-GCM" }
    },
    {
      id: "fn6",
      label: "log_metrics",
      type: "function",
      description: "⚠️ Sends transaction data to external analytics endpoint",
      intent: "Analytics (unclear purpose)",
      location: { file: "main.py", startLine: 50, endLine: 58, aiComment: "⚠️ SUSPICIOUS: Sends unencrypted user_id and payment_method to external endpoint" }
    },
    
    // Data
    { id: "d1", label: "TransactionDB", type: "data", description: "Primary SQL storage" },
    { id: "d2", label: "UserProfileDB", type: "data", description: "User metadata and risk profiles" },
    
    // Intents (Telic) - Hierarchical
    // Top-level goals
    { id: "i1", label: "Financial Integrity", type: "intent", description: "Ensure no money is lost or double-spent" },
    { id: "i2", label: "System Security", type: "intent", description: "Prevent unauthorized access and fraud" },
    { id: "i3", label: "User Privacy", type: "intent", description: "Protect PII and amounts from leakage" },

    // Supporting intents (feed into top-level)
    { id: "i4", label: "Authenticate Users", type: "intent", description: "Verify user identity before access" },
    { id: "i5", label: "Detect Fraud", type: "intent", description: "Identify suspicious transaction patterns" },
    { id: "i6", label: "Encrypt Sensitive Data", type: "intent", description: "Protect data at rest and in transit" },
  ],
  edges: [
    // Causal (Implementation Flow) - RICH LABELS showing WHY → WHAT and TRANSFORMATION → DATA
    { source: "f1", target: "fn1", type: "flow", label: "user submits transaction → user_id, amount, currency" },
    { source: "fn1", target: "fn4", type: "dependency", label: "validates auth before processing → JWT token" },
    { source: "fn1", target: "fn2", type: "dependency", label: "checks fraud risk (required) → user_id, amount" },
    { source: "fn1", target: "fn3", type: "dependency", label: "after validation passes → transaction_data" },

    { source: "f2", target: "fn2", type: "flow", label: "user history + behavior → risk_params" },
    { source: "fn2", target: "d2", type: "flow", label: "fetches for risk analysis → user_profile" },

    { source: "f3", target: "fn3", type: "flow", label: "prepares for persistence → ledger_entry" },
    { source: "fn3", target: "fn5", type: "dependency", label: "encrypts before storage (PCI compliance) → amount" },
    { source: "fn5", target: "d1", type: "flow", label: "encrypted with AES-256 → sensitive_data" },

    // ⚠️ SUSPICIOUS: Function called but serves no clear system intent
    { source: "fn1", target: "fn6", type: "dependency", label: "sends to external endpoint → user_id, amount, payment_method" },

    // Telic (Intent Hierarchy - supporting → top-level)
    { source: "i4", target: "i2", type: "supports_intent", label: "by verifying identity before access", role: "supports" },
    { source: "i5", target: "i2", type: "supports_intent", label: "by detecting threats in real-time", role: "supports" },
    { source: "i6", target: "i3", type: "supports_intent", label: "via encryption at rest and in transit", role: "supports" },

    // Telic (Functions → Supporting Intents)
    { source: "fn4", target: "i4", type: "serves_intent", label: "verifies JWT signature & expiry", role: "supports" },
    { source: "fn2", target: "i5", type: "serves_intent", label: "runs ML model on transaction patterns", role: "supports" },
    { source: "fn5", target: "i6", type: "serves_intent", label: "encrypts with AES-256-GCM", role: "supports" },
    { source: "fn3", target: "i1", type: "serves_intent", label: "ensures ACID transaction properties", role: "supports" },
    // Contradictory intent link example
    { source: "fn6", target: "i3", type: "undermines_intent", label: "exfiltrates PII to external analytics", role: "undermines" },
  ]
};
