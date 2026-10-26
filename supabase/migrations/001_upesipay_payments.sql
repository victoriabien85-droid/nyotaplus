-- Run this in your Supabase SQL Editor
-- Creates the payment_transactions table for UPesi Pay

CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reference TEXT UNIQUE NOT NULL,
  phone_number TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  loan_amount NUMERIC,
  applicant_name TEXT,
  national_id TEXT,
  gateway TEXT DEFAULT 'upesipay',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  gateway_reference TEXT,
  raw_response JSONB,
  webhook_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (edge functions use service role)
CREATE POLICY "Service role full access" ON payment_transactions
  FOR ALL USING (auth.role() = 'service_role');

-- Allow authenticated admin to read
CREATE POLICY "Admin read access" ON payment_transactions
  FOR SELECT USING (auth.role() = 'authenticated');

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_payment_transactions_reference ON payment_transactions(reference);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_phone ON payment_transactions(phone_number);

-- Update app_settings to enable UPesi Pay
INSERT INTO app_settings (key, value)
VALUES ('payment_gateway', 'upesipay')
ON CONFLICT (key) DO UPDATE SET value = 'upesipay';
