-- Migration: auto-generate variant_code for policy_variant
-- Format: VRT-{variant_id padded to 3}

CREATE OR REPLACE FUNCTION generate_policy_variant_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.variant_code := 'VRT-' || lpad(NEW.variant_id::text, 3, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS policy_variant_code_trg ON policy_variant;

CREATE TRIGGER policy_variant_code_trg
BEFORE INSERT ON policy_variant
FOR EACH ROW
EXECUTE FUNCTION generate_policy_variant_code();
