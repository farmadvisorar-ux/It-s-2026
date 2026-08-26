# Sikas Admin Auth API Reference

Complete documentation of all authentication endpoints.

## Base URL
```
http://localhost:3000/v1/auth
```

## Authentication

Endpoints requiring authentication use Bearer token in `Authorization` header:
```
Authorization: Bearer <access_token>
```

---

## Endpoints

### 1. Login
**POST** `/login`

Authenticate with email and password. Returns session ID for 2FA verification.

**Request:**
```json
{
  "email": "admin@example.com",
  "password": "SecurePassword123",
  "remember_device": false
}
```

**Response (200):**
```json
{
  "status": "success",
  "session_id": "base64_encoded_session_token",
  "mfa_required": true,
  "mfa_method": "totp",
  "message": "Enter your authenticator code"
}
```

**Errors:**
- 401: Invalid credentials
- 429: Too many attempts (5 per 15 min per IP)

---

### 2. Verify TOTP
**POST** `/verify-totp`

Verify TOTP code from authenticator app during login.

**Request:**
```json
{
  "session_id": "base64_encoded_session_token",
  "code": "123456"
}
```

**Response (200):**
```json
{
  "status": "success",
  "access_token": "jwt_access_token",
  "refresh_token": "jwt_refresh_token",
  "expires_in": 3600,
  "user": {
    "id": 1,
    "email": "admin@example.com",
    "role": "platform_admin"
  }
}
```

**Errors:**
- 401: Invalid or expired session, invalid code

---

### 3. Verify SMS
**POST** `/verify-sms`

Verify SMS code during login (if SMS is configured as MFA method).

**Request:**
```json
{
  "session_id": "base64_encoded_session_token",
  "sms_code": "123456"
}
```

**Response (200):** Same as `/verify-totp`

**Errors:**
- 401: Invalid or expired session, SMS not configured, invalid code

---

### 4. Setup 2FA (TOTP)
**POST** `/setup-2fa`

Generate TOTP secret and QR code for 2FA setup during onboarding.

**Request:**
```json
{
  "session_id": "base64_encoded_session_token"
}
```

**Response (200):**
```json
{
  "status": "success",
  "totp_secret": "base32_encoded_secret",
  "qr_code": "data:image/png;base64,...",
  "backup_codes": [
    "XXXX-XXXX-XXXX",
    "XXXX-XXXX-XXXX",
    ...
  ],
  "message": "Save your backup codes in a safe place"
}
```

---

### 5. Confirm 2FA (TOTP)
**POST** `/confirm-2fa`

Verify TOTP code and save secret to database.

**Request:**
```json
{
  "session_id": "base64_encoded_session_token",
  "totp_code": "123456"
}
```

**Response (200):**
```json
{
  "status": "success",
  "message": "2FA setup complete. Next: add SMS backup."
}
```

**Errors:**
- 401: Invalid code, setup expired, invalid session

---

### 6. Setup SMS
**POST** `/setup-sms`

Request SMS code for SMS 2FA setup.

**Request:**
```json
{
  "session_id": "base64_encoded_session_token",
  "phone": "+1234567890"
}
```

**Response (200):**
```json
{
  "status": "success",
  "message": "SMS code sent to your phone"
}
```

**Errors:**
- 400: Invalid phone number
- 401: Invalid session

---

### 7. Verify SMS Setup
**POST** `/verify-sms-setup`

Verify SMS code and enable SMS as backup 2FA method.

**Request:**
```json
{
  "session_id": "base64_encoded_session_token",
  "sms_code": "123456"
}
```

**Response (200):**
```json
{
  "status": "success",
  "message": "SMS verified successfully"
}
```

**Errors:**
- 401: Invalid code, setup expired, invalid session

---

### 8. Password Reset Request
**POST** `/password-reset-request`

Request a password reset email. Always returns 200 for security.

**Request:**
```json
{
  "email": "admin@example.com"
}
```

**Response (200):**
```json
{
  "status": "success",
  "message": "If that email is registered, we sent a password reset link"
}
```

---

### 9. Password Reset
**POST** `/password-reset`

Reset password using token from email.

**Request:**
```json
{
  "token": "base64_reset_token",
  "password": "NewSecurePassword123"
}
```

**Response (200):**
```json
{
  "status": "success",
  "message": "Password updated. Please log in again."
}
```

**Errors:**
- 400: Password too short
- 401: Invalid or expired token

---

### 10. Logout
**POST** `/logout`

Invalidate session. Safe to call multiple times.

**Request:**
```json
{
  "session_id": "base64_encoded_session_token"
}
```

**Response (200):**
```json
{
  "status": "success",
  "message": "Logged out"
}
```

---

### 11. Refresh Token
**POST** `/refresh`

Get new access token using refresh token.

**Request:**
```json
{
  "refresh_token": "jwt_refresh_token"
}
```

**Response (200):**
```json
{
  "status": "success",
  "access_token": "new_jwt_access_token",
  "expires_in": 3600
}
```

**Errors:**
- 401: Invalid or expired refresh token

---

### 12. Get Current User
**GET** `/me`

Get logged-in user information.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200):**
```json
{
  "status": "success",
  "user": {
    "id": 1,
    "email": "admin@example.com",
    "role": "platform_admin",
    "email_verified": true,
    "totp_verified": true,
    "sms_verified": true,
    "created_at": "2026-08-20T10:30:00Z",
    "last_login_at": "2026-08-26T14:22:00Z"
  }
}
```

**Errors:**
- 401: Missing or invalid token

---

## Rate Limiting

Login endpoint is rate limited to 5 attempts per 15 minutes per IP address.

Response headers:
```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 4
X-RateLimit-Reset: 2026-08-26T15:37:00Z
```

---

## Error Responses

All error responses follow this format:

```json
{
  "status": "error",
  "error": "error_code",
  "message": "Human readable message"
}
```

Common error codes:
- `invalid_credentials` - Login failed
- `invalid_session` - Session expired or invalid
- `invalid_code` - Wrong 2FA/SMS/reset code
- `too_many_attempts` - Rate limit exceeded
- `validation_error` - Request validation failed
- `internal_error` - Server error
- `setup_expired` - 2FA setup expired
- `invalid_token` - Malformed or expired token
- `user_not_found` - User doesn't exist

---

## Development

### Run migrations
```bash
npm run migrate
```

### Start server
```bash
npm run dev
```

### Build
```bash
npm run build
```

### Environment Variables
```env
DATABASE_URL=postgresql://user:password@localhost/sikas_auth
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_secret_key_here
NODE_ENV=development
```
