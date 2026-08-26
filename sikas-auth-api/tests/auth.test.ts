import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import axios from "axios";
import { Pool } from "pg";

const API_URL = "http://localhost:3000/v1/auth";
const TEST_EMAIL = "test@example.com";
const TEST_PASSWORD = "TestPassword123";

let pool: Pool;
let accessToken: string;
let refreshToken: string;
let sessionId: string;

beforeAll(async () => {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  // Create test user
  const passwordHash = "$2b$12$abcdefghijklmnopqrstuvwxyz"; // Mock hash
  await pool.query(
    "INSERT INTO admin_users (email, password_hash, role, status) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
    [TEST_EMAIL, passwordHash, "analyst", "active"]
  );
});

afterAll(async () => {
  // Clean up test user
  await pool.query("DELETE FROM admin_users WHERE email = $1", [TEST_EMAIL]);
  await pool.end();
});

describe("Auth API", () => {
  describe("POST /login", () => {
    it("should return 400 for missing email", async () => {
      const response = await axios
        .post(`${API_URL}/login`, {
          password: TEST_PASSWORD,
        })
        .catch((err) => err.response);

      expect(response.status).toBe(400);
      expect(response.data.error).toBe("validation_error");
    });

    it("should return 400 for invalid email format", async () => {
      const response = await axios
        .post(`${API_URL}/login`, {
          email: "invalid-email",
          password: TEST_PASSWORD,
        })
        .catch((err) => err.response);

      expect(response.status).toBe(400);
      expect(response.data.error).toBe("validation_error");
    });

    it("should return 401 for non-existent user", async () => {
      const response = await axios
        .post(`${API_URL}/login`, {
          email: "nonexistent@example.com",
          password: TEST_PASSWORD,
        })
        .catch((err) => err.response);

      expect(response.status).toBe(401);
      expect(response.data.error).toBe("invalid_credentials");
    });
  });

  describe("GET /me", () => {
    it("should return 401 without authorization header", async () => {
      const response = await axios
        .get(`${API_URL}/me`)
        .catch((err) => err.response);

      expect(response.status).toBe(401);
      expect(response.data.error).toBe("missing_token");
    });

    it("should return 401 with invalid token", async () => {
      const response = await axios
        .get(`${API_URL}/me`, {
          headers: {
            Authorization: "Bearer invalid_token",
          },
        })
        .catch((err) => err.response);

      expect(response.status).toBe(401);
      expect(response.data.error).toBe("invalid_token");
    });
  });

  describe("POST /refresh", () => {
    it("should return 400 for missing refresh_token", async () => {
      const response = await axios
        .post(`${API_URL}/refresh`, {})
        .catch((err) => err.response);

      expect(response.status).toBe(400);
      expect(response.data.error).toBe("validation_error");
    });

    it("should return 401 for invalid refresh token", async () => {
      const response = await axios
        .post(`${API_URL}/refresh`, {
          refresh_token: "invalid_token",
        })
        .catch((err) => err.response);

      expect(response.status).toBe(401);
      expect(response.data.error).toBe("invalid_token");
    });
  });

  describe("POST /logout", () => {
    it("should return 200 even for invalid session", async () => {
      const response = await axios.post(`${API_URL}/logout`, {
        session_id: "invalid_session",
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe("success");
    });
  });

  describe("POST /password-reset-request", () => {
    it("should return 200 for any email (security: no email enumeration)", async () => {
      const response = await axios.post(`${API_URL}/password-reset-request`, {
        email: "definitely-does-not-exist@example.com",
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe("success");
    });

    it("should return 400 for invalid email format", async () => {
      const response = await axios
        .post(`${API_URL}/password-reset-request`, {
          email: "not-an-email",
        })
        .catch((err) => err.response);

      expect(response.status).toBe(400);
      expect(response.data.error).toBe("validation_error");
    });
  });

  describe("POST /setup-sms", () => {
    it("should return 401 for invalid session", async () => {
      const response = await axios
        .post(`${API_URL}/setup-sms`, {
          session_id: "invalid_session",
          phone: "+1234567890",
        })
        .catch((err) => err.response);

      expect(response.status).toBe(401);
      expect(response.data.error).toBe("invalid_session");
    });
  });
});
