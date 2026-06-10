-- Migration: default location operating hours by location type

CREATE OR REPLACE FUNCTION apply_location_operating_hours_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  location_kind text;
BEGIN
  SELECT lower(coalesce(location_type, ''))
    INTO location_kind
  FROM sub_location
  WHERE location_id = NEW.location_id;

  IF location_kind = 'office' THEN
    NEW.is_open := coalesce(NEW.is_open, true);
    NEW.official_open_time := coalesce(NEW.official_open_time, time '10:00');
    NEW.official_close_time := coalesce(NEW.official_close_time, time '19:00');
    NEW.operational_open_time := coalesce(NEW.operational_open_time, time '10:00');
    NEW.operational_close_time := coalesce(NEW.operational_close_time, time '19:00');
  ELSIF location_kind = 'store' THEN
    NEW.is_open := coalesce(NEW.is_open, true);
    NEW.official_open_time := coalesce(NEW.official_open_time, time '11:00');
    NEW.official_close_time := coalesce(NEW.official_close_time, time '21:00');
    NEW.operational_open_time := coalesce(NEW.operational_open_time, time '10:30');
    NEW.operational_close_time := coalesce(NEW.operational_close_time, time '21:30');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS location_operating_hours_defaults_trg ON location_operating_hours;

CREATE TRIGGER location_operating_hours_defaults_trg
BEFORE INSERT OR UPDATE OF location_id, is_open, official_open_time, official_close_time, operational_open_time, operational_close_time
ON location_operating_hours
FOR EACH ROW
EXECUTE FUNCTION apply_location_operating_hours_defaults();