# School ERP Mobile App - Developer Guide

Complete technical documentation for developers working on the School ERP mobile application.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Core Technologies](#core-technologies)
4. [Authentication System](#authentication-system)
5. [API Integration](#api-integration)
6. [State Management](#state-management)
7. [Navigation](#navigation)
8. [Styling Guidelines](#styling-guidelines)
9. [Development Workflow](#development-workflow)
10. [Testing](#testing)
11. [Deployment](#deployment)

## Architecture Overview

The mobile app follows a **modular, component-based architecture** with clear separation of concerns:

```
┌─────────────────────────────────────┐
│           App.tsx                   │
│         (Root Component)            │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│        AuthProvider                 │
│      (Authentication Context)       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│       AppNavigator                  │
│    (Navigation Container)           │
└──────────────┬──────────────────────┘
               │
         ┌─────┴─────┐
         ▼           ▼
    ┌─────────┐  ┌──────────────┐
    │  Login  │  │ DrawerNav    │
    │ Screen  │  │ (Authenticated)│
    └─────────┘  └──────┬───────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │Dashboard │  │Students  │  │Attendance│
    └──────────┘  └──────────┘  └──────────┘
```

### Design Patterns

1. **Context Pattern**: Global state (AuthContext)
2. **Service Layer**: API calls isolated in services
3. **Component Composition**: Reusable UI components
4. **Custom Hooks**: Reusable logic (useAuth)

## Project Structure

```
mobile/
├── src/
│   ├── components/              # Reusable UI components
│   │   └── DrawerContent.tsx   # Custom drawer menu
│   │
│   ├── config/                  # Configuration files
│   │   └── constants.ts        # App constants & API config
│   │
│   ├── contexts/                # React contexts
│   │   └── AuthContext.tsx     # Authentication state
│   │
│   ├── navigation/              # Navigation configuration
│   │   └── AppNavigator.tsx    # Main navigation setup
│   │
│   ├── screens/                 # Screen components
│   │   ├── LoginScreen.tsx
│   │   ├── DashboardScreen.tsx
│   │   ├── StudentsScreen.tsx
│   │   ├── AttendanceScreen.tsx
│   │   ├── ExamsScreen.tsx
│   │   ├── FeesScreen.tsx
│   │   └── ProfileScreen.tsx
│   │
│   ├── services/                # API service layer
│   │   ├── apiClient.ts        # Axios configuration
│   │   ├── authService.ts      # Authentication API
│   │   └── dataService.ts      # Data fetching APIs
│   │
│   ├── types/                   # TypeScript definitions
│   │   └── index.ts            # Type definitions
│   │
│   └── utils/                   # Helper functions
│       └── helpers.ts          # Utility functions
│
├── App.tsx                      # Root component
├── app.json                     # Expo configuration
├── package.json                 # Dependencies
├── tsconfig.json               # TypeScript config
└── README.md                    # Documentation
```

## Core Technologies

### Framework & Language

- **React Native**: v0.74.1 - Mobile framework
- **Expo**: v51.0.0 - Development platform
- **TypeScript**: v5.1.3 - Type safety

### Navigation

- **@react-navigation/native**: v6.1.9 - Navigation core
- **@react-navigation/stack**: v6.3.20 - Stack navigation
- **@react-navigation/drawer**: v6.6.6 - Drawer navigation
- **@react-navigation/bottom-tabs**: v6.5.11 - Tab navigation

### HTTP & State

- **Axios**: v1.6.0 - HTTP client
- **@react-native-async-storage/async-storage**: v1.23.1 - Local storage

### UI Components

- **react-native-paper**: v5.11.0 - Material Design components
- **react-native-vector-icons**: v10.0.2 - Icon library

## Authentication System

### Flow Overview

```typescript
// 1. User Login
await authService.login(email, password);

// 2. Store token and user data
AsyncStorage.setItem('access_token', token);
AsyncStorage.setItem('user_data', JSON.stringify(user));

// 3. Set up axios interceptor
axios.interceptors.request.use(config => {
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 4. Handle token expiration
axios.interceptors.response.use(null, error => {
  if (error.response?.status === 401) {
    // Clear storage and redirect to login
  }
});
```

### AuthContext API

```typescript
const { 
  user,              // Current user object
  isAuthenticated,   // Boolean: is user logged in
  isLoading,         // Boolean: auth check in progress
  menuAccess,        // Array of allowed paths or null
  login,             // Function: (email, password) => Promise
  logout,            // Function: () => Promise
  refreshMenuAccess  // Function: () => Promise
} = useAuth();
```

## API Integration

### API Client Setup

```typescript
// src/services/apiClient.ts
class ApiClient {
  private client: AxiosInstance;
  
  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
    });
    
    // Add token to requests
    this.client.interceptors.request.use(async (config) => {
      const token = await AsyncStorage.getItem('access_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }
  
  async get<T>(url: string): Promise<T> { /* ... */ }
  async post<T>(url: string, data: any): Promise<T> { /* ... */ }
  // ... other methods
}
```

### Service Layer Pattern

```typescript
// src/services/dataService.ts
export const studentsService = {
  getAll: () => apiClient.get<Student[]>(API_ENDPOINTS.STUDENTS),
  getById: (id: number) => apiClient.get<Student>(`/api/students/${id}`),
  create: (data: Partial<Student>) => apiClient.post('/api/students', data),
  update: (id: number, data: Partial<Student>) => 
    apiClient.put(`/api/students/${id}`, data),
};
```

### Usage in Components

```typescript
const StudentsScreen = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await studentsService.getAll();
        setStudents(data);
      } catch (error) {
        console.error('Failed to fetch:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  // Render UI...
};
```

## State Management

### Local State (useState)

For component-specific state:

```typescript
const [students, setStudents] = useState<Student[]>([]);
const [loading, setLoading] = useState(false);
const [searchQuery, setSearchQuery] = useState('');
```

### Global State (Context)

For app-wide state (authentication):

```typescript
// Define context
const AuthContext = createContext<AuthContextType>();

// Provider component
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  // ... other state and methods
  
  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// Consumer hook
export const useAuth = () => useContext(AuthContext);
```

## Navigation

### Navigation Structure

```typescript
// Stack Navigator (root)
<Stack.Navigator>
  {!isAuthenticated ? (
    <Stack.Screen name="Login" component={LoginScreen} />
  ) : (
    <Stack.Screen name="Main" component={DrawerNavigator} />
  )}
</Stack.Navigator>

// Drawer Navigator (authenticated)
<Drawer.Navigator>
  <Drawer.Screen name="Dashboard" component={DashboardScreen} />
  <Drawer.Screen name="Students" component={StudentsScreen} />
  // ... other screens
</Drawer.Navigator>
```

### Navigation API

```typescript
// In functional components
import { useNavigation } from '@react-navigation/native';

const MyComponent = () => {
  const navigation = useNavigation();
  
  // Navigate to screen
  navigation.navigate('Students');
  
  // Go back
  navigation.goBack();
  
  // Navigate with params
  navigation.navigate('StudentDetail', { id: 123 });
};
```

## Styling Guidelines

### Style Conventions

```typescript
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: 16,
    backgroundColor: COLORS.primary,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
});
```

### Color System

Use constants from `config/constants.ts`:

```typescript
export const COLORS = {
  primary: '#6366f1',      // Indigo
  secondary: '#8b5cf6',    // Purple
  success: '#10b981',      // Green
  warning: '#f59e0b',      // Amber
  error: '#ef4444',        // Red
  info: '#3b82f6',         // Blue
  background: '#f9fafb',   // Light gray
  surface: '#ffffff',      // White
  text: '#1f2937',         // Dark gray
  textSecondary: '#6b7280',// Medium gray
  border: '#e5e7eb',       // Light border
};
```

### Responsive Design

```typescript
import { Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  card: {
    width: width * 0.9,  // 90% of screen width
    padding: width > 600 ? 24 : 16,  // Larger padding on tablets
  },
});
```

## Development Workflow

### 1. Start Development Server

```bash
cd mobile
npm start
```

### 2. Run on Device/Emulator

```bash
# iOS Simulator (Mac only)
npm run ios

# Android Emulator
npm run android

# Physical device via Expo Go
# Scan QR code in terminal
```

### 3. Hot Reloading

Changes automatically reload on save. Force reload:
- iOS: Cmd + R
- Android: RR (double tap R)

### 4. Debug Menu

- iOS: Cmd + D
- Android: Cmd + M (Mac) or Ctrl + M (Windows)

### 5. React Native Debugger

Install and use for advanced debugging:

```bash
# Windows
choco install react-native-debugger

# Mac
brew install --cask react-native-debugger
```

## Testing

### Manual Testing Checklist

- [ ] Login with valid credentials
- [ ] Login with invalid credentials
- [ ] Token expiration handling
- [ ] Network error handling
- [ ] Pull-to-refresh functionality
- [ ] Search functionality
- [ ] Navigation between screens
- [ ] Logout functionality

### Unit Testing (Future)

```bash
# Install Jest
npm install --save-dev @testing-library/react-native jest

# Run tests
npm test
```

Example test:

```typescript
import { render, fireEvent } from '@testing-library/react-native';
import LoginScreen from '../src/screens/LoginScreen';

test('shows error for empty credentials', () => {
  const { getByText, getByPlaceholderText } = render(<LoginScreen />);
  
  const loginButton = getByText('Login');
  fireEvent.press(loginButton);
  
  expect(getByText('Please enter email and password')).toBeTruthy();
});
```

## Deployment

### Development Build

```bash
expo start
```

### Production Build

#### Android APK/AAB

```bash
# Classic build
expo build:android

# EAS Build (recommended)
eas build --platform android
```

#### iOS IPA

```bash
# Requires Apple Developer account
eas build --platform ios
```

### Environment Configuration

```typescript
// For production, update API_BASE_URL
export const API_BASE_URL = 
  __DEV__ 
    ? 'http://192.168.1.100:8000'  // Development
    : 'https://api.schoolerp.com';  // Production
```

## Common Tasks

### Adding a New Screen

1. Create screen file:
```typescript
// src/screens/NewScreen.tsx
import React from 'react';
import { View, Text } from 'react-native';

const NewScreen = () => {
  return (
    <View>
      <Text>New Screen</Text>
    </View>
  );
};

export default NewScreen;
```

2. Add to navigator:
```typescript
// src/navigation/AppNavigator.tsx
import NewScreen from '../screens/NewScreen';

<Drawer.Screen 
  name="NewScreen" 
  component={NewScreen}
  options={{ title: 'New Feature' }}
/>
```

### Adding a New API Endpoint

1. Add endpoint to constants:
```typescript
// src/config/constants.ts
export const API_ENDPOINTS = {
  // ... existing endpoints
  NEW_FEATURE: '/api/new-feature',
};
```

2. Create service method:
```typescript
// src/services/dataService.ts
export const newFeatureService = {
  getAll: () => apiClient.get(API_ENDPOINTS.NEW_FEATURE),
  create: (data) => apiClient.post(API_ENDPOINTS.NEW_FEATURE, data),
};
```

3. Use in component:
```typescript
const data = await newFeatureService.getAll();
```

## Performance Optimization

### FlatList Optimization

```typescript
<FlatList
  data={students}
  renderItem={renderStudent}
  keyExtractor={(item) => item.id.toString()}
  initialNumToRender={10}
  maxToRenderPerBatch={10}
  windowSize={10}
  removeClippedSubviews={true}
  updateCellsBatchingPeriod={50}
/>
```

### Image Optimization

```typescript
<Image 
  source={{ uri: imageUrl }}
  style={styles.image}
  resizeMode="cover"
  // Add placeholder/loading
/>
```

### Memo for Expensive Components

```typescript
const StudentCard = React.memo(({ student }) => {
  return <View>...</View>;
}, (prevProps, nextProps) => {
  return prevProps.student.id === nextProps.student.id;
});
```

## Troubleshooting

### Clear Cache

```bash
expo start -c
```

### Reset Metro Bundler

```bash
npx react-native start --reset-cache
```

### Reinstall Dependencies

```bash
rm -rf node_modules package-lock.json
npm install
```

## Resources

- [React Native Docs](https://reactnative.dev/)
- [Expo Docs](https://docs.expo.dev/)
- [React Navigation](https://reactnavigation.org/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

**Version**: 1.0.0  
**Last Updated**: 2024  
**Platform**: iOS & Android
