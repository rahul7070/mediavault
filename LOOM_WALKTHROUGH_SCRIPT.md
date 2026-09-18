# Loom Video Walkthrough — Script & Screen Action Guide

**Target Duration:** 6–8 minutes (Do not exceed 10 minutes).  
**Tone:** Confident, senior engineering mindset, direct and practical. Stumbles or pauses are 100% fine.

---

## Pre-Recording Setup (2 Minutes Before Hitting Record)

1. **Terminal:**
   - Ensure the app is running: `npm run dev` (API on `8787`, app on `5173`).
   - Check API health: `http://localhost:8787/api/health` should return `{"chaos": true, "latency": true}`.
2. **Browser (Google Chrome):**
   - Open `http://localhost:5173`.
   - Open Chrome DevTools (`Cmd + Option + I`), go to the **Network** tab, and filter by **`Fetch/XHR`**.
3. **Code Editor (VS Code):**
   - Have three files open in tabs:
     1. `src/api/client.ts`
     2. `src/App.tsx`
     3. `src/features/assets/AssetCard.tsx`
4. **Loom Settings:**
   - Select **Screen + Camera** (or Screen only if preferred).
   - Microphone tested and clear.

---

## Segment-by-Segment Cue Sheet

```
+-------------------------------------------------------------------------+
| TIME        | SECTION                 | WHAT IS ON SCREEN               |
+-------------------------------------------------------------------------+
| 0:00 - 0:45 | Intro & Context         | MediaVault Browser Window       |
| 0:45 - 3:30 | Live UI Demo (Chaos ON) | Browser + DevTools Network Tab  |
| 3:30 - 6:00 | Code Walkthrough        | VS Code (3 Key Decisions)       |
| 6:00 - 7:15 | Trade-offs & Wrap-up    | SUBMISSION.md / Browser         |
+-------------------------------------------------------------------------+
```

---

### Segment 1: Introduction (0:00 – 0:45)

#### Screen:
- MediaVault app open in browser at `http://localhost:5173`.

#### What to Say:
> *"Hi everyone, my name is [Your Name]. Today I’m walking you through my implementation of the MediaVault frontend assessment for the Senior Frontend Engineer role at Switchon.*
>
> *MediaVault is an internal digital asset library for 12,400 assets. The baseline code suffered from race conditions under latency, unbounded DOM nodes, unhandled partial failures, and complete lack of keyboard accessibility.*
>
> *I rebuilt the client architecture using TanStack Query and TanStack Virtual, backed by a resilient network client. I’m running this demo with both chaos mode and artificial latency fully enabled on the backend. Let’s jump straight into the demo."*

---

### Segment 2: Live UI Demonstration with Chaos ON (0:45 – 3:30)

