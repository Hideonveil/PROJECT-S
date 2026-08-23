-- Ranked matchmaking: one adjacent rank, with Eternus-only pairing.
-- Keep this in the versioned ruleset so API and operations tooling read the
-- same hard rule. The service layer also has a safe fallback for old rows
-- during rollout.

update public.matchmaking_rule_sets
set hard_rules = hard_rules || jsonb_build_object(
  'maxRankDistance', 1
),
    notes = 'Ranked duo only: non-Eternus players may differ by at most one rank; Eternus may match only with Eternus.'
where game_id = 'deadlock'
  and active = true;
