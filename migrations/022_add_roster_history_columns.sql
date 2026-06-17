ALTER TABLE roster_history ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();
ALTER TABLE roster_history ADD COLUMN IF NOT EXISTS action varchar;
ALTER TABLE roster_history ADD COLUMN IF NOT EXISTS changed_by varchar;
