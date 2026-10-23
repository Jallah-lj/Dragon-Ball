import type { FastifyError, FastifyInstance } from 'fastify';
import { z, ZodError } from 'zod';
import type { ApiErrorBody } from '@dbfc/shared';
import { AppError } from '../lib/errors';

export function sendError(
  code: ApiErrorBody['error']['code'],
  message: string,
  details?: unknown,
): ApiErrorBody {
  return { error: { code, message, ...(details !== undefined ? { details } : {}) } };
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.status).send(sendError(error.code, error.message, error.details));
    }
    if (error instanceof ZodError) {
      const flat = z.flattenError(error);
      const first = error.issues[0];
      return reply.status(400).send(
        sendError('VALIDATION', first?.message ?? 'Invalid request.', {
          fieldErrors: flat.fieldErrors,
          formErrors: flat.formErrors,
        }),
      );
    }
    const fe = error as FastifyError;
    if (fe.statusCode === 429) {
      return reply
        .status(429)
        .send(sendError('RATE_LIMITED', 'Too many requests. Take a breath and try again shortly.'));
    }
    if (
      fe.validation ||
      fe.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' ||
      fe.code === 'FST_ERR_CTP_EMPTY_JSON_BODY' ||
      fe.statusCode === 400
    ) {
      return reply.status(400).send(sendError('BAD_REQUEST', 'Malformed request.'));
    }
    if (fe.statusCode === 413) {
      return reply.status(413).send(sendError('BAD_REQUEST', 'Request body is too large.'));
    }
    request.log.error({ err: error }, 'Unhandled error');
    return reply.status(500).send(sendError('INTERNAL', 'Something went wrong on our side.'));
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.status(404).send(sendError('NOT_FOUND', 'No such endpoint.'));
    }
    return reply.status(404).send('Not found');
  });
}
