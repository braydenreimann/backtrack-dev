# PBI 20: Replace iTunes Search API with Apple MusicKit
  

## Summary
Replace the current runtime usage of the ****iTunes Search API**** with the ****Apple Music API (MusicKit)****.  
Backtrack will stop searching by title/artist at play time and instead rely on ****stable Apple Music catalog song IDs**** stored per card.
  

All Apple Music usage in this PBI is ****unauthorized (developer‑token only)****.  
User authorization, subscriptions, and marketing assets are explicitly out of scope.
  

---
  

## Motivation
The iTunes Search API introduces:
- Non‑deterministic matches (covers, remasters, compilations)
- Runtime latency and rate‑limit risk
- Fragility when metadata changes
  

Apple Music catalog IDs provide:
- Stable, long‑lived identifiers
- Deterministic lookup and playback
- A clean future upgrade path to authorized playback
  

---
  

## Scope
  

### In Scope
- Apple Music ****catalog search**** (one‑time backfill / ingestion)
- Apple Music ****lookup by catalog song ID**** at runtime
- Developer‑token authentication only (no Music‑User‑Token)
- Card schema update to persist Apple Music identifiers
- Removal of iTunes Search API calls
  

### Out of Scope
- Apple Music user authorization or subscriptions
- Marketing / attribution requirements
- Apple Music Feed
- International storefront support (US only)
- Server‑side audio streaming
  

---
  

## Credentials & Configuration (Development)
> Stored in Azure DevOps secrets. ****Never committed to the repo.****
  

- Apple Developer ****Team ID**** (configured)
- Apple Media Services ****Key ID**** (configured)
- Apple Media Services ****Media ID****:  
  `media.com.braydenreimann.backtrack`
- Apple Music ****.p8 private key**** (stored locally under `Programming/keys`, injected via secrets)
  

Storefront:
- Default storefront: `us`
  

---
  

## Data Model Changes
  

### Card Schema (Updated)
Each card must persist its Apple Music catalog identifier.
  

```json
{
  "title": "Chromakopia",
  "artist": "Tyler, the Creator",
  "year": 2025,
  "am": {
    "storefront": "us",
    "songId": "0123456789"
  }
}
```
  

### Optional Audit Metadata (Recommended)
Stored only to debug bad matches and validate ingestion.
  

```json
{
  "title": "Sweet Child O' Mine",
  "artist": "Guns N' Roses",
  "year": 1987,
  "am": {
    "storefront": "us",
    "songId": "269572838",
    "isrc": "USGF18714809",
    "matchedTitle": "Sweet Child O' Mine",
    "matchedArtist": "Guns N' Roses",
    "matchedAlbum": "Appetite for Destruction",
    "durationMs": 356000,
    "explicit": false,
    "lastVerifiedAt": "2026-02-15T00:00:00Z"
  }
}
```
  

---
  

## Apple Music API Usage
  

### One‑Time Ingestion / Backfill
- Use Apple Music ****catalog search**** to resolve `title + artist`
- Select best match
- Persist `songId` + `storefront`
- No runtime searching after ingestion
  

### Runtime Lookup
Playback and metadata resolution must use ****lookup‑by‑ID only****.
  

```
GET /v1/catalog/us/songs/{songId}
Authorization: Bearer <developer_token>
```
  

---
  

## Client Playback (Unauthorized MusicKit)
  

### Initialize MusicKit
```js
await MusicKit.configure({
  developerToken: "<developer_token>",
  app: {
    name: "Backtrack",
    build: "1.0.0"
  }
});
```
  

### Play by Catalog Song ID
```js
const music = MusicKit.getInstance();
  

await music.setQueue({
  song: "269572838"
});
  

await music.play();
```
  

> Without user authorization, playback may be preview‑only. This is expected.
  

---
  

## Runtime Flow
1. Game logic selects a card
2. Card provides `songId`
3. Client queues the song via MusicKit
4. MusicKit handles playback
  

No title/artist search occurs at runtime.
  

---
  

## Error Handling & Observability
- Do ****not**** pre‑verify songs at play time
- On playback failure:
  - Skip the card
  - Mark as unavailable
  - Queue for admin review/remap
- Report ****unexpected or systemic failures**** to Sentry
- Treat song unavailability as expected data, not an error
  

---
  

## Acceptance Criteria
- No usage of iTunes Search API remains
- Cards persist Apple Music `songId` and `storefront`
- Runtime playback queues songs by catalog ID only
- Apple Music calls succeed using developer token only
- Gameplay remains performant with no added latency
  

---
  

## Notes
- Apple Music has ****150+ storefronts**** globally; Backtrack Classic uses `us`
- Storefront is stored per card for future extensibility
- IDs are stable; metadata may change# PBI: Replace iTunes Search API with Apple MusicKit (Catalog‑Only)
  

