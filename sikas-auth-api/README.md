# Sikas Admin Authentication API

Enterprise-grade authentication and authorization backend for the Sikas Admin Dashboard.

## Features

- **Multi-factor Authentication (MFA)** — all free
  - TOTP (Time-based One-Time Password) via Google Authenticator — no service, no cost
  - Emailed 6-digit login codes as the backup channel, over plain SMTP
  - Backup codes for account recovery
  - SMS is supported but optional, and is the only part that needs a paid provider

- **Session Management**
  - Device fingerprinting
  - Session expiration (7 days)
  - Concurrent session limit support

- **Security**
  - Bcrypt password hashing (12 salt rounds)
  - JWT-based access tokens (1 hour expiry)
  - Refresh tokens (7 days expiry)
  - Rate limiting on login (5 attempts per 15 minutes per IP)
  - Audit logging for all authentication events
  - HMAC-SHA256 signatures support (future)

- **User Management**
  - Role-based access control (RBAC)
  - Email verification
  - Password reset with email tokens
  - User status management

- **Database**
  - PostgreSQL for persistent storage
  - Redis for sessions and rate limiting
  - Indexed tables for performance

## Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose (for local dev)
- PostgreSQL 14+ (or use Docker)
- Redis 6+ (or use Docker)

### Development Setup

1. **Clone and install**
   ```bash
   cd sikas-auth-api
   npm install
   ```

2. **Start services** (using Docker Compose)
   ```bash
   docker-compose up -d
   ```

3. **Run migrations**
   ```bash
   npm run migrate
   ```

4. **Create your first admin account**
   ```bash
   npm run seed:admin -- you@example.com 'YourPassword123' owner
   ```

   Email and password are required — there is no default account. The password
   must be at least 12 characters with an uppercase letter, a lowercase letter,
   and a digit.

5. **Start development server**
   ```bash
   npm run dev
   ```

   API will be running at `http://localhost:9000/v1/auth`

With no SMTP configured, password-reset links and login codes print to the
server console — so you can run the whole flow locally without credentials.

6. **Start the dashboard** (separate terminal)
   ```bash
   cd ../sikas-admin-dashboard && npm install && npm run dev
   ```

   Open <http://localhost:5173> and sign in. See
   [`../sikas-admin-dashboard/README.md`](../sikas-admin-dashboard/README.md).

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
DATABASE_URL=postgresql://sikas_admin:password123@localhost:5432/sikas_auth
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_secret_key
NODE_ENV=development
```

### Sending real email for free (Gmail SMTP)

Gmail sends up to 500 messages/day at no cost, which covers admin password
resets and login codes comfortably.

1. Turn on 2-Step Verification at <https://myaccount.google.com/security>
2. Create an App Password at <https://myaccount.google.com/apppasswords>
3. Add to `.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your_16_char_app_password
SMTP_FROM=Sikas Admin <you@gmail.com>
APP_URL=http://localhost:5173
```

Any other SMTP provider works by changing `SMTP_HOST`/`SMTP_PORT`. Leave these
unset and email is printed to the console instead of sent.

## API Endpoints

See [API-ENDPOINTS.md](./API-ENDPOINTS.md) for complete documentation.

### Core Endpoints
- `POST /login` - User login with email/password
- `POST /verify-totp` - Verify TOTP code
- `POST /send-email-otp` - Email a 6-digit login code (free backup MFA)
- `POST /verify-email-otp` - Verify the emailed login code
- `POST /verify-sms` - Verify SMS code *(optional, paid)*
- `POST /setup-2fa` - Initialize TOTP setup
- `POST /confirm-2fa` - Confirm TOTP and save secret
- `POST /setup-sms` - Request SMS verification
- `POST /verify-sms-setup` - Confirm SMS setup
- `POST /password-reset-request` - Request password reset
- `POST /password-reset` - Reset password with token
- `POST /logout` - Invalidate session
- `POST /refresh` - Get new access token
- `GET /me` - Get current user info

### Admin Endpoints
All require a Bearer access token; see [API-ENDPOINTS.md](./API-ENDPOINTS.md).

- `GET /v1/admin/stats` - Headline counts for the overview
- `GET /v1/admin/activity` - Daily auth events, last 14 days
- `GET /v1/admin/audit-log` - Paginated, filterable audit trail
- `GET /v1/admin/sessions` - The caller's live sessions
- `DELETE /v1/admin/sessions/:id` - Revoke one of the caller's sessions
- `GET /v1/admin/users` - Admin roster *(owner / platform_admin only)*

## Architecture

### Directory Structure
```
sikas-auth-api/
├── src/
│   ├── server.ts           # Fastify server setup
│   ├── routes/auth.ts      # Auth endpoint handlers
│   ├── services/
│   │   ├── auth.service.ts # Auth business logic
│   │   ├── crypto.service.ts # Cryptographic operations
│   │   └── email.service.ts # SMTP delivery (Gmail-friendly)
│   ├── routes/admin.ts     # Admin data endpoints
│   ├── middleware/
│   │   ├── audit.ts        # Audit logging
│   │   ├── rateLimit.ts    # Rate limiting
│   │   └── requireAuth.ts  # JWT verification + role gate
│   └── db/
│       ├── pool.ts         # Postgres connection pool
│       └── redis.ts        # Redis client
├── migrations/
│   ├── 001_create_admin_tables.sql
│   └── 002_widen_totp_secret.sql
├── scripts/
│   ├── migrate.ts          # Migration runner
│   └── seed-admin.ts       # Create the first admin account
├── tests/
│   └── auth.test.ts
├── Dockerfile
├── docker-compose.yml
├── package.json
└── tsconfig.json
```

### Technology Stack
- **Runtime**: Node.js with TypeScript
- **Web Framework**: Fastify 4
- **Database**: PostgreSQL 16
- **Cache**: Redis 7
- **Authentication**: JWT (HS256), TOTP (speakeasy), Bcrypt
- **Email**: Nodemailer over SMTP
- **Validation**: Zod
- **Logging**: Pino

## Security Implementation

### Password Security
- Minimum 8 characters
- Bcrypt hashing with 12 salt rounds
- No password storage in logs

### MFA
- TOTP: ±2 time window (±60 seconds) to prevent clock skew
- Email OTP: 6-digit codes, 10-minute expiry, single use, 60s resend cooldown,
  compared in constant time
- SMS: 6-digit codes with 5-minute expiration *(optional, paid)*
- Backup codes: 10 codes in XXXX-XXXX-XXXX format, stored as SHA-256 hashes

### Session Security
- Random 32-byte session tokens
- Device fingerprinting (SHA256 of User-Agent + IP)
- 7-day expiration
- IP/User-Agent validation on session reuse

### Access Control
- Every `/v1/admin` route requires a verified Bearer access token
- `requireRole(...)` gates routes by role; the admin roster is owner /
  platform_admin only
- Session queries are scoped by admin id, so one admin cannot read or revoke
  another's sessions

### CORS
- Browser origins are allowlisted via `CORS_ORIGINS` (comma separated)
- Defaults to `http://localhost:5173,http://127.0.0.1:5173` for local dev

