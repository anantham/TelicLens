/**
 * SAFE: Proper authentication flow with sanitization
 * Expected graph properties:
 * - username/password flow through sanitize/hash before database
 * - No trust boundary violations
 * - All defs have uses, all uses have defs
 */

import { hash, sanitize } from './utils';
import { database } from './db';

export function authenticateUser(username: string, password: string): string | null {
  // SAFE: Input sanitization
  const sanitizedUsername = sanitize(username);
  const hashedPassword = hash(password);

  // SAFE: Query with sanitized inputs
  const user = database.findUser(sanitizedUsername);

  if (user && user.password === hashedPassword) {
    const token = generateToken(user.id);
    return token;
  }

  return null;
}

function generateToken(userId: string): string {
  const payload = { userId, timestamp: Date.now() };
  return signJWT(payload);
}

function signJWT(payload: any): string {
  // Safe JWT signing
  return 'jwt-token';
}
