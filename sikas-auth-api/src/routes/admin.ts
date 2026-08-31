import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";

const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  action: z.string().max(50).optional(),
  status: z.enum(["success", "failure"]).optional(),
});

export async function adminRoutes(fastify: FastifyInstance) {
  // Every route below requires a verified access token.
  fastify.addHook("preHandler", requireAuth);

  // GET /v1/admin/stats — headline numbers, all derived from real rows.
  fastify.get("/stats", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { rows } = await fastify.db.query(`
        SELECT
          (SELECT count(*) FROM admin_users WHERE status = 'active')          AS active_admins,
          (SELECT count(*) FROM admin_users WHERE totp_verified)              AS admins_with_2fa,
          (SELECT count(*) FROM admin_sessions WHERE expires_at > now())      AS active_sessions,
          (SELECT count(*) FROM admin_audit_log
             WHERE created_at > now() - interval '24 hours')                  AS events_24h,
          (SELECT count(*) FROM admin_audit_log
             WHERE status = 'failure' AND created_at > now() - interval '24 hours')
                                                                              AS failures_24h,
          (SELECT count(*) FROM admin_audit_log
             WHERE action = 'login' AND status = 'success'
               AND created_at > now() - interval '7 days')                    AS logins_7d
      `);

      const s = rows[0];
      return reply.send({
        status: "success",
        stats: {
          active_admins: Number(s.active_admins),
          admins_with_2fa: Number(s.admins_with_2fa),
          active_sessions: Number(s.active_sessions),
          events_24h: Number(s.events_24h),
          failures_24h: Number(s.failures_24h),
          logins_7d: Number(s.logins_7d),
        },
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ status: "error", error: "internal_error" });
    }
  });

  // GET /v1/admin/activity — daily auth event counts for the last 14 days.
  fastify.get("/activity", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { rows } = await fastify.db.query(`
        SELECT
          d::date AS day,
          count(l.id) FILTER (WHERE l.status = 'success') AS successes,
          count(l.id) FILTER (WHERE l.status = 'failure') AS failures
        FROM generate_series(now()::date - interval '13 days', now()::date, interval '1 day') d
        LEFT JOIN admin_audit_log l ON l.created_at::date = d::date
        GROUP BY d
        ORDER BY d
      `);

      return reply.send({
        status: "success",
        activity: rows.map((r: any) => ({
          day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day),
          successes: Number(r.successes),
          failures: Number(r.failures),
        })),
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ status: "error", error: "internal_error" });
    }
  });

  // GET /v1/admin/audit-log — paginated, filterable audit trail.
  fastify.get("/audit-log", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const q = pageSchema.parse(request.query);

      const where: string[] = [];
      const params: any[] = [];
      if (q.action) {
        params.push(q.action);
        where.push(`l.action = $${params.length}`);
      }
      if (q.status) {
        params.push(q.status);
        where.push(`l.status = $${params.length}`);
      }
      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const countRes = await fastify.db.query(
        `SELECT count(*) AS total FROM admin_audit_log l ${whereSql}`,
        params
      );

      params.push(q.limit, q.offset);
      const { rows } = await fastify.db.query(
        `SELECT l.id, l.action, l.status, l.ip_address, l.error_msg, l.created_at,
                u.email AS admin_email
         FROM admin_audit_log l
         LEFT JOIN admin_users u ON u.id = l.admin_user_id
         ${whereSql}
         ORDER BY l.created_at DESC, l.id DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      return reply.send({
        status: "success",
        total: Number(countRes.rows[0].total),
        limit: q.limit,
        offset: q.offset,
        events: rows,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.code(400).send({ status: "error", error: "validation_error" });
      }
      fastify.log.error(err);
      return reply.code(500).send({ status: "error", error: "internal_error" });
    }
  });

  // GET /v1/admin/sessions — the caller's own live sessions.
  fastify.get("/sessions", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { rows } = await fastify.db.query(
        `SELECT id, ip_address, user_agent, is_mfa_verified, created_at,
                expires_at, last_activity_at
         FROM admin_sessions
         WHERE admin_user_id = $1 AND expires_at > now()
         ORDER BY last_activity_at DESC`,
        [request.authUser!.id]
      );
      return reply.send({ status: "success", sessions: rows });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ status: "error", error: "internal_error" });
    }
  });

  // DELETE /v1/admin/sessions/:id — revoke one of the caller's own sessions.
  fastify.delete<{ Params: { id: string } }>(
    "/sessions/:id",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        // Scoped by admin_user_id so one admin can never revoke another's session.
        const res = await fastify.db.query(
          "DELETE FROM admin_sessions WHERE id = $1 AND admin_user_id = $2",
          [request.params.id, request.authUser!.id]
        );
        if (res.rowCount === 0) {
          return reply.code(404).send({ status: "error", error: "not_found" });
        }
        return reply.send({ status: "success", message: "Session revoked" });
      } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send({ status: "error", error: "internal_error" });
      }
    }
  );

  // GET /v1/admin/users — the admin roster. Owners and platform admins only.
  fastify.get(
    "/users",
    { preHandler: requireRole("owner", "platform_admin") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { rows } = await fastify.db.query(
          `SELECT u.id, u.email, u.role, u.status, u.email_verified,
                  u.totp_verified, u.sms_verified, u.created_at, u.last_login_at,
                  (SELECT count(*) FROM admin_sessions s
                     WHERE s.admin_user_id = u.id AND s.expires_at > now()) AS active_sessions
           FROM admin_users u
           ORDER BY u.created_at`
        );
        return reply.send({
          status: "success",
          users: rows.map((r: any) => ({ ...r, active_sessions: Number(r.active_sessions) })),
        });
      } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send({ status: "error", error: "internal_error" });
      }
    }
  );
}
