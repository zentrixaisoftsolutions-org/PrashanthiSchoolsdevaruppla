# School ERP Mobile - Authentication Flow

## Overview

The mobile app uses **JWT (JSON Web Token)** based authentication, mirroring the web application's authentication system. This document details the complete authentication process.

## Authentication Architecture

### 1. Login Flow

```
┌─────────────┐
│ User enters │
│ credentials │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│ POST /api/auth/login            │
│ Body: { email, password }       │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ Backend validates credentials   │
│ via AuthService                 │
└──────┬──────────────────────────┘
       │
       ├─── Invalid ───► Show error message
       │
       ▼ Valid
┌─────────────────────────────────┐
│ Backend returns:                │
│ - access_token (JWT)            │
│ - user_id                       │
│ - role                          │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ Mobile app stores:              │
│ 1. Token in AsyncStorage        │
│ 2. User data in AsyncStorage    │
│ 3. Updates AuthContext          │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ Fetch menu access permissions   │
│ GET /api/role-access/my-access  │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ Navigate to Dashboard           │
└─────────────────────────────────┘
```

## Step-by-Step Authentication Process

### Step 1: Initial State

When the app launches:

1. **AuthContext** checks AsyncStorage for existing token
2. If token exists:
   - Load cached user data
   - Attempt to refresh menu access from backend
   - Navigate to Dashboard
3. If no token:
   - Show Login Screen

**Implementation** (`src/contexts/AuthContext.tsx`):
```typescript
useEffect(() => {
  const storedUser = localStorage.getItem('user');
  if (storedUser) {
    setUser(JSON.parse(storedUser));
    fetchMenuAccess();
  }
  setIsLoading(false);
}, []);
```

### Step 2: User Login

User enters credentials on Login Screen:

**Required Fields**:
- Email (validated format)
- Password (minimum requirements handled by backend)

**Frontend Validation**:
```typescript
if (!email || !password) {
  Alert.alert('Error', 'Please enter email and password');
  return;
}
```

### Step 3: API Authentication

**Request**:
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@school.com",
  "password": "password123"
}
```

**Response** (Success - 200):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user_id": 1,
  "role": "admin"
}
```

**Response** (Error - 401):
```json
{
  "detail": "Invalid credentials"
}
```

### Step 4: Token Storage

Upon successful authentication:

1. **Store JWT Token**:
   ```typescript
   await AsyncStorage.setItem('access_token', response.access_token);
   ```

2. **Create User Object**:
   ```typescript
   const userData: User = {
     id: response.user_id,
     email,
     username: email.split('@')[0],
     role_id: getRoleId(response.role),
     role: response.role,
     is_active: true,
     created_at: new Date().toISOString(),
     updated_at: new Date().toISOString(),
   };
   ```

3. **Store User Data**:
   ```typescript
   await AsyncStorage.setItem('user', JSON.stringify(userData));
   ```

4. **Update Context**:
   ```typescript
   setUser(userData);
   ```

### Step 5: Menu Access Control

Fetch user's menu permissions:

**Request**:
```http
GET /api/role-access/my-access
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response**:
```json
{
  "allowed_paths": [
    "/dashboard",
    "/students",
    "/attendance",
    "/exams"
  ]
}
```

**Storage**:
```typescript
await AsyncStorage.setItem('menu_access', JSON.stringify(allowedPaths));
setMenuAccess(allowedPaths);
```

### Step 6: Authenticated API Requests

All subsequent API requests automatically include the token:

**Implementation** (`src/services/apiClient.ts`):
```typescript
this.client.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  }
);
```

**Example Request**:
```http
GET /api/students
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Step 7: Token Expiration Handling

When token expires (after 30 minutes by default):

1. **Backend returns 401 Unauthorized**
2. **Response interceptor catches it**:
   ```typescript
   if (error.response?.status === 401) {
     await AsyncStorage.multiRemove([
       'access_token',
       'user_data',
       'menu_access',
     ]);
     // User will be redirected to Login
   }
   ```
3. **User must login again**

### Step 8: Logout Process

When user clicks logout:

1. **Show confirmation dialog**
2. **Clear all stored data**:
   ```typescript
   await AsyncStorage.multiRemove([
     'access_token',
     'user_data',
     'menu_access',
   ]);
   ```
3. **Reset context state**:
   ```typescript
   setUser(null);
   setMenuAccess(null);
   ```
4. **Navigate to Login Screen**

## Role-Based Access Control

### Supported Roles

| Role | ID | Description | Access Level |
|------|-----|-------------|--------------|
| super_admin | 1 | System Administrator | Full access |
| admin | 2 | School Administrator | Admin features |
| teacher | 3 | Teacher | Teaching features |
| student | 4 | Student | Student portal |
| parent | 5 | Parent | Parent portal |

