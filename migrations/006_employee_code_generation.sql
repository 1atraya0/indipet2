-- Migration: generate employee_master.employee_code from employee_id, location_id, and parent_entity_id.

UPDATE employee_master
SET employee_code = 'IDP'
  || lpad(employee_id::text, 4, '0')
  || lpad(coalesce(location_id::text, '0'), 4, '0')
  || lpad(coalesce(parent_entity_id::text, '0'), 4, '0')
WHERE employee_code IS NULL OR btrim(employee_code) = '';

CREATE UNIQUE INDEX IF NOT EXISTS employee_master_employee_code_ux
  ON employee_master (employee_code)
  WHERE employee_code IS NOT NULL;

CREATE OR REPLACE FUNCTION generate_employee_master_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.employee_id IS NULL THEN
    NEW.employee_id := nextval(pg_get_serial_sequence('employee_master', 'employee_id'));
  END IF;

  NEW.employee_code := 'IDP'
    || lpad(NEW.employee_id::text, 4, '0')
    || lpad(coalesce(NEW.location_id::text, '0'), 4, '0')
    || lpad(coalesce(NEW.parent_entity_id::text, '0'), 4, '0');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employee_master_code_trg ON employee_master;

CREATE TRIGGER employee_master_code_trg
BEFORE INSERT OR UPDATE OF location_id, parent_entity_id, employee_id
ON employee_master
FOR EACH ROW
EXECUTE FUNCTION generate_employee_master_code();