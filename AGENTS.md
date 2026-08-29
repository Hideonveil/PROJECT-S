# Agent instructions

## Engineering contract

Read `CONTEXT.md` before changing Matching, Room, Session, Recruitment or
Settlement behavior. Read `docs/project/DECISIONS.md` before changing a
confirmed product rule, Production lifecycle, capacity test policy or game
expansion behavior.

Build deep modules: one clear interface, one owner for each business rule, and
small callers. Prefer the simplest implementation that preserves current
behavior, data integrity, security and observability. Keep browser UI,
orchestration, domain rules, persistence adapters and operational tooling in
their existing directories; add a new directory only when it owns a distinct
responsibility.

Use tests at stable interfaces. A behavior change starts with a red regression
test and finishes with typecheck, relevant tests, full tests and Production
build. Refactors must preserve behavior and keep architecture hotspot ratchets
green. Update or replace tests that describe retired product behavior; do not
make Production imitate stale tests. Source-text assertions are reserved for
security/migration placement or negative architecture and performance ratchets
that cannot be observed reliably through a public interface; label that reason
in the test and pair the behavior with an interface or browser regression.

Keep work authorized and compliant: preserve secrets, user data, RLS and
Production protections; use dependencies and copied material only when their
license and terms permit it; record required attribution; never place
credentials or tokens in source, evidence or logs. Database changes are
forward-only migrations and require explicit scope. Production deployment is a
separate action after verification and must retain a rollback path.

New games use the `GameDefinition` registry and a game rule adapter described
by DEC-015. Shared Auth → Ticket → Room → Session → terminal lifecycle remains
generic; do not add scattered game-name branches to shared orchestration.

Work is complete only when the changed behavior is testable through its public
interface, project facts and docs agree with the code, `git diff --check`
passes, and unrelated user files remain untouched.

## Production access

For Production deployment, diagnostics, or container inspection, use the dedicated local SSH key:

```bash
ssh -i /Users/jasonhu/.ssh/jiyuan_hk_ed25519 ubuntu@124.156.175.247
```

Use this SSH path directly instead of depending on the Tencent Cloud browser terminal. Keep Production commands scoped to `/opt/jiyuan` and resolve the exact target before any destructive action.