### Menu Access Logic

**No restrictions** (menuAccess = null):
- User sees all screens based on role defaults

**Restricted** (menuAccess = array of paths):
- User only sees specified screens
- Example: `["/dashboard", "/students"]`

**Implementation**:
```typescript
const isAllowed = 
  menuAccess === null || 
  menuAccess.includes(currentPath);
```

## Security Features

### 1. Token Security

- **Algorithm**: HS256 (HMAC with SHA-256)
- **Storage**: AsyncStorage (platform-specific secure storage)
- **Transmission**: HTTPS only in production
- **Expiration**: 30 minutes (configurable)

### 2. Password Security

- **Hashing**: bcrypt (handled by backend)
- **Never stored**: Passwords are never stored in mobile app
- **Transmission**: Only sent during login

### 3. API Security

- **Bearer Token**: All requests include `Authorization: Bearer <token>`
- **Automatic Injection**: Token added by interceptor
- **Automatic Cleanup**: Token cleared on 401 responses

### 4. Data Protection

- **No sensitive logging**: Passwords/tokens not logged
- **Secure storage**: AsyncStorage is encrypted on both platforms
- **Auto-logout**: On token expiration

## Error Handling

### Login Errors

| Error | Cause | User Message |
|-------|-------|--------------|
| 401 | Invalid credentials | "Invalid email or password" |
| 500 | Server error | "Server error. Please try again" |
| Network | Connection failed | "Cannot connect to server" |

### Token Errors

| Error | Cause | Action |
|-------|-------|--------|
| 401 | Expired token | Auto-logout, redirect to login |
| 401 | Invalid token | Auto-logout, redirect to login |
| 403 | Insufficient permissions | Show "Unauthorized" message |

## Testing Authentication

### Test Cases

1. **Valid Login**:
   - Email: Valid user email
   - Password: Correct password
   - Expected: Successful login, redirect to Dashboard

2. **Invalid Login**:
   - Email: Valid format
   - Password: Wrong password
   - Expected: Error message "Invalid credentials"

3. **Empty Fields**:
   - Email: Empty
   - Password: Empty
   - Expected: Error message "Please enter email and password"

4. **Token Expiration**:
   - Login successfully
   - Wait 30+ minutes
   - Make API request
   - Expected: Auto-logout, redirect to login

5. **Logout**:
   - Login successfully
   - Click logout
   - Confirm logout
   - Expected: Redirect to login, data cleared

## Configuration

### Backend Configuration

In `config.py`:
```python
SECRET_KEY: str = "your-secret-key"
ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
```

### Mobile Configuration

In `src/config/constants.ts`:
```typescript
export const API_BASE_URL = 'http://YOUR_IP:8000';
export const APP_CONFIG = {
  TOKEN_KEY: 'access_token',
  USER_KEY: 'user_data',
  MENU_ACCESS_KEY: 'menu_access',
};
```

## Troubleshooting

### Cannot Login

1. **Check backend is running**: Visit `http://YOUR_IP:8000/docs`
2. **Verify API_BASE_URL**: Check `constants.ts`
3. **Test credentials**: Try logging into web app
4. **Check network**: Ensure device can reach backend

### Token Issues

1. **Clear AsyncStorage**: Uninstall and reinstall app
2. **Check token expiration**: Verify backend settings
3. **Inspect network requests**: Use React Native Debugger

### Permission Issues

1. **Check role**: Verify user role in backend
2. **Check menu_access**: Review role access settings
3. **Clear cache**: Logout and login again

## API Endpoints Reference

| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| `/api/auth/login` | POST | User login | No |
| `/api/auth/register` | POST | User registration | No |
| `/api/auth/users` | GET | List users | Yes (super_admin) |
| `/api/role-access/my-access` | GET | Get menu access | Yes |
| `/api/dashboard` | GET | Dashboard stats | Yes |

## Best Practices

1. **Never log tokens**: Don't console.log JWT tokens
2. **Use HTTPS**: Always use HTTPS in production
3. **Short expiration**: Keep token expiry reasonable (30 min)
4. **Refresh tokens**: Consider implementing refresh tokens
5. **Secure storage**: Always use AsyncStorage, not global variables
6. **Validate inputs**: Always validate user inputs
7. **Handle errors**: Gracefully handle all auth errors
8. **Test thoroughly**: Test all authentication scenarios

## Future Enhancements

- [ ] Biometric authentication (Face ID/Fingerprint)
- [ ] Refresh token implementation
- [ ] Remember me functionality
- [ ] Social login (Google, Facebook)
- [ ] Two-factor authentication (2FA)
- [ ] Password reset flow
- [ ] Email verification
- [ ] Session management across devices

---

**Document Version**: 1.0  
**Last Updated**: 2024  
**Maintained By**: Development Team
