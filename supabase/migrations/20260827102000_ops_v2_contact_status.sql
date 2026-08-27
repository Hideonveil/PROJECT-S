begin;

alter table public.feedback
  add column if not exists ops_status text not null default 'unread',
  add column if not exists ops_updated_at timestamptz null;

alter table public.feedback drop constraint if exists feedback_ops_status_check;
alter table public.feedback add constraint feedback_ops_status_check
  check (ops_status in ('unread', 'read', 'resolved'));

create index if not exists feedback_ops_status_created_at_idx
  on public.feedback (ops_status, created_at desc);

commit;
