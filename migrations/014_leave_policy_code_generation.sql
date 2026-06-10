-- Migration: auto-generate policy_code for leave_policy_master
-- Format: LP-{year}-{policy_id padded to 3}

CREATE OR REPLACE FUNCTION generate_leave_policy_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.policy_code := 'LP-' || NEW.policy_year || '-' || lpad(NEW.policy_id::text, 3, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leave_policy_code_trg ON leave_policy_master;

CREATE TRIGGER leave_policy_code_trg
BEFORE INSERT ON leave_policy_master
FOR EACH ROW
EXECUTE FUNCTION generate_leave_policy_code();
