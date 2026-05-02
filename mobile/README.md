# School ERP Mobile App

A React Native mobile application for the School Management ERP system, built with Expo and TypeScript.

## Features

- **Authentication**: JWT-based login with role-based access control
- **Dashboard**: Overview of key metrics (students, teachers, attendance, fees)
- **Students Management**: View and search student records
- **Attendance**: Daily attendance tracking and summary
- **Exams & Results**: View exam schedules and results
- **Fee Management**: Track fee payments and history
- **Profile**: User account information

## Tech Stack

- **React Native** with **Expo** - Cross-platform mobile framework
- **TypeScript** - Type-safe development
- **React Navigation** - Navigation with Stack, Drawer navigations
- **Axios** - HTTP client for API calls
- **AsyncStorage** - Local data persistence
- **React Native Paper** - UI components

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Expo CLI: `npm install -g expo-cli`
- iOS Simulator (for Mac) or Android Studio (for Android development)
- Expo Go app on your mobile device (for testing)

## Installation

1. **Install dependencies**:
   ```bash
   cd mobile
   npm install
   ```

2. **Configure Backend URL**:
   
   The app now supports **automatic environment-based configuration**!
   
   **Quick Setup:**
   - Open `src/config/constants.ts`
   - Update `DEV_API_URL` with your local IP address:
   ```typescript
   const DEV_API_URL = 'http://YOUR_IP_ADDRESS:8000';
   ```
   - The app automatically uses the correct URL based on environment
   
   **Supported URLs:**
   - Development: Uses `DEV_API_URL` (auto-detected when debugging)
   - Production: Uses `PROD_API_URL` (used in release builds)
   - Staging: Uses `STAGING_API_URL` (optional)
   
   For detailed configuration options, see [CONFIGURATION.md](CONFIGURATION.md)

## Running the App

1. **Start the development server**:
   ```bash
   npm start
   ```

2. **Run on specific platform**:
   ```bash
   # iOS (Mac only)
   npm run ios

   # Android
   npm run android

   # Web
   npm run web
   ```

3. **Test on physical device**:
   - Install Expo Go app from App Store/Play Store
   - Scan the QR code shown in terminal
   - Make sure your device and computer are on the same network

## Project Structure

```
mobile/
├── src/
│   ├── components/          # Reusable UI components
│   │   └── DrawerContent.tsx
│   ├── config/              # Configuration files
│   │   └── constants.ts
│   ├── contexts/            # React contexts
│   │   └── AuthContext.tsx
│   ├── navigation/          # Navigation setup
│   │   └── AppNavigator.tsx
│   ├── screens/             # Screen components
│   │   ├── LoginScreen.tsx
│   │   ├── DashboardScreen.tsx
│   │   ├── StudentsScreen.tsx
│   │   ├── AttendanceScreen.tsx
│   │   ├── ExamsScreen.tsx
│   │   ├── FeesScreen.tsx
│   │   └── ProfileScreen.tsx
│   ├── services/            # API services
│   │   ├── apiClient.ts
│   │   └── authService.ts
│   └── types/               # TypeScript types
│       └── index.ts
├── App.tsx                  # Root component
├── app.json                 # Expo configuration
├── package.json             # Dependencies
└── tsconfig.json            # TypeScript configuration
```

## Authentication Flow

1. User enters email and password on Login screen
2. App sends credentials to `/api/auth/login` endpoint
3. Backend validates and returns JWT token
4. Token is stored in AsyncStorage
5. Token is automatically added to all subsequent API requests
6. User data and menu access permissions are fetched and cached
7. On logout, all stored data is cleared

## API Integration

The app integrates with the FastAPI backend using the following endpoints:

- **Authentication**: `/api/auth/login`, `/api/auth/users`
- **Dashboard**: `/api/dashboard`
- **Students**: `/api/students`
- **Attendance**: `/api/attendance`
- **Exams**: `/api/exams`, `/api/exam-types`
- **Fees**: `/api/fees/payment`, `/api/fees/structure`
- **Role Access**: `/api/role-access`

All API calls automatically include the JWT token in the Authorization header.

## Role-Based Access

The app supports the following roles:
- **super_admin**: Full system access
- **admin**: Administrative access
- **teacher**: Teacher-specific features
- **student**: Student portal
- **parent**: Parent portal

Menu items and features are shown/hidden based on user role and permissions.

## Building for Production

### Android APK

```bash
expo build:android
```

### iOS IPA

```bash
expo build:ios
```

### Using EAS Build (Recommended)

1. Install EAS CLI:
   ```bash
   npm install -g eas-cli
   ```

2. Configure project:
   ```bash
   eas build:configure
   ```

3. Build:
   ```bash
   # Android
   eas build --platform android

   # iOS
   eas build --platform ios
   ```

## Troubleshooting

### Cannot connect to backend

- Ensure backend server is running
- Check if `API_BASE_URL` in `constants.ts` is correct
- For physical devices, use your computer's local IP (not localhost)
- Ensure firewall allows connections on port 8000

### Dependencies issues

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Expo cache
expo start -c
```

## Additional Features to Implement

- Push notifications for announcements
- Offline mode with data sync
- Photo upload for students
- Calendar view for events
- Biometric authentication
- Dark mode theme
- Multi-language support

## Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly on both iOS and Android
4. Submit a pull request

## License

Proprietary - School ERP System
