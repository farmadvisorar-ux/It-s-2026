/**
 * Creates (or resets) an admin account so you can log in for the first time.
 *
 *   npm run seed:admin -- you@example.com 'YourPassword123' owner
 *
 * Re-running with the same email resets that account's password and role.
 */
import pkg from "pg";
import { CryptoService } from "../src/services/crypto.service.js";
const { Pool } = pkg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const crypto = new CryptoService();

const email = process.argv[2] || "admin@sikads.com";
const password = process.argv[3] || "SikasAdmin2026!";
const role = process.argv[4] || "owner";

const hash = await crypto.hashPassword(password);
const res = await pool.query(
  `INSERT INTO admin_users (email, password_hash, role, status, email_verified)
   VALUES ($1, $2, $3, 'active', true)
   ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role
   RETURNING id, email, role`,
  [email.toLowerCase(), hash, role]
);
console.log("Seeded admin:", res.rows[0]);
await pool.end();
