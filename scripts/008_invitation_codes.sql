-- Invitation codes table to restrict platform access
-- Manage codes directly in this table via Supabase dashboard

CREATE TABLE IF NOT EXISTS invitation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  description TEXT, -- optional note (e.g. "Para Granja Los Peces")
  used BOOLEAN DEFAULT FALSE,
  used_by UUID REFERENCES auth.users(id),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE invitation_codes ENABLE ROW LEVEL SECURITY;

-- Anyone can check if a code is valid (the code itself is the secret)
CREATE POLICY "Public can read invitation codes" ON invitation_codes
  FOR SELECT USING (true);

-- Anyone can mark a code as used, but only if it hasn't been used yet
CREATE POLICY "Public can mark code as used" ON invitation_codes
  FOR UPDATE USING (used = false);

-- Seed a few initial codes for testing
INSERT INTO invitation_codes (code, description) VALUES
  ('AQUA-2026-BETA', 'Acceso beta inicial'),
  ('AQUA-DEMO-01', 'Demo cliente 1'),
  ('AQUA-DEMO-02', 'Demo cliente 2');
