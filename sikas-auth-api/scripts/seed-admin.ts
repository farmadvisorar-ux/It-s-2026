/**
 * Creates (or resets) an admin account so you can log in for the first time.
 *
 *   npm run seed:admin -- you@example.com 'YourPassword123' owner
 *
 * Email and password are required — there is deliberately no default account,
 * so a bare run of this script can never leave a known-password owner behind.
 * Re-running with the same email resets that account's password and role.
 */
import pkg from "pg";
import { CryptoService } from "../src/services/crypto.service.js";

const { Pool } = pkg;

const VALID_ROLES = ["owner", "platform_admin", "ops", "finance", "support", "analyst"];

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  console.error("  Usage: npm run seed:admin -- <email> <password> [role]");
  console.error(`  Roles: ${VALID_ROLES.join(", ")} (default: analyst)\n`);
  process.exit(1);
}

const email = process.argv[2];
const password = process.argv[3];
const role = process.argv[4] || "analyst";

if (!email || !password) fail("Email and password are both required.");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`"${email}" is not a valid email address.`);
if (!VALID_ROLES.includes(role)) fail(`"${role}" is not a valid role.`);

// Enough to stop a throwaway password reaching a production owner account.
if (password.length < 12) fail("Password must be at least 12 characters.");
if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
  fail("Password must contain a lowercase letter, an uppercase letter, and a digit.");
}

if (!process.env.DATABASE_URL) fail("DATABASE_URL is not set.");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const crypto = new CryptoService();

try {
  const hash = await crypto.hashPassword(password);
  const res = await pool.query(
    `INSERT INTO admin_users (email, password_hash, role, status, email_verified)
     VALUES ($1, $2, $3, 'active', true)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           updated_at = now()
     RETURNING id, email, role, created_at`,
    [email.toLowerCase(), hash, role]
  );

  const user = res.rows[0];
  console.log(`\n  Admin ready: ${user.email}  (id ${user.id}, role ${user.role})`);
  console.log("  Sign in, then enrol an authenticator app under Security.\n");
} catch (err) {
  console.error("\n  Failed to seed admin:", err instanceof Error ? err.message : err, "\n");
  process.exit(1);
} finally {
  await pool.end();
}
