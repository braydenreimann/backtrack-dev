import { createSign } from 'crypto';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

const MAX_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 180;

const encodeBase64Url = (value) => {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
};

const readText = (path, label) => {
  if (!existsSync(path)) {
    throw new Error(`Missing ${label} at ${path}`);
  }
  return readFileSync(path, 'utf-8');
};

const parseCredentialValue = (content, label) => {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`${escapedLabel}:\\s*([^\\n\\r]+)`, 'i'));
  return match?.[1]?.trim() ?? '';
};

const resolvePrivateKeyPath = (rootDir, keyId) => {
  const keysDir = resolve(rootDir, 'keys');
  if (!existsSync(keysDir)) {
    throw new Error(`Missing keys directory at ${keysDir}`);
  }

  const expectedName = `AuthKey_${keyId}.p8`;
  const expectedPath = resolve(keysDir, expectedName);
  if (existsSync(expectedPath)) {
    return expectedPath;
  }

  const fallback = readdirSync(keysDir).find((name) => name.endsWith('.p8'));
  if (!fallback) {
    throw new Error(`No .p8 key found in ${keysDir}`);
  }
  return resolve(keysDir, fallback);
};

export const loadAppleMusicCredentials = (options = {}) => {
  const rootDir = options.rootDir ?? process.cwd();
  const credentialsPath = resolve(rootDir, 'credentials', 'musickit.txt');
  const credentialsText = readText(credentialsPath, 'MusicKit credentials file');

  const teamId = parseCredentialValue(credentialsText, 'Team ID');
  const keyId = parseCredentialValue(credentialsText, 'Apple Media Services Key ID');
  const mediaId = parseCredentialValue(credentialsText, 'Apple Media Services Media ID');

  if (!teamId) {
    throw new Error('Missing Team ID in credentials/musickit.txt');
  }
  if (!keyId) {
    throw new Error('Missing Apple Media Services Key ID in credentials/musickit.txt');
  }
  if (!mediaId) {
    throw new Error('Missing Apple Media Services Media ID in credentials/musickit.txt');
  }

  const keyPath = resolvePrivateKeyPath(rootDir, keyId);
  const privateKey = readText(keyPath, '.p8 private key').trim();

  if (!privateKey.includes('BEGIN PRIVATE KEY')) {
    throw new Error(`Invalid private key content in ${keyPath}`);
  }

  return {
    teamId,
    keyId,
    mediaId,
    privateKey,
    keyPath,
  };
};

export const createDeveloperToken = (options) => {
  const nowMs = options.nowMs ?? Date.now();
  const ttlSeconds = Math.max(60, Math.min(options.ttlSeconds ?? 60 * 55, MAX_TOKEN_TTL_SECONDS));
  const issuedAtSeconds = Math.floor(nowMs / 1000);
  const expiresAtSeconds = issuedAtSeconds + ttlSeconds;

  const header = {
    alg: 'ES256',
    kid: options.keyId,
    typ: 'JWT',
  };

  const payload = {
    iss: options.teamId,
    iat: issuedAtSeconds,
    exp: expiresAtSeconds,
  };

  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signer = createSign('SHA256');
  signer.update(signingInput);
  signer.end();

  // ES256 JWT signatures must use JOSE (IEEE-P1363) format, not DER.
  const signature = signer.sign({
    key: options.privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  const encodedSignature = signature
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return {
    token: `${signingInput}.${encodedSignature}`,
    expiresAtMs: expiresAtSeconds * 1000,
  };
};
