-- Contact messages are intentionally short operational reports from registered players.
alter table public.feedback drop constraint if exists feedback_content_check;
alter table public.feedback add constraint feedback_content_check
  check (char_length(content) between 10 and 500) not valid;

drop policy if exists "feedback_insert_anon" on public.feedback;
