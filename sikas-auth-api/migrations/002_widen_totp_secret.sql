-- speakeasy.generateSecret({ length: 32 }) returns a 32-BYTE secret, which
-- base32-encodes to roughly 52 characters. The original VARCHAR(32) column
-- rejected every value with "value too long for type character varying(32)",
-- so TOTP enrolment could never complete. TEXT removes the ceiling.
ALTER TABLE admin_users
  ALTER COLUMN totp_secret TYPE TEXT;

-- Backup codes are stored as SHA-256 hex digests (64 chars each); make the
-- intent explicit rather than relying on the untyped array default.
ALTER TABLE admin_users
  ALTER COLUMN backup_codes TYPE TEXT[];
