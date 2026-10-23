import argon2 from 'argon2';

/** OWASP-recommended Argon2id parameters (19 MiB, t=2, p=1). */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

export async function verifyPassword(hash: string | null, password: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/** A real hash to verify against when the account doesn't exist (equalizes timing). */
let dummy: Promise<string> | null = null;
export function dummyHash(): Promise<string> {
  dummy ??= argon2.hash('not-a-real-password-placeholder', OPTIONS);
  return dummy;
}
