-- Migration: auto-generate roster_code from shift_policy_id and roster_date

CREATE OR REPLACE FUNCTION generate_roster_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  shift_code text;
BEGIN
  SELECT shift_policy_master.policy_code INTO shift_code
  FROM shift_policy_master
  WHERE shift_policy_master.policy_id = NEW.shift_policy_id;

  shift_code := coalesce(shift_code, 'UNKNOWN');

  NEW.roster_code := shift_code || '-' || to_char(NEW.roster_date, 'YYYYMMDD');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS roster_code_trg ON roster;

CREATE TRIGGER roster_code_trg
BEFORE INSERT ON roster
FOR EACH ROW
EXECUTE FUNCTION generate_roster_code();
