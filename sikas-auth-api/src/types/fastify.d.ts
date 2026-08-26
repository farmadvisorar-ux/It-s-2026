import type { Pool } from "pg";
import type { redis } from "../db/redis.js";

// Decorators attached in server.ts, declared here so routes and middleware
// can reach fastify.db / fastify.redis with real types.
declare module "fastify" {
  interface FastifyInstance {
    db: Pool;
    redis: typeof redis;
  }
}
