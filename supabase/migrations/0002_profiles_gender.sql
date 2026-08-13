-- Add gender to profiles created before the profile field migration was applied.
-- Idempotent: safe to run even if the column already exists.
alter table public.profiles add column if not exists gender text not null default '保密';
