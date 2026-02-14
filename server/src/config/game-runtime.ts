const parsePositiveInt = (value: string | undefined, fallback: number, label: string): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label} value "${value}". Expected a positive integer.`);
  }
  return parsed;
};

export type GameRuntimeConfig = {
  turnDurationMs: number;
  revealDurationMs: number;
  winCardCount: number;
};

export const readGameRuntimeConfig = (): GameRuntimeConfig => ({
  turnDurationMs: parsePositiveInt(process.env.BACKTRACK_TURN_DURATION_MS, 40_000, 'BACKTRACK_TURN_DURATION_MS'),
  revealDurationMs: parsePositiveInt(process.env.BACKTRACK_REVEAL_DURATION_MS, 3000, 'BACKTRACK_REVEAL_DURATION_MS'),
  winCardCount: parsePositiveInt(process.env.BACKTRACK_WIN_CARD_COUNT, 10, 'BACKTRACK_WIN_CARD_COUNT'),
});
