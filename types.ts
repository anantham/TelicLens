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
  type: 'file' | 'function' | 'data' | 'intent' | 'event' | 'variable';
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
  // Variable-specific metadata
  variableInfo?: {
    symbolName: string;        // The actual variable name
    scope: string;             // Function/class/module scope
    kind: 'parameter' | 'local' | 'return' | 'field' | 'global'; // Variable kind
    dataType?: string;         // Inferred or declared type
    isDef: boolean;            // Is this a definition site?
    isUse: boolean;            // Is this a use site?
    parentFunction?: string;   // Parent function node ID
    trustBoundary?: boolean;   // Crosses trust boundary?
  };
  // Clustering metadata for zoom levels
  clusterId?: string;          // ID of parent cluster (function/file)
  clusterLevel?: number;       // 0=variable, 1=function, 2=file, 3=intent
}

export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
  reason?: string; // explicit rationale for the edge
  type: 'dependency' | 'flow' | 'serves_intent' | 'supports_intent' | 'undermines_intent';
  role?: 'supports' | 'undermines'; // polarity for telic edges
  color?: string; // optional edge color hint from AI (e.g., orange for insecure)
}

export interface VariableConsistencyReport {
  orphanDefs: string[];           // Variables defined but never used
  orphanUses: string[];           // Variables used but never defined (missing defs)
  unreachableFlows: string[];     // Use sites unreachable from their definition
  trustBoundaryViolations: string[]; // Variables crossing trust boundaries without sanitization
  missingNodes: string[];         // Symbols found in AST but missing graph nodes
  summary: string;                // Human-readable summary of issues
}

export interface AnalysisResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: string;
  fromCache?: boolean;
  rootIntents?: string[]; // overarching telos entries
  telicAudit?: {
    orphanNodes?: string[];      // nodes/intents without path to root telos
    contradictions?: string[];   // edges/nodes that undermine parent intent
    closedLoops?: string[][];    // cycles that never reach root telos
    suspiciousCapture?: string[]; // nodes doing data capture/telemetry without serving telos
  };
  variableConsistency?: VariableConsistencyReport; // Variable-level consistency check
  zoomLevels?: {                  // Pre-computed clustering for different zoom levels
    level0: GraphNode[];          // Variable-level (finest)
    level1: GraphNode[];          // Function-level clustering
    level2: GraphNode[];          // File-level clustering
    level3: GraphNode[];          // Intent-level clustering (coarsest)
  };
}

export interface TraceResult {
  relatedNodeIds: string[];
  relatedEdgeIds: string[]; // Edge identifiers in the form "source->target"
  paths?: string[][]; // Optional ordered node-id paths showing flow
  explanation: string;
  fromCache?: boolean;
}

export type TraceMode = 'data' | 'journey';

export type FileUpdateHandler = (fileName: string, newContent: string) => void;
export type FileRemoveHandler = (fileName: string) => void;
