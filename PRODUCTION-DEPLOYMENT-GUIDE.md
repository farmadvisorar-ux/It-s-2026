# Production Deployment Guide

Complete guide for deploying Sikas authentication infrastructure to production.

## Pre-Deployment Checklist

### Infrastructure Requirements
- [ ] Kubernetes cluster (1.28+) or Docker Swarm
- [ ] PostgreSQL 16 instance (managed service or self-hosted)
- [ ] Redis 7 instance (managed service like ElastiCache or self-hosted)
- [ ] SSL/TLS certificates (from Let's Encrypt or commercial CA)
- [ ] DNS records configured
- [ ] Load balancer (ALB/NLB for AWS, others for other clouds)
- [ ] S3 or object storage for backups
- [ ] Email service API key (SendGrid, Mailgun, SES)
- [ ] SMS service API key (Twilio, Amazon SNS)
- [ ] Logging infrastructure (CloudWatch, ELK, DataDog)
- [ ] Monitoring & alerting (Prometheus, Grafana, PagerDuty)

### Code Readiness
- [ ] All dependencies updated and audited
- [ ] Security vulnerabilities checked (`npm audit`)
- [ ] Unit and integration tests passing
- [ ] Load testing completed
- [ ] Code review completed
- [ ] Deployment scripts tested
- [ ] Rollback procedure documented

### Data Readiness
- [ ] Database backups configured
- [ ] Data retention policies set
- [ ] Disaster recovery plan documented
- [ ] Point-in-time recovery tested

## Environment Configuration

### Production Environment Variables

```env
# Database
DATABASE_URL=postgresql://sikas_prod:${DB_PASSWORD}@prod-db.us-east-1.rds.amazonaws.com:5432/sikas_auth
DB_POOL_SIZE=20
DB_IDLE_TIMEOUT=30000

# Redis
REDIS_URL=redis://:${REDIS_PASSWORD}@prod-redis.us-east-1.cache.amazonaws.com:6379
REDIS_TLS_ENABLED=true

# JWT
JWT_SECRET=${PRODUCTION_JWT_SECRET_MIN_32_CHARS}

# Email Service
SENDGRID_API_KEY=${SENDGRID_API_KEY}
SENDGRID_FROM_EMAIL=noreply@sikads.com

# SMS Service
TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID}
TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN}
TWILIO_PHONE_NUMBER=${TWILIO_PHONE_NUMBER}

# Application
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info

# Security
ENABLE_RATE_LIMITING=true
RATE_LIMIT_LOGIN_ATTEMPTS=5
RATE_LIMIT_WINDOW_MS=900000

# Monitoring
DATADOG_API_KEY=${DATADOG_API_KEY}
SENTRY_DSN=${SENTRY_DSN}

# Feature Flags
ENABLE_TOTP_MFA=true
ENABLE_SMS_MFA=true
ENABLE_PASSWORD_RESET=true
```

### Secure Secrets Management

**Using AWS Secrets Manager:**
```bash
aws secretsmanager create-secret \
  --name sikas/auth-api/prod \
  --secret-string '{
    "JWT_SECRET": "your_secret_key_here",
    "DB_PASSWORD": "your_db_password_here",
    "REDIS_PASSWORD": "your_redis_password_here",
    "SENDGRID_API_KEY": "SG.your_key_here",
    "TWILIO_AUTH_TOKEN": "your_token_here"
  }'
```

**Using Kubernetes Secrets:**
```bash
kubectl create secret generic sikas-auth-secrets \
  --from-literal=JWT_SECRET=your_secret_key \
  --from-literal=DB_PASSWORD=your_db_password \
  --namespace=production
```

## Deployment Methods

### Method 1: Kubernetes (Recommended)

#### Create Namespace
```bash
kubectl create namespace sikas-production
```

#### Deploy Database Migration Job
```yaml
# migrations-job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: sikas-auth-migrations
  namespace: sikas-production
spec:
  template:
    spec:
      serviceAccountName: sikas-auth
      containers:
      - name: migrations
        image: sikas-auth-api:latest
        command: ["npm", "run", "migrate"]
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: sikas-auth-secrets
              key: DATABASE_URL
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: sikas-auth-secrets
              key: REDIS_URL
      restartPolicy: Never
  backoffLimit: 3
```

#### Deploy Application
```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sikas-auth-api
  namespace: sikas-production
  labels:
    app: sikas-auth-api
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: sikas-auth-api
  template:
    metadata:
      labels:
        app: sikas-auth-api
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
    spec:
      serviceAccountName: sikas-auth
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
      containers:
      - name: sikas-auth-api
        image: sikas-auth-api:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 3000
          name: http
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: sikas-auth-secrets
              key: DATABASE_URL
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: sikas-auth-secrets
              key: REDIS_URL
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: sikas-auth-secrets
              key: JWT_SECRET
        - name: SENDGRID_API_KEY
          valueFrom:
            secretKeyRef:
              name: sikas-auth-secrets
              key: SENDGRID_API_KEY
        - name: LOG_LEVEL
          value: "info"
        resources:
          requests:
            cpu: 250m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 512Mi
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 2
        volumeMounts:
        - name: config
          mountPath: /app/config
          readOnly: true
      volumes:
      - name: config
        configMap:
          name: sikas-auth-config
```

#### Deploy Service
```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: sikas-auth-api
  namespace: sikas-production
spec:
  type: ClusterIP
  selector:
    app: sikas-auth-api
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
    name: http
```

#### Deploy Ingress
```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: sikas-auth-api
  namespace: sikas-production
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - admin-api.sikads.com
    secretName: sikas-auth-tls
  rules:
  - host: admin-api.sikads.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: sikas-auth-api
            port:
              number: 80
```

#### Deploy Commands
```bash
# Create secrets
kubectl apply -f secrets.yaml -n sikas-production

# Run migrations
kubectl apply -f migrations-job.yaml -n sikas-production
kubectl wait --for=condition=complete job/sikas-auth-migrations -n sikas-production --timeout=300s

# Deploy application
kubectl apply -f deployment.yaml -n sikas-production
kubectl apply -f service.yaml -n sikas-production
kubectl apply -f ingress.yaml -n sikas-production

# Verify deployment
kubectl get pods -n sikas-production
kubectl get svc -n sikas-production
kubectl get ingress -n sikas-production
```

### Method 2: Docker Swarm

```bash
# Initialize swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.prod.yml sikas_auth
```

**docker-compose.prod.yml:**
```yaml
version: '3.8'

services:
  auth-api:
    image: registry.sikads.com/sikas-auth-api:latest
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://...
      REDIS_URL: redis://...
      JWT_SECRET: ${JWT_SECRET}
      NODE_ENV: production
    deploy:
      replicas: 3
      placement:
        constraints: [node.role == worker]
      restart_policy:
        condition: on-failure
      update_config:
        parallelism: 1
        delay: 10s
    networks:
      - sikas_network

  reverse-proxy:
    image: nginx:latest
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    deploy:
      replicas: 2
      placement:
        constraints: [node.role == manager]
    networks:
      - sikas_network

networks:
  sikas_network:
    driver: overlay
```

### Method 3: EC2/DigitalOcean with Systemd

#### Build and Push Image
```bash
# Build image
docker build -t registry.sikads.com/sikas-auth-api:1.0.0 .

# Push to registry
docker push registry.sikads.com/sikas-auth-api:1.0.0
```

#### Systemd Service File
```ini
# /etc/systemd/system/sikas-auth-api.service
[Unit]
Description=Sikas Auth API
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
Restart=always
RestartSec=10
User=docker
WorkingDirectory=/opt/sikas

ExecStart=/usr/bin/docker run \
  --rm \
  --name sikas-auth-api \
  -p 3000:3000 \
  --env-file /opt/sikas/.env.prod \
  registry.sikads.com/sikas-auth-api:1.0.0

ExecStop=/usr/bin/docker stop sikas-auth-api

[Install]
WantedBy=multi-user.target
```

#### Deploy Commands
```bash
# Copy service file
sudo cp sikas-auth-api.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Start service
sudo systemctl start sikas-auth-api

# Enable at boot
sudo systemctl enable sikas-auth-api

# View logs
sudo journalctl -u sikas-auth-api -f
```

## Database Setup

### PostgreSQL Connection

```bash
# Install PostgreSQL client
apt-get install postgresql-client

# Connect to production database
psql postgresql://sikas_prod@prod-db.us-east-1.rds.amazonaws.com:5432/sikas_auth

# Run migrations
npm run migrate
```

### Backup Configuration

```bash
# Daily backup to S3
0 2 * * * /usr/local/bin/backup-db.sh
```

**backup-db.sh:**
```bash
#!/bin/bash
DB_URL="postgresql://sikas_prod:...@prod-db..."
BACKUP_FILE="/tmp/sikas_auth_$(date +%Y%m%d_%H%M%S).sql"

pg_dump "$DB_URL" | gzip > "$BACKUP_FILE"
aws s3 cp "$BACKUP_FILE" s3://sikas-backups/auth-api/
rm "$BACKUP_FILE"
```

### Point-in-Time Recovery

```bash
# AWS RDS with automated backups
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier sikas-auth-restored \
  --db-snapshot-identifier sikas-auth-snapshot
```

## Redis Setup

### AWS ElastiCache (Recommended)

```bash
aws elasticache create-cache-cluster \
  --cache-cluster-id sikas-auth-redis \
  --cache-node-type cache.t3.medium \
  --engine redis \
  --engine-version 7.0 \
  --num-cache-nodes 1 \
  --security-group-ids sg-xxxxx \
  --at-rest-encryption-enabled \
  --transit-encryption-enabled
```

### Self-Hosted Redis

```bash
# Install Redis
apt-get install redis-server

# Configure /etc/redis/redis.conf
requirepass your_secure_password
maxmemory 256mb
maxmemory-policy allkeys-lru

# Enable persistence
save 900 1

# Start service
systemctl start redis-server
systemctl enable redis-server
```

## SSL/TLS Configuration

### Using Let's Encrypt with Certbot

```bash
# Install Certbot
apt-get install certbot python3-certbot-nginx

# Generate certificate
certbot certonly --nginx \
  --non-interactive \
  --agree-tos \
  -m admin@sikads.com \
  -d admin-api.sikads.com

# Auto-renewal
systemctl enable certbot.timer
systemctl start certbot.timer
```

### Nginx Configuration

```nginx
# /etc/nginx/sites-available/sikas-auth-api
server {
    listen 80;
    server_name admin-api.sikads.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name admin-api.sikads.com;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/admin-api.sikads.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin-api.sikads.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Proxy to backend
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

## Monitoring & Logging

### Application Logs to CloudWatch

```typescript
// src/server.ts
import pino from 'pino';

const transport = pino.transport({
  target: 'pino-loki',
  options: {
    host: 'logs.us-east-1.logz.io',
    batchInterval: 3,
  },
});

export const logger = pino(transport);
```

### Prometheus Metrics

```typescript
// src/middleware/metrics.ts
import prometheus from 'fastify-metrics';

fastify.register(prometheus, {
  defaultMetrics: { enabled: true },
  routeMetrics: { enabled: true },
});

// Endpoint: GET /metrics
```

### Health Check Endpoint

```typescript
fastify.get('/health', async (request, reply) => {
  const dbHealthy = await checkDatabase();
  const redisHealthy = await checkRedis();

  if (!dbHealthy || !redisHealthy) {
    return reply.code(503).send({
      status: 'unhealthy',
      database: dbHealthy ? 'ok' : 'error',
      redis: redisHealthy ? 'ok' : 'error',
    });
  }

  return reply.code(200).send({
    status: 'healthy',
    database: 'ok',
    redis: 'ok',
  });
});
```

### Monitoring Alerts

**Prometheus alert rules (prometheus-rules.yml):**
```yaml
groups:
- name: sikas_auth
  rules:
  - alert: AuthAPIDown
    expr: up{job="sikas-auth-api"} == 0
    for: 2m
    annotations:
      summary: Sikas Auth API is down

  - alert: HighErrorRate
    expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
    annotations:
      summary: High error rate on Auth API

  - alert: HighLatency
    expr: histogram_quantile(0.95, http_request_duration_seconds) > 1
    annotations:
      summary: High latency on Auth API

  - alert: DatabaseConnectionErrors
    expr: increase(db_connection_errors_total[5m]) > 10
    annotations:
      summary: High database connection errors
```

## Scaling & Performance

### Horizontal Scaling

```bash
# Kubernetes - Auto-scaling
kubectl autoscale deployment sikas-auth-api \
  --min=3 --max=10 \
  --cpu-percent=70 \
  -n sikas-production
```

### Database Connection Pooling

```typescript
// src/db/pool.ts
const pool = new Pool({
  max: 20,
  min: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### Cache Optimization

```typescript
// Cache user lookups for 5 minutes
const getCachedUser = async (email: string) => {
  const cached = await redis.get(`user:${email}`);
  if (cached) return JSON.parse(cached);

  const user = await authService.getUserByEmail(email);
  await redis.setex(`user:${email}`, 300, JSON.stringify(user));
  return user;
};
```

## Disaster Recovery

### Backup Strategy

**Daily automated backups:**
```
- Database: RDS automated backups (35-day retention)
- Redis: RDB snapshots to S3
- Config: Git repository with automated sync
```

### Recovery Procedures

**Database Recovery:**
```bash
# Point-in-time restore
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier sikas-auth-restored \
  --restore-time 2026-08-26T12:00:00Z
```

**Redis Recovery:**
```bash
# Restore from S3 snapshot
aws s3 cp s3://sikas-backups/redis/latest.rdb /tmp/
redis-cli BGSAVE
```

### RTO/RPO Targets

- **RTO (Recovery Time Objective):** 15 minutes
- **RPO (Recovery Point Objective):** 1 hour

## Security Hardening

### Network Security

```bash
# Security groups
- Inbound: HTTPS (443), HTTP (80) from LoadBalancer
- Outbound: All traffic
- Database: Port 5432 from app only
- Redis: Port 6379 from app only
```

### Application Security

```bash
# Security headers in Nginx
add_header X-Frame-Options "DENY";
add_header X-Content-Type-Options "nosniff";
add_header X-XSS-Protection "1; mode=block";
add_header Referrer-Policy "strict-origin-when-cross-origin";
add_header Permissions-Policy "geolocation=(), microphone=()";
```

### Secret Rotation

```bash
# Rotate JWT_SECRET every 30 days
- Create new secret
- Deploy with both old and new secrets
- Validate tokens with both
- Remove old secret after 30 days
```

## Post-Deployment Validation

### Health Checks

```bash
# API health
curl https://admin-api.sikads.com/health

# Database connectivity
curl -H "Authorization: Bearer $TOKEN" \
  https://admin-api.sikads.com/v1/auth/me

# SSL certificate
openssl s_client -connect admin-api.sikads.com:443
```

### Load Testing

```bash
# Using Apache Bench
ab -n 10000 -c 100 https://admin-api.sikads.com/health

# Using k6
k6 run load-test.js
```

### Security Scan

```bash
# Dependency audit
npm audit --production

# OWASP ZAP scan
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t https://admin-api.sikads.com
```

## Rollback Procedure

### Kubernetes Rollback

```bash
# View rollout history
kubectl rollout history deployment/sikas-auth-api

# Rollback to previous version
kubectl rollout undo deployment/sikas-auth-api

# Rollback to specific version
kubectl rollout undo deployment/sikas-auth-api --to-revision=2
```

### Manual Rollback

```bash
# Docker
docker run -d \
  --name sikas-auth-api \
  sikas-auth-api:previous-version

# Stop new version
docker stop sikas-auth-api-new

# Redirect traffic back to old version
```

## Maintenance Windows

### Zero-Downtime Deployments

```bash
# Using blue-green deployment
- Deploy new version as "green"
- Test green thoroughly
- Switch load balancer to green
- Keep blue for rollback (1 hour)
- Decommission blue
```

### Database Migrations

```bash
# Schema changes during deployment
1. Deploy app with backward-compatible code
2. Run migrations
3. Deploy app using new schema
```

## Documentation & Handoff

- [ ] Deployment runbook created
- [ ] Emergency procedures documented
- [ ] On-call escalation path defined
- [ ] Team trained on deployment process
- [ ] Monitoring dashboards created
- [ ] Alert thresholds tuned
- [ ] RunBook kept in GitOps repository

## Support & Escalation

- **On-Call:** On-call schedule via PagerDuty
- **Escalation:** platform-oncall@sikads.com
- **Emergency:** +1-XXX-XXX-XXXX
