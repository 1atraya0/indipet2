-- Migration: keep role permissions structured in UI and link service types to departments by FK.

ALTER TABLE service_type_master
  ADD COLUMN IF NOT EXISTS linked_department_id integer;

ALTER TABLE service_type_master
  DROP CONSTRAINT IF EXISTS service_type_master_linked_department_id_fkey;

ALTER TABLE service_type_master
  ADD CONSTRAINT service_type_master_linked_department_id_fkey
  FOREIGN KEY (linked_department_id) REFERENCES department_master(department_id);

CREATE OR REPLACE FUNCTION sync_service_type_department_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  dept_code text;
BEGIN
  IF NEW.linked_department_id IS NULL THEN
    NEW.linked_department_code := NULL;
    RETURN NEW;
  END IF;

  SELECT department_code INTO dept_code
  FROM department_master
  WHERE department_id = NEW.linked_department_id
  LIMIT 1;

  NEW.linked_department_code := dept_code;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_type_master_department_code_trg ON service_type_master;

CREATE TRIGGER service_type_master_department_code_trg
BEFORE INSERT OR UPDATE OF linked_department_id
ON service_type_master
FOR EACH ROW
EXECUTE FUNCTION sync_service_type_department_code();
