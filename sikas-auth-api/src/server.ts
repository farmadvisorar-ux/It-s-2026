import Fastify from "fastify";
import { adminAuthRoutes } from "./routes/auth.js";
import { rateLimitMiddleware } from "./middleware/rateLimit.js";
import { auditMiddleware } from "./middleware/audit.js";
import { pool } from "./db/pool.js";
import { redis } from "./db/redis.js";

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        singleLine: false,
      },
    },
  },
  trustProxy: true,
});

// Attach database connections
fastify.decorate("db", pool);
fastify.decorate("redis", redis);

// Middleware
fastify.addHook("onRequest", rateLimitMiddleware);
fastify.addHook("onResponse", auditMiddleware);

// Routes
fastify.register(adminAuthRoutes, { prefix: "/v1/auth" });

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
    await fastify.listen({ port: 9000, host: "0.0.0.0" });
    fastify.log.info("Auth API running on :9000");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== "test") {
  start();
}

export default fastify;
