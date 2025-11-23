/**
 * Multi-Pass Analysis Strategy
 *
 * For large codebases, break analysis into phases to:
 * 1. Stay within token limits
 * 2. Produce deeper analysis
 * 3. Allow progressive loading
 */

import { CodeFile, AnalysisResult, GraphNode, GraphEdge } from '../types';
import { analyzeCodebase } from './geminiService';

const MAX_CHARS_PER_PASS = 50000; // ~12k tokens
const MAX_FILES_PER_PASS = 5;

interface AnalysisPass {
  name: string;
  files: CodeFile[];
  charCount: number;
}

/**
 * Determine if codebase needs multi-pass analysis
 */
export const needsMultiPass = (files: CodeFile[]): boolean => {
  const totalChars = files.reduce((sum, f) => sum + f.content.length, 0);
  return totalChars > MAX_CHARS_PER_PASS || files.length > MAX_FILES_PER_PASS;
};

/**
 * Split files into manageable passes
 */
export const createAnalysisPasses = (files: CodeFile[]): AnalysisPass[] => {
  const passes: AnalysisPass[] = [];
  let currentPass: CodeFile[] = [];
  let currentChars = 0;

  for (const file of files) {
    const fileChars = file.content.length;

    // If adding this file exceeds limits, start new pass
    if (currentPass.length >= MAX_FILES_PER_PASS ||
        (currentChars + fileChars > MAX_CHARS_PER_PASS && currentPass.length > 0)) {
      passes.push({
        name: `Pass ${passes.length + 1}`,
        files: currentPass,
        charCount: currentChars
      });
      currentPass = [];
      currentChars = 0;
    }

    currentPass.push(file);
    currentChars += fileChars;
  }

  // Add final pass
  if (currentPass.length > 0) {
    passes.push({
      name: `Pass ${passes.length + 1}`,
      files: currentPass,
      charCount: currentChars
    });
  }

  return passes;
};

/**
 * Merge multiple analysis results
 * Handles node ID conflicts and cross-file edges
 */
export const mergeAnalysisResults = (results: AnalysisResult[]): AnalysisResult => {
  const allNodes: GraphNode[] = [];
  const allEdges: GraphEdge[] = [];
  const nodeIds = new Set<string>();

  // Merge nodes (deduplicate by ID)
  for (const result of results) {
    for (const node of result.nodes) {
      if (!nodeIds.has(node.id)) {
        allNodes.push(node);
        nodeIds.add(node.id);
      }
    }
  }

  // Merge edges (deduplicate by source-target-type)
  const edgeKeys = new Set<string>();
  for (const result of results) {
    for (const edge of result.edges) {
      const key = `${edge.source}-${edge.target}-${edge.type}`;
      if (!edgeKeys.has(key)) {
        allEdges.push(edge);
        edgeKeys.add(key);
      }
    }
  }

  // Combine summaries
  const summary = results
    .map((r, i) => `**Pass ${i + 1}**: ${r.summary}`)
    .join('\n\n');

  return {
    nodes: allNodes,
    edges: allEdges,
    summary: `# Multi-Pass Analysis (${results.length} passes)\n\n${summary}`
  };
};

/**
 * Run multi-pass analysis with progress callback
 */
export const runMultiPassAnalysis = async (
  files: CodeFile[],
  model: string,
  onProgress?: (current: number, total: number, passName: string) => void
): Promise<AnalysisResult> => {
  const passes = createAnalysisPasses(files);

  console.log(`📊 Multi-pass analysis: ${passes.length} passes for ${files.length} files`);
  passes.forEach((pass, i) => {
    console.log(`  Pass ${i + 1}: ${pass.files.length} files, ${pass.charCount} chars`);
  });

  const results: AnalysisResult[] = [];

  for (let i = 0; i < passes.length; i++) {
    const pass = passes[i];

    if (onProgress) {
      onProgress(i + 1, passes.length, pass.name);
    }

    console.log(`🔍 Analyzing ${pass.name}: ${pass.files.map(f => f.name).join(', ')}`);

    try {
      const result = await analyzeCodebase(pass.files, model);
      results.push(result);
    } catch (error) {
      console.error(`❌ Pass ${i + 1} failed:`, error);
      throw error;
    }
  }

  return mergeAnalysisResults(results);
};

/**
 * Get analysis strategy recommendation
 */
export const getAnalysisStrategy = (files: CodeFile[]): {
  strategy: 'single-pass' | 'multi-pass';
  reason: string;
  estimatedPasses?: number;
  estimatedTime?: number;
} => {
  const totalChars = files.reduce((sum, f) => sum + f.content.length, 0);

  if (!needsMultiPass(files)) {
    return {
      strategy: 'single-pass',
      reason: `Small codebase (${files.length} files, ${totalChars.toLocaleString()} chars)`
    };
  }

  const passes = createAnalysisPasses(files);
  const estimatedTimePerPass = 15; // seconds (rough estimate)

  return {
    strategy: 'multi-pass',
    reason: `Large codebase requires ${passes.length} passes to stay within limits`,
    estimatedPasses: passes.length,
    estimatedTime: passes.length * estimatedTimePerPass
  };
};
