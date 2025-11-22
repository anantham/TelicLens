export enum ViewMode {
  CAUSAL = 'CAUSAL', // Left to right, data flow
  TELIC = 'TELIC',   // Convergent, intent based
}

export interface CodeFile {
  name: string;
  content: string;
  language: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'file' | 'function' | 'data' | 'intent';
  description?: string;
  x?: number;
  y?: number;
  // Specifically for Telic view
  intent?: string; 
  // Specifically for Causal view
  inputs?: string[];
  outputs?: string[];
}

export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
  type: 'dependency' | 'flow' | 'serves_intent';
}

export interface AnalysisResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: string;
}

export interface TraceResult {
  relatedNodeIds: string[];
  relatedEdgeIds: string[]; // Although edges don't have explicit IDs in the main type, we can match by source-target
  explanation: string;
}