### Work
This file enumerates the tasks that should be completed, are in the process of being completed, and have been completed.

Definitions:

- **Host UI** - game UI displayed on the host device
- **Controller UI** - player UI displayed on phones

### Tasks

#### Short Term
1. Display myster card during `PLACE` on Host UI
- This corresponds to the display of the mystery card on the controller UI
- Add animation to the card to indicate it is "playing"
- If the mystery card has not been placed, do not append to timeline upon `REVEAL`
    - Instead of auto-placing in the timeline, the mystery card shall reveal in-place

2. Implement robust card color system
- Card color shall be assigned once and stored in deck/card metadata
- Map card colors (red, yellow, blue, green, purple) to HEX values on server
- Simplifies logic and ensures persistence of card colors

3. Swap iTunes Search API calls with Apple MusicKit
- Wherever the iTunes Search API is called, replace with calls to Apple MusicKit
- Do not yet enable authentication with a paid subscription of Apple Music
- Assume all hosts are unauthorized, and limit audio to preview clips

4. Implement a "game end" screen for Host UI
- Transition from final card placed (10th card) to win screen
- Display "Player X" won using existing overlay UI
- Create two buttons:
    - Play again: restarts the game, players do not have to re-join
    - Return: redirect to `/host`

5. Add "Host Identity Mode" (Guest vs Signed-in) scaffolding
- Host can be either:
    - Guest (local session)
        - Same game mode/flow as current
    - Signed-in (Clerk user)
- Define session storage for Guest (localStorage/cookie) with `guest_host_id`
- Add a simple banner on Host UI when Guest: "Guest session (temporary). Sign in to save progress / unlock additional modes"

#### Medium Term
1. Integrate Clerk (core auth)
- Set up Clerk project + env vars
- Add Clerk SDK to Host UI
- Implement Create Account/Sign In/Sign Out UI flows
- Require auth gates for various pages

2. Protect backend APIs with Clerk sessions
- Verify clerk session JWT on server for host-protected endpoints
- Define "public vs authenticated" routes
- Add basic auth error handling (401/403) in Host UI

3. User persistance in Postgres (Neon)
- Create users table (`clerk_user_id`, timestamps, optional internal UUID)
- On first authenticated request, upsert user row
- Store app-sepcific settings/preferences here (not in Clerk)

4. Auth abuse protections
- Configure rate limiting/anti-abuse for sign-up/sign-in as needed
- Add basic logging/monitoring for auth failures

5. Apple Music integration state storage
- Create `user_integrations` table
- Store Apple Music fields (`token_encrypted, `last_verified_at`, `status`)
- Optional: store `hasAppleMusicLinked` flag in Clerk private metadata, but treat DB as source of truth


**Store in Clerk**
- Identity and login state:
    - user id
    - emails/phone numbers
    - OAuth connections
    - sessions
- Small, non-sensitive flags that are purely auth/UI-related (optional):
    - `onboardingComplete`
    - `betaAccess`
    - `hasAppleMusicLinked` (flag, not the token)

**Store in your database**
- Anything that is "Backtrack data" or needs strong control/versioning:
    - Apple MusicKit authorization token (and related integration state)
    - Game progress, matche, stats
    - Purchases/subscriptions
    - Preferences, setting, inventory, deck ownership, etc.
    - Cache "has Apple Music subscription" with status `lastVerifiedAt`

6. Integrate Backtrack with Apple MusicKit
- Revise Host UI to comply with Apple MusicKit UI guidelines
    - Create new UI components or redesign existing UIs as necessary
- Define two gameplay modes, *Party* and *Concert*
    - Hosts shall choose between these two modes when starting a game
    - **Party mode (Default)**: Unauthorized/no Apple Music subscription
        - Current gameplay mode using 30-second previews
    - **Concert mode**: Authorized with Apple Music subscription
        - Stream full-length audio clips
- Design a robust authorization flow and persist authorization tokes to database

#### Long Term