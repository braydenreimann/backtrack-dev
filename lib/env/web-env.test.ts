import { afterEach, describe, expect, it } from 'vitest';
import { isLocalLikeHostname, resolveSocketUrl, validateWebEnvAtStartup } from '@/lib/env/web-env';

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_WINDOW = globalThis.window;
type GlobalWithOptionalWindow = typeof globalThis & { window?: Window };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  if (typeof ORIGINAL_WINDOW === 'undefined') {
    Reflect.deleteProperty(globalThis as GlobalWithOptionalWindow, 'window');
    return;
  }
  (globalThis as GlobalWithOptionalWindow).window = ORIGINAL_WINDOW;
});

describe('web env contract', () => {
  it('recognizes local-like hostnames', () => {
    expect(isLocalLikeHostname('localhost')).toBe(true);
    expect(isLocalLikeHostname('127.0.0.1')).toBe(true);
    expect(isLocalLikeHostname('192.168.1.50')).toBe(true);
    expect(isLocalLikeHostname('device.local')).toBe(true);
    expect(isLocalLikeHostname('joinbacktrack.com')).toBe(false);
  });

  it('throws on Vercel deployments when NEXT_PUBLIC_SOCKET_URL is missing', () => {
    delete process.env.NEXT_PUBLIC_SOCKET_URL;
    process.env.VERCEL = '1';
    expect(() => validateWebEnvAtStartup()).toThrow(/NEXT_PUBLIC_SOCKET_URL is required/i);
  });

  it('returns configured socket URL when provided', () => {
    process.env.NEXT_PUBLIC_SOCKET_URL = 'https://rt.joinbacktrack.com';
    expect(resolveSocketUrl()).toBe('https://rt.joinbacktrack.com');
  });

  it('uses host fallback in local development hosts', () => {
    delete process.env.NEXT_PUBLIC_SOCKET_URL;
    process.env.NODE_ENV = 'development';
    (globalThis as GlobalWithOptionalWindow).window = {
      location: {
        protocol: 'http:',
        hostname: 'localhost',
      },
    };
    expect(resolveSocketUrl()).toBe('http://localhost:3001');
  });
});
