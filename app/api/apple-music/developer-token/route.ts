import { NextResponse } from 'next/server';
import { createDeveloperToken, loadAppleMusicCredentials } from '@/lib/server/apple-music-auth';

export const runtime = 'nodejs';

const REFRESH_WINDOW_MS = 60_000;

let cachedToken: string | null = null;
let cachedTokenExpiresAtMs = 0;

const getDeveloperToken = () => {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiresAtMs - REFRESH_WINDOW_MS) {
    return cachedToken;
  }

  const credentials = loadAppleMusicCredentials();
  const next = createDeveloperToken({
    teamId: credentials.teamId,
    keyId: credentials.keyId,
    privateKey: credentials.privateKey,
    ttlSeconds: 60 * 55,
    nowMs: now,
  });

  cachedToken = next.token;
  cachedTokenExpiresAtMs = next.expiresAtMs;
  return cachedToken;
};

export async function GET() {
  try {
    const developerToken = getDeveloperToken();
    return NextResponse.json({ developerToken });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate developer token.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
