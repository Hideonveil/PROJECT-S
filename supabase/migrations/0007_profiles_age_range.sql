-- Store the coarse age range selected during player identity creation.
-- The product intentionally does not collect a birth date.
alter table public.profiles
  add column if not exists age_range text not null default '保密';
