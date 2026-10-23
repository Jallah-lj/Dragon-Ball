import { expect, test } from '@playwright/test';
import { register, uniqueName } from './helpers';

test('register, edit profile, create a team and invite a second player', async ({ browser }) => {
  const ownerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  const ownerName = uniqueName('Owner');
  await register(owner, ownerName);
  await expect(owner.getByRole('button', { name: new RegExp(ownerName) })).toBeVisible();

  await owner.goto('/profile');
  await owner.getByLabel('Display name').fill('Ember Owner');
  await owner.getByRole('button', { name: 'Save profile' }).click();
  await expect(owner.getByText('Profile saved.')).toBeVisible();

  await owner.goto('/team');
  await owner.getByLabel('Team name').fill(`Wardens ${ownerName.slice(-4)}`);
  await owner.getByLabel('Tag').fill(
    `W${ownerName.slice(-3)}`
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, 'X')
      .slice(0, 5),
  );
  await owner.getByRole('button', { name: 'Create team' }).click();
  await expect(owner.getByRole('heading', { name: /Wardens/ })).toBeVisible();
  await owner.getByRole('button', { name: 'Create invite' }).click();
  const code = (await owner.locator('.code-chip').first().innerText()).trim();
  expect(code).toMatch(/^[A-Z2-9]{8}$/);

  const memberCtx = await browser.newContext();
  const member = await memberCtx.newPage();
  const memberName = uniqueName('Member');
  await register(member, memberName);
  await member.goto(`/join/${code}`);
  await member.getByRole('button', { name: /Join Wardens/ }).click();
  await expect(member).toHaveURL(/\/team$/);
  await expect(member.getByText('2 / 8 members')).toBeVisible();

  await owner.reload();
  await owner
    .getByRole('row', { name: new RegExp(memberName) })
    .getByRole('button', { name: 'Make captain' })
    .click();
  await expect(
    owner.getByRole('row', { name: new RegExp(memberName) }).getByText('Captain'),
  ).toBeVisible();

  // The member leaves; the owner sees the team shrink.
  await member.reload();
  await member.getByRole('button', { name: 'Leave team' }).click();
  await member.getByRole('button', { name: 'Confirm' }).click();
  await expect(member.getByRole('heading', { name: 'Find your flight' })).toBeVisible();
  await owner.reload();
  await expect(owner.getByText('1 / 8 members')).toBeVisible();

  // Sign out and back in.
  await owner.getByRole('button', { name: /Ember Owner/ }).click();
  await owner.getByRole('menuitem', { name: 'Sign out' }).click();
  await owner.goto('/auth?mode=login');
  await owner.getByLabel('Username or email').fill(ownerName);
  await owner.getByLabel('Password').fill('e2e password 123');
  await owner.getByRole('button', { name: 'Sign in' }).last().click();
  await expect(owner).toHaveURL(/\/play/);
  await ownerCtx.close();
  await memberCtx.close();
});

test('invalid invite codes are explained', async ({ page }) => {
  await page.goto('/join/ZZZZZZZZ');
  await expect(page.getByRole('heading', { name: 'Invite not found' })).toBeVisible();
});
