# Frontend-Backend Integration Guide

Complete guide for integrating the Sikas Admin Dashboard frontend with the authentication API backend.

## Overview

The frontend login UI (`sikas-admin-login.html`) needs to communicate with the backend auth API (`sikas-auth-api`). This guide explains the complete flow and provides implementation examples.

## Backend API Base URL

```
Development: http://localhost:3000/v1/auth
Production: https://admin-api.sikads.com/v1/auth
```

## Authentication Flow

### 1. Email/Password Login

**User enters email and password → Frontend sends to backend**

```javascript
async function handleLogin(email, password, rememberDevice = false) {
  const response = await fetch('http://localhost:3000/v1/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      remember_device: rememberDevice,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    // Handle error: invalid_credentials, validation_error, too_many_attempts
    console.error('Login failed:', data.error, data.message);
    return null;
  }

  // Store session for MFA verification
  sessionStorage.setItem('mfa_session_id', data.session_id);
  sessionStorage.setItem('mfa_method', data.mfa_method);

  return {
    sessionId: data.session_id,
    mfaMethod: data.mfa_method, // 'totp' or 'sms'
    message: data.message,
  };
}
```

**Response (Success - 200):**
```json
{
  "status": "success",
  "session_id": "base64_encoded_session_token",
  "mfa_required": true,
  "mfa_method": "totp",
  "message": "Enter your authenticator code"
}
```

**Response (Error - 401):**
```json
{
  "status": "error",
  "error": "invalid_credentials",
  "message": "Email or password is incorrect"
}
```

**Response (Error - 429):**
```json
{
  "status": "error",
  "error": "too_many_attempts",
  "message": "Too many login attempts. Try again in 15 minutes."
}
```

### 2. MFA: TOTP Verification

**User enters 6-digit TOTP code from authenticator app**

```javascript
async function handleTotpVerification(sessionId, totpCode) {
  const response = await fetch('http://localhost:3000/v1/auth/verify-totp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session_id: sessionId,
      code: totpCode,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('TOTP verification failed:', data.error);
    return null;
  }

  // Store tokens
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);
  localStorage.setItem('token_expires_at', 
    new Date(Date.now() + data.expires_in * 1000).toISOString()
  );

  // Clear session
  sessionStorage.removeItem('mfa_session_id');
  sessionStorage.removeItem('mfa_method');

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in, // 3600 seconds = 1 hour
    user: data.user,
  };
}
```

**Response (Success - 200):**
```json
{
  "status": "success",
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": 3600,
  "user": {
    "id": 1,
    "email": "admin@example.com",
    "role": "platform_admin"
  }
}
```

### 3. MFA: SMS Verification

**User enters 6-digit SMS code sent to their phone**

```javascript
async function handleSmsVerification(sessionId, smsCode) {
  const response = await fetch('http://localhost:3000/v1/auth/verify-sms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session_id: sessionId,
      sms_code: smsCode,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('SMS verification failed:', data.error);
    return null;
  }

  // Store tokens (same as TOTP)
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    user: data.user,
  };
}
```

## 2FA Setup Flow (During Onboarding)

### 1. Start TOTP Setup

```javascript
async function startTotpSetup(sessionId) {
  const response = await fetch('http://localhost:3000/v1/auth/setup-2fa', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session_id: sessionId,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('2FA setup failed:', data.error);
    return null;
  }

  return {
    totpSecret: data.totp_secret,
    qrCode: data.qr_code, // Data URL: data:image/png;base64,...
    backupCodes: data.backup_codes,
  };
}
```

**Response (Success - 200):**
```json
{
  "status": "success",
  "totp_secret": "JBSWY3DPEBLW64TMMQ======",
  "qr_code": "data:image/png;base64,iVBORw0KGgo...",
  "backup_codes": [
    "XXXX-XXXX-XXXX",
    "XXXX-XXXX-XXXX",
    ...
  ],
  "message": "Save your backup codes in a safe place"
}
```

**Implementation in Frontend:**
```javascript
// Display QR code
const qrImg = document.getElementById('qr-code');
qrImg.src = setupResult.qrCode;

// Display backup codes
const backupList = document.getElementById('backup-codes');
setupResult.backupCodes.forEach(code => {
  const li = document.createElement('li');
  li.textContent = code;
  backupList.appendChild(li);
});
```

### 2. Confirm TOTP Setup

```javascript
async function confirmTotpSetup(sessionId, totpCode) {
  const response = await fetch('http://localhost:3000/v1/auth/confirm-2fa', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session_id: sessionId,
      totp_code: totpCode,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('2FA confirmation failed:', data.error);
    return null;
  }

  return {
    status: 'success',
    message: data.message, // "2FA setup complete. Next: add SMS backup."
  };
}
```

### 3. Setup SMS Backup

```javascript
async function setupSms(sessionId, phoneNumber) {
  // Step 1: Send SMS code
  const smsResponse = await fetch('http://localhost:3000/v1/auth/setup-sms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session_id: sessionId,
      phone: phoneNumber,
    }),
  });

  const smsData = await smsResponse.json();
  if (!smsResponse.ok) {
    console.error('SMS setup failed:', smsData.error);
    return null;
  }

  // Step 2: User enters SMS code they received
  // This is stored in UI state until user confirms

  // Step 3: Verify SMS code
  const verifyResponse = await fetch('http://localhost:3000/v1/auth/verify-sms-setup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session_id: sessionId,
      sms_code: userEnteredSmsCode,
    }),
  });

  const verifyData = await verifyResponse.json();
  return verifyData;
}
```

## Session & Token Management

### Using Access Token

All authenticated requests use the Bearer token:

