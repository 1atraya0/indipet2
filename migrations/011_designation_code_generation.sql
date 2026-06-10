-- Migration: auto-generate designation_code from department_short_code + name-based suffix

CREATE OR REPLACE FUNCTION generate_designation_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  dept_short character varying;
  suffix text;
BEGIN
  SELECT dm.department_short_code INTO dept_short
  FROM department_master dm
  WHERE dm.department_id = NEW.department_id;

  IF dept_short IS NULL THEN
    dept_short := 'XXX';
  END IF;

  suffix := CASE
    WHEN NEW.designation_name ILIKE '%HR Manager%' THEN 'MGR'
    WHEN NEW.designation_name ILIKE '%Area Manager%' THEN 'AM'
    WHEN NEW.designation_name ILIKE '%Store Assistant Manager%' OR NEW.designation_name ILIKE '%Store Asst Manager%' THEN 'SAM'
    WHEN NEW.designation_name ILIKE '%Store Manager%' THEN 'SM'
    WHEN NEW.designation_name ILIKE '%Sales Associate%' THEN 'SA'
    WHEN NEW.designation_name ILIKE '%Senior Groomer%' THEN 'SGR'
    WHEN NEW.designation_name ILIKE '%Groomer%' THEN 'GRM'
    WHEN NEW.designation_name ILIKE '%Clinic Manager%' THEN 'CM'
    WHEN NEW.designation_name ILIKE '%Veterinary Doctor%' THEN 'VD'
    WHEN NEW.designation_name ILIKE '%Vet Assistant%' THEN 'VA'
    WHEN NEW.designation_name ILIKE '%Inventory Executive%' THEN 'IE'
    WHEN NEW.designation_name ILIKE '%Finance Executive%' THEN 'FE'
    ELSE upper(regexp_replace(NEW.designation_name, '[^A-Z]+', '', 'g'))
  END;

  NEW.designation_code := dept_short || '-' || suffix;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS designation_master_code_trg ON designation_master;

CREATE TRIGGER designation_master_code_trg
BEFORE INSERT ON designation_master
FOR EACH ROW
EXECUTE FUNCTION generate_designation_code();
