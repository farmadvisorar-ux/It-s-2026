import { FastifyRequest, FastifyReply } from "fastify";

export function rateLimitKey(action: string, ip: string): string {
  return `rate_limit:${action}:${ip}`;
}

export async function rateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Extract real IP (behind proxy)
  const ip = request.ip;

  // Only rate limit login attempts
  if (request.url.includes("/auth/login")) {
    const key = rateLimitKey("login", ip);
    try {
      const attempts = await request.server.redis.incr(key);

      // First request: set expiry
      if (attempts === 1) {
        await request.server.redis.expire(key, 900); // 15 minutes
      }

      // Set rate limit headers
      reply.header("X-RateLimit-Limit", "5");
      reply.header("X-RateLimit-Remaining", Math.max(0, 5 - attempts));
      reply.header("X-RateLimit-Reset", new Date(Date.now() + 15 * 60 * 1000).toISOString());

      if (attempts > 5) {
        return reply.code(429).send({
          status: "error",
          error: "too_many_attempts",
          message: "Too many login attempts. Try again in 15 minutes.",
        });
      }
    } catch (err) {
      request.server.log.error("Rate limit check failed", err);
      // Don't fail the request if rate limiting fails
    }
  }
}
