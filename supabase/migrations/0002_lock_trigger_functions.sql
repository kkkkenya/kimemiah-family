-- Trigger-only functions should not be callable through the API.
revoke execute on function public.set_row_meta() from authenticated, anon, public;
revoke execute on function public.write_audit() from authenticated, anon, public;
