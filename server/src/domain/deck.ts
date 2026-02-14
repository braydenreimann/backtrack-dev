import { existsSync, readFileSync } from 'fs';
import { dirname, isAbsolute, parse, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { Card } from '../../../lib/contracts/game.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SERVER_PACKAGE_NAME = 'bt-mvp-server';
const DEFAULT_DECK_FILE = 'cards.json';

const readJsonFile = (path: string): unknown => {
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw);
};

const parseCard = (value: unknown, index: number): Card => {
  if (!value || typeof value !== 'object') {
    throw new Error(`Deck entry at index ${index} must be an object.`);
  }

  const entry = value as Partial<Card>;
  if (typeof entry.title !== 'string' || entry.title.trim().length === 0) {
    throw new Error(`Deck entry at index ${index} has an invalid title.`);
  }
  if (typeof entry.artist !== 'string' || entry.artist.trim().length === 0) {
    throw new Error(`Deck entry at index ${index} has an invalid artist.`);
  }
  if (typeof entry.year !== 'number' || !Number.isFinite(entry.year)) {
    throw new Error(`Deck entry at index ${index} has an invalid year.`);
  }

  return {
    title: entry.title.trim(),
    artist: entry.artist.trim(),
    year: entry.year,
  };
};

const parseDeck = (value: unknown): Card[] => {
  if (!Array.isArray(value)) {
    throw new Error('Deck file must contain an array of cards.');
  }
  if (value.length === 0) {
    throw new Error('Deck file cannot be empty.');
  }
  return value.map((entry, index) => parseCard(entry, index));
};

const findServerRoot = (): string => {
  let cursor = __dirname;
  const root = parse(cursor).root;

  while (true) {
    const packageJsonPath = resolve(cursor, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = readJsonFile(packageJsonPath) as { name?: string };
        if (packageJson?.name === SERVER_PACKAGE_NAME) {
          return cursor;
        }
      } catch {
        // Ignore malformed package.json candidates and continue traversal.
      }
    }

    if (cursor === root) {
      break;
    }
    cursor = dirname(cursor);
  }

  throw new Error(`Unable to resolve server root (${SERVER_PACKAGE_NAME}).`);
};

const resolveConfiguredDeckPath = (): string | null => {
  const configured = process.env.BACKTRACK_DECK_PATH?.trim();
  if (!configured) {
    return null;
  }
  return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
};

const resolveDefaultDeckPath = (): string => resolve(findServerRoot(), 'data', DEFAULT_DECK_FILE);

export const resolveDeckPath = (): string => resolveConfiguredDeckPath() ?? resolveDefaultDeckPath();

const loadDeck = (path: string): Card[] => parseDeck(readJsonFile(path));

export const baseDeckPath = resolveDeckPath();
export const baseDeck: Card[] = loadDeck(baseDeckPath);
