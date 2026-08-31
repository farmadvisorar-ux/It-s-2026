import { FastifyRequest, FastifyReply } from "fastify";
import { CryptoService } from "../services/crypto.service.js";

const cryptoService = new CryptoService();

export interface AuthedUser {
  id: number;
  role: string;
}

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthedUser;
  }
}

/**
 * Verifies the Bearer access token and attaches the caller to the request.
 * Registered as a preHandler on the /v1/admin routes.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return reply.code(401).send({
      status: "error",
      error: "missing_token",
      message: "Missing or invalid authorization header",
    });
  }

  const decoded = cryptoService.verifyToken(header.slice(7));
  if (!decoded || decoded.type !== "access" || !decoded.role) {
    return reply.code(401).send({
      status: "error",
      error: "invalid_token",
      message: "Session expired. Please sign in again.",
    });
  }

  request.authUser = { id: decoded.sub, role: decoded.role };
}

/**
 * Role gate. Use after requireAuth: requireRole("owner", "platform_admin").
 */
export function requireRole(...roles: string[]) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.authUser || !roles.includes(request.authUser.role)) {
      return reply.code(403).send({
        status: "error",
        error: "forbidden",
        message: "Your role does not have access to this resource",
      });
    }
  };
}
