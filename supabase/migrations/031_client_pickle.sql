-- Pickle for clients and managers too (their Overview widgets). Each person still has their own
-- pet; clients and managers earn an oatcake for every request they send instead of every delivery.
alter policy "own pet" on public.pets
  using (owner_email = public.my_email())
  with check (owner_email = public.my_email());