### Rate Limiting
- Login: 5 attempts per 15 minutes per IP
- Configurable per endpoint
- Redis-backed counter with auto-expiry
- Note: successful sign-ins count toward the limit, and the key is the IP, so
  several admins behind one NAT address share the budget

### Audit Logging
- All auth events logged (login, TOTP verify, password reset, etc.)
- Includes user ID, action, status, IP, error message
- Indexed by timestamp for audit trails

### Token Security
- Access tokens: 1 hour expiry
- Refresh tokens: 7 days expiry
- HS256 signing with ENV variable secret
- Type claim prevents token confusion

## Testing

### Run Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Test Coverage
```bash
npm test -- --coverage
```

Test suite includes:
- Input validation tests
- Authorization tests
- Rate limiting tests
- Error handling tests

## Deployment

### Docker Build
```bash
docker build -t sikas-auth-api:latest .
```

### Docker Run
```bash
docker run -p 9000:9000 \
  -e DATABASE_URL="postgresql://..." \
  -e REDIS_URL="redis://..." \
  -e JWT_SECRET="..." \
  sikas-auth-api:latest
```

### Kubernetes
```bash
kubectl apply -f k8s/deployment.yaml
```

### Environment Variables (Production)
```env
DATABASE_URL=postgresql://prod_user:prod_pass@prod-db.example.com/sikas_auth
REDIS_URL=redis://prod-redis.example.com:6379
JWT_SECRET=your_production_secret_key_min_32_chars
NODE_ENV=production
PORT=9000
LOG_LEVEL=info
```

## Database Migrations

### Run Migrations
```bash
npm run migrate
```

### Create New Migration
1. Create file: `migrations/NNN_description.sql`
2. Write SQL with idempotent operations (use `IF NOT EXISTS`)
3. Run migrations

### Rollback
Currently no automatic rollback. To rollback manually:
1. Connect to PostgreSQL
2. Execute reverse SQL operations
3. Or restore from backup

## Monitoring & Logging

### Logs
- Structured JSON logs to stdout
- Pino logger with levels: debug, info, warn, error
- Log level configurable via `LOG_LEVEL` env var

### Health Check
```bash
curl http://localhost:9000/health
```

### Metrics (Future)
- Response times
- Error rates
- MFA success rates
- Audit log counts

## Common Issues

### Port 9000 Already in Use
```bash
lsof -i :9000
kill -9 <PID>
```

### Database Connection Failed
- Verify `DATABASE_URL` is correct
- Check PostgreSQL is running: `docker-compose logs postgres`
- Verify credentials

### Redis Connection Failed
- Verify `REDIS_URL` is correct
- Check Redis is running: `docker-compose logs redis`

### Migrations Not Running
```bash
npm run migrate
# Check for SQL errors in migrations/
```

## Performance

### Database Indexes
- `admin_users.email` - for fast user lookups
- `admin_users.status` - for filtering active users
- `admin_sessions.user_id` - for finding user sessions
- `admin_sessions.expires_at` - for cleanup queries
- `admin_audit_log.user_id`, `.action`, `.created_at` - for audit queries

### Caching Strategy
- Sessions in Redis (7-day TTL)
- Rate limit counters in Redis (15-min TTL)
- No query caching (stateless API)

### Load Testing
```bash
# Using Apache Bench
ab -n 1000 -c 10 http://localhost:9000/health

# Using Artillery
artillery run artillery-config.yml
```

## Contributing

1. Create feature branch: `git checkout -b feature/auth-enhancements`
2. Make changes and test: `npm test`
3. Commit with clear messages
4. Push and create pull request

## Future Enhancements

- [ ] OAuth 2.0 / OpenID Connect support
- [ ] SAML 2.0 enterprise support
- [ ] WebAuthn / FIDO2 support
- [ ] Risk-based authentication
- [ ] Passwordless authentication
- [ ] IP whitelisting per user
- [ ] Geographic anomaly detection
- [ ] Session activity dashboard

## License

Proprietary - Sikas Admin Dashboard

## Support

For issues or questions:
1. Check [API-ENDPOINTS.md](./API-ENDPOINTS.md)
2. Review error codes and responses
3. Contact: support@sikads.com
