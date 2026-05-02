# School ERP Mobile - Application Flow Diagram

## Overall Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Mobile App                          │
│                    (React Native + Expo)                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ HTTP/HTTPS
                         │ JWT Bearer Token
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    FastAPI Backend                          │
│                  (Python + SQL Server)                      │
└─────────────────────────────────────────────────────────────┘
```

## User Journey Flow

```
┌──────────────┐
│  App Launch  │
└──────┬───────┘
       │
       ▼
┌─────────────────┐
│ Check Storage   │
│ for JWT Token   │
└────┬────────┬───┘
     │        │
     │ No     │ Yes
     │ Token  │ Token
     │        │
     ▼        ▼
┌─────────┐  ┌──────────────┐
│ Login   │  │ Verify Token │
│ Screen  │  │ with Backend │
└────┬────┘  └──────┬───────┘
     │              │
     │              ▼
     │         ┌─────────────┐
     │         │ Token Valid?│
     │         └──┬──────┬───┘
     │            │ No   │ Yes
     │            │      │
     ▼◄───────────┘      │
┌──────────────┐         │
│ User enters  │         │
│ credentials  │         │
└──────┬───────┘         │
       │                 │
       ▼                 │
┌──────────────┐         │
│ POST /login  │         │
└──────┬───────┘         │
       │                 │
       ▼                 │
┌──────────────┐         │
│ Store Token  │         │
│ & User Data  │         │
└──────┬───────┘         │
       │                 │
       └────────┬────────┘
                ▼
        ┌───────────────┐
        │   Dashboard   │
        │    Screen     │
        └──────┬────────┘
               │
     ┌─────────┼─────────┐
     │         │         │
     ▼         ▼         ▼
┌─────────┐ ┌──────┐ ┌─────────┐
│Students │ │Attend│ │  Exams  │
└─────────┘ └──────┘ └─────────┘
     ▼         ▼         ▼
┌─────────┐ ┌──────┐ ┌─────────┐
│  Fees   │ │Profile│ │ Logout  │
└─────────┘ └──────┘ └────┬────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ Clear Token │
                    │   & Data    │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ Login Screen│
                    └─────────────┘
```

## Screen Navigation Structure

```
App
│
├─── Not Authenticated
│    │
│    └─── Stack Navigator
│         │
│         └─── Login Screen
│
└─── Authenticated
     │
     └─── Stack Navigator
          │
          └─── Drawer Navigator
               │
               ├─── Dashboard Screen
               │    │
               │    └─── Stats Cards
               │         └─── Quick Actions
               │
               ├─── Students Screen
               │    │
               │    ├─── Search Bar
               │    └─── Student List
               │         └─── Student Card
               │
               ├─── Attendance Screen
               │    │
               │    ├─── Date Selector
               │    ├─── Summary Stats
               │    └─── Attendance List
               │
               ├─── Exams Screen
               │    │
               │    └─── Exam List
               │         └─── Exam Card
               │
               ├─── Fees Screen
               │    │
               │    ├─── Total Summary
               │    └─── Payment List
               │         └─── Payment Card
               │
               └─── Profile Screen
                    │
                    ├─── User Info Section
                    └─── Account Details
```

## Authentication Flow Details

```
┌────────────────────────────────────────────────────────────┐
│                     Login Process                          │
└────────────────────────────────────────────────────────────┘

1. User Input
   ┌─────────────┐
   │ Email       │
   │ Password    │
   └─────┬───────┘
         │
         ▼
2. Validation
   ┌─────────────────┐
   │ Check Required  │
   │ Validate Format │
   └─────┬───────────┘
         │
         ▼
3. API Request
   ┌──────────────────────────────┐
   │ POST /api/auth/login         │
   │ Body: { email, password }    │
   └─────┬────────────────────────┘
         │
         ▼
4. Backend Processing
   ┌──────────────────────────────┐
   │ Verify Credentials           │
   │ Check User Status            │
   │ Generate JWT Token           │
   └─────┬────────────────────────┘
         │
         ├─── Invalid ───► Error Alert
         │
         ▼ Valid
5. Store Locally
   ┌──────────────────────────────┐
   │ AsyncStorage.set('token')    │
   │ AsyncStorage.set('user')     │
   └─────┬────────────────────────┘
         │
         ▼
6. Update Context
   ┌──────────────────────────────┐
   │ setUser(userData)            │
   │ setIsAuthenticated(true)     │
   └─────┬────────────────────────┘
         │
         ▼
7. Fetch Permissions
   ┌──────────────────────────────┐
   │ GET /api/role-access         │
   │ Store menu access            │
   └─────┬────────────────────────┘
         │
         ▼
8. Navigate
   ┌──────────────────────────────┐
   │ Navigate to Dashboard        │
   └──────────────────────────────┘
```

## API Request Flow

```
┌────────────────────────────────────────────────────────────┐
│              API Request with Authentication               │
└────────────────────────────────────────────────────────────┘

