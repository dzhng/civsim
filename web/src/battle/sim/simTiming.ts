/** The sim's fixed timestep, held where the authority can read it without pulling
 * in the animation graph. `ACTION_TICK_SECONDS` in crowd-runtime is the same
 * number seen from the presentation side; `tests/battleSimTiming.test.ts` pins the
 * two together so this copy can never drift. */
export const BATTLE_TICK_SECONDS = 1 / 30;
export const BATTLE_TICK_MS = BATTLE_TICK_SECONDS * 1000;

/** Ticks of wall-clock debt the authority will chase in one pump before it
 * abandons the rest. A kernel tick slower than the timestep can never catch up,
 * and pretending otherwise only builds an unbounded backlog. */
export const BATTLE_MAX_CATCHUP_TICKS = 4;

/** Publications the authority may have outstanding. Two lets it run one tick
 * ahead of the consumer, which is all the pipelining ownership allows: the
 * consumer holds one while the producer fills the other, and neither waits for an
 * animation frame. A third would buy nothing but staleness. */
export const PUBLICATION_POOL = 2;
