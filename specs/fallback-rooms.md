# Spec: fallback rooms (`fallbackRoomIds`)

Status: approved for implementation (2026-10-08).

## Problem

A host page can pin the widget to one room with `roomIds: ["search"]`. If the
logged-in user cannot access that room, the widget dead-ends on
"No rooms available" with no way forward. This was reproduced against the
`../soliplex` Docker stack (soliplex 0.84) on 2026-10-08:

- Search room open to the user: the widget lands directly in Search & Answer.
- Search room made private: `GET /api/v1/rooms` returns only `chat`, the
  widget filters that list down to `["search"]`, gets nothing, and shows
  "No rooms available".

The host page should be able to name one or more rooms to fall back to, tried
in order, so the user still gets a working chat.

Scope: authenticated users only. Anonymous visitors are out of scope; the
widget shows the login screen before any room fetch whenever the backend has
OIDC configured, and the backend answers 401 to the room list for anonymous
callers.

## Backend facts the design relies on

Verified in the soliplex 0.84 package installed in the `soliplex-backend`
image:

- `GET /api/v1/rooms` (`views/rooms.py`, `get_rooms`) returns only the rooms
  the caller may access. Rooms are filtered through
  `RoomAuthorizationPolicy.filter_room_ids`, the same policy the chat
  endpoints enforce via `_check_user_in_room` in `views/agui.py`.
- `GET /api/v1/rooms/{id}` returns 404 for both "denied" and "does not
  exist" (`KeyError` is mapped to 404 in `get_room`). The widget cannot tell
  the two apart, and does not need to.
- A room with no policy row is open to every authenticated user. A policy
  row carries `default_allow_deny` plus ordered ACL entries matched against
  token claims; the first matching entry wins.

Consequence: "not accessible, for whatever reason" has exactly one
observable from the widget's side: the room ID is absent from the list. The
fallback chain is resolved from the single list request the widget already
makes. No per-room probing.

## Current widget behavior (for orientation)

- `widget/index.tsx` rewrites the legacy `roomId` into `roomIds: [roomId]`
  before rendering `ChatWidget`, and copies every option explicitly into
  `widgetConfig`.
- `components/ChatWidget.tsx` fetches the list in `fetchRooms`, filters it
  by `roomIds`, stores the result in `availableRooms`, then restores the
  persisted room (`soliplex-widget:{baseUrl}:room`) or auto-selects when
  exactly one room remains.
- `fetchSingleRoom` and the `roomId` branch of the fetch effect are
  unreachable from the bundle because of the rewrite above. The Next.js
  harness under `app/` does not pass `roomId` either.
- The header back button renders only when `availableRooms.length > 1`.
- Threads and messages are keyed per server and per room in
  `hooks/useAGUIChat.ts` (`soliplex-chat:{baseUrl}:{roomId}:messages` and
  `:thread`).

## Configuration

New option on `SoliplexChat.init(...)`:

| Option | Type | Default | Description |
|---|---|---|---|
| `fallbackRoomIds` | `string[]` | `undefined` | Room(s) to use when none of the configured `roomIds` are accessible. Holds a single room or several; entries are tried in order and the first accessible room wins. Ignored when `roomIds` is empty. |

Example:

```js
SoliplexChat.init({
  baseUrl: "https://api.example.com",
  roomIds: ["search"],
  fallbackRoomIds: ["search-lite", "chat"],
});
```

Normalization happens in `widget/index.tsx`, next to the existing
`roomId` → `roomIds` rewrite, so `ChatWidget` only ever sees `string[]`:

1. A value that is not an array is ignored with a `console.warn`
   ("fallbackRoomIds ignored because it is not an array").
2. Entries that are not non-empty strings are dropped.
3. Duplicates are dropped, keeping first occurrence.
4. Entries that also appear in `roomIds` are dropped.
5. If the result is non-empty but `roomIds` is empty, log
   `console.warn` once ("fallbackRoomIds ignored because roomIds is empty")
   and pass `undefined`.

## Semantics

- **Primaries always win.** If any entry of `roomIds` is accessible,
  behavior is identical to today. Fallbacks are never consulted.
- **Fallbacks are tried in order.** The widget lands in the first entry of
  `fallbackRoomIds` that is accessible, as a single auto-selected room with
  no room picker and no back button.
- **Nothing accessible.** The existing "No rooms available" empty state is
  shown. The existing Retry button on the error screen, and a reopen of the
  widget, re-run the whole resolution.
- **Several primaries.** Although the motivating case is a single static
  room, the rule "fallback only when none of the primaries are accessible"
  applies unchanged to `roomIds` with several entries.

## Resolution algorithm

Implemented inside `fetchRooms` in `components/ChatWidget.tsx`, replacing
the current filter step:

1. Fetch `GET /api/v1/rooms` with the bearer token, exactly as today. A
   non-2xx response or network failure still sets `roomsError` and shows the
   error screen with Retry.
2. Build `rooms` from the response as today.
3. If `roomIds` is empty: `availableRooms = rooms` (unchanged behavior),
   skip to step 7.
4. `primaries = roomIds.map(id => rooms.find(r => r.id === id)).filter(Boolean)`,
   preserving `roomIds` order.
5. If `primaries` is non-empty: `availableRooms = primaries`, skip to
   step 7.
