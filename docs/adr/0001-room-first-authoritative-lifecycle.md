---
status: accepted
---

# Use one authoritative Room lifecycle with participant-based settlement

Jiyuan uses one Room UI from matchmaking entry through Session completion, while Recruitment and Session remain separate domain lifecycles. Room changes are reconciled by a monotonic server authority; Casual locking requires all current members, and terminal settlement uses the Session's frozen participants rather than active Room membership. This avoids the previous alternatives—multiple user-facing room phases, owner-only locking, and active-member settlement—which produced asymmetric rosters, false Room restoration, missing postgame players, and retry-driven state races.
