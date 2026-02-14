import { afterEach, describe, expect, it } from 'vitest';
import { readServerEnv } from './env';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('server env contract', () => {
  it('uses development defaults when env vars are unset', () => {
    delete process.env.PORT;
    delete process.env.CORS_ORIGINS;
    process.env.NODE_ENV = 'development';

    const env = readServerEnv();
    expect(env.port).toBe(3001);
    expect(env.corsOrigins).toEqual([]);
    expect(env.isProduction).toBe(false);
    expect(env.isCorsOriginAllowed('http://localhost:3000')).toBe(true);
  });

  it('requires CORS_ORIGINS in production-like environments', () => {
    delete process.env.CORS_ORIGINS;
    process.env.NODE_ENV = 'production';
    expect(() => readServerEnv()).toThrow(/CORS_ORIGINS is required/i);
  });

  it('parses CORS allowlist entries and enforces them in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGINS = 'https://joinbacktrack.com, https://bt-mvp.vercel.app';

    const env = readServerEnv();
    expect(env.isCorsOriginAllowed('https://joinbacktrack.com')).toBe(true);
    expect(env.isCorsOriginAllowed('https://bt-mvp.vercel.app')).toBe(true);
    expect(env.isCorsOriginAllowed('https://evil.example')).toBe(false);
  });
});
