-- Migration: 022_add_user_profile_fields.sql
-- Adds customizable avatar_url column to users table

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
