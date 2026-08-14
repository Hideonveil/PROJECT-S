-- Add play genres to profiles: onboarding now collects game types (FPS/MOBA/RTS...)
-- instead of specific game names. Idempotent: safe to run multiple times.
alter table public.profiles add column if not exists genres jsonb not null default '[]'::jsonb;