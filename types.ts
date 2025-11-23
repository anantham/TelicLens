export enum ViewMode {
  CAUSAL = 'CAUSAL', // Left to right, data flow
  TELIC = 'TELIC',   // Convergent, intent based
}

export interface CodeFile {
  name: string;
  content: string;
  language: string;
}

export interface SourceLocation {
  file: string;
  startLine: number;
  endLine: number;
  aiComment?: string;  // AI-generated contextual explanation
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
  // Source location(s)
  location?: SourceLocation;
  locations?: SourceLocation[];  // For nodes that appear in multiple places
}

export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
  type: 'dependency' | 'flow' | 'serves_intent' | 'supports_intent' | 'undermines_intent';
  role?: 'supports' | 'undermines'; // polarity for telic edges
}

export interface AnalysisResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: string;
  rootIntents?: string[]; // overarching telos entries
  telicAudit?: {
    orphanNodes?: string[];      // nodes/intents without path to root telos
    contradictions?: string[];   // edges/nodes that undermine parent intent
    closedLoops?: string[][];    // cycles that never reach root telos
  };
}

export interface TraceResult {
  relatedNodeIds: string[];
  relatedEdgeIds: string[]; // Edge identifiers in the form "source->target"
  paths?: string[][]; // Optional ordered node-id paths showing flow
  explanation: string;
}