## Summary
Replace the current runtime usage of the ****iTunes Search API**** with the ****Apple Music API (MusicKit)****.  
Backtrack will stop searching by title/artist at play time and instead rely on ****stable Apple Music catalog song IDs**** stored per card.
  

All Apple Music usage in this PBI is ****unauthorized (developer‑token only)****.  
User authorization, subscriptions, and marketing assets are explicitly out of scope.
  

---
  

## Motivation
The iTunes Search API introduces:
- Non‑deterministic matches (covers, remasters, compilations)
- Runtime latency and rate‑limit risk
- Fragility when metadata changes
  

Apple Music catalog IDs provide:
- Stable, long‑lived identifiers
- Deterministic lookup and playback
- A clean future upgrade path to authorized playback
  

---
  

## Scope
  

### In Scope
- Apple Music ****catalog search**** (one‑time backfill / ingestion)
- Apple Music ****lookup by catalog song ID**** at runtime
- Developer‑token authentication only (no Music‑User‑Token)
- Card schema update to persist Apple Music identifiers
- Removal of iTunes Search API calls
  

### Out of Scope
- Apple Music user authorization or subscriptions
- Marketing / attribution requirements
- Apple Music Feed
- International storefront support (US only)
- Server‑side audio streaming
  

---
  

## Credentials & Configuration (Development)
> Stored in Azure DevOps secrets. ****Never committed to the repo.****
  Note that Team ID, Key ID, and Media ID are not secrets. Only .p8 private key.

- Apple Developer ****Team ID**** (configured)
- Apple Media Services ****Key ID**** (configured)
- Apple Media Services ****Media ID****:  
  `media.com.braydenreimann.backtrack`
- Apple Music ****.p8 private key**** (stored locally under `Programming/keys`, injected via secrets)
  

Storefront:
- Default storefront: `us`
  

---
  

## Data Model Changes
  

### Card Schema (Updated)
Each card must persist its Apple Music catalog identifier.
  

```json
{
  "title": "Chromakopia",
  "artist": "Tyler, the Creator",
  "year": 2025,
  "am": {
    "storefront": "us",
    "songId": "0123456789"
  }
}
```
  

### Optional Audit Metadata (Recommended)
Stored only to debug bad matches and validate ingestion.
  

```json
{
  "title": "Sweet Child O' Mine",
  "artist": "Guns N' Roses",
  "year": 1987,
  "am": {
    "storefront": "us",
    "songId": "269572838",
    "isrc": "USGF18714809",
    "matchedTitle": "Sweet Child O' Mine",
    "matchedArtist": "Guns N' Roses",
    "matchedAlbum": "Appetite for Destruction",
    "durationMs": 356000,
    "explicit": false,
    "lastVerifiedAt": "2026-02-15T00:00:00Z"
  }
}
```
  

---
  

## Apple Music API Usage
  

### One‑Time Ingestion / Backfill
- Use Apple Music ****catalog search**** to resolve `title + artist`
- Select best match
- Persist `songId` + `storefront`
- No runtime searching after ingestion
  

### Runtime Lookup
Playback and metadata resolution must use ****lookup‑by‑ID only****.
  

```
GET /v1/catalog/us/songs/{songId}
Authorization: Bearer <developer_token>
```
  

---
  

## Client Playback (Unauthorized MusicKit)
  

### Initialize MusicKit
```js
await MusicKit.configure({
  developerToken: "<developer_token>",
  app: {
    name: "Backtrack",
    build: "1.0.0"
  }
});
```
  

### Play by Catalog Song ID
```js
const music = MusicKit.getInstance();
  

await music.setQueue({
  song: "269572838"
});
  

await music.play();
```
  

> Without user authorization, playback may be preview‑only. This is expected.
  

---
  

## Runtime Flow
1. Game logic selects a card
2. Card provides `songId`
3. Client queues the song via MusicKit
4. MusicKit handles playback
  

No title/artist search occurs at runtime.
  

---
  

## Error Handling & Observability
- Do ****not**** pre‑verify songs at play time
- On playback failure:
  - Skip the card
  - Mark as unavailable
  - Queue for admin review/remap
- Report ****unexpected or systemic failures**** to Sentry
- Treat song unavailability as expected data, not an error
  

---
  

## Acceptance Criteria
- No usage of iTunes Search API remains
- Cards persist Apple Music `songId` and `storefront`
- Runtime playback queues songs by catalog ID only
- Apple Music calls succeed using developer token only
- Gameplay remains performant with no added latency
  

---
  

## Notes
- Apple Music has ****150+ storefronts**** globally; Backtrack Classic uses `us`
- Storefront is stored per card for future extensibility
- IDs are stable; metadata may change