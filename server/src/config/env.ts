const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

const PRIVATE_IPV4_PATTERN =
  /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})$/;

const parsePort = (value: string | undefined): number => {
  if (!value) {
    return 3001;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid PORT value "${value}". Expected an integer between 1 and 65535.`);
  }
  return parsed;
};

const parseCorsOrigins = (value: string | undefined): string[] => {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const isProductionLike = () => process.env.NODE_ENV === 'production' || Boolean(process.env.FLY_APP_NAME);

const isLocalHostname = (hostname: string): boolean =>
  LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith('.local') || PRIVATE_IPV4_PATTERN.test(hostname);

const isLocalDevOrigin = (origin: string): boolean => {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    if (parsed.port && parsed.port !== '3000') {
      return false;
    }
    return isLocalHostname(parsed.hostname);
  } catch {
    return false;
  }
};

export type ServerEnv = {
  port: number;
  corsOrigins: string[];
  isProduction: boolean;
  isCorsOriginAllowed: (origin: string | undefined) => boolean;
};

export const readServerEnv = (): ServerEnv => {
  const port = parsePort(process.env.PORT);
  const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);
  const isProduction = isProductionLike();

  if (isProduction && corsOrigins.length === 0) {
    throw new Error(
      'CORS_ORIGINS is required in production/deployed server environments. Provide a comma-separated allowlist.'
    );
  }

  const isCorsOriginAllowed = (origin: string | undefined): boolean => {
    if (!origin) {
      return true;
    }
    if (corsOrigins.includes(origin)) {
      return true;
    }
    if (!isProduction && isLocalDevOrigin(origin)) {
      return true;
    }
    return false;
  };

  return {
    port,
    corsOrigins,
    isProduction,
    isCorsOriginAllowed,
  };
};
