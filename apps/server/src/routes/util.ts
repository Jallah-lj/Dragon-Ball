import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

export const uuidParam = z.object({ id: z.uuid('Invalid id.') });

export function userAgent(request: FastifyRequest): string | undefined {
  const ua = request.headers['user-agent'];
  return typeof ua === 'string' ? ua : undefined;
}

/** Per-route rate limit config (ignored when rate limiting is disabled). */
export function limit(max: number, timeWindow: string) {
  return { rateLimit: { max, timeWindow } };
}
