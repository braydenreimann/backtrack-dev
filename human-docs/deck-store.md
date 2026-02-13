Backtrack Deck Store Layout Specification

This document defines the recommended structure, layout, and intent of the Backtrack Deck Store. It is written to be implementation-ready for design and engineering, while remaining product-aligned with Backtrack’s deck economy decisions.

⸻

Design Goals

The Deck Store exists to help users answer one question quickly:

“Which deck should we play tonight?”

It is not designed to:
	•	compare deck sizes competitively
	•	surface internal tiers (Small / Standard / Flagship)
	•	push monetization aggressively

Instead, it should:
	•	emphasize vibe and use case
	•	treat all decks as complete premium experiences
	•	naturally surface Backtrack: Definitive as the broad default

⸻

High-Level Page Structure

The page is a vertical stack of rows:
	1.	Header / Page Title
	2.	Featured Decks (Hero Row)
	3.	Host Pass CTA (conditional)
	4.	Browse by Vibe (multiple category rows)
	5.	Footer / Secondary Info

[ Header ]

[ Featured Decks ]

[ Host Pass CTA ]   (only if not owned)

[ Browse by Vibe ]
  ├─ Party & Sing-Alongs
  ├─ Genres
  ├─ Global & International
  ├─ Soundtracks & Themes
  └─ Seasonal / Special


⸻

Row 1: Featured Decks (Hero Row)

Purpose
	•	Guide first-time users
	•	Surface Backtrack: Definitive naturally
	•	Highlight 1–2 rotating Standard decks

Desktop Layout (≥1024px)
	•	Grid: 12 columns
	•	Cards:
	•	Backtrack: Definitive → spans 6 columns
	•	Featured Standard Deck → 3 columns
	•	Featured Standard Deck → 3 columns

| Definitive (6) | Standard (3) | Standard (3) |

Tablet Layout (768–1023px)

| Definitive (8) |
| Standard (4) | Standard (4) |

Mobile Layout (≤767px)

| Definitive |
| Standard   |
| Standard   |

Visual Notes
	•	Definitive card is taller and visually richer
	•	Badges allowed: “Recommended”, “Included with Host Pass”
	•	Do not show tier labels

⸻

Row 2: Host Pass CTA (Conditional)

Visibility
	•	Shown only if the user does not own the Host Pass

Purpose
	•	Explain the value of the Host Pass
	•	Provide a clean upgrade path

Desktop Layout
	•	Full-width (12 columns)
	•	Slim horizontal card

| Unlock Backtrack: Definitive + Pick 1 Deck | [Upgrade $7.99] |

Mobile Layout
	•	Full-width stacked layout
	•	CTA button spans full width

Copy Guidelines
	•	Emphasize hosting benefit
	•	Avoid urgency or pressure
	•	Example:
“Upgrade your host experience. One-time purchase.”

⸻

Row 3: Browse by Vibe (Main Catalog)

This section contains multiple category sub-rows, each grouped by experience rather than size.

Example Categories
	•	Party & Sing-Alongs
	•	Genres
	•	Global & International
	•	Soundtracks & Themes
	•	Seasonal / Special

Each category consists of:
	1.	A section header
	2.	A deck grid

⸻

Category Sub-Row Structure

Header
	•	Full-width
	•	Clear, friendly language

Party & Sing-Alongs

Deck Grid

Desktop
	•	Grid: 12 columns
	•	Cards: 3 columns each → 4 decks per row

| Deck | Deck | Deck | Deck |

Tablet
	•	2 decks per row

| Deck | Deck |
| Deck | Deck |

Mobile
	•	1 deck per row

| Deck |
| Deck |
| Deck |

Decks are left-aligned; no filler cards.

⸻

Individual Deck Card Layout

Each deck card should follow a consistent internal structure:

┌─────────────────────────┐
│ Deck Artwork            │
│                         │
│ Deck Name               │
│ 1-line description      │
│                         │
│ ~500 songs · $3.99      │
│ [Buy] / [Owned]         │
└─────────────────────────┘

Rules
	•	Artwork dominates visual weight
	•	Deck size is shown quietly (“~500 songs”)
	•	Price is visible but secondary
	•	“Owned” replaces price if already purchased

⸻

Special Handling: Backtrack: Definitive

If listed outside the Featured row:
	•	Place under a category like “Complete Experiences” or “Core”
	•	Use a subtle “Definitive” badge
	•	Avoid direct side-by-side size comparison with Standard decks

Definitive should feel central, not competitive.

⸻

Summary Table

Section	Desktop Columns	Cards per Row
Featured	6 / 3 / 3	3 total
Host Pass CTA	12	1
Browse Categories	3	4
Tablet Browse	4	2
Mobile Browse	12	1


⸻

Design Intent (Non-Negotiable)
	•	Users choose based on vibe, not math
	•	All decks feel premium and intentional
	•	Definitive is featured, not ranked
	•	Tiering exists only in internal logic

All Backtrack decks are complete experiences. Some are focused. One is definitive.

This principle should guide all future deck store iterations.