#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { createDeveloperToken, loadAppleMusicCredentials } from '../lib/server/apple-music-auth.js';

const ROOT_DIR = process.cwd();
const STOREFRONT = process.env.APPLE_MUSIC_STOREFRONT?.trim() || 'us';
const SEARCH_LIMIT = 10;
const RETRY_ATTEMPTS = 3;

const cardsPath = resolve(ROOT_DIR, 'cards.json');
const deckPath = resolve(ROOT_DIR, '/server/data/deck.json');
const unavailablePath = resolve(ROOT_DIR, 'logs/unavailable.txt');

const normalizeText = (value) => {
  return value
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(feat|featuring|ft)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
};

const parseYear = (releaseDate) => {
  if (typeof releaseDate !== 'string' || releaseDate.length < 4) {
    return null;
  }
  const parsed = Number.parseInt(releaseDate.slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const delay = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

const parseJsonFile = (path) => {
  return JSON.parse(readFileSync(path, 'utf-8'));
};

const buildAuthHeader = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/json',
});

const fetchJsonWithRetry = async (url, token) => {
  let lastError = null;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: buildAuthHeader(token),
      });

      if (response.ok) {
        return await response.json();
      }

      if (response.status === 404) {
        return null;
      }

      const body = await response.text();
      const error = new Error(`HTTP ${response.status}: ${body.slice(0, 240)}`);
      if (response.status === 429 || response.status >= 500) {
        lastError = error;
        await delay(250 * attempt);
        continue;
      }
      throw error;
    } catch (error) {
      lastError = error;
      if (attempt < RETRY_ATTEMPTS) {
        await delay(250 * attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unknown Apple Music request failure.');
};

const scoreCandidate = (card, candidate) => {
  const attrs = candidate.attributes ?? {};
  const cardTitle = normalizeText(card.title);
  const cardArtist = normalizeText(card.artist);
  const candidateTitle = normalizeText(attrs.name ?? '');
  const candidateArtist = normalizeText(attrs.artistName ?? '');

  let score = 0;

  if (candidateTitle === cardTitle) {
    score += 120;
  } else if (candidateTitle.includes(cardTitle) || cardTitle.includes(candidateTitle)) {
    score += 70;
  }

  if (candidateArtist === cardArtist) {
    score += 120;
  } else if (candidateArtist.includes(cardArtist) || cardArtist.includes(candidateArtist)) {
    score += 70;
  }

  const releaseYear = parseYear(attrs.releaseDate);
  if (releaseYear !== null) {
    const delta = Math.abs(releaseYear - card.year);
    if (delta === 0) {
      score += 30;
    } else if (delta <= 1) {
      score += 20;
    } else if (delta <= 3) {
      score += 10;
    }
  }

  if (candidateTitle.includes('live') && !cardTitle.includes('live')) {
    score -= 10;
  }

  return score;
};

const getBestSearchMatch = (card, data) => {
  const songs = data?.results?.songs?.data;
  if (!Array.isArray(songs) || songs.length === 0) {
    return null;
  }

  const ranked = songs
    .filter((candidate) => typeof candidate?.id === 'string')
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(card, candidate),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return String(a.candidate.id).localeCompare(String(b.candidate.id));
    });

  return ranked[0]?.candidate ?? null;
};

const toDeckCard = (card, song, storefront, lastVerifiedAt) => {
  const attrs = song.attributes ?? {};
  return {
    title: card.title,
    artist: card.artist,
    year: card.year,
    am: {
      storefront,
      songId: String(song.id),
      isrc: typeof attrs.isrc === 'string' && attrs.isrc.trim().length > 0 ? attrs.isrc : null,
      matchedTitle: typeof attrs.name === 'string' && attrs.name.trim().length > 0 ? attrs.name : card.title,
      matchedArtist:
        typeof attrs.artistName === 'string' && attrs.artistName.trim().length > 0
          ? attrs.artistName
          : card.artist,
      matchedAlbum:
        typeof attrs.albumName === 'string' && attrs.albumName.trim().length > 0 ? attrs.albumName : null,
      durationMs: typeof attrs.durationInMillis === 'number' ? attrs.durationInMillis : null,
      explicit: attrs.contentRating === 'explicit',
      lastVerifiedAt,
    },
  };
};

const generateDeck = async () => {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is unavailable in this Node runtime.');
  }

  const cards = parseJsonFile(cardsPath);
  if (!Array.isArray(cards)) {
    throw new Error('cards.json must contain an array.');
  }

  const credentials = loadAppleMusicCredentials({ rootDir: ROOT_DIR });
  const { token } = createDeveloperToken({
    teamId: credentials.teamId,
    keyId: credentials.keyId,
    privateKey: credentials.privateKey,
    ttlSeconds: 60 * 55,
  });

  const deck = [];
  const unavailable = [];
  const lastVerifiedAt = new Date().toISOString();

  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    if (!card || typeof card !== 'object') {
      unavailable.push(`Invalid card at index ${index}`);
      continue;
    }

    const title = typeof card.title === 'string' ? card.title.trim() : '';
    const artist = typeof card.artist === 'string' ? card.artist.trim() : '';
    const year = typeof card.year === 'number' ? card.year : NaN;

    if (!title || !artist || !Number.isFinite(year)) {
      unavailable.push(`${title || 'Unknown Title'} - ${artist || 'Unknown Artist'}`);
      continue;
    }

    const printable = `${title} - ${artist}`;
    process.stdout.write(`[${index + 1}/${cards.length}] ${printable}\n`);

    const searchTerm = encodeURIComponent(`${title} ${artist}`);
    const searchUrl = `https://api.music.apple.com/v1/catalog/${storefrontSafe(STOREFRONT)}/search?types=songs&limit=${SEARCH_LIMIT}&term=${searchTerm}`;

    let searchData;
    try {
      searchData = await fetchJsonWithRetry(searchUrl, token);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'search failed';
      throw new Error(`Apple Music search failed for "${printable}": ${reason}`);
    }

    const match = getBestSearchMatch({ title, artist, year }, searchData);
    if (!match) {
      unavailable.push(printable);
      continue;
    }

    let songLookup;
    try {
      const lookupUrl = `https://api.music.apple.com/v1/catalog/${storefrontSafe(STOREFRONT)}/songs/${encodeURIComponent(String(match.id))}`;
      songLookup = await fetchJsonWithRetry(lookupUrl, token);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'lookup failed';
      throw new Error(`Apple Music song lookup failed for "${printable}": ${reason}`);
    }

    const song = songLookup?.data?.[0] ?? null;
    if (!song || typeof song?.id !== 'string') {
      unavailable.push(printable);
      continue;
    }

    deck.push(toDeckCard({ title, artist, year }, song, STOREFRONT, lastVerifiedAt));
  }

  mkdirSync(dirname(unavailablePath), { recursive: true });
  writeFileSync(deckPath, `${JSON.stringify(deck, null, 2)}\n`);
  writeFileSync(unavailablePath, unavailable.length > 0 ? `${unavailable.join('\n')}\n` : '');

  process.stdout.write(`\nGenerated ${deck.length} deck cards. Unavailable: ${unavailable.length}.\n`);
};

const storefrontSafe = (value) => {
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : 'us';
};

void generateDeck().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown deck generation failure.';
  process.stderr.write(`Deck generation failed: ${message}\n`);
  process.exitCode = 1;
});
