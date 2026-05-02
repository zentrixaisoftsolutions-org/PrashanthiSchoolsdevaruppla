# Mobile App Configuration Guide

## API Base URL Configuration

The mobile app now supports **automatic environment-based configuration** for the backend API URL.

---

## 🎯 How It Works

The app automatically selects the correct API URL based on:

1. **Environment Variable** (`REACT_APP_ENV`) - if set
2. **Development Flag** (`__DEV__`) - automatic detection
3. **Default URLs** - configured in `constants.ts`

---

## ⚙️ Configuration Methods

### Method 1: Automatic (Recommended)

**No configuration needed!** The app automatically uses:
- **Development**: Local IP when debugging (`__DEV__ = true`)
- **Production**: Production URL when built for release

### Method 2: Environment Variable

Set `REACT_APP_ENV` to control the environment:

```bash
# Development
export REACT_APP_ENV=development

# Staging
export REACT_APP_ENV=staging

# Production
export REACT_APP_ENV=production
```

### Method 3: Direct Edit

Edit `src/config/constants.ts` and update the URLs:

```typescript
const DEV_API_URL = 'http://YOUR_LOCAL_IP:8000';
const PROD_API_URL = 'https://api.schoolerp.com';
const STAGING_API_URL = 'https://staging-api.schoolerp.com';
```

---

## 📝 URL Configuration by Platform

### For Physical Devices (Testing)

**Find your local IP:**
```bash
# Windows
ipconfig
# Look for IPv4 Address (e.g., 192.168.1.100)

# Mac/Linux
ifconfig | grep "inet "
```

**Update DEV_API_URL:**
```typescript
const DEV_API_URL = 'http://192.168.1.100:8000';
```

### For Android Emulator

```typescript
const DEV_API_URL = 'http://10.0.2.2:8000';
```
> `10.0.2.2` is the special address for localhost on Android emulator

### For iOS Simulator

```typescript
const DEV_API_URL = 'http://localhost:8000';
```

---

## 🔄 Environment Flow

```
App Launch
    │
    ▼
Check REACT_APP_ENV
    │
    ├─ 'production' ──► Use PROD_API_URL
    ├─ 'staging' ─────► Use STAGING_API_URL
    ├─ 'development' ─► Use DEV_API_URL
    └─ Not Set ───────► Check __DEV__
                            │
                            ├─ true ──► DEV_API_URL
                            └─ false ─► PROD_API_URL
```

---

## 🚀 Quick Setup Examples

### Example 1: Local Development on Phone

```typescript
// In constants.ts
const DEV_API_URL = 'http://192.168.1.100:8000';
```

**Requirements:**
- Phone and computer on same WiFi
- Backend running: `python -m uvicorn main:app --host 0.0.0.0`

### Example 2: Testing on Android Emulator

```typescript
// In constants.ts
const DEV_API_URL = 'http://10.0.2.2:8000';
```

**Requirements:**
- Android emulator running
- Backend running: `python -m uvicorn main:app`

### Example 3: Production Build

```typescript
// In constants.ts
const PROD_API_URL = 'https://api.schoolerp.com';
```

Then build:
```bash
expo build:android
# or
eas build --platform android
```

The production URL will be used automatically.

---

## 🧪 Testing Different Environments

### Test Development URL

```bash
# Start app normally
npm start
# __DEV__ is true, uses DEV_API_URL
```

### Test Production URL (without building)

Set environment variable:
```bash
# Windows PowerShell
$env:REACT_APP_ENV="production"
npm start

# Mac/Linux
export REACT_APP_ENV=production
npm start
```

### Test Staging URL

```bash
export REACT_APP_ENV=staging
npm start
```

---

## 🔍 Verify Current Configuration

Add logging to see which URL is being used:

```typescript
// In constants.ts (temporary)
const apiUrl = getApiBaseUrl();
console.log('🌐 API Base URL:', apiUrl);
export const API_BASE_URL = apiUrl;
```

Check the console when app launches to see which URL is active.

---

## 📱 Platform-Specific Notes

### Android
- Physical device: Use your computer's local IP
- Emulator: Use `10.0.2.2` for localhost
- Ensure firewall allows connections on port 8000

### iOS
- Physical device: Use your computer's local IP
- Simulator: Use `localhost` or `127.0.0.1`
- Mac only for iOS development

---

## 🛡️ Security Best Practices

1. **Never commit sensitive URLs** to version control
2. **Use HTTPS in production**: `https://api.schoolerp.com`
3. **Keep .env files private**: Add `.env` to `.gitignore`
4. **Use different keys/secrets** per environment
5. **Validate SSL certificates** in production

---

## 🔧 Troubleshooting

### Cannot connect to backend

1. **Check URL is correct:**
   ```typescript
   console.log('API URL:', API_BASE_URL);
   ```

2. **Verify backend is accessible:**
   ```bash
   curl http://YOUR_IP:8000/docs
   ```

3. **Check firewall settings** (Windows):
   ```bash
   netsh advfirewall firewall add rule name="FastAPI" dir=in action=allow protocol=TCP localport=8000
   ```

4. **Ensure device and computer on same network**

### Wrong URL being used

1. **Check __DEV__ flag:**
   ```typescript
   console.log('Is Dev?', __DEV__);
   ```

2. **Clear environment variable:**
   ```bash
   unset REACT_APP_ENV
   ```

3. **Restart Metro bundler:**
   ```bash
   expo start -c
   ```

---

## 📚 Additional Configuration

### Custom Configuration

You can extend the configuration in `constants.ts`:

```typescript
// Add custom environment
const getApiBaseUrl = (): string => {
  const customEnv = process.env.REACT_APP_ENV;
  
  if (customEnv === 'local') {
    return 'http://localhost:8000';
  }
  if (customEnv === 'production') {
    return PROD_API_URL;
  }
  // ... other cases
  
  return __DEV__ ? DEV_API_URL : PROD_API_URL;
};
```

### Multiple Backend Services

```typescript
export const API_URLS = {
  MAIN: getApiBaseUrl(),
  ANALYTICS: getAnalyticsUrl(),
  STORAGE: getStorageUrl(),
};
```

---

## ✅ Configuration Checklist

Before running the app:

- [ ] Update `DEV_API_URL` with your local IP
- [ ] Update `PROD_API_URL` with production server
- [ ] Backend is running and accessible
- [ ] Firewall allows connections (if needed)
- [ ] Device and computer on same network (for testing)
- [ ] Environment variable set (if using custom environment)

---

## 🆘 Need Help?

- Check [SETUP_GUIDE.md](SETUP_GUIDE.md) for installation
- Review [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) for technical details
- Ensure backend is running: `http://YOUR_IP:8000/docs`

---

**Last Updated**: March 2026  
**Version**: 1.0.0
