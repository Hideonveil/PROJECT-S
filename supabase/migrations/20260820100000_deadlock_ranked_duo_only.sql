-- Deadlock ranked mode is strictly duo queue: one owner plus one teammate.
-- Casual groups keep their separate 1-5 teammate limits.

update public.matchmaking_rule_sets
set hard_rules = hard_rules || jsonb_build_object(
  'rankedPartyMax', 2,
  'rankedTeammateMax', 1
),
    notes = 'Ranked mode is duo-only (maximum two players total). Casual mode uses the separate group limits.'
where game_id = 'deadlock'
  and active = true;
