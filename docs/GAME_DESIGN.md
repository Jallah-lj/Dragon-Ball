# Game design reference

All values live in `packages/shared/src/sim` (`constants.ts`, `difficulty.ts`, `course.ts`). Distances are metres, times seconds, 1 tick = 1/60 s.

## Dragon

| Property                    | Value                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Hitbox (standing / sliding) | 1.44 × 1.30 m / 1.84 × 0.66 m                                                                                      |
| Jump                        | launch 11 m/s, gravity 30 m/s² while held, 46 m/s² otherwise; apex ≈ 1.93 m held, ≈ 1.0 m tapped; ≈ 0.65 s airtime |
| Forgiveness                 | 6-tick coyote time, 8-tick jump buffer, minimum 6-tick hold                                                        |
| Slide                       | 0.6 s tap, up to 1.3 s held; slide in the air = fast fall                                                          |
| Hit                         | −1 heart, speed × 0.55, 1.2 s invulnerability, Flow reset                                                          |
| Pit                         | falling 0.9 m into a gap costs a heart and triggers a rescue flap                                                  |

## Abilities

| Ability       | Input           | Effect                                    | Cost / cooldown                                                          |
| ------------- | --------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| Fire Dash     | Shift (default) | × 1.4 speed for 1.2 s, burns thorn bushes | 50 orb energy, 4 s cooldown                                              |
| Forest Leap   | Jump in mid-air | second jump (10.4 m/s)                    | 5 s cooldown                                                             |
| Dragon Shield | E (default)     | absorbs one hit or fall for 8 s           | 20 s cooldown; unlocked by the first catch; shield pickups grant it free |

Energy: start 50/100, +4 per orb, +2 per crystal. **Flow** 0–10: +1 per clean clear, +0.15 per orb; each level adds 1.2 % speed.

## Difficulties

|                        | Forest Explorer (Easy) | Wildwood Chase (Medium)  | Dragon's Trial (Hard) |
| ---------------------- | ---------------------- | ------------------------ | --------------------- |
| Base speed             | 8.6 m/s                | 10.4 m/s                 | 12.2 m/s              |
| Fireball pace          | 1.04 ×                 | 1.07 ×                   | 1.085 ×               |
| Head start             | 50 m                   | 70 m                     | 84 m                  |
| Shrine distance        | 1 500 m                | 2 400 m                  | 3 200 m               |
| Hearts                 | 4                      | 3                        | 3                     |
| Pattern spacing        | 2.0–3.0 s              | 1.35–2.2 s               | 0.95–1.6 s            |
| Hazard tiers           | basics                 | + swings, snares, combos | + dense combos        |
| Score multiplier / par | × 1 / 75 s             | × 1.5 / 90 s             | × 2 / 105 s           |

The fireball eases off by up to 6 % when you fall more than 8 m behind your start gap, speeds up by up to 3.5 % when you are within 10 m, and tires by 0.03 %/s (max 5 %). You catch it within 1.2 m.

Balance (autopilot, 30 seeds per cell, `npm run balance -- --seeds 30`): perfect play catches in ≈ 47 s (Easy), ≈ 65 s (Medium) and ≈ 71 s (Hard) with zero harms; never using Fire Dash is only ≈ 10 % slower.

## Hazards

| Hazard            | Box                           | Response                                          |
| ----------------- | ----------------------------- | ------------------------------------------------- |
| Fallen log        | 1.2–1.6 × 0.8                 | jump                                              |
| Mossy rock        | ~1 × 0.6                      | short hop                                         |
| Ancient trunk     | 1.1–1.3 × 1.3                 | full jump                                         |
| Low branch        | 2.0–2.6 wide, 1.0 → 3.9 m     | slide                                             |
| Thorn bush        | up to 2.7 × 0.75              | jump or Fire Dash through (+30)                   |
| Tangled roots     | 1.6–2.2 × 0.38                | hop (stumble: −3 Flow, slow)                      |
| Mud               | sized for the slow-case speed | jump across (slows to 62 %)                       |
| Broken bridge     | 2.4–4.2 m gap                 | jump (fall: −1 heart)                             |
| Rolling boulder   | 1.1 m, starts at 34 m         | jump; reserved lane, stops before earlier hazards |
| Swinging vine-log | 1.3 m, bottom 0.72–1.92 m     | slide (always safe) or run under while high       |
| Wisp snare        | 1.6 m, 1.15 m when blazing    | jump (always safe) or cross while dormant         |

## Scoring and rewards

- Points: 1 per metre, orb 10, crystal 25, ancient scale 250, pickup 20, thorn burn 30, clean clear `15 + 1.5 × Flow`.
- Catch: +1000, +10 per second under par, +150 per remaining heart; total × difficulty multiplier.
- XP ≈ score / 25 + 60 for a catch (15 otherwise), scaled per difficulty. Levels need 250, 500, 750 … XP.
- Crystals: those collected + 25 per scale + 10/20/35 for a catch + 50 for the first catch on a difficulty.

## Progression and cosmetics

- Medium unlocks after an Easy catch; Hard after a Medium catch. Misty Pine unlocks with a catch in Emerald Woodland, Moonlit Grove with a catch in Misty Pine.
- Skins: Emberscale (default), Mossback (150 crystals), Barkhide (300), Duskwing (Untouchable), Goldcrest (Dragon's Trial), Ashborn (Scale Collector).
- Achievements: First Catch, Wildwood Runner, Dragon's Trial, Untouchable, Blazing Pursuit, Flow State, Scale Seeker, Scale Collector, Crystal Hoarder, Thorn Burner, Explorer of the Wilds, Team Spirit, Race Champion.
