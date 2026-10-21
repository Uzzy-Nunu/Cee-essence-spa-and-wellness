-- Add payment_status and paystack_reference to appointments table
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending';

-- Add check constraint for payment_status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_payment_status_check'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_payment_status_check
      CHECK (payment_status IN ('pending', 'paid', 'failed'));
  END IF;
END $$;

-- Add paystack_reference column
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS paystack_reference text;

-- Create index for faster lookups by reference and payment_status
CREATE INDEX IF NOT EXISTS idx_appointments_paystack_reference
  ON appointments (paystack_reference);

CREATE INDEX IF NOT EXISTS idx_appointments_payment_status
  ON appointments (payment_status);
