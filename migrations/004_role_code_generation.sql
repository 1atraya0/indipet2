-- Migration: generate role_code from role_name and role_id

-- role_code format: UPPER(sanitized_role_name)_RL_<padded_role_id>

CREATE OR REPLACE FUNCTION generate_role_master_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  name_text text;
  slug text;
BEGIN
  name_text := coalesce(NEW.role_name, 'ROLE');
  -- sanitize: replace non-alphanum with underscore, collapse multiple underscores
  slug := regexp_replace(upper(name_text), '[^A-Z0-9]+', '_', 'g');
  slug := regexp_replace(slug, '_+', '_', 'g');
  slug := trim(both '_' from slug);

  IF NEW.role_id IS NULL THEN
    -- ensure sequence is used to assign role_id if not provided
    NEW.role_id := nextval(pg_get_serial_sequence('role_master', 'role_id'));
  END IF;

  NEW.role_code := slug || '_RL_' || lpad(NEW.role_id::text, 3, '0');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS role_master_code_trg ON role_master;

CREATE TRIGGER role_master_code_trg
BEFORE INSERT OR UPDATE OF role_name, role_id
ON role_master
FOR EACH ROW
EXECUTE FUNCTION generate_role_master_code();
