-- Migration: generate parent_entity.entity_code from legal_name and entity_id.

WITH source AS (
  SELECT
    entity_id,
    CASE
      WHEN length(prefix) = 0 THEN 'ENT'
      WHEN length(prefix) < 3 THEN rpad(prefix, 3, 'X')
      ELSE prefix
    END AS code_prefix
  FROM (
    SELECT
      entity_id,
      upper(left(regexp_replace(coalesce(legal_name, 'ENTITY'), '[^A-Z]+', '', 'g'), 3)) AS prefix
    FROM parent_entity
  ) AS derived
)
UPDATE parent_entity
SET entity_code = source.code_prefix || lpad(parent_entity.entity_id::text, 4, '0')
FROM source
WHERE parent_entity.entity_id = source.entity_id
  AND (parent_entity.entity_code IS NULL OR btrim(parent_entity.entity_code) = '');

ALTER TABLE parent_entity
  ALTER COLUMN entity_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS parent_entity_entity_code_ux
  ON parent_entity (entity_code);

CREATE OR REPLACE FUNCTION generate_parent_entity_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  name_text text;
  prefix text;
BEGIN
  name_text := coalesce(NEW.legal_name, 'ENTITY');
  prefix := upper(left(regexp_replace(name_text, '[^A-Z]+', '', 'g'), 3));

  IF prefix = '' THEN
    prefix := 'ENT';
  ELSIF length(prefix) < 3 THEN
    prefix := rpad(prefix, 3, 'X');
  END IF;

  IF NEW.entity_id IS NULL THEN
    NEW.entity_id := nextval(pg_get_serial_sequence('parent_entity', 'entity_id'));
  END IF;

  NEW.entity_code := prefix || lpad(NEW.entity_id::text, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS parent_entity_code_trg ON parent_entity;

CREATE TRIGGER parent_entity_code_trg
BEFORE INSERT OR UPDATE OF legal_name, entity_id
ON parent_entity
FOR EACH ROW
EXECUTE FUNCTION generate_parent_entity_code();