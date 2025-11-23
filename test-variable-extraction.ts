/**
 * Test script for variable extraction and consistency checking
 */

import { extractVariables, variablesToNodes, flowsToEdges } from './services/variableExtractor';
import { checkVariableConsistency, filterMeaningfulVariables } from './services/variableConsistencyChecker';
import type { CodeFile } from './types';

// Sample code to test
const testCode: CodeFile = {
  name: 'test.ts',
  language: 'typescript',
  content: `
function authenticateUser(username: string, password: string) {
  const sanitizedUsername = sanitize(username);
  const hashedPassword = hash(password);

  const user = database.findUser(sanitizedUsername);

  if (user && user.password === hashedPassword) {
    const token = generateToken(user.id);
    return token;
  }

  return null;
}

function sanitize(input: string) {
  return input.trim().toLowerCase();
}

function hash(password: string) {
  return crypto.hash(password);
}

function generateToken(userId: string) {
  const payload = { userId, timestamp: Date.now() };
  return jwt.sign(payload);
}
`,
};

console.log('🔬 Testing Variable Extraction\n');
console.log('Code file:', testCode.name);
console.log('=====================================\n');

// Extract variables
const { variables, flows } = extractVariables(testCode);
console.log(`✅ Extracted ${variables.length} variable instances`);
console.log(`✅ Extracted ${flows.length} data flows\n`);

// Convert to nodes/edges
let variableNodes = variablesToNodes(variables);
const variableEdges = flowsToEdges(flows);

console.log(`📊 Created ${variableNodes.length} variable nodes`);
console.log(`📊 Created ${variableEdges.length} flow edges\n`);

// Filter meaningful variables
const originalCount = variableNodes.length;
variableNodes = filterMeaningfulVariables(variableNodes);
console.log(`🎯 Filtered to ${variableNodes.length} meaningful variables (removed ${originalCount - variableNodes.length} noise)\n`);

// Display variable nodes
console.log('Variable Nodes:');
console.log('================');
variableNodes.forEach((node) => {
  console.log(`  - ${node.label} (${node.variableInfo?.kind}) in ${node.variableInfo?.scope}`);
  console.log(`    Location: ${node.location?.file}:${node.location?.startLine}`);
  console.log(`    Def: ${node.variableInfo?.isDef}, Use: ${node.variableInfo?.isUse}`);
  console.log('');
});

// Display flows
console.log('Data Flows:');
console.log('===========');
variableEdges.forEach((edge) => {
  console.log(`  ${edge.source} → ${edge.target}`);
  console.log(`    Type: ${edge.type}, Reason: ${edge.reason}`);
  console.log('');
});

// Run consistency check
console.log('Running Consistency Check...');
console.log('============================\n');
const consistencyReport = checkVariableConsistency(variableNodes, variableEdges);

console.log(consistencyReport.summary);
console.log('');

if (consistencyReport.orphanDefs.length > 0) {
  console.log('Orphan Definitions:');
  consistencyReport.orphanDefs.forEach((def) => console.log(`  - ${def}`));
  console.log('');
}

if (consistencyReport.orphanUses.length > 0) {
  console.log('Orphan Uses:');
  consistencyReport.orphanUses.forEach((use) => console.log(`  - ${use}`));
  console.log('');
}

if (consistencyReport.unreachableFlows.length > 0) {
  console.log('Unreachable Flows:');
  consistencyReport.unreachableFlows.forEach((flow) => console.log(`  - ${flow}`));
  console.log('');
}

if (consistencyReport.trustBoundaryViolations.length > 0) {
  console.log('Trust Boundary Violations:');
  consistencyReport.trustBoundaryViolations.forEach((viol) => console.log(`  - ${viol}`));
  console.log('');
}

console.log('✅ Test complete!');
