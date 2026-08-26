import { Pool } from "pg";

export interface AdminUser {
  id: number;
  email: string;
  email_verified: boolean;
  password_hash: Buffer;
  totp_secret?: string;
  totp_verified: boolean;
  sms_phone?: string;
  sms_verified: boolean;
  role: string;
  status: string;
  created_at: Date;
  last_login_at?: Date;
}

export interface AdminSession {
  id: string;
  admin_user_id: number;
  ip_address: string;
  user_agent: string;
  device_fingerprint?: string;
  is_mfa_verified: boolean;
  created_at: Date;
  expires_at: Date;
  last_activity_at: Date;
}

export class AuthService {
  constructor(private db: Pool) {}

  // Users
  async getUserByEmail(email: string): Promise<AdminUser | null> {
    const result = await this.db.query(
      "SELECT * FROM admin_users WHERE email = $1 AND status = 'active'",
      [email.toLowerCase()]
    );
    return result.rows[0] || null;
  }

  async getUserById(id: number): Promise<AdminUser | null> {
    const result = await this.db.query("SELECT * FROM admin_users WHERE id = $1", [id]);
    return result.rows[0] || null;
  }

  async createUser(
    email: string,
    passwordHash: string,
    role: string = "analyst"
  ): Promise<AdminUser> {
    const result = await this.db.query(
      `INSERT INTO admin_users (email, password_hash, role, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING *`,
      [email.toLowerCase(), passwordHash, role]
    );
    return result.rows[0];
  }

  async updateUserTotp(userId: number, totpSecret: string): Promise<void> {
    await this.db.query(
      "UPDATE admin_users SET totp_secret = $1 WHERE id = $2",
      [totpSecret, userId]
    );
  }

  async verifyUserTotp(userId: number): Promise<void> {
    await this.db.query(
      "UPDATE admin_users SET totp_verified = true WHERE id = $1",
      [userId]
    );
  }

  async updateUserSms(userId: number, phone: string): Promise<void> {
    await this.db.query("UPDATE admin_users SET sms_phone = $1 WHERE id = $2", [phone, userId]);
  }

  async verifyUserSms(userId: number): Promise<void> {
    await this.db.query("UPDATE admin_users SET sms_verified = true WHERE id = $1", [userId]);
  }

  async updateUserPassword(userId: number, passwordHash: string): Promise<void> {
    await this.db.query(
      "UPDATE admin_users SET password_hash = $1, updated_at = now() WHERE id = $2",
      [passwordHash, userId]
    );
  }

  async recordLastLogin(userId: number): Promise<void> {
    await this.db.query("UPDATE admin_users SET last_login_at = now() WHERE id = $1", [userId]);
  }

  // Sessions
  async createSession(data: {
    user_id: number;
    session_id: string;
    ip_address: string;
    user_agent?: string;
    device_fingerprint?: string;
  }): Promise<AdminSession> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const result = await this.db.query(
      `INSERT INTO admin_sessions
       (id, admin_user_id, ip_address, user_agent, device_fingerprint, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.session_id,
        data.user_id,
        data.ip_address,
        data.user_agent,
        data.device_fingerprint,
        expiresAt,
      ]
    );

    return result.rows[0];
  }

  async getSession(sessionId: string): Promise<AdminSession | null> {
    const result = await this.db.query(
      `SELECT * FROM admin_sessions
       WHERE id = $1 AND expires_at > now()`,
      [sessionId]
    );
    return result.rows[0] || null;
  }

  async markSessionMfaVerified(sessionId: string): Promise<void> {
    await this.db.query(
      "UPDATE admin_sessions SET is_mfa_verified = true WHERE id = $1",
      [sessionId]
    );
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.db.query("DELETE FROM admin_sessions WHERE id = $1", [sessionId]);
  }

  // Audit logging
  async auditLog(
    userId: number | null,
    action: string,
    status: "success" | "failure",
    ipAddress: string,
    errorMsg?: string
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO admin_audit_log
       (admin_user_id, action, status, ip_address, error_msg)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, action, status, ipAddress, errorMsg || null]
    );
  }

  // Password reset tokens (stored in Redis, not DB)
  // Implementation: key = "password_reset:{token}", value = "{user_id}", TTL = 3600s
}
