-- =========================================================================
-- Migration 0004: new auth.users row -> matching officers row
-- Everyone who signs up starts as an unranked, unassigned Portfolio
-- Officer. HO promotes/assigns them afterwards (officers_update_ho_only
-- policy from 0002 already restricts that to HO).
-- =========================================================================

create or replace function handle_new_officer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.officers (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_officer();
