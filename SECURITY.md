# Bidwise AI - Security Guide

## 🔒 Security Implementation

### 1. **Middleware Stack**
- ✅ **Helmet.js** - Security headers
- ✅ **CORS** - Origin validation
- ✅ **Rate Limiting** - DDoS protection
- ✅ **Input Sanitization** - XSS prevention
- ✅ **JWT Auth** - Token-based authentication

### 2. **Rate Limits**
```
Global:          100 req/min
Auth endpoints:  5 attempts/15min per email
API endpoints:   30 req/min per user
Analyze:         3/hour (free), unlimited (pro/team)
```

### 3. **Data Protection**
- ✅ DOMPurify sanitization for HTML/XSS attacks
- ✅ SQL injection pattern detection
- ✅ Input validation with Joi
- ✅ HTTPS redirect in production
- ✅ Secure headers (CSP, X-Frame-Options, etc.)

### 4. **Authentication**
```javascript
// Protected routes require JWT token
Authorization: Bearer <token>

// Token expires in 30 days
// Plan-based access control (free/pro/team)
```

### 5. **CORS Configuration**
Allowed origins:
- http://localhost:3000 (dev)
- http://localhost:3001 (dev)
- https://bidwise.app (production)
- https://www.bidwise.app (production)

### 6. **Error Handling**
- ✅ Never expose stack traces in production
- ✅ Centralized error logging
- ✅ User-friendly error messages
- ✅ Proper HTTP status codes

## 🚀 Best Practices

### API Calls
```bash
# Always include auth token
curl -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     https://bidwise.app/api/protected/analyze
```

### Environment Variables
- Store sensitive data in `.env` (not in code)
- Use `.env.local` for development
- Rotate API keys regularly
- Keep `JWT_SECRET` at least 32 characters

### Monitoring
- All requests logged with IP, method, path, status
- Error rates tracked automatically
- Rate limit violations logged
- Suspicious patterns detected

## 🛡️ Common Attacks & Protection

| Attack | Protection |
|--------|-----------|
| XSS | DOMPurify sanitization |
| SQL Injection | Pattern detection + parameterized queries |
| CSRF | SameSite cookies + CORS |
| DDoS | Rate limiting + Helmet |
| Clickjacking | X-Frame-Options header |
| Headers | CSP, X-Content-Type-Options |

## 📝 Security Checklist

- [ ] Environment variables configured
- [ ] JWT_SECRET is strong (32+ chars)
- [ ] HTTPS enabled in production
- [ ] Rate limits appropriate for your needs
- [ ] CORS origins whitelist updated
- [ ] Error logging enabled
- [ ] No sensitive data in logs
- [ ] Authentication tested
- [ ] Rate limiting tested
- [ ] CORS tested

## 🔧 Production Deployment

1. Set `NODE_ENV=production`
2. Enable HTTPS redirect
3. Set strong `JWT_SECRET`
4. Configure proper CORS origins
5. Enable error monitoring (Sentry)
6. Use environment-specific API keys
7. Set rate limits appropriate to capacity
8. Monitor logs for suspicious activity