```javascript
async function apiRequest(endpoint, method = 'GET', body = null) {
  const token = localStorage.getItem('access_token');

  if (!token) {
    // Redirect to login
    window.location.href = '/login';
    return null;
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(endpoint, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  if (response.status === 401) {
    // Token expired or invalid
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      // Redirect to login
      window.location.href = '/login';
      return null;
    }
    // Retry request with new token
    return apiRequest(endpoint, method, body);
  }

  return response.json();
}
```

### Refresh Access Token

Access tokens expire after 1 hour. Use refresh token to get a new one:

```javascript
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refresh_token');

  if (!refreshToken) {
    return false;
  }

  const response = await fetch('http://localhost:3000/v1/auth/refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    // Refresh token expired, need to login again
    localStorage.clear();
    return false;
  }

  const data = await response.json();

  // Store new access token
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('token_expires_at',
    new Date(Date.now() + data.expires_in * 1000).toISOString()
  );

  return true;
}
```

### Get Current User

```javascript
async function getCurrentUser() {
  const response = await fetch('http://localhost:3000/v1/auth/me', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.json().then(data => data.user);
}
```

## Password Reset Flow

### 1. Request Password Reset

```javascript
async function requestPasswordReset(email) {
  const response = await fetch('http://localhost:3000/v1/auth/password-reset-request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
    }),
  });

  const data = await response.json();
  // Always returns 200 for security (no email enumeration)
  return {
    status: 'success',
    message: data.message,
  };
}
```

### 2. Reset Password

**User receives email with reset link: `https://admin.sikads.com/reset-password?token=...`**

```javascript
async function resetPassword(resetToken, newPassword) {
  const response = await fetch('http://localhost:3000/v1/auth/password-reset', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      token: resetToken,
      password: newPassword,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('Password reset failed:', data.error);
    return false;
  }

  return true;
}
```

## Logout

```javascript
async function handleLogout() {
  const sessionId = sessionStorage.getItem('mfa_session_id');

  if (sessionId) {
    await fetch('http://localhost:3000/v1/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
      }),
    });
  }

  // Clear all stored tokens
  localStorage.clear();
  sessionStorage.clear();

  // Redirect to login
  window.location.href = '/login';
}
```

## Error Handling

```javascript
function handleApiError(error, data) {
  switch (error) {
    case 'invalid_credentials':
      return 'Email or password is incorrect';
    case 'invalid_code':
      return 'Invalid code. Please try again.';
    case 'too_many_attempts':
      return 'Too many login attempts. Try again in 15 minutes.';
    case 'invalid_session':
      return 'Session expired. Please log in again.';
    case 'setup_expired':
      return '2FA setup expired. Start the setup process again.';
    case 'validation_error':
      return 'Invalid request format';
    case 'internal_error':
      return 'Server error. Please try again later.';
    default:
      return data.message || 'An error occurred';
  }
}
```

## CORS Configuration

**Backend needs to allow frontend origin:**

```typescript
// In server.ts, add Fastify CORS plugin
fastify.register(import('@fastify/cors'), {
  origin: [
    'http://localhost:3000',  // Dev
    'https://admin.sikads.com', // Prod
  ],
  credentials: true,
});
```

## Complete Login Form Example

```html
<form id="login-form">
  <input type="email" id="email" placeholder="Email" required>
  <input type="password" id="password" placeholder="Password" required>
  <button type="submit">Log In</button>
  <p id="error-message" style="color: red; display: none;"></p>
</form>

<script>
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const errorDiv = document.getElementById('error-message');

  try {
    const result = await handleLogin(email, password);

    if (!result) {
      errorDiv.textContent = 'Login failed. Please try again.';
      errorDiv.style.display = 'block';
      return;
    }

    // Navigate to MFA screen
    window.location.href = `/mfa?method=${result.mfaMethod}`;
  } catch (error) {
    errorDiv.textContent = error.message;
    errorDiv.style.display = 'block';
  }
});
</script>
```

## Security Best Practices

1. **Never log access tokens**
2. **Always use HTTPS in production**
3. **Store tokens in `localStorage` (not cookies for SPA)**
4. **Set `httpOnly` for cookies if using them**
5. **Implement token expiration checks**
6. **Validate email format on frontend** (backend also validates)
7. **Handle rate limiting gracefully** (show user-friendly message)
8. **Clear tokens on logout**
9. **Implement CSRF protection if using cookies**
10. **Validate password requirements before sending** (minimum 8 chars)

## Testing

### Test with cURL

```bash
# Login
curl -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "SecurePassword123"
  }'

# Verify TOTP
curl -X POST http://localhost:3000/v1/auth/verify-totp \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "...",
    "code": "123456"
  }'

# Get Current User
curl -X GET http://localhost:3000/v1/auth/me \
  -H "Authorization: Bearer ..."
```

### Test with Postman

1. Import API endpoints from `API-ENDPOINTS.md`
2. Set up environment variables:
   - `base_url` = http://localhost:3000/v1/auth
   - `access_token` = {{token from login}}
3. Run requests in order

## Environment Configuration

### Development
- Base URL: `http://localhost:3000/v1/auth`
- Enable logging and debugging
- CORS: `http://localhost:3000`

### Production
- Base URL: `https://admin-api.sikads.com/v1/auth`
- SSL/TLS enabled
- CORS: `https://admin.sikads.com`
- Rate limiting: enabled
- Audit logging: enabled

## Deployment Checklist

- [ ] Backend API deployed to production server
- [ ] Database migrations run successfully
- [ ] Environment variables set correctly
- [ ] SSL certificates configured
- [ ] CORS allows frontend origin
- [ ] Frontend updated with production API URL
- [ ] Rate limiting tested and working
- [ ] Email service integrated (SendGrid)
- [ ] SMS service integrated (Twilio)
- [ ] Health check endpoint responsive
- [ ] Audit logging enabled
- [ ] Monitoring and alerting configured
