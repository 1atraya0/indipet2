-- Migration: add primary_keyholder_id and backup_keyholder_id to sub_location
-- Adds nullable integer columns. Foreign-key constraints are optional and commented out;
-- enable them after ensuring referenced rows exist.

ALTER TABLE sub_location
  ADD COLUMN IF NOT EXISTS primary_keyholder_id integer,
  ADD COLUMN IF NOT EXISTS backup_keyholder_id integer;

-- Optional foreign-key constraints. Uncomment to enable (ensure employee_master.employee_id exists).
-- ALTER TABLE sub_location
--   ADD CONSTRAINT fk_sub_location_primary_keyholder FOREIGN KEY (primary_keyholder_id) REFERENCES employee_master(employee_id),
--   ADD CONSTRAINT fk_sub_location_backup_keyholder FOREIGN KEY (backup_keyholder_id) REFERENCES employee_master(employee_id);
