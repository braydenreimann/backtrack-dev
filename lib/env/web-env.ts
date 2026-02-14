const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

const PRIVATE_IPV4_PATTERN =
  /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})$/;

export const isLocalLikeHostname = (hostname: string): boolean => {
  if (LOCAL_HOSTNAMES.has(hostname)) {
    return true;
  }
  if (hostname.endsWith('.local')) {
    return true;
  }
  return PRIVATE_IPV4_PATTERN.test(hostname);
};

const readConfiguredSocketUrl = () => process.env.NEXT_PUBLIC_SOCKET_URL?.trim() ?? '';

const isVercelDeployment = () => Boolean(process.env.VERCEL) || Boolean(process.env.VERCEL_ENV);

export const validateWebEnvAtStartup = () => {
  if (!isVercelDeployment()) {
    return;
  }
  if (!readConfiguredSocketUrl()) {
    throw new Error(
      'NEXT_PUBLIC_SOCKET_URL is required for deployed web environments. Set it to the Fly realtime server origin.'
    );
  }
};

export const resolveSocketUrl = (): string => {
  const configuredUrl = readConfiguredSocketUrl();
  if (configuredUrl) {
    return configuredUrl;
  }

  if (typeof window === 'undefined') {
    return 'http://localhost:3001';
  }

  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  const hostname = window.location.hostname;
  const fallbackUrl = `${protocol}//${hostname}:3001`;
  const isProductionBuild = process.env.NODE_ENV === 'production';

  if (isProductionBuild && !isLocalLikeHostname(hostname)) {
    throw new Error(
      'NEXT_PUBLIC_SOCKET_URL is required for deployed web environments. Configure it before serving production traffic.'
    );
  }

  return fallbackUrl;
};
