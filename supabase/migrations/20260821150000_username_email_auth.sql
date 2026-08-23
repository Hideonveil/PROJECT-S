-- Username remains a login alias; the Auth email is the verification/recovery
-- address. Keep it separate from the mutable display nickname.
alter table public.profiles
  add column if not exists username text;

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username))
  where username is not null;

comment on column public.profiles.username is
  'Unique login username, normalized to lowercase; distinct from nickname.';
