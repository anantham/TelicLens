import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { GraphNode, GraphEdge, CodeFile } from '../types';

// Fix for ESM/CJS interop
const traverse = (_traverse as any).default || _traverse;

export interface VariableInfo {
  name: string;
  scope: string;
  kind: 'parameter' | 'local' | 'return' | 'field' | 'global';
  file: string;
  line: number;
  isDef: boolean;
  isUse: boolean;
  parentFunction?: string;
  dataType?: string;
}

export interface VariableFlowEdge {
  from: string;  // Variable ID
  to: string;    // Variable ID
  type: 'def-use' | 'param-arg' | 'return' | 'assignment';
  reason: string;
  trustBoundary?: boolean;
}

/**
 * Extract all variables from a code file using AST parsing
 */
export function extractVariables(file: CodeFile): {
  variables: VariableInfo[];
  flows: VariableFlowEdge[];
} {
  const variables: VariableInfo[] = [];
  const flows: VariableFlowEdge[] = [];
  const scopeStack: string[] = ['global'];

  try {
    // Parse the code into an AST
    const ast = parse(file.content, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: true,
    });

    // Traverse the AST and extract variable information
    traverse(ast, {
      // Track scope changes
      FunctionDeclaration: {
        enter(path) {
          const funcName = path.node.id?.name || 'anonymous';
          scopeStack.push(funcName);

          // Extract parameters
          path.node.params.forEach((param) => {
            if (t.isIdentifier(param)) {
              variables.push({
                name: param.name,
                scope: funcName,
                kind: 'parameter',
                file: file.name,
                line: param.loc?.start.line || 0,
                isDef: true,
                isUse: false,
                parentFunction: funcName,
              });
            }
          });
        },
        exit() {
          scopeStack.pop();
        },
      },

      FunctionExpression: {
        enter(path) {
          const funcName = path.node.id?.name || `anonymous_${path.node.loc?.start.line}`;
          scopeStack.push(funcName);

          // Extract parameters
          path.node.params.forEach((param) => {
            if (t.isIdentifier(param)) {
              variables.push({
                name: param.name,
                scope: funcName,
                kind: 'parameter',
                file: file.name,
                line: param.loc?.start.line || 0,
                isDef: true,
                isUse: false,
                parentFunction: funcName,
              });
            }
          });
        },
        exit() {
          scopeStack.pop();
        },
      },

      ArrowFunctionExpression: {
        enter(path) {
          const funcName = `arrow_${path.node.loc?.start.line}`;
          scopeStack.push(funcName);

          // Extract parameters
          path.node.params.forEach((param) => {
            if (t.isIdentifier(param)) {
              variables.push({
                name: param.name,
                scope: funcName,
                kind: 'parameter',
                file: file.name,
                line: param.loc?.start.line || 0,
                isDef: true,
                isUse: false,
                parentFunction: funcName,
              });
            }
          });
        },
        exit() {
          scopeStack.pop();
        },
      },

      // Variable declarations
      VariableDeclarator(path) {
        const currentScope = scopeStack[scopeStack.length - 1];

        if (t.isIdentifier(path.node.id)) {
          const varInfo: VariableInfo = {
            name: path.node.id.name,
            scope: currentScope,
            kind: currentScope === 'global' ? 'global' : 'local',
            file: file.name,
            line: path.node.id.loc?.start.line || 0,
            isDef: true,
            isUse: false,
            parentFunction: currentScope !== 'global' ? currentScope : undefined,
          };

          // Try to infer type from initialization
          if (path.node.init) {
            varInfo.dataType = inferType(path.node.init);
          }

          variables.push(varInfo);

          // If there's an initializer, track the flow
          if (path.node.init && t.isIdentifier(path.node.init)) {
            // Use scoped ID format to match node IDs: file:scope:name
            flows.push({
              from: `${file.name}:${currentScope}:${path.node.init.name}`,
              to: `${file.name}:${currentScope}:${path.node.id.name}`,
              type: 'assignment',
              reason: `${path.node.init.name} assigned to ${path.node.id.name}`,
            });
          }
        }
      },

      // Variable uses (identifiers)
      Identifier(path) {
        // Skip if this is a declaration or key
        if (path.parent.type === 'VariableDeclarator' && path.parent.id === path.node) return;
        if (path.parent.type === 'FunctionDeclaration' && path.parent.id === path.node) return;
        if (path.parent.type === 'Property' && path.parent.key === path.node) return;

        const currentScope = scopeStack[scopeStack.length - 1];

        variables.push({
          name: path.node.name,
          scope: currentScope,
          kind: 'local',
          file: file.name,
          line: path.node.loc?.start.line || 0,
          isDef: false,
          isUse: true,
          parentFunction: currentScope !== 'global' ? currentScope : undefined,
        });
      },

      // Return statements
      ReturnStatement(path) {
        const currentScope = scopeStack[scopeStack.length - 1];

        if (path.node.argument && t.isIdentifier(path.node.argument)) {
          variables.push({
            name: `return_${path.node.argument.name}`,
            scope: currentScope,
            kind: 'return',
            file: file.name,
            line: path.node.loc?.start.line || 0,
            isDef: false,
            isUse: true,
            parentFunction: currentScope,
          });

          // Use scoped ID format to match node IDs: file:scope:name
          flows.push({
            from: `${file.name}:${currentScope}:${path.node.argument.name}`,
            to: `${file.name}:${currentScope}:return_${path.node.argument.name}`,
            type: 'return',
            reason: `${path.node.argument.name} returned from ${currentScope}`,
          });
        }
      },

      // Assignment expressions
      AssignmentExpression(path) {
        const currentScope = scopeStack[scopeStack.length - 1];

        if (t.isIdentifier(path.node.left) && t.isIdentifier(path.node.right)) {
          // Use scoped ID format to match node IDs: file:scope:name
          flows.push({
            from: `${file.name}:${currentScope}:${path.node.right.name}`,
            to: `${file.name}:${currentScope}:${path.node.left.name}`,
            type: 'assignment',
            reason: `${path.node.right.name} assigned to ${path.node.left.name}`,
          });
        }
      },
    });
  } catch (error) {
    console.warn(`Failed to parse ${file.name}:`, error);
  }

  return { variables, flows };
}

