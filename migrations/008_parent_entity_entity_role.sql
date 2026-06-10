-- Migration: add business relationship role to parent_entity

ALTER TABLE parent_entity
  ADD COLUMN IF NOT EXISTS entity_role text;