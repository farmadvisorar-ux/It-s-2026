import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import crypto from "crypto";

export class CryptoService {
  private jwtSecret: string;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || "change_me_in_production";
    if (this.jwtSecret === "change_me_in_production" && process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET must be set in production");
    }
  }

  // Password hashing
  async hashPassword(password: string): Promise<string> {
    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }
    return bcrypt.hash(password, 12);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // TOTP (Google Authenticator)
  generateTotpSecret(email: string): {
    secret: string;
    qrCodeUrl: string;
    backupCodes: string[];
  } {
    const secret = speakeasy.generateSecret({
      name: `Sikas Admin (${email})`,
      issuer: "Sikas",
      length: 32,
    });

    const backupCodes = this.generateBackupCodes();

    return {
      secret: secret.base32 || "",
      qrCodeUrl: secret.otpauth_url || "",
      backupCodes,
    };
  }

  verifyTotp(token: string, secret: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: "base32",
      token,
      window: 2, // ±2 time windows (±60 seconds)
    });
  }

  generateBackupCodes(count: number = 10): string[] {
    return Array.from({ length: count }, () => {
      // 6 bytes -> 12 hex chars -> XXXX-XXXX-XXXX
      const hex = crypto.randomBytes(6).toString("hex").toUpperCase();
      return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8)}`;
    });
  }

  hashBackupCode(code: string): string {
    return crypto.createHash("sha256").update(code).digest("hex");
  }

  // Random tokens
  async randomToken(length: number = 32): Promise<string> {
    return crypto.randomBytes(length).toString("base64url");
  }

  // JWT tokens
  generateAccessToken(userId: number, role: string): string {
    return jwt.sign({ sub: userId, role, type: "access" }, this.jwtSecret, {
      expiresIn: "1h",
      algorithm: "HS256",
    });
  }

  generateRefreshToken(userId: number): string {
    return jwt.sign({ sub: userId, type: "refresh" }, this.jwtSecret, {
      expiresIn: "7d",
      algorithm: "HS256",
    });
  }

  verifyToken(token: string): { sub: number; role?: string; type: string } | null {
    try {
      return jwt.verify(token, this.jwtSecret, {
        algorithms: ["HS256"],
      }) as any;
    } catch {
      return null;
    }
  }

  // Device fingerprint (basic, not cryptographic)
  generateDeviceFingerprint(userAgent: string, ip: string): string {
    return crypto
      .createHash("sha256")
      .update(`${userAgent}:${ip}`)
      .digest("hex");
  }

  // Constant-time string comparison for short secrets (OTP codes, tokens)
  timingSafeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  // SMS OTP
  generateSmsCode(): string {
    return crypto.randomInt(100000, 999999).toString();
  }
}
