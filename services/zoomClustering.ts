import type { GraphNode, GraphEdge } from '../types';

export type ZoomLevel = 0 | 1 | 2 | 3;

/**
 * Cluster nodes based on zoom/detail level
 *
 * Level 0: Variable-level (finest) - show all variables
 * Level 1: Function-level - cluster variables into their parent functions
 * Level 2: File-level - cluster functions into their files
 * Level 3: Intent-level (coarsest) - cluster files into their intents
 */
export function clusterNodesByZoomLevel(
  nodes: GraphNode[],
  edges: GraphEdge[],
  zoomLevel: ZoomLevel
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  if (zoomLevel === 0) {
    // Show everything (finest granularity)
    return { nodes, edges };
  }

  if (zoomLevel === 1) {
    // Cluster variables into functions
    return clusterVariablesIntoFunctions(nodes, edges);
  }

  if (zoomLevel === 2) {
    // Cluster functions into files
    return clusterFunctionsIntoFiles(nodes, edges);
  }

  // Level 3: Cluster files into intents (coarsest)
  return clusterFilesIntoIntents(nodes, edges);
}

/**
 * Level 1: Cluster variable nodes into their parent function nodes
 */
function clusterVariablesIntoFunctions(
  nodes: GraphNode[],
  edges: GraphEdge[]
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const variableNodes = nodes.filter((n) => n.type === 'variable');
  const otherNodes = nodes.filter((n) => n.type !== 'variable');

  // Group variables by their parent function
  const variablesByFunction = new Map<string, GraphNode[]>();
  for (const varNode of variableNodes) {
    const clusterId = varNode.clusterId || 'global';
    if (!variablesByFunction.has(clusterId)) {
      variablesByFunction.set(clusterId, []);
    }
    variablesByFunction.get(clusterId)!.push(varNode);
  }

  // Update function nodes with variable counts and aggregated data flows
  const updatedNodes = otherNodes.map((node) => {
    const clusterVars = variablesByFunction.get(node.id) || [];
    if (clusterVars.length === 0) return node;

    // Aggregate inputs/outputs from clustered variables
    const allInputs = new Set<string>();
    const allOutputs = new Set<string>();

    for (const varNode of clusterVars) {
      varNode.inputs?.forEach((i) => allInputs.add(i));
      varNode.outputs?.forEach((o) => allOutputs.add(o));
    }

    return {
      ...node,
      description: `${node.description || ''} [${clusterVars.length} variables]`,
      inputs: [...new Set([...(node.inputs || []), ...allInputs])],
      outputs: [...new Set([...(node.outputs || []), ...allOutputs])],
    };
  });

  // Rebuild edges: merge variable-to-variable edges into function-to-function edges
  const newEdges = new Map<string, GraphEdge>();

  for (const edge of edges) {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);

    if (!sourceNode || !targetNode) continue;

    // If both are variables, lift edge to their parent functions
    if (sourceNode.type === 'variable' && targetNode.type === 'variable') {
      const sourceCluster = sourceNode.clusterId || 'global';
      const targetCluster = targetNode.clusterId || 'global';

      if (sourceCluster !== targetCluster) {
        const edgeKey = `${sourceCluster}->${targetCluster}`;
        if (!newEdges.has(edgeKey)) {
          newEdges.set(edgeKey, {
            source: sourceCluster,
            target: targetCluster,
            type: 'flow',
            label: `data flow (${edge.label || 'variables'})`,
            reason: `Aggregated from variable flows`,
          });
        }
      }
    } else {
      // Keep non-variable edges as is
      newEdges.set(`${edge.source}->${edge.target}`, edge);
    }
  }

  return {
    nodes: updatedNodes,
    edges: Array.from(newEdges.values()),
  };
}

/**
 * Level 2: Cluster function nodes into file nodes
 */
