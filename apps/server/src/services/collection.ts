import { and, eq } from 'drizzle-orm';
import { ACHIEVEMENTS, achievementById, SKINS, skinById, type CollectionDTO } from '@dbfc/shared';
import type { AppContext } from '../context';
import type { Db } from '../db/client';
import { achievements, userSkins, users } from '../db/schema';
import { AppError, notFound } from '../lib/errors';
import type { UserRow } from './users';

/** Skins a player owns: the default, purchases and achievement rewards. */
export async function ownedSkins(db: Db, userId: string): Promise<Set<string>> {
  const owned = new Set<string>();
  const unlocked = await db
    .select({ id: achievements.achievementId })
    .from(achievements)
    .where(eq(achievements.userId, userId));
  const ach = new Set(unlocked.map((a) => a.id));
  const bought = await db
    .select({ id: userSkins.skinId })
    .from(userSkins)
    .where(eq(userSkins.userId, userId));
  for (const b of bought) owned.add(b.id);
  for (const skin of SKINS) {
    if (skin.unlock.type === 'default') owned.add(skin.id);
    if (skin.unlock.type === 'achievement' && ach.has(skin.unlock.achievement)) owned.add(skin.id);
  }
  return owned;
}

export async function collectionDTO(db: Db, user: UserRow): Promise<CollectionDTO> {
  const owned = await ownedSkins(db, user.id);
  const unlocked = await db.select().from(achievements).where(eq(achievements.userId, user.id));
  const unlockedAt = new Map(unlocked.map((a) => [a.achievementId, a.unlockedAt.toISOString()]));
  return {
    crystals: user.crystals,
    selectedSkin: user.selectedSkin,
    avatar: user.avatar,
    skins: SKINS.map((s) => ({
      id: s.id,
      owned: owned.has(s.id),
      equipped: user.selectedSkin === s.id,
      price: s.unlock.type === 'purchase' ? s.unlock.price : null,
      requirement:
        s.unlock.type === 'achievement'
          ? `Achievement: ${achievementById(s.unlock.achievement)?.name ?? s.unlock.achievement}`
          : null,
    })),
    achievements: ACHIEVEMENTS.map((a) => ({
      id: a.id,
      unlocked: unlockedAt.has(a.id),
      unlockedAt: unlockedAt.get(a.id) ?? null,
    })),
  };
}

export async function purchaseSkin(ctx: AppContext, user: UserRow, skinId: string): Promise<void> {
  const skin = skinById(skinId);
  if (skin.id !== skinId) throw notFound('Skin');
  if (skin.unlock.type !== 'purchase')
    throw new AppError(
      'BAD_REQUEST',
      'This skin cannot be bought — it is earned through achievements.',
    );
  const price = skin.unlock.price;
  await ctx.db.transaction(async (tx) => {
    const owned = await tx
      .select()
      .from(userSkins)
      .where(and(eq(userSkins.userId, user.id), eq(userSkins.skinId, skinId)))
      .limit(1);
    if (owned.length) throw new AppError('CONFLICT', 'You already own this skin.');
    const [me] = await tx
      .select({ crystals: users.crystals })
      .from(users)
      .where(eq(users.id, user.id))
      .for('update');
    if (!me || me.crystals < price) {
      throw new AppError(
        'INSUFFICIENT_CRYSTALS',
        `You need ${price} crystals (you have ${me?.crystals ?? 0}).`,
      );
    }
    await tx
      .update(users)
      .set({ crystals: me.crystals - price, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    await tx.insert(userSkins).values({ userId: user.id, skinId });
  });
}

export async function equipSkin(
  ctx: AppContext,
  user: UserRow,
  skinId: string,
  alsoAvatar = false,
): Promise<void> {
  const owned = await ownedSkins(ctx.db, user.id);
  if (!owned.has(skinId)) throw new AppError('FORBIDDEN', 'You do not own this skin yet.');
  await ctx.db
    .update(users)
    .set({ selectedSkin: skinId, ...(alsoAvatar ? { avatar: skinId } : {}), updatedAt: new Date() })
    .where(eq(users.id, user.id));
}
