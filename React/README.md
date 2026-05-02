# Student Management System (SMS)

A React-based Student Management System with role-based access control, built with Vite, TypeScript, and Tailwind CSS.

## Features

- **Login & Authentication**: JWT-based authentication with role-based access
- **Student Management**: CRUD operations for student records
- **Fee Management**: Track and manage student fee records with dashboard
- **Marks & Grades**: Enter and manage exam marks with auto-grading
- **Subject Management**: Manage subjects and courses
- **Teacher Management**: Manage teachers with subject assignment
- **Attendance Management**: Mark and track student attendance
- **User Management**: Register new users (Super Admin only)

## User Roles

| Role | Description |
|------|-------------|
| super_admin | Super Administrator with full access. Can create users. |
| admin | Administrator with management access |
| teacher | Teacher with class and student management |
| student | Student with personal record access |
| parent | Parent with student progress access |

## Tech Stack

- **React 18** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS** for styling
- **Axios** for API calls
- **React Router v6** for routing

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Backend API running at `http://localhost:8000`

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The development server starts at `http://localhost:5173` and proxies API calls to `http://localhost:8000`.

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
src/
├── components/           # Reusable components
│   ├── Layout.tsx       # Main layout with sidebar
│   └── PrivateRoute.tsx # Route protection component
├── contexts/            # React contexts
│   └── AuthContext.tsx  # Authentication context
├── pages/               # Page components
│   ├── Login/
│   ├── Dashboard/
│   ├── Students/
│   ├── Fees/
│   ├── Exams/
│   ├── Subjects/
│   ├── Teachers/
│   ├── Attendance/
│   ├── Users/
│   └── Unauthorized/
├── services/            # API service layer
│   ├── api.ts          # Axios instance
│   ├── authService.ts
│   ├── studentService.ts
│   ├── feeService.ts
│   ├── examService.ts
│   ├── subjectService.ts
│   ├── teacherService.ts
│   └── attendanceService.ts
├── App.tsx              # Main app with routing
├── main.tsx             # Entry point
└── index.css            # Global styles with Tailwind
```

## API Endpoints

The app connects to a FastAPI backend with the following endpoints:

- `POST /api/auth/login` - User login
- `POST /api/auth/register` - Register new user
- `GET/POST /api/students/` - List/Create students
- `GET/PUT /api/students/{id}` - Get/Update student
- `GET/POST /api/fees/` - List/Create fee records
- `GET /api/fees/dashboard/summary` - Fee dashboard
- `GET/PUT /api/fees/{id}` - Get/Update fee record
- `GET/POST /api/exams/` - List/Enter exam marks
- `GET/PUT /api/exams/{id}` - Get/Update exam
- `GET/POST /api/subjects/` - List/Create subjects
- `GET/PUT/DELETE /api/subjects/{id}` - Subject CRUD
- `GET/POST /api/teachers/` - List/Create teachers
- `GET/PUT /api/teachers/{id}` - Get/Update teacher
- `POST /api/teachers/{id}/subjects` - Assign subjects
- `GET/POST /api/attendance/` - List/Mark attendance
- `GET /api/attendance/dashboard/daily` - Attendance dashboard
