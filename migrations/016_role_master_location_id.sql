-- Migration: add location_id FK to role_master for location-scoped permissions
ALTER TABLE role_master ADD COLUMN location_id INTEGER REFERENCES sub_location(location_id);
