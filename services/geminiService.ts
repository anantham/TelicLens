import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, TraceResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeCodebase = async (files: { name: string; content: string }[]): Promise<AnalysisResult> => {
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

    **For intent nodes:**
    - High-level system goals (3-6 major intents)
    - Use imperative language: "Authenticate Users", "Prevent Fraud", "Maintain Data Consistency"

    **Edges**: Create three types:
    - 'dependency': Function A calls Function B
    - 'flow': Data flows from A to B
    - 'serves_intent': Function/Data serves this system-level intent

    **Summary**: Provide an executive summary that highlights:
    - Overall system purpose
    - Key security intents
    - Any suspicious patterns detected

    The output must strictly follow the JSON schema provided.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: fileContext + "\n" + prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING, description: "A high level executive summary of what this system does." },
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
                  outputs: { type: Type.ARRAY, items: { type: Type.STRING } }
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
                  type: { type: Type.STRING, enum: ['dependency', 'flow', 'serves_intent'] }
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
      return JSON.parse(response.text) as AnalysisResult;
    }
    throw new Error("No response from Gemini");
  } catch (error) {
    console.error("Analysis failed", error);
    // Fallback mock data for demo if API fails or key missing
    return mockAnalysis;
  }
};

export const traceCodeSelection = async (
  codeSnippet: string, 
  fileName: string, 
  currentGraph: AnalysisResult
): Promise<TraceResult> => {
  
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

    ## Task
    Perform a comprehensive flow trace to identify:
    1. **Direct nodes**: Nodes explicitly mentioned or called in the snippet
    2. **Upstream nodes**: Functions/data that lead TO this code (dependencies)
    3. **Downstream nodes**: Functions/data that are affected BY this code (dependents)
    4. **Intent nodes**: What high-level purposes does this code serve?

    ## Output
    Return a JSON object with:
    - 'relatedNodeIds': Array of node IDs that are part of this flow trace
    - 'explanation': Clear explanation of how these nodes relate (2-3 sentences)

    Be thorough but focused - include only nodes with direct causal or intentional relationships.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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
            explanation: { type: Type.STRING }
          },
          required: ['relatedNodeIds', 'explanation']
        }
      }
    });

    if (response.text) {
      const data = JSON.parse(response.text);
      return {
        relatedNodeIds: data.relatedNodeIds,
        relatedEdgeIds: [], // We will compute edges on the client side based on nodes
        explanation: data.explanation
      };
    }
    throw new Error("No response");
  } catch (error) {
    console.error("Trace failed", error);
    return { relatedNodeIds: [], relatedEdgeIds: [], explanation: "Trace failed" };
  }
};

const mockAnalysis: AnalysisResult = {
  summary: "Aegis Payment Processor: A secure financial transaction system focusing on fraud prevention and atomic data persistence.",
  nodes: [
    // Files
    { id: "f1", label: "main.py", type: "file", description: "Orchestration layer for transactions" },
    { id: "f2", label: "fraud_detection.py", type: "file", description: "Risk analysis logic" },
    { id: "f3", label: "ledger.py", type: "file", description: "Database transaction management" },
    { id: "f4", label: "auth_service.py", type: "file", description: "Identity verification" },
    
    // Functions
    { id: "fn1", label: "process_transaction", type: "function", description: "Main workflow controller", intent: "Execute Business Logic" },
    { id: "fn2", label: "is_suspicious", type: "function", description: "Heuristic & ML risk check", intent: "Detect Threats" },
    { id: "fn3", label: "create_entry", type: "function", description: "Inserts raw record into DB", intent: "Persist Data" },
    { id: "fn4", label: "verify_token", type: "function", description: "JWT validation", intent: "Verify Identity" },
    { id: "fn5", label: "encrypt_value", type: "function", description: "AES-256 encryption", intent: "Protect Data Privacy" },
    
    // Data
    { id: "d1", label: "TransactionDB", type: "data", description: "Primary SQL storage" },
    { id: "d2", label: "UserProfileDB", type: "data", description: "User metadata and risk profiles" },
    
    // Intents (Telic)
    { id: "i1", label: "GOAL: Financial Integrity", type: "intent", description: "Ensure no money is lost or double-spent" },
    { id: "i2", label: "GOAL: System Security", type: "intent", description: "Prevent unauthorized access and fraud" },
    { id: "i3", label: "GOAL: User Privacy", type: "intent", description: "Protect PII and amounts from leakage" },
  ],
  edges: [
    // Causal (Implementation Flow)
    { source: "f1", target: "fn1", type: "flow" },
    { source: "fn1", target: "fn4", type: "dependency" }, // Call auth
    { source: "fn1", target: "fn2", type: "dependency" }, // Call fraud
    { source: "fn1", target: "fn3", type: "dependency" }, // Call ledger
    
    { source: "f2", target: "fn2", type: "flow" },
    { source: "fn2", target: "d2", type: "dependency" }, // Reads user profile
    
    { source: "f3", target: "fn3", type: "flow" },
    { source: "fn3", target: "fn5", type: "dependency" }, // Calls encryption
    { source: "fn3", target: "d1", type: "dependency" }, // Writes to DB
    
    // Telic (Intent Mapping)
    { source: "fn3", target: "i1", type: "serves_intent" }, // Ledger serves Integrity
    { source: "fn4", target: "i2", type: "serves_intent" }, // Auth serves Security
    { source: "fn2", target: "i2", type: "serves_intent" }, // Fraud serves Security
    { source: "fn5", target: "i3", type: "serves_intent" }, // Encryption serves Privacy
  ]
};