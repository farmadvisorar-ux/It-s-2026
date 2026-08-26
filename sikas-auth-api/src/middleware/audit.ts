import { FastifyRequest, FastifyReply } from "fastify";

export async function auditMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Log endpoint calls (optional, for debugging)
  // In production, audit log auth events via the auth routes themselves
  if (request.url.includes("/auth/") && request.method !== "GET") {
    request.server.log.info({
      path: request.url,
      method: request.method,
      statusCode: reply.statusCode,
      ip: request.ip,
    });
  }
}
