-- Migration: add location_id FK to role_master for location-scoped permissions
ALTER TABLE role_master ADD COLUMN IF NOT EXISTS location_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'role_master'
      AND constraint_name = 'role_master_location_id_fkey'
  ) THEN
    ALTER TABLE role_master ADD CONSTRAINT role_master_location_id_fkey
      FOREIGN KEY (location_id) REFERENCES sub_location(location_id);
  END IF;
END;
$$;
