import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, TraceResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeCodebase = async (files: { name: string; content: string }[]): Promise<AnalysisResult> => {
  const fileContext = files.map(f => `File: ${f.name}\nContent:\n${f.content}\n---`).join('\n');

  const prompt = `
    You are an advanced code analysis AI named "TelicLens". 
    Analyze the following codebase.
    
    I need two views of this code:
    1. CAUSAL: How data flows. Which functions call which? (Standard dependency graph).
    2. TELIC: What is the INTENT? Why does this code exist? (Teleological graph).
    
    Return a single JSON object representing a node-graph.
    
    Nodes should represent files, major functions, or data stores.
    
    For the TELIC view, ensure you identify "Intent" nodes (e.g., "Authenticate User", "Sanitize Input") and link the code components to these intents using 'serves_intent' edges.
    
    The output must strictly follow this JSON schema.
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
    I have a codebase graph with the following Nodes:
    ${JSON.stringify(currentGraph.nodes.map(n => ({ id: n.id, label: n.label, type: n.type })))}
    
    The user has selected the following code in file "${fileName}":
    "${codeSnippet}"
    
    Task: Identify which Nodes in the graph are directly involved, affected by, or causally linked to this code snippet.
    Also identify the specific edges that represent this flow.
    
    Return a JSON object with 'relatedNodeIds' (array of strings) and 'explanation' (string).
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