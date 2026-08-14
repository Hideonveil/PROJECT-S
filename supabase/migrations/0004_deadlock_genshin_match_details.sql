-- Add Deadlock / Genshin Impact to supported games and store extra flow details.
-- Idempotent: safe to run multiple times.

insert into public.games (id, name, tag, modes, roles, devices) values
  ('deadlock', 'Deadlock', 'MOBA FPS', '["排位 / 上分","普通对局","娱乐","练英雄","固定队","开黑"]', '["Carry","Support","Flex","Solo","Duo"]', '["PC"]'),
  ('genshin', '原神', '开放世界', '["刷材料","跑图","解谜","带新人","长期相伴","随便玩"]', '["输出","辅助","探索","带人"]', '["PC","主机","手机"]')
on conflict (id) do nothing;

alter table public.match_requests add column if not exists details jsonb not null default '{}'::jsonb;