#### Test 1: Search Race Condition & Request Cancellation (0:45 – 1:30)
- **Screen Action:**
  - Clear the Network tab in DevTools.
  - In the search bar, type `tr`, pause for half a second (you'll see `q=tr` pending in the Network tab).
  - Immediately type `ail runner`.
- **What to Say:**
  > *"First, let's look at search concurrency. The backend artificially adds up to 700ms of latency for short prefixes like `tr`, while longer phrases resolve in ~100ms. In a naive app, the slow `tr` response arrives last and overwrites the view with the wrong items.*
  >
  > *Watch the Network tab here: our search is debounced by 250ms, and as soon as the user continues typing, TanStack Query and our client issue an `AbortController` cancellation. Notice `q=tr` is marked `(canceled)` in red, and only the newest `trail runner` query resolves with 200 OK. The grid never flickers or displays stale rows, and the state is synchronized in the URL."*

---

#### Test 2: Scale, Virtualization & Layout Stability (1:30 – 2:15)
- **Screen Action:**
  - Clear the search box to view the full library.
  - Smoothly scroll down through hundreds of items in the grid.
  - Open DevTools Elements tab briefly (or mention the DOM count): show that only ~40 cards exist in the DOM.
- **What to Say:**
  > *"Next is scale. We have 12,400 assets in this dataset. Without virtualization, mounting 5,000 DOM nodes would choke the browser main thread and cause heavy layout thrashing.*
  >
  > *Using TanStack Virtual, our rendered card count is strictly bounded to the viewport—consistently between 36 and 48 elements. Notice that thumbnails load lazily, and for missing thumbnails, we pre-check `hasThumbnail` and render an SVG fallback with an exact 16:10 aspect ratio, ensuring zero Cumulative Layout Shift (CLS)."*

---

#### Test 3: Bulk Actions & 207 Partial Failure Rollback (2:15 – 2:50)
- **Screen Action:**
  - Click the checkbox on the first card.
  - Hold `Shift` and click a card 3 rows down (or click 'Select all loaded' in the floating bulk bar).
  - Point to the floating bulk bar: click **"Set Approved"**.
  - A toast notification will appear: e.g., *"Partial update: X succeeded, Y failed (on legal hold / conflicts)"*.
  - Show the "Retry Conflicts" button in the toast.
- **What to Say:**
  > *"Now for reviewer workflows: bulk operations. Reviewers select dozens of assets at once. Our client supports Shift-click range selection, chunks requests to stay under the server's 50-ID hard cap, and bounds concurrency to 2 parallel requests.*
  >
  > *Notice that when I apply 'Approved', the UI updates optimistically. The server returns a 207 Multi-Status because assets tagged `legal-hold` cannot be archived or changed. Our client rolls back ONLY the failed subset to its snapshot state, leaves the successful assets untouched, and surfaces an actionable summary toast with a 1-click 'Retry Conflicts' action."*

---

#### Test 4: Keyboard Navigation & Detail Panel (2:50 – 3:30)
- **Screen Action:**
  - Take your hands off the mouse.
  - Use `Arrow Keys` (Down, Right, Left, Up) to navigate between cards.
  - Press `Space` to toggle selection on a focused card.
  - Press `Enter` to open the Asset Detail panel.
  - Show that focus has moved into the panel.
  - Press `Escape` — panel closes and focus returns to the card you were on.
- **What to Say:**
  > *"Finally, full keyboard accessibility. Using a roving tabindex composite widget model, reviewers can navigate the entire grid using Arrow keys, toggle selection with Space, and open the detail panel with Enter.*
  >
  > *Opening the drawer moves focus directly into the panel, and pressing Escape dismisses it, restoring focus precisely to the triggering card in the grid. All status changes and result counts are announced via an ARIA live region for screen reader users."*

---

#### Test 5: Bonus Tracks — Non-Blocking Stats, Live SSE, and Offline Queue (3:30 – 4:00)
- **Screen Action:**
  - Point to the header: show **12,400 assets • 2.0 TB • approved count** and the pulsing **"Live sync"** badge.
  - In DevTools Network tab, switch throttling to **"Offline"**.
  - Click on a card, open detail panel, and click "Approved".
  - Show the topbar **"1 pending sync"** badge and offline alert.
  - Switch DevTools back to **"No throttling"** (Online).
  - Show the toast notification: *"Offline changes synchronized"* and badge clearing automatically.
- **What to Say:**
  > *"We also implemented the bonus tracks from the brief:
  > First, a non-blocking `/api/stats` header: although the endpoint carries an artificial 1.1s delay, it loads asynchronously in the background with zero layout shift.
  > Second, real-time Server-Sent Events (`/api/events`) with conflict shielding so incoming background updates never clobber active reviewer edits.
  > And third, an offline mutation queue: when connectivity drops, writes are safely stored in local storage, and as soon as office wifi reconnects, the queue drains automatically with bounded concurrency and announces recovery."*

---

### Segment 3: Code Architecture (4:00 – 6:00)

*Switch screen to VS Code.*

#### Decision 1: Network Resilience & Structural Retries (`src/api/client.ts`) (4:00 – 4:40)
- **Screen:** Open `src/api/client.ts`, highlight `ApiError` and `executeRequestWithRetry`.
- **What to Say:**
  > *"Let's look at three key code decisions. First, in `client.ts`: we created a structured `ApiError` class. The server throws intermittent 503s, 429 rate limits, and 500 write failures.
  >
  > Rather than string-matching error messages, we discriminate structurally: 503, 429, and 500 are retried with exponential backoff and jitter, strictly honoring the server's `Retry-After` header. Non-retryable errors like 400 stale cursor, 409 version conflict, and 422 are never retried, preventing retry storms."*

---

#### Decision 2: Optimistic State & 207 Rollbacks (`src/App.tsx`) (4:40 – 5:20)
- **Screen:** Open `src/App.tsx`, scroll to `applyBulkStatus`.
- **What to Say:**
  > *"Second, optimistic state management. In `App.tsx: applyBulkStatus`, before firing the network request, we snapshot the affected assets in a Map and immediately mutate the TanStack Query cache in-place.
  >
  > When the 207 response arrives with per-item outcomes, we inspect the `results` array. Any item that failed is restored from `previousAssetsMap`, while successes stay applied. This keeps optimistic UI honest without requiring full cache invalidations or jumping the user's scroll position."*

---

#### Decision 3: Re-render Isolation & Performance Budget (`src/features/assets/AssetCard.tsx`) (5:20 – 6:00)
- **Screen:** Open `src/features/assets/AssetCard.tsx`, highlight `React.memo` and custom comparator at the bottom.
- **What to Say:**
  > *"Third, performance and re-render isolation. In the baseline code, `selectedIds` was passed into the grid, causing all rendered cards to re-render whenever a single checkbox was toggled.
  >
  > I isolated `AssetCard` with `React.memo` and a custom comparator that only compares primitive booleans (`isSelected`, `isActive`, `isFocused`). Toggling a card re-renders strictly that 1 card ($O(1)$ updates). Our production bundle is 76.5 kB gzipped, which is well justified by the inclusion of TanStack Query, Virtualizer, and offline resilience."*

---

### Segment 4: Trade-offs & Wrap-Up (6:00 – 7:00)

#### Screen:
- Switch back to the deployed app (`https://mediavault-eta.vercel.app`) or `SUBMISSION.md`.

#### What to Say:
> *"To close out:
> 
> We chose `localStorage` for our offline mutation queue to keep the production bundle extremely tight rather than pulling in heavy external IndexedDB libraries. For selection, we chose standard OS-style Click, Shift+Click, and Shift+Arrow range selection over canvas marquee dragging to ensure complete keyboard and screen reader accessibility.
> 
> The app is deployed live on Vercel at `mediavault-eta.vercel.app`, passes strict TypeScript compilation with zero errors, and is backed by a clean Git history.
> 
> Thank you for reviewing my submission, and I look forward to discussing this in the live interview round!"*

---

## Pro-Tips for Recording

1. **Don't restart if you stumble:** A small pause or re-phrasing makes you sound human and authentic. The brief explicitly says: *"Unedited, one take, a stumble or two — completely fine."*
2. **Speak at a steady pace:** 7 minutes is plenty of time when you follow the cue sheet above.
3. **Keep the Network tab visible during the demo:** Seeing `(canceled)` and `200` in the Network tab is the strongest visual proof of senior-level asynchronous handling.
4. **Copy the link immediately:** Once Loom finishes processing, copy the link, paste it into line 7 of `SUBMISSION.md`, commit and push, and send your email!
