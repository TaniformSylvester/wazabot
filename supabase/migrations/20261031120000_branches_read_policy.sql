-- WazaBolt — branches: every team member reads their business's branches.
--
-- The first branches migration let only is_business_member() read them, and
-- that leaves kitchen staff and teachers out: the kitchen screen couldn't
-- find its branch. This replaces that one read policy. Nothing else changes.

drop policy "branches: members read" on public.branches;
create policy "branches: members read" on public.branches
  for select to authenticated
  using (exists (select 1 from public.business_members m where m.business_id = branches.business_id and m.user_id = (select auth.uid())));