6. Otherwise walk `fallbackRoomIds` in order and take the first ID present
   in `rooms`. If found: `availableRooms = [thatRoom]`. If not:
   `availableRooms = []`.
7. Apply the existing restore and auto-select logic to `availableRooms`
   unchanged: restore the persisted room if it is in the list, else
   auto-select when the list has exactly one entry.
8. When `debug` is true and a fallback was chosen, log
   `console.info("[SoliplexChat] primary room(s) not accessible, using fallback room", id)`.

Because step 7 only restores among whatever `availableRooms` holds, a
persisted fallback room never overrides a primary that has become
accessible: on the next load the primary is in the list and the fallback is
not, so the restore misses and the single primary auto-selects.

## Persistence

- No storage key changes. `soliplex-widget:{baseUrl}:room` keeps holding
  the last selected room ID, which may now be a fallback room.
- Conversations are already keyed per room, so a user who chats in a
  fallback room and later regains the primary keeps both threads intact.

## UI

- No new screens. The fallback room renders exactly like a single
  configured room: room name in the header, no back button.
- The "No rooms available" text is unchanged in this change.

## Code changes

1. `components/ChatWidget.tsx`
   - Add `fallbackRoomIds?: string[]` to `ChatWidgetConfig` with a comment.
   - Destructure it alongside `roomIds`.
   - Replace the filter block in `fetchRooms` with steps 3 to 8 above.
   - Remove `fetchSingleRoom`, the `roomId` branch in the fetch effect, and
     `roomId` from `ChatWidgetConfig`. They are dead in the bundle and in the
     harness. The legacy `roomId` stays supported at the `init` level via the
     existing rewrite in `widget/index.tsx`.
2. `widget/index.tsx`
   - Add the normalization above and copy `fallbackRoomIds` explicitly into
     `widgetConfig`.
3. Docs
   - `README.md`: add the option row after `roomIds`; extend the note under
     the table.
   - `docs/usage.md`: add the option row, and a "Fallback rooms" paragraph
     plus example under "Room Selection Behavior".
   - `public/index.html`: add the row to its options table so the demo page
     stays accurate.
4. Build and sync
   - `npx tsc --noEmit`, then `npm run build:widget`.
   - Commit `public/soliplex-chat.js` and `public/soliplex-chat.js.map`,
     and copy both into `docs/` so the copies stay identical.

## Verification

There is no automated test suite. Verify manually against the
`../soliplex` Docker stack, which has the rooms `chat` and `search` and the
Keycloak account `user`.

Test page: a static page that loads the freshly built bundle and
`soliplex-auth-callback.html` from the same directory, with
`baseUrl: "http://localhost:8000"`. The scratch page used for the baseline
on 2026-10-08 lives in the session scratchpad at `widget-test/index.html`,
served with `python3 -m http.server 8080`; it also logs every request to
`/api/v1/rooms` with its status and body.

Backend commands (run from `../soliplex`):

```bash
# Deny everyone on search (what was used for the baseline reproduction)
docker compose exec backend soliplex-cli room-authz make-private /environment/installation.yaml search

# Restore search to public
docker compose exec backend soliplex-cli room-authz make-public --update /environment/installation.yaml search

# Inspect
docker compose exec backend soliplex-cli room-authz --verbose show /environment/installation.yaml search
```

Note: `make-public` is a no-op when no policy row exists, and
`add-acl-entry` refuses to run without a policy row. To deny a single user
while leaving the room public, run `make-private`, then
`add-acl-entry --deny --preferred-username user`, then
`add-acl-entry --allow --authenticated` (entries are evaluated in creation
order, first match wins).

Cases, each after a page reload:

| # | search policy | config | Expected |
|---|---|---|---|
| 1 | private | `roomIds: ["search"]` (no fallback) | "No rooms available" (unchanged baseline) |
| 2 | private | `roomIds: ["search"], fallbackRoomIds: ["chat"]` | lands in Chat, no back button |
| 3 | private | `roomIds: ["search"], fallbackRoomIds: ["missing", "chat"]` | lands in Chat |
| 4 | private | `roomIds: ["search"], fallbackRoomIds: ["missing"]` | "No rooms available" |
| 5 | public | `roomIds: ["search"], fallbackRoomIds: ["chat"]` | lands in Search & Answer (primaries win) |
| 6 | public, after case 2 persisted `chat` | same as 5 | lands in Search & Answer, not the persisted fallback |
| 7 | any | `fallbackRoomIds: ["chat"]` with no `roomIds` | all rooms shown; console warning |
| 8 | any | `roomIds: ["search"], fallbackRoomIds: ["chat", "search", "", "chat"]` | behaves as `fallbackRoomIds: ["chat"]` |

Also confirm `debug: true` logs the fallback choice in case 2, and that the
Retry button after a forced network error re-resolves correctly.

## Out of scope

- Fallback for anonymous visitors (needs changes to auth gating).
- Re-resolving mid-session when a run request returns 404. The backend
  filters the list with the same policy it enforces on runs, so the list is
  authoritative at load time. If this ever changes, the error would need to
  be plumbed from `useAGUIChat` back to `ChatWidget` to advance the chain.
- Any change to the "No rooms available" copy.
