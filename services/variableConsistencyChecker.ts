import type { GraphNode, GraphEdge, VariableConsistencyReport } from '../types';

/**
 * Performs consistency checks on variable-level graph to ensure all data flows are captured
 */
export function checkVariableConsistency(
  nodes: GraphNode[],
  edges: GraphEdge[]
): VariableConsistencyReport {
  const variableNodes = nodes.filter((n) => n.type === 'variable');
  const variableEdges = edges.filter((e) => e.type === 'flow' || e.type === 'dependency');

  const orphanDefs: string[] = [];
  const orphanUses: string[] = [];
  const unreachableFlows: string[] = [];
  const trustBoundaryViolations: string[] = [];
  const missingNodes: string[] = [];

  // Build adjacency lists for reachability analysis
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();

  for (const edge of variableEdges) {
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    outgoing.get(edge.source)!.push(edge.target);
    incoming.get(edge.target)!.push(edge.source);
  }

  // Check 1: Orphan definitions (defined but never used)
  for (const node of variableNodes) {
    if (node.variableInfo?.isDef && !node.variableInfo?.isUse) {
      const hasOutgoing = outgoing.has(node.id) && outgoing.get(node.id)!.length > 0;
      if (!hasOutgoing) {
        orphanDefs.push(`${node.id} (${node.label} in ${node.variableInfo.scope})`);
      }
    }
  }

  // Check 2: Orphan uses (used but never defined)
  for (const node of variableNodes) {
    if (node.variableInfo?.isUse && !node.variableInfo?.isDef) {
      const hasIncoming = incoming.has(node.id) && incoming.get(node.id)!.length > 0;
      if (!hasIncoming) {
        // Check if there's a matching definition in a parent scope
        const defExists = variableNodes.some(
          (other) =>
            other.variableInfo?.isDef &&
            other.variableInfo.symbolName === node.variableInfo?.symbolName &&
            other.id !== node.id
        );
        if (!defExists) {
          orphanUses.push(`${node.id} (${node.label} in ${node.variableInfo.scope})`);
        }
      }
    }
  }

  // Check 3: Unreachable flows (use sites not reachable from their definition)
  for (const node of variableNodes) {
    if (node.variableInfo?.isUse) {
      const reachableDefs = findReachableNodes(node.id, incoming);
      const hasReachableDef = reachableDefs.some(
        (defId) =>
          variableNodes.find((n) => n.id === defId)?.variableInfo?.isDef &&
          variableNodes.find((n) => n.id === defId)?.variableInfo?.symbolName ===
            node.variableInfo?.symbolName
      );
      if (!hasReachableDef && node.variableInfo.kind !== 'parameter') {
        unreachableFlows.push(`${node.id} (${node.label} at ${node.location?.file}:${node.location?.startLine})`);
      }
    }
  }

  // Check 4: Trust boundary violations
  for (const edge of variableEdges) {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);

    if (sourceNode?.variableInfo?.trustBoundary || targetNode?.variableInfo?.trustBoundary) {
      // Check if there's sanitization or encryption in the edge
      const isSanitized =
        edge.reason?.toLowerCase().includes('sanitize') ||
        edge.reason?.toLowerCase().includes('encrypt') ||
        edge.reason?.toLowerCase().includes('validate');

      if (!isSanitized) {
        trustBoundaryViolations.push(
          `${edge.source} → ${edge.target} (crosses trust boundary without sanitization)`
        );
      }
    }
  }

  // Check 5: Missing nodes (detect if there are references in edges without corresponding nodes)
  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) {
      missingNodes.push(`${edge.source} (referenced in edge but missing node)`);
    }
    if (!nodeIds.has(edge.target)) {
      missingNodes.push(`${edge.target} (referenced in edge but missing node)`);
    }
  }

  // Generate summary
  const issueCount =
    orphanDefs.length +
    orphanUses.length +
    unreachableFlows.length +
    trustBoundaryViolations.length +
    missingNodes.length;

  const summary =
    issueCount === 0
      ? `✅ All ${variableNodes.length} variables are consistent. No data flow issues detected.`
      : `⚠️ Found ${issueCount} consistency issues across ${variableNodes.length} variables:\n` +
        (orphanDefs.length > 0 ? `  - ${orphanDefs.length} orphan definitions\n` : '') +
        (orphanUses.length > 0 ? `  - ${orphanUses.length} orphan uses\n` : '') +
        (unreachableFlows.length > 0 ? `  - ${unreachableFlows.length} unreachable flows\n` : '') +
        (trustBoundaryViolations.length > 0
          ? `  - ${trustBoundaryViolations.length} trust boundary violations\n`
          : '') +
        (missingNodes.length > 0 ? `  - ${missingNodes.length} missing nodes\n` : '');

  return {
    orphanDefs,
    orphanUses,
    unreachableFlows,
    trustBoundaryViolations,
    missingNodes,
    summary,
  };
}

/**
 * Find all nodes reachable from a given node by traversing backward through edges
 */
function findReachableNodes(startId: string, incoming: Map<string, string[]>): string[] {
  const visited = new Set<string>();
  const queue = [startId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const parents = incoming.get(current) || [];
    for (const parent of parents) {
      if (!visited.has(parent)) {
        queue.push(parent);
      }
    }
  }

  return Array.from(visited);
}

/**
 * Merge variable nodes with existing function/file/data nodes
 */
export function mergeVariableNodes(
  existingNodes: GraphNode[],
  variableNodes: GraphNode[]
): GraphNode[] {
  // Add cluster IDs to variable nodes based on parent functions
  const functionNodes = existingNodes.filter((n) => n.type === 'function');

  for (const varNode of variableNodes) {
    if (varNode.variableInfo?.parentFunction) {
      const parentFunc = functionNodes.find((f) =>
        f.label.includes(varNode.variableInfo!.parentFunction!)
      );
      if (parentFunc) {
        varNode.clusterId = parentFunc.id;
      }
    }
  }

  // Combine and deduplicate
  const merged = [...existingNodes, ...variableNodes];
  const seen = new Set<string>();
  return merged.filter((node) => {
    if (seen.has(node.id)) return false;
    seen.add(node.id);
    return true;
  });
}

/**
 * Filter meaningful variables (avoid noise from temporary variables)
 */
export function filterMeaningfulVariables(variables: GraphNode[]): GraphNode[] {
  return variables.filter((v) => {
    const name = v.variableInfo?.symbolName || '';

    // Skip common temporary/noise variables
    if (name.startsWith('_') && name.length < 3) return false;
    if (/^tmp\d*$/.test(name)) return false;
    if (/^temp\d*$/.test(name)) return false;
    if (name === 'i' || name === 'j' || name === 'k') return false; // Loop counters
    if (name.length === 1 && !/^[a-z]$/.test(name)) return false; // Single char except lowercase

    // Keep meaningful variables
    return (
      v.variableInfo?.kind === 'parameter' ||
      v.variableInfo?.kind === 'return' ||
      v.variableInfo?.kind === 'field' ||
      v.variableInfo?.kind === 'global' ||
      (v.variableInfo?.kind === 'local' && name.length > 2)
    );
  });
}
