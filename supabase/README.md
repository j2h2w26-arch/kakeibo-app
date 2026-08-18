# Supabase setup

The migration is intentionally split so the currently deployed anonymous app
does not stop working before the authenticated frontend is ready.

## Phase 1: prepare without an outage

Apply `migrations/20260817000000_prepare_secure_household.sql`. This adds the
member table, validation, atomic repayment functions, authenticated grants, and
Realtime publication entries. It does **not** revoke the existing anonymous
access to the three application tables.

## Create the two users

1. Open **Authentication → Users** in Supabase.
2. Create one email/password user for each spouse. Use the two agreed email
   addresses; passwords must be chosen privately and must not be committed or
   pasted into an issue or pull request.
3. Copy each user's UUID.
4. Register both UUIDs in the SQL Editor:

```sql
insert into public.app_members (user_id, display_name)
values
  ('HUSBAND_USER_UUID', 'Hyunwoo'),
  ('WIFE_USER_UUID', 'Fumika');
```

Confirm that both rows exist before continuing:

```sql
select user_id, display_name from public.app_members order by display_name;
```

## Phase 2: cut over to Auth + RLS

1. Deploy or open the authenticated frontend in a Preview environment.
2. Confirm that both spouses can log in and read the existing data.
3. Apply `migrations/20260817000001_enable_household_rls.sql`.
4. Immediately repeat the checks below, then promote the frontend.

Phase 2 removes anonymous table access. Do not apply it until the authenticated
frontend and both member rows are ready.

## Post-migration check

- Logged out: the three data tables must not be readable.
- Registered husband and wife: both must see the same existing data.
- Any other authenticated user: no household data must be returned.
- A repayment from one phone should appear on the other phone without reloading.
