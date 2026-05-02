# School ERP Mobile App - Setup Guide

## Quick Start Guide

### Step 1: Install Node.js and Dependencies

1. **Install Node.js** (if not already installed):
   - Download from: https://nodejs.org/ (v16 or higher)
   - Verify installation: `node --version`

2. **Install Expo CLI globally**:
   ```bash
   npm install -g expo-cli
   ```

### Step 2: Install Project Dependencies

Navigate to the mobile folder and install dependencies:

```bash
cd C:\Users\oruga\OneDrive\Documents\Projects\WorkingCopies\SchoolERP\mobile
npm install
```

### Step 3: Configure Backend Connection

1. Open `src/config/constants.ts`
2. Update the `API_BASE_URL` with your backend server URL

**Important URL Configuration:**

- **For Physical Device Testing** (recommended):
  ```typescript
  export const API_BASE_URL = 'http://YOUR_LOCAL_IP:8000';
  ```
  - Find your local IP:
    - Windows: Run `ipconfig` in Command Prompt, look for IPv4 Address
    - Example: `http://192.168.1.100:8000`

- **For Android Emulator**:
  ```typescript
  export const API_BASE_URL = 'http://10.0.2.2:8000';
  ```

- **For iOS Simulator** (Mac only):
  ```typescript
  export const API_BASE_URL = 'http://localhost:8000';
  ```

### Step 4: Ensure Backend is Running

Make sure your FastAPI backend is running:

```bash
cd C:\Users\oruga\OneDrive\Documents\Projects\WorkingCopies\SchoolERP
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Note**: Use `--host 0.0.0.0` to allow connections from other devices on your network.

### Step 5: Start the Mobile App

```bash
cd C:\Users\oruga\OneDrive\Documents\Projects\WorkingCopies\SchoolERP\mobile
npm start
```

This will open the Expo DevTools in your browser.

### Step 6: Run on Your Device

#### Option A: Physical Device (Recommended)

1. **Install Expo Go app**:
   - iOS: Download from App Store
   - Android: Download from Google Play Store

2. **Connect to same WiFi** as your computer

3. **Scan QR Code**:
   - iOS: Use Camera app to scan the QR code
   - Android: Use Expo Go app to scan the QR code

#### Option B: Emulator/Simulator

**For Android Emulator**:
1. Install Android Studio
2. Set up Android Virtual Device (AVD)
3. Press `a` in the Expo terminal or click "Run on Android device/emulator"

**For iOS Simulator** (Mac only):
1. Install Xcode from Mac App Store
2. Press `i` in the Expo terminal or click "Run on iOS simulator"

## Default Login Credentials

Use your existing backend user credentials. If you need to create a test user:

```
Email: admin@school.com
Password: [Your password]
```

Or create a new user through the backend API `/api/auth/register` endpoint.

## Project Structure Overview

```
mobile/
├── src/
│   ├── components/          # Reusable UI components
│   ├── config/              # App configuration
│   ├── contexts/            # React Context (Auth)
│   ├── navigation/          # Navigation setup
│   ├── screens/             # App screens
│   ├── services/            # API services
│   ├── types/               # TypeScript types
│   └── utils/               # Helper functions
├── App.tsx                  # Root component
├── app.json                 # Expo config
├── package.json             # Dependencies
└── README.md                # Documentation
```

## Key Features Implemented

✅ JWT Authentication with token storage
✅ Role-based access control (super_admin, admin, teacher, student, parent)
✅ Dashboard with key metrics
✅ Students list with search
✅ Attendance tracking
✅ Exams and results viewing
✅ Fee payment history
✅ User profile
✅ Drawer navigation
✅ Pull-to-refresh functionality
✅ Loading states and error handling

## Troubleshooting

### Cannot connect to backend

**Problem**: "Network request failed" or "Cannot connect to server"

**Solutions**:
1. Verify backend is running: Check `http://YOUR_IP:8000/docs`
2. Check `API_BASE_URL` in `constants.ts`
3. Ensure device and computer are on same WiFi network
4. For Windows, allow port 8000 through firewall:
   ```bash
   netsh advfirewall firewall add rule name="FastAPI" dir=in action=allow protocol=TCP localport=8000
   ```
5. Check if backend is accessible: `curl http://YOUR_IP:8000/api/dashboard`

### Metro bundler issues

**Problem**: "Unable to resolve module" or caching issues

**Solution**:
```bash
# Clear cache and restart
expo start -c

# Or delete and reinstall
rm -rf node_modules
npm install
```

### Module not found errors

**Problem**: Import errors for React Navigation or other packages

**Solution**:
```bash
# Ensure all dependencies are installed
npm install
expo install react-native-gesture-handler react-native-reanimated react-native-screens react-native-safe-area-context
```

### Android build issues

**Problem**: Build fails on Android

**Solution**:
1. Check Android SDK is properly installed
2. Set ANDROID_HOME environment variable
3. Accept all Android SDK licenses:
   ```bash
   cd %ANDROID_HOME%\tools\bin
   sdkmanager --licenses
   ```

## Testing Checklist

Before deploying, test these features:

- [ ] Login with valid credentials
- [ ] Login with invalid credentials (should show error)
- [ ] View dashboard statistics
- [ ] Browse students list
- [ ] Search students
- [ ] View attendance records
- [ ] View exam schedules
- [ ] View fee payments
- [ ] View profile information
- [ ] Navigate between screens
- [ ] Pull-to-refresh on lists
- [ ] Logout functionality

## Next Steps - Recommended Enhancements

1. **Push Notifications**: Alert users about announcements, fees due, etc.
2. **Offline Support**: Cache data for offline viewing
3. **Image Upload**: Add photo upload for students
4. **Calendar Integration**: Visual calendar for events and exams
5. **Biometric Auth**: Fingerprint/Face ID login
6. **Dark Mode**: Theme switching
7. **Report Generation**: Download PDF reports
8. **Parent-Teacher Communication**: Messaging feature
9. **Attendance Marking**: Let teachers mark attendance from mobile
10. **Fee Payment Gateway**: Integrate online payment

## Building for Production

### Create APK for Android

```bash
# Using Expo build
expo build:android

# Or using EAS (recommended)
npm install -g eas-cli
eas build --platform android
```

### Create IPA for iOS

```bash
# Using EAS (requires Apple Developer account)
eas build --platform ios
```

## Support & Documentation

- **Expo Documentation**: https://docs.expo.dev/
- **React Native Docs**: https://reactnative.dev/
- **React Navigation**: https://reactnavigation.org/

## API Endpoints Used

The app integrates with these backend endpoints:

- POST `/api/auth/login` - User authentication
- GET `/api/auth/users` - List users
- GET `/api/dashboard` - Dashboard statistics
- GET `/api/students` - Students list
- GET `/api/attendance` - Attendance records
- GET `/api/exams` - Exam schedules
- GET `/api/fees/payment` - Fee payments
- GET `/api/role-access/my-access` - User permissions

## Security Notes

- JWT tokens are stored in AsyncStorage (secure on both platforms)
- Tokens are automatically included in all API requests
- Tokens expire after 30 minutes (configurable in backend)
- Sensitive data is not logged or cached
- Use HTTPS in production

## Performance Tips

- Images are lazy-loaded
- Lists use FlatList for efficient rendering
- API responses are cached where appropriate
- Pull-to-refresh updates data
- Loading states prevent multiple requests

## Contact & Support

For issues or questions about the mobile app, contact your development team.

---

**Version**: 1.0.0  
**Last Updated**: 2024  
**Platform**: iOS & Android (via React Native/Expo)
