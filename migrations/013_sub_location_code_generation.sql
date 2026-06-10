-- Migration: auto-generate location_code for sub_location
-- Format: {parent_entity_code}-{3-letter-abbrev}{location_id + 200}

CREATE OR REPLACE FUNCTION generate_sub_location_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  entity_code_val text;
  abbrev text;
  name_source text;
BEGIN
  SELECT pe.entity_code INTO entity_code_val
  FROM parent_entity pe
  WHERE pe.entity_id = NEW.parent_entity_id;

  IF entity_code_val IS NULL THEN
    entity_code_val := 'XXX';
  END IF;

  name_source := coalesce(NEW.brand_flag, NEW.location_name, 'LOC');
  abbrev := upper(left(regexp_replace(name_source, '[^A-Z]+', '', 'g'), 3));

  IF abbrev = '' THEN
    abbrev := 'LOC';
  ELSIF length(abbrev) < 3 THEN
    abbrev := rpad(abbrev, 3, 'X');
  END IF;

  NEW.location_code := entity_code_val || '-' || abbrev || lpad((NEW.location_id + 200)::text, 3, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sub_location_code_trg ON sub_location;

CREATE TRIGGER sub_location_code_trg
BEFORE INSERT ON sub_location
FOR EACH ROW
EXECUTE FUNCTION generate_sub_location_code();
