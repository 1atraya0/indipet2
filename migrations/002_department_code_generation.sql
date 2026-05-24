-- Migration: add department short code and generate department/revenue codes.

ALTER TABLE department_master
  ADD COLUMN IF NOT EXISTS department_short_code varchar(3);

ALTER TABLE department_master
  DROP CONSTRAINT IF EXISTS department_master_short_code_format_chk;

ALTER TABLE department_master
  ADD CONSTRAINT department_master_short_code_format_chk
  CHECK (department_short_code ~ '^[A-Z]{3}$');

ALTER TABLE department_master
  ALTER COLUMN department_short_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS department_master_short_code_ux
  ON department_master (department_short_code);

CREATE OR REPLACE FUNCTION generate_department_master_codes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  short_code text;
BEGIN
  short_code := upper(trim(coalesce(NEW.department_short_code, '')));

  IF short_code = '' THEN
    RAISE EXCEPTION 'department_short_code is required';
  END IF;

  IF short_code !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'department_short_code must be exactly 3 uppercase letters';
  END IF;

  NEW.department_short_code := short_code;
  NEW.department_code := short_code || '-' || lpad(coalesce(NEW.department_id::text, '0'), 3, '0');

  IF coalesce(NEW.is_revenue_generating, false) THEN
    NEW.revenue_centre_code := 'RC-' || short_code || '-' || lpad(coalesce(NEW.department_id::text, '0'), 3, '0');
  ELSE
    NEW.revenue_centre_code := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS department_master_codes_trg ON department_master;

CREATE TRIGGER department_master_codes_trg
BEFORE INSERT OR UPDATE OF department_short_code, is_revenue_generating, department_id
ON department_master
FOR EACH ROW
EXECUTE FUNCTION generate_department_master_codes();
