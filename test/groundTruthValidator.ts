/**
 * Ground-truth validator: Build expected graph from AST and validate invariants
 */

import { extractVariables, variablesToNodes, flowsToEdges } from '../services/variableExtractor';
import { checkVariableConsistency, filterMeaningfulVariables } from '../services/variableConsistencyChecker';
import type { GraphNode, GraphEdge, CodeFile, VariableConsistencyReport } from '../types';

export interface GroundTruthGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  consistency: VariableConsistencyReport;
}

export interface GraphInvariant {
  name: string;
  check: (graph: GroundTruthGraph) => { pass: boolean; message: string };
}

/**
 * Build ground-truth graph from AST (no AI involved)
 */
export function buildGroundTruth(files: CodeFile[]): GroundTruthGraph {
  const allVariables: any[] = [];
  const allFlows: any[] = [];

  for (const file of files) {
    const { variables, flows } = extractVariables(file);
    allVariables.push(...variables);
    allFlows.push(...flows);
  }

  let nodes = variablesToNodes(allVariables);
  nodes = filterMeaningfulVariables(nodes);
  const edges = flowsToEdges(allFlows);

  const consistency = checkVariableConsistency(nodes, edges);

  return { nodes, edges, consistency };
}

/**
 * Core invariants that all safe code should satisfy
 */
export const safeCodeInvariants: GraphInvariant[] = [
  {
    name: 'No orphan uses',
    check: (graph) => ({
      pass: graph.consistency.orphanUses.length === 0,
      message: `Found ${graph.consistency.orphanUses.length} orphan uses: ${graph.consistency.orphanUses.join(', ')}`,
    }),
  },
  {
    name: 'No unreachable flows',
    check: (graph) => ({
      pass: graph.consistency.unreachableFlows.length === 0,
      message: `Found ${graph.consistency.unreachableFlows.length} unreachable flows: ${graph.consistency.unreachableFlows.join(', ')}`,
    }),
  },
  {
    name: 'No missing nodes',
    check: (graph) => ({
      pass: graph.consistency.missingNodes.length === 0,
      message: `Found ${graph.consistency.missingNodes.length} missing nodes: ${graph.consistency.missingNodes.join(', ')}`,
    }),
  },
  {
    name: 'User inputs must be sanitized before database',
    check: (graph) => {
      // Find parameter nodes (user inputs)
      const userInputs = graph.nodes.filter(
        (n) => n.variableInfo?.kind === 'parameter' &&
               (n.variableInfo.symbolName.includes('username') ||
                n.variableInfo.symbolName.includes('email') ||
                n.variableInfo.symbolName.includes('input'))
      );

      // Find database-related nodes
      const dbNodes = graph.nodes.filter(
        (n) => n.variableInfo?.symbolName.includes('database') ||
               n.variableInfo?.symbolName.includes('query') ||
               n.variableInfo?.symbolName.includes('findUser')
      );

      // Check if there's a sanitize call between input and database
      const violations: string[] = [];

      for (const input of userInputs) {
        // Find all paths from this input to database operations
        const hasDirectPathToDB = graph.edges.some(
          (e) => e.source === input.id && dbNodes.some((db) => e.target.includes('database') || e.target.includes('findUser'))
        );

        if (hasDirectPathToDB) {
          // Check if input flows through sanitize first
          const hasSanitization = graph.nodes.some(
            (n) => n.variableInfo?.symbolName.includes('sanitize') &&
                   graph.edges.some((e) => e.source === input.id && e.target === n.id)
          );

          if (!hasSanitization) {
            violations.push(`${input.label} flows to database without sanitization`);
          }
        }
      }

      return {
        pass: violations.length === 0,
        message: violations.length > 0
          ? `Trust boundary violations: ${violations.join('; ')}`
          : 'All user inputs are sanitized before database access',
      };
    },
  },
];

/**
 * Expected violations for vulnerable code
 */
export interface ExpectedViolation {
  type: 'orphan-def' | 'orphan-use' | 'trust-boundary' | 'data-exfiltration';
  pattern: string | RegExp;
  message: string;
}

