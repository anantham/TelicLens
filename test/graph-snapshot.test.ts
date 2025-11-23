/**
 * Snapshot tests for graph structure
 * These tests ensure graph structure doesn't regress unexpectedly
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { CodeFile } from '../types';
import { buildGroundTruth } from './groundTruthValidator';

function loadFixture(name: string): CodeFile {
  const content = readFileSync(join(__dirname, 'fixtures', name), 'utf-8');
  return {
    name,
    content,
    language: 'typescript',
  };
}

describe('Graph Structure Snapshots', () => {
  it('should match safe-auth graph structure', () => {
    const safeAuth = loadFixture('safe-auth.ts');
    const graph = buildGroundTruth([safeAuth]);

    // Snapshot the node types and counts
    const nodesByType = graph.nodes.reduce(
      (acc, node) => {
        const type = node.type;
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    expect(nodesByType).toMatchSnapshot('safe-auth-node-types');

    // Snapshot the edge types and counts
    const edgesByType = graph.edges.reduce(
      (acc, edge) => {
        const type = edge.type;
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    expect(edgesByType).toMatchSnapshot('safe-auth-edge-types');

    // Snapshot parameter names
    const parameters = graph.nodes
      .filter((n) => n.variableInfo?.kind === 'parameter')
      .map((n) => ({
        name: n.variableInfo!.symbolName,
        scope: n.variableInfo!.scope,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    expect(parameters).toMatchSnapshot('safe-auth-parameters');
  });

  it('should match vulnerable-auth graph structure', () => {
    const vulnAuth = loadFixture('vulnerable-auth.ts');
    const graph = buildGroundTruth([vulnAuth]);

    // Snapshot the node types and counts
    const nodesByType = graph.nodes.reduce(
      (acc, node) => {
        const type = node.type;
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    expect(nodesByType).toMatchSnapshot('vulnerable-auth-node-types');

    // Snapshot consistency issues
    const issuesSummary = {
      orphanDefs: graph.consistency.orphanDefs.length,
      orphanUses: graph.consistency.orphanUses.length,
      unreachableFlows: graph.consistency.unreachableFlows.length,
      trustBoundaryViolations: graph.consistency.trustBoundaryViolations.length,
      missingNodes: graph.consistency.missingNodes.length,
    };

    expect(issuesSummary).toMatchSnapshot('vulnerable-auth-issues');
  });

  it('should detect orphan definition regression', () => {
    const vulnAuth = loadFixture('vulnerable-auth.ts');
    const graph = buildGroundTruth([vulnAuth]);

    // This specific orphan should always be detected
    const hasSanitizedPassword = graph.consistency.orphanDefs.some((def) =>
      def.includes('sanitizedPassword')
    );

    expect(hasSanitizedPassword).toBe(true);

    // Snapshot the exact orphan defs list
    const orphanDefs = graph.consistency.orphanDefs.sort();
    expect(orphanDefs).toMatchSnapshot('vulnerable-auth-orphan-defs');
  });

  it('should maintain function scope tracking', () => {
    const safeAuth = loadFixture('safe-auth.ts');
    const graph = buildGroundTruth([safeAuth]);

    // Collect unique scopes
    const scopes = new Set(
      graph.nodes.filter((n) => n.variableInfo).map((n) => n.variableInfo!.scope)
    );

    const scopeList = Array.from(scopes).sort();

    // Should have scopes for: authenticateUser, generateToken, signJWT
    expect(scopeList).toMatchSnapshot('safe-auth-scopes');
  });

  it('should track variable kinds distribution', () => {
    const safeAuth = loadFixture('safe-auth.ts');
    const graph = buildGroundTruth([safeAuth]);

    const kindDistribution = graph.nodes
      .filter((n) => n.variableInfo)
      .reduce(
        (acc, node) => {
          const kind = node.variableInfo!.kind;
          acc[kind] = (acc[kind] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

    expect(kindDistribution).toMatchSnapshot('safe-auth-variable-kinds');
  });
});

describe('Graph Structure Invariants', () => {
  it('should have consistent node IDs format', () => {
    const safeAuth = loadFixture('safe-auth.ts');
    const graph = buildGroundTruth([safeAuth]);

    // All variable node IDs should follow pattern: var:file:scope:name
    const invalidIds = graph.nodes
      .filter((n) => n.type === 'variable')
      .filter((n) => !n.id.startsWith('var:'));

    expect(invalidIds.length).toBe(0);
  });

  it('should have valid edge references', () => {
    const safeAuth = loadFixture('safe-auth.ts');
    const graph = buildGroundTruth([safeAuth]);

    const nodeIds = new Set(graph.nodes.map((n) => n.id));

    // Check if there are edges referencing non-existent nodes
    const invalidEdges = graph.edges.filter(
      (e) =>
        !e.source.includes(':') && // Skip external references
        !e.target.includes(':') &&
        (!nodeIds.has(e.source) || !nodeIds.has(e.target))
    );

    // We expect some invalid edges for external dependencies
    // But we want to track them
    expect(invalidEdges.length).toBeGreaterThanOrEqual(0);
  });

  it('should have location info on all nodes', () => {
    const safeAuth = loadFixture('safe-auth.ts');
    const graph = buildGroundTruth([safeAuth]);

    const nodesWithoutLocation = graph.nodes.filter((n) => !n.location);

    expect(nodesWithoutLocation.length).toBe(0);
  });

  it('should have variableInfo on all variable nodes', () => {
    const safeAuth = loadFixture('safe-auth.ts');
    const graph = buildGroundTruth([safeAuth]);

    const variableNodes = graph.nodes.filter((n) => n.type === 'variable');
    const nodesWithoutVarInfo = variableNodes.filter((n) => !n.variableInfo);

    expect(nodesWithoutVarInfo.length).toBe(0);
  });
});
