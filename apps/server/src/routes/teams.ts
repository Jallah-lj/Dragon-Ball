import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createInviteSchema,
  createTeamSchema,
  inviteCodeSchema,
  updateMemberSchema,
  updateTeamSchema,
} from '@dbfc/shared';
import type { AppContext } from '../context';
import { requireAccount, requireUser } from '../plugins/auth';
import {
  acceptInvite,
  createInvite,
  createTeam,
  disbandTeam,
  leaveTeam,
  previewInvite,
  removeMember,
  revokeInvite,
  setMemberRole,
  teamDTO,
  teamOf,
  updateTeam,
} from '../services/teams';
import { limit, uuidParam } from './util';

const memberParams = z.object({ id: z.uuid(), userId: z.uuid() });
const inviteParams = z.object({ id: z.uuid(), code: inviteCodeSchema });

export function teamRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post('/api/teams', { config: limit(10, '10 minutes') }, async (request, reply) => {
    const user = requireAccount(request);
    const input = createTeamSchema.parse(request.body);
    const id = await createTeam(ctx, user, input);
    reply.status(201);
    return teamDTO(ctx.db, id, user);
  });

  app.get('/api/teams/mine', async (request) => {
    const user = requireUser(request);
    const mine = await teamOf(ctx.db, user.id);
    return { team: mine ? await teamDTO(ctx.db, mine.teamId, user) : null };
  });

  app.get('/api/teams/:id', async (request) => {
    const { id } = uuidParam.parse(request.params);
    return teamDTO(ctx.db, id, request.user);
  });

  app.patch('/api/teams/:id', async (request) => {
    const user = requireAccount(request);
    const { id } = uuidParam.parse(request.params);
    await updateTeam(ctx, user, id, updateTeamSchema.parse(request.body));
    return teamDTO(ctx.db, id, user);
  });

  app.delete('/api/teams/:id', async (request, reply) => {
    const user = requireAccount(request);
    const { id } = uuidParam.parse(request.params);
    await disbandTeam(ctx, user, id);
    return reply.status(204).send();
  });

  app.post(
    '/api/teams/:id/invites',
    { config: limit(20, '10 minutes') },
    async (request, reply) => {
      const user = requireAccount(request);
      const { id } = uuidParam.parse(request.params);
      const invite = await createInvite(
        ctx,
        user,
        id,
        createInviteSchema.parse(request.body ?? {}),
      );
      reply.status(201);
      return invite;
    },
  );

  app.delete('/api/teams/:id/invites/:code', async (request, reply) => {
    const user = requireAccount(request);
    const { id, code } = inviteParams.parse(request.params);
    await revokeInvite(ctx, user, id, code);
    return reply.status(204).send();
  });

  app.get('/api/invites/:code', { config: limit(60, '1 minute') }, async (request) => {
    const { code } = z.object({ code: inviteCodeSchema }).parse(request.params);
    return previewInvite(ctx.db, code);
  });

  app.post('/api/invites/:code/accept', { config: limit(20, '10 minutes') }, async (request) => {
    const user = requireAccount(request);
    const { code } = z.object({ code: inviteCodeSchema }).parse(request.params);
    const teamId = await acceptInvite(ctx, user, code);
    return teamDTO(ctx.db, teamId, user);
  });

  app.patch('/api/teams/:id/members/:userId', async (request) => {
    const user = requireAccount(request);
    const { id, userId } = memberParams.parse(request.params);
    const { role } = updateMemberSchema.parse(request.body);
    await setMemberRole(ctx, user, id, userId, role);
    return teamDTO(ctx.db, id, user);
  });

  app.delete('/api/teams/:id/members/:userId', async (request, reply) => {
    const user = requireAccount(request);
    const { id, userId } = memberParams.parse(request.params);
    await removeMember(ctx, user, id, userId);
    return reply.status(204).send();
  });

  app.post('/api/teams/:id/leave', async (request) => {
    const user = requireAccount(request);
    const { id } = uuidParam.parse(request.params);
    return leaveTeam(ctx, user, id);
  });
}
