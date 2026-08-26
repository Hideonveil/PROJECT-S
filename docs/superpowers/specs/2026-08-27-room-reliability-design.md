# Room Reliability Design — 2026-08-27

## Decision

The server owns the Room snapshot. A browser may render an optimistic shell, but it must reconcile to a server-authoritative snapshot and never derive membership, recruitment eligibility, or session state from a local event alone.

## Product invariants

1. A Room roster displays active members only. An exited member is retained for audit/lifecycle records but not as a live player.
2. Ranked and Casual use the same Room surface. Ranked locks after the first compatible teammate; Casual stays recruiting until locked or full.
3. Casual fit information is limited to Game, Purpose (`休闲`), and Microphone. Rank and role are Ranked-only.
4. A member join or exit is visible to every current Room participant and does not require a full page render.
5. Chat history is read from the server, new sends are acknowledged by the server, and realtime is an acceleration path rather than the sole source of truth.
6. A stale Room shell may not re-open a closed Room after an explicit leave. A leave starts a local tombstone until the server snapshot confirms no recoverable Room.

## Transport contract

`RoomSnapshot` is the sole client render input for live Room state:

```ts
type RoomSnapshot = {
  room: Room;
  snapshotVersion: string;
  generatedAt: string;
};
```

The initial start response may contain a shell. Hydration and every realtime signal fetch the latest `RoomSnapshot`; an event only says that a snapshot may be newer. This avoids lost or reordered member events producing divergent rosters.

## References applied

- Supabase Realtime recommends Broadcast rather than unrestricted Postgres Changes for scalable, secure realtime delivery; database changes must still be reconciled against an authoritative read. The implementation therefore scopes Room refreshes and retains HTTP snapshot recovery.
- Nakama Party documentation models a server-owned roster with explicit join/leave events. The live roster here likewise comes from a server snapshot, not client-side inference.
- The Supabase security checklist applies to any future snapshot/event persistence: no client service role, RLS on exposed tables, and no new privileged function without an authorization check.

## Phased implementation

Phase 1 (this change): correct live roster projection, Casual presentation, Room-local refresh/event notices, reliable chat reconciliation, and no full-render resubscription on local Room updates.

Phase 2 (separate migration and rollout): add a monotonic database snapshot version and private Room Broadcast events. This requires a forward-only migration, RLS/realtime authorization verification, a staging test, and production rollout approval; it is deliberately not mixed into the current user-visible bug fix.

## Non-goals

- No Production migration or deployment in this change.
- No replacement of the current matcher or creation of a second matching system.
- No direct cleanup of historical Room/ticket data.