function clusterFunctionsIntoFiles(
  nodes: GraphNode[],
  edges: GraphEdge[]
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const functionNodes = nodes.filter((n) => n.type === 'function' || n.type === 'variable');
  const otherNodes = nodes.filter((n) => n.type !== 'function' && n.type !== 'variable');

  // Group functions by file
  const functionsByFile = new Map<string, GraphNode[]>();
  for (const funcNode of functionNodes) {
    const file = funcNode.location?.file || 'unknown';
    if (!functionsByFile.has(file)) {
      functionsByFile.set(file, []);
    }
    functionsByFile.get(file)!.push(funcNode);
  }

  // Create or update file nodes
  const fileNodeMap = new Map<string, GraphNode>();

  // Find existing file nodes
  for (const node of otherNodes) {
    if (node.type === 'file') {
      fileNodeMap.set(node.id, node);
    }
  }

  // Create file nodes for functions without explicit file nodes
  for (const [file, funcs] of functionsByFile.entries()) {
    const existingFileNode = Array.from(fileNodeMap.values()).find(
      (n) => n.location?.file === file || n.label === file
    );

    if (existingFileNode) {
      // Update existing file node with function count
      fileNodeMap.set(existingFileNode.id, {
        ...existingFileNode,
        description: `${existingFileNode.description || ''} [${funcs.length} functions]`,
      });
    } else {
      // Create new file node
      const fileId = `file:${file}`;
      fileNodeMap.set(fileId, {
        id: fileId,
        label: file,
        type: 'file',
        description: `${funcs.length} functions`,
        location: { file, startLine: 1, endLine: 1 },
      });
    }
  }

  // Merge edges to file level
  const newEdges = new Map<string, GraphEdge>();

  for (const edge of edges) {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);

    if (!sourceNode || !targetNode) continue;

    // Lift function-to-function edges to file-to-file
    if (
      (sourceNode.type === 'function' || sourceNode.type === 'variable') &&
      (targetNode.type === 'function' || targetNode.type === 'variable')
    ) {
      const sourceFile = sourceNode.location?.file || 'unknown';
      const targetFile = targetNode.location?.file || 'unknown';

      if (sourceFile !== targetFile) {
        const edgeKey = `file:${sourceFile}->file:${targetFile}`;
        if (!newEdges.has(edgeKey)) {
          newEdges.set(edgeKey, {
            source: `file:${sourceFile}`,
            target: `file:${targetFile}`,
            type: 'dependency',
            label: 'file dependency',
            reason: 'Aggregated from function dependencies',
          });
        }
      }
    } else {
      // Keep other edges
      newEdges.set(`${edge.source}->${edge.target}`, edge);
    }
  }

  return {
    nodes: [...Array.from(fileNodeMap.values()), ...otherNodes.filter((n) => n.type !== 'file')],
    edges: Array.from(newEdges.values()),
  };
}

/**
 * Level 3: Cluster files into intent nodes (coarsest)
 */
function clusterFilesIntoIntents(
  nodes: GraphNode[],
  edges: GraphEdge[]
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const intentNodes = nodes.filter((n) => n.type === 'intent');
  const otherNodes = nodes.filter((n) => n.type !== 'intent');

  // Find which intents are served by which files/functions
  const intentToNodes = new Map<string, Set<string>>();

  for (const edge of edges) {
    if (edge.type === 'serves_intent') {
      if (!intentToNodes.has(edge.target)) {
        intentToNodes.set(edge.target, new Set());
      }
      intentToNodes.get(edge.target)!.add(edge.source);
    }
  }

  // Update intent nodes with counts
  const updatedIntents = intentNodes.map((intent) => {
    const servingNodes = intentToNodes.get(intent.id);
    const count = servingNodes ? servingNodes.size : 0;
    return {
      ...intent,
      description: `${intent.description || ''} [${count} components]`,
    };
  });

  // Keep only intent-to-intent edges and high-level serves_intent edges
  const filteredEdges = edges.filter(
    (e) =>
      e.type === 'supports_intent' ||
      e.type === 'undermines_intent' ||
      (e.type === 'serves_intent' && nodes.find((n) => n.id === e.target)?.type === 'intent')
  );

  return {
    nodes: updatedIntents,
    edges: filteredEdges,
  };
}

/**
 * Determine zoom level based on current viewBox width
 */
export function calculateZoomLevel(viewBoxWidth: number): ZoomLevel {
  // Wider viewBox = zoomed out more = higher cluster level
  if (viewBoxWidth < 1000) return 0; // Very zoomed in - show variables
  if (viewBoxWidth < 2000) return 1; // Moderately zoomed - cluster variables into functions
  if (viewBoxWidth < 4000) return 2; // Zoomed out - cluster into files
  return 3; // Very zoomed out - show only intents
}