Component Calls API
   │
   ▼
┌─────────────────────┐
│ studentService.get()│
└─────┬───────────────┘
      │
      ▼
┌─────────────────────┐
│ apiClient.get()     │
└─────┬───────────────┘
      │
      ▼
┌──────────────────────────────────┐
│ Request Interceptor              │
│ • Get token from AsyncStorage    │
│ • Add Authorization header       │
│ • Bearer {token}                 │
└─────┬────────────────────────────┘
      │
      ▼
┌──────────────────────────────────┐
│ HTTP Request to Backend          │
│ GET /api/students                │
│ Authorization: Bearer xyz...     │
└─────┬────────────────────────────┘
      │
      ▼
┌──────────────────────────────────┐
│ Backend Validates Token          │
│ • Decode JWT                     │
│ • Check expiration               │
│ • Verify user                    │
└─────┬──────────┬─────────────────┘
      │          │
      │ Invalid  │ Valid
      │ (401)    │ (200)
      ▼          ▼
┌──────────┐  ┌──────────────────┐
│Response  │  │ Response         │
│Inter-    │  │ Interceptor      │
│ceptor    │  │ • Pass data      │
│• Logout  │  └─────┬────────────┘
│• Clear   │        │
│  Storage │        ▼
└──────────┘  ┌──────────────────┐
              │ Component        │
              │ • Update state   │
              │ • Render data    │
              └──────────────────┘
```

## Data Flow in Components

```
┌────────────────────────────────────────────────────────────┐
│              Students Screen Example                       │
└────────────────────────────────────────────────────────────┘

Component Mount
   │
   ▼
┌─────────────────────┐
│ useState([])        │  Initial empty state
└─────┬───────────────┘
      │
      ▼
┌─────────────────────┐
│ useEffect()         │  Fetch on mount
└─────┬───────────────┘
      │
      ▼
┌──────────────────────┐
│ setLoading(true)     │
└─────┬────────────────┘
      │
      ▼
┌──────────────────────────────┐
│ API Call                     │
│ studentsService.getAll()     │
└─────┬────────────────────────┘
      │
      ├─── Error ───► Alert & setLoading(false)
      │
      ▼ Success
┌──────────────────────────────┐
│ setStudents(data)            │
│ setLoading(false)            │
└─────┬────────────────────────┘
      │
      ▼
┌──────────────────────────────┐
│ Render FlatList              │
│ • Map over students          │
│ • Render StudentCard         │
└──────────────────────────────┘
      │
      ▼
┌──────────────────────────────┐
│ User Interactions            │
│ • Pull to Refresh            │
│ • Search                     │
│ • Tap Card                   │
└──────────────────────────────┘
```

## State Management

```
┌────────────────────────────────────────────────────────────┐
│                    State Architecture                      │
└────────────────────────────────────────────────────────────┘

Global State (Context)
┌─────────────────────────────┐
│ AuthContext                 │
│ • user                      │
│ • isAuthenticated           │
│ • menuAccess                │
│ • login()                   │
│ • logout()                  │
└──────────┬──────────────────┘
           │
           │ Accessible via useAuth()
           │
           ▼
    ┌─────────────────┐
    │ All Screens     │
    └─────────────────┘

Local State (useState)
┌─────────────────────────────┐
│ Screen Component            │
│ • data (students, etc)      │
│ • loading                   │
│ • error                     │
│ • searchQuery               │
└─────────────────────────────┘

Persistent State (AsyncStorage)
┌─────────────────────────────┐
│ AsyncStorage                │
│ • access_token              │
│ • user_data                 │
│ • menu_access               │
└─────────────────────────────┘
```

## Folder Organization Logic

```
src/
│
├── components/          # Reusable UI components
│   └── Used across multiple screens
│
├── config/              # App configuration
│   └── Constants, colors, API URLs
│
├── contexts/            # React Context
│   └── Global state management
│
├── navigation/          # Navigation setup
│   └── Route configuration
│
├── screens/             # Screen components
│   └── One file per screen
│
├── services/            # Backend communication
│   ├── apiClient.ts    # Axios setup & interceptors
│   ├── authService.ts  # Auth-specific APIs
│   └── dataService.ts  # Data fetching APIs
│
├── types/               # TypeScript types
│   └── Interface & type definitions
│
└── utils/               # Helper functions
    └── Pure utility functions
```

## Build & Deployment Flow

```
Development
┌─────────────┐
│ npm start   │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ Metro Bundler   │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Expo Go App     │
│ (Test Device)   │
└─────────────────┘

Production
┌──────────────────┐
│ expo build       │
│ or               │
│ eas build        │
└──────┬───────────┘
       │
       ├───► Android APK/AAB
       │
       └───► iOS IPA
              │
              ▼
       ┌──────────────┐
       │ App Stores   │
       └──────────────┘
```

---

**This diagram shows the complete flow of the School ERP Mobile application, from user login to data retrieval and display.**
