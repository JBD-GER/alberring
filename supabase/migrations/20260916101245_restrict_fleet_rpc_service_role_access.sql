-- Hosted projects can grant service_role EXECUTE through default privileges.
-- These user-facing mutations must keep the tested caller-only entry points.
-- The RPC bodies independently require a real authorized organization member.
revoke all on function public.correct_mileage_submission(uuid,integer,date,text,text)
  from service_role;
revoke all on function public.correct_vehicle_damage_report(uuid,uuid,date,text,text)
  from service_role;
revoke all on function public.save_vehicle_maintenance_event(uuid,uuid,text,text,date,integer,text,text,text,date,integer)
  from service_role;