/**
 * Convert extracted variables to graph nodes
 */
export function variablesToNodes(variables: VariableInfo[]): GraphNode[] {
  // Deduplicate and merge def/use sites
  const varMap = new Map<string, VariableInfo>();

  for (const v of variables) {
    const key = `${v.file}:${v.scope}:${v.name}`;
    const existing = varMap.get(key);

    if (existing) {
      existing.isDef = existing.isDef || v.isDef;
      existing.isUse = existing.isUse || v.isUse;
    } else {
      varMap.set(key, { ...v });
    }
  }

  // Convert to graph nodes
  return Array.from(varMap.values()).map((v) => ({
    id: `var:${v.file}:${v.scope}:${v.name}`,
    label: v.name,
    type: 'variable' as const,
    description: `${v.kind} in ${v.scope}`,
    location: {
      file: v.file,
      startLine: v.line,
      endLine: v.line,
      aiComment: `${v.isDef ? 'Defined' : 'Used'} at line ${v.line}`,
    },
    variableInfo: {
      symbolName: v.name,
      scope: v.scope,
      kind: v.kind,
      dataType: v.dataType,
      isDef: v.isDef,
      isUse: v.isUse,
      parentFunction: v.parentFunction,
    },
    clusterId: `func:${v.file}:${v.parentFunction || 'global'}`,
    clusterLevel: 0,
  }));
}

/**
 * Convert variable flows to graph edges
 */
export function flowsToEdges(flows: VariableFlowEdge[]): GraphEdge[] {
  return flows.map((f) => ({
    source: `var:${f.from}`,
    target: `var:${f.to}`,
    label: f.type,
    reason: f.reason,
    type: 'flow' as const,
    color: f.trustBoundary ? 'orange' : undefined,
  }));
}

/**
 * Simple type inference from AST node
 */
function inferType(node: t.Expression): string {
  if (t.isStringLiteral(node)) return 'string';
  if (t.isNumericLiteral(node)) return 'number';
  if (t.isBooleanLiteral(node)) return 'boolean';
  if (t.isArrayExpression(node)) return 'array';
  if (t.isObjectExpression(node)) return 'object';
  if (t.isFunctionExpression(node) || t.isArrowFunctionExpression(node)) return 'function';
  if (t.isCallExpression(node)) {
    if (t.isIdentifier(node.callee)) {
      // Common constructor patterns
      if (node.callee.name === 'Array') return 'array';
      if (node.callee.name === 'Object') return 'object';
      if (node.callee.name === 'String') return 'string';
      if (node.callee.name === 'Number') return 'number';
    }
  }
  return 'unknown';
}
