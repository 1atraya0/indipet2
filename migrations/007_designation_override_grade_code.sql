-- Migration: rename designation override_level to override_grade_code

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'designation_master'
      AND column_name = 'override_level'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'designation_master'
      AND column_name = 'override_grade_code'
  ) THEN
    ALTER TABLE designation_master
      RENAME COLUMN override_level TO override_grade_code;
  END IF;
END;
$$;