import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** 256-bit random token, URL-safe. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmac(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

/**
 * Digest stored for session and email tokens: HMAC-SHA256 keyed with
 * SESSION_SECRET. A leaked database alone cannot validate tokens, and rotating
 * the secret invalidates every session at once.
 */
export function tokenDigest(secret: string, token: string): string {
  return hmac(secret, token);
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Unambiguous alphabet (no 0/O, 1/I/L) for human-typed codes. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function randomSeed(): number {
  return randomBytes(4).readUInt32BE(0);
}
