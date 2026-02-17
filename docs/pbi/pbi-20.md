# PBI 20: Replace iTunes Search API with Apple MusicKit (Catalog‑Only)

## Summary
Replace the current runtime usage of the **iTunes Search API** with the **Apple Music API (MusicKit)**.  
Backtrack will stop searching by title/artist at play time and instead rely on **stable Apple Music catalog song IDs** stored per card.

All Apple Music usage in this PBI is **unauthorized (developer‑token only)**.  
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
- Apple Music **catalog search** for one‑time ingestion
- Generation of a new `deck.json` file derived from `cards.json`
- Apple Music **lookup by catalog song ID** at runtime
- Developer‑token authentication only (no Music‑User‑Token)
- Card schema update to persist Apple Music identifiers and metadata
- Removal of all iTunes Search API calls

### Out of Scope
- Apple Music user authorization or subscriptions
- Marketing / attribution requirements
- Apple Music Feed
- International storefront support (US only)
- Server‑side audio streaming
- Ongoing deck refresh / re‑verification

---

## Credentials & Configuration (Development)

- Apple Music **.p8 private key**
  - Stored in `/keys`
  - Temporarily committed (repository is private)
- All other Apple Music credentials
  - Stored in `/credentials/musickit.txt`
- Azure DevOps secrets are **not** in use yet

If a required credential is missing and execution cannot proceed, **stop and request the credential**.

Storefront:
- Default storefront: `us`

---

## Data Generation Strategy

### Source File
- `cards.json` remains the human‑authored source of truth

### Generated File
- Create a new file: `deck.json`
- `deck.json` is **fully generated** and must not be manually edited

### Generation Rules
For each item in `cards.json`:

1. Query Apple Music catalog search using `title + artist`
2. Select the best matching catalog song
3. Fetch full Apple Music metadata for that song
4. Construct a new card object populated with Apple Music metadata
5. Append the card to `deck.json`

If a song is **unavailable or cannot be resolved**:
- Append the song name to `unavailable.txt`
- Omit the song from `deck.json`

Only deck generation is in scope.  
Refreshing or re‑verifying metadata will be handled in a future PBI.

---

## Card Schema (deck.json)

Each generated card must include Apple Music catalog identifiers and resolved metadata.

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

### One‑Time Ingestion
- Use Apple Music **catalog search** to resolve `title + artist`
- Select best match
- Fetch full catalog metadata
- Persist results into `deck.json`
- No runtime searching after ingestion

### Runtime Lookup
Playback and metadata resolution must use **lookup‑by‑ID only**.

```
GET /v1/catalog/us/songs/{songId}
Authorization: Bearer <developer_token>
```

---

## Client Playback (Unauthorized MusicKit)

The following snippets are **illustrative examples only**.  
For authoritative and up‑to‑date usage, always refer to **Apple MusicKit official documentation**.

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

Without user authorization, playback may be preview‑only. This is expected.

---

## Runtime Flow
1. Game logic selects a card from `deck.json`
2. Card provides `songId`
3. Client queues the song via MusicKit
4. MusicKit handles playback

No title/artist search occurs at runtime.

---

## Error Handling
- Do **not** pre‑verify songs at play time
- On playback failure:
  - Skip the card
  - Mark as unavailable
  - Queue for admin review / remap
- Treat song unavailability as expected data, not an error

---

## Acceptance Criteria
- No usage of iTunes Search API remains
- `deck.json` is generated from `cards.json`
- Unavailable songs are written to `unavailable.txt`
- Cards persist Apple Music `songId`, storefront, and metadata
- Runtime playback queues songs by catalog ID only
- Apple Music calls succeed using developer token only
- Gameplay remains performant with no added latency

---

## Notes
- Apple Music supports 150+ storefronts; Backtrack Classic uses `us`
- Storefront is stored per card for future extensibility
- Catalog IDs are stable; metadata may change
