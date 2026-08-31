import Fastify from "fastify";
import { adminAuthRoutes } from "./routes/auth.js";
import { adminRoutes } from "./routes/admin.js";
import cors from "@fastify/cors";
import { rateLimitMiddleware } from "./middleware/rateLimit.js";
import { auditMiddleware } from "./middleware/audit.js";
import { pool } from "./db/pool.js";
import { redis } from "./db/redis.js";

// pino-pretty is a dev-only dependency; production emits structured JSON
// straight to stdout for the log collector to pick up.
const prettyLogs = process.env.NODE_ENV !== "production";

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    ...(prettyLogs
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              singleLine: false,
            },
          },
        }
      : {}),
  },
  trustProxy: true,
});

// Attach database connections
fastify.decorate("db", pool);
fastify.decorate("redis", redis);

// Browser clients (the admin dashboard) are served from a different origin
// in development, so the allowed origins are configurable.
// localhost and 127.0.0.1 are distinct origins to the browser, so dev
// needs both or the dashboard's fetches fail CORS depending on the URL typed.
const allowedOrigins = (
  process.env.CORS_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

await fastify.register(cors, {
  origin: allowedOrigins,
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
});

// Middleware
fastify.addHook("onRequest", rateLimitMiddleware);
fastify.addHook("onResponse", auditMiddleware);

// Routes
fastify.register(adminAuthRoutes, { prefix: "/v1/auth" });
fastify.register(adminRoutes, { prefix: "/v1/admin" });

// Health check
fastify.get("/health", async (request, reply) => {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  };
});

// Error handler
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);

  if (error.statusCode === 429) {
    return reply.code(429).send({
      status: "error",
      error: "too_many_requests",
      message: "Rate limit exceeded",
    });
  }

  return reply.code(500).send({
    status: "error",
    error: "internal_error",
    message: process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
  });
});

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || "9000", 10);
    const host = process.env.HOST || "0.0.0.0";
    await fastify.listen({ port, host });
    fastify.log.info(`Auth API running on ${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== "test") {
  start();
}

export default fastify;