export const vulnerableCodeExpectations: ExpectedViolation[] = [
  {
    type: 'orphan-def',
    pattern: /sanitizedPassword/,
    message: 'sanitizedPassword should be defined but never used',
  },
  {
    type: 'trust-boundary',
    pattern: /username.*database/,
    message: 'Raw username should flow to database without sanitization',
  },
  {
    type: 'data-exfiltration',
    pattern: /token.*analytics/,
    message: 'Sensitive token should be sent to external endpoint',
  },
];

/**
 * Validate that vulnerable code DOES have expected violations
 */
export function validateExpectedViolations(
  graph: GroundTruthGraph,
  expected: ExpectedViolation[]
): { pass: boolean; message: string } {
  const findings: string[] = [];

  for (const violation of expected) {
    let found = false;

    switch (violation.type) {
      case 'orphan-def':
        found = graph.consistency.orphanDefs.some((def) =>
          typeof violation.pattern === 'string'
            ? def.includes(violation.pattern)
            : violation.pattern.test(def)
        );
        break;

      case 'orphan-use':
        found = graph.consistency.orphanUses.some((use) =>
          typeof violation.pattern === 'string'
            ? use.includes(violation.pattern)
            : violation.pattern.test(use)
        );
        break;

      case 'trust-boundary':
        found = graph.consistency.trustBoundaryViolations.some((viol) =>
          typeof violation.pattern === 'string'
            ? viol.includes(violation.pattern)
            : violation.pattern.test(viol)
        );
        break;

      case 'data-exfiltration':
        // Check for flows to external endpoints
        found = graph.edges.some((edge) => {
          const edgeStr = `${edge.source} ${edge.target} ${edge.label || ''} ${edge.reason || ''}`;
          return typeof violation.pattern === 'string'
            ? edgeStr.includes(violation.pattern)
            : violation.pattern.test(edgeStr);
        });
        break;
    }

    if (!found) {
      findings.push(`Expected violation not found: ${violation.message}`);
    }
  }

  return {
    pass: findings.length === 0,
    message: findings.length > 0 ? findings.join('; ') : 'All expected violations detected',
  };
}

/**
 * Diff two graphs and report differences
 */
export interface GraphDiff {
  missingNodes: string[];      // Nodes in expected but not in actual
  extraNodes: string[];         // Nodes in actual but not in expected
  missingEdges: string[];       // Edges in expected but not in actual
  extraEdges: string[];         // Edges in actual but not in expected
  summary: string;
}

export function diffGraphs(expected: GroundTruthGraph, actual: { nodes: GraphNode[]; edges: GraphEdge[] }): GraphDiff {
  const expectedNodeIds = new Set(expected.nodes.map((n) => n.id));
  const actualNodeIds = new Set(actual.nodes.map((n) => n.id));

  const missingNodes = expected.nodes.filter((n) => !actualNodeIds.has(n.id)).map((n) => n.id);
  const extraNodes = actual.nodes.filter((n) => !expectedNodeIds.has(n.id)).map((n) => n.id);

  const expectedEdgeIds = new Set(expected.edges.map((e) => `${e.source}->${e.target}`));
  const actualEdgeIds = new Set(actual.edges.map((e) => `${e.source}->${e.target}`));

  const missingEdges = expected.edges
    .filter((e) => !actualEdgeIds.has(`${e.source}->${e.target}`))
    .map((e) => `${e.source}->${e.target}`);

  const extraEdges = actual.edges
    .filter((e) => !expectedEdgeIds.has(`${e.source}->${e.target}`))
    .map((e) => `${e.source}->${e.target}`);

  const totalDiffs = missingNodes.length + extraNodes.length + missingEdges.length + extraEdges.length;

  const summary =
    totalDiffs === 0
      ? '✅ Graphs match perfectly'
      : `⚠️ Found ${totalDiffs} differences:\n` +
        (missingNodes.length > 0 ? `  - ${missingNodes.length} missing nodes\n` : '') +
        (extraNodes.length > 0 ? `  - ${extraNodes.length} extra nodes\n` : '') +
        (missingEdges.length > 0 ? `  - ${missingEdges.length} missing edges\n` : '') +
        (extraEdges.length > 0 ? `  - ${extraEdges.length} extra edges\n` : '');

  return { missingNodes, extraNodes, missingEdges, extraEdges, summary };
}
