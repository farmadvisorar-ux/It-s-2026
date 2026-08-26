import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { AuthService } from "../services/auth.service.js";
import { CryptoService } from "../services/crypto.service.js";
import QRCode from "qrcode";

// Schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  remember_device: z.boolean().optional(),
});

const verifyTotpSchema = z.object({
  session_id: z.string(),
  code: z.string().length(6),
});

const verifySmsSchema = z.object({
  session_id: z.string(),
  sms_code: z.string().length(6),
});

const setupTotpSchema = z.object({
  session_id: z.string(),
});

const confirmTotpSchema = z.object({
  session_id: z.string(),
  totp_code: z.string().length(6),
});

const setupSmsSchema = z.object({
  session_id: z.string(),
  phone: z.string(),
});

const verifySmsSetupSchema = z.object({
  session_id: z.string(),
  sms_code: z.string().length(6),
});

const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

const passwordResetSchema = z.object({
  token: z.string(),
  password: z.string().min(8),
});

export async function adminAuthRoutes(fastify: FastifyInstance) {
  const authService = new AuthService(fastify.db);
  const cryptoService = new CryptoService();

  // POST /v1/auth/login
  fastify.post<{ Body: z.infer<typeof loginSchema> }>(
    "/login",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = loginSchema.parse(request.body);
        const ip = request.ip;

        // Fetch user
        const user = await authService.getUserByEmail(body.email);
        if (!user) {
          await authService.auditLog(null, "login", "failure", ip, "user_not_found");
          return reply.code(401).send({
            status: "error",
            error: "invalid_credentials",
            message: "Email or password is incorrect",
          });
        }

        // Verify password
        const isValid = await cryptoService.verifyPassword(
          body.password,
          user.password_hash.toString()
        );
        if (!isValid) {
          await authService.auditLog(user.id, "login", "failure", ip, "invalid_password");
          return reply.code(401).send({
            status: "error",
            error: "invalid_credentials",
            message: "Email or password is incorrect",
          });
        }

        // Create session
        const sessionId = await cryptoService.randomToken();
        const deviceFingerprint = cryptoService.generateDeviceFingerprint(
          request.headers["user-agent"] || "",
          ip
        );

        await authService.createSession({
          user_id: user.id,
          session_id: sessionId,
          ip_address: ip,
          user_agent: request.headers["user-agent"],
          device_fingerprint: deviceFingerprint,
        });

        // Audit
        await authService.auditLog(user.id, "login", "success", ip);

        return reply.code(200).send({
          status: "success",
          session_id: sessionId,
          mfa_required: true,
          mfa_method: user.totp_verified ? "totp" : "sms",
          message: user.totp_verified
            ? "Enter your authenticator code"
            : "We'll send an SMS code to your phone",
        });
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.code(400).send({
            status: "error",
            error: "validation_error",
            details: err.errors,
          });
        }
        fastify.log.error(err);
        return reply.code(500).send({
          status: "error",
          error: "internal_error",
        });
      }
    }
  );

  // POST /v1/auth/verify-totp
  fastify.post<{ Body: z.infer<typeof verifyTotpSchema> }>(
    "/verify-totp",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = verifyTotpSchema.parse(request.body);

        const session = await authService.getSession(body.session_id);
        if (!session) {
          return reply.code(401).send({
            status: "error",
            error: "invalid_session",
            message: "Session expired or invalid",
          });
        }

        const user = await authService.getUserById(session.admin_user_id);
        if (!user || !user.totp_secret) {
          return reply.code(401).send({
            status: "error",
            error: "totp_not_configured",
          });
        }

        // Verify TOTP
        const isValid = cryptoService.verifyTotp(body.code, user.totp_secret);
        if (!isValid) {
          await authService.auditLog(user.id, "totp_verify", "failure", request.ip);
          return reply.code(401).send({
            status: "error",
            error: "invalid_code",
            message: "Invalid authenticator code",
          });
        }

        // Mark session MFA verified
        await authService.markSessionMfaVerified(body.session_id);
        await authService.recordLastLogin(user.id);

        // Generate tokens
        const accessToken = cryptoService.generateAccessToken(user.id, user.role);
        const refreshToken = cryptoService.generateRefreshToken(user.id);

        await authService.auditLog(user.id, "totp_verify", "success", request.ip);

        return reply.code(200).send({
          status: "success",
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 3600,
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
          },
        });
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.code(400).send({
            status: "error",
            error: "validation_error",
          });
        }
        fastify.log.error(err);
        return reply.code(500).send({
          status: "error",
          error: "internal_error",
        });
      }
    }
  );

  // POST /v1/auth/setup-2fa
  fastify.post<{ Body: z.infer<typeof setupTotpSchema> }>(
    "/setup-2fa",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = setupTotpSchema.parse(request.body);

        const session = await authService.getSession(body.session_id);
        if (!session) {
          return reply.code(401).send({
            status: "error",
            error: "invalid_session",
          });
        }

        const user = await authService.getUserById(session.admin_user_id);
        if (!user) {
          return reply.code(401).send({
            status: "error",
            error: "user_not_found",
          });
        }

        const { secret, qrCodeUrl, backupCodes } = cryptoService.generateTotpSecret(user.email);

        // Generate QR code as data URL
        const qrCode = await QRCode.toDataURL(qrCodeUrl);

        // Hash backup codes (store hashed versions in DB later)
        const hashedBackupCodes = backupCodes.map((code) =>
          cryptoService.hashBackupCode(code)
        );

        // Store secret in session (Redis) temporarily
        await fastify.redis.setEx(
          `totp_setup:${body.session_id}`,
          300, // 5 minutes
          JSON.stringify({ secret, backupCodes: hashedBackupCodes })
        );

        return reply.code(200).send({
          status: "success",
          totp_secret: secret,
          qr_code: qrCode,
          backup_codes: backupCodes, // Return unhashed for user to save
          message: "Save your backup codes in a safe place",
        });
      } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send({
          status: "error",
          error: "internal_error",
        });
      }
    }
  );

  // POST /v1/auth/confirm-2fa
  fastify.post<{ Body: z.infer<typeof confirmTotpSchema> }>(
    "/confirm-2fa",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = confirmTotpSchema.parse(request.body);

        // Get secret from Redis
        const setupData = await fastify.redis.get(`totp_setup:${body.session_id}`);
        if (!setupData) {
          return reply.code(401).send({
            status: "error",
            error: "setup_expired",
            message: "2FA setup expired. Start over.",
          });
        }

        const { secret, backupCodes } = JSON.parse(setupData);

        // Verify TOTP code
        const isValid = cryptoService.verifyTotp(body.totp_code, secret);
        if (!isValid) {
          return reply.code(401).send({
            status: "error",
            error: "invalid_code",
          });
        }

        const session = await authService.getSession(body.session_id);
        if (!session) {
          return reply.code(401).send({
            status: "error",
            error: "invalid_session",
          });
        }

        // Save TOTP secret to DB
        await authService.updateUserTotp(session.admin_user_id, secret);
        await authService.verifyUserTotp(session.admin_user_id);

        // Store backup codes in DB (hashed)
        await fastify.db.query(
          "UPDATE admin_users SET backup_codes = $1 WHERE id = $2",
          [backupCodes, session.admin_user_id]
        );

        // Clear setup data
        await fastify.redis.del(`totp_setup:${body.session_id}`);

        return reply.code(200).send({
          status: "success",
          message: "2FA setup complete. Next: add SMS backup.",
        });
      } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send({
          status: "error",
          error: "internal_error",
        });
      }
    }
  );

  // POST /v1/auth/password-reset-request
  fastify.post<{ Body: z.infer<typeof passwordResetRequestSchema> }>(
    "/password-reset-request",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = passwordResetRequestSchema.parse(request.body);

        const user = await authService.getUserByEmail(body.email);

        if (user) {
          // Generate reset token
          const token = await cryptoService.randomToken();
          await fastify.redis.setEx(`password_reset:${token}`, 3600, user.id.toString());

          // Send email (mock for now)
          fastify.log.info(`Password reset link for ${body.email}: ${token}`);
          // TODO: Integrate with SendGrid or similar
        }

        // Always return success (security: don't reveal if email exists)
        return reply.code(200).send({
          status: "success",
          message: "If that email is registered, we sent a password reset link",
        });
      } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send({
          status: "error",
          error: "internal_error",
        });
      }
    }
  );

  // POST /v1/auth/password-reset
  fastify.post<{ Body: z.infer<typeof passwordResetSchema> }>(
    "/password-reset",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = passwordResetSchema.parse(request.body);

        const userId = await fastify.redis.get(`password_reset:${body.token}`);
        if (!userId) {
          return reply.code(401).send({
            status: "error",
            error: "invalid_token",
            message: "Reset link expired or invalid",
          });
        }

        const passwordHash = await cryptoService.hashPassword(body.password);
        await authService.updateUserPassword(parseInt(userId), passwordHash);

        // Invalidate token
        await fastify.redis.del(`password_reset:${body.token}`);

        await authService.auditLog(parseInt(userId), "password_reset", "success", request.ip);

        return reply.code(200).send({
          status: "success",
          message: "Password updated. Please log in again.",
        });
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.code(400).send({
            status: "error",
            error: "validation_error",
          });
        }
        fastify.log.error(err);
        return reply.code(500).send({
          status: "error",
          error: "internal_error",
        });
      }
    }
  );

  // POST /v1/auth/logout
  fastify.post<{ Body: { session_id: string } }>(
    "/logout",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { session_id } = request.body;
        const session = await authService.getSession(session_id);

        if (session) {
          await authService.deleteSession(session_id);
          await authService.auditLog(session.admin_user_id, "logout", "success", request.ip);
        }

        return reply.code(200).send({
          status: "success",
          message: "Logged out",
        });
      } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send({
          status: "error",
          error: "internal_error",
        });
      }
    }
  );
}
