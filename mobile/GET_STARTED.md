# 📱 School ERP Mobile Application

> A cross-platform mobile app for School Management ERP - Built with React Native & Expo

---

## 🚀 Quick Start - 3 Steps

### 1️⃣ Install Dependencies
```bash
cd mobile
npm install
```

### 2️⃣ Configure Backend URL
Edit `src/config/constants.ts`:
```typescript
export const API_BASE_URL = 'http://YOUR_IP_ADDRESS:8000';
```
> Replace `YOUR_IP_ADDRESS` with your computer's local IP

### 3️⃣ Start the App
```bash
npm start
```
> Scan the QR code with **Expo Go** app on your phone

---

## 📖 Documentation Overview

| Document | Description | When to Use |
|----------|-------------|-------------|
| [README.md](README.md) | Project overview & features | First-time setup |
| [SETUP_GUIDE.md](SETUP_GUIDE.md) | **Detailed installation guide** | Installation help |
| [AUTHENTICATION_FLOW.md](AUTHENTICATION_FLOW.md) | Authentication system docs | Understanding auth |
| [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) | **Technical reference** | Development work |
| [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) | Complete project summary | Project overview |

---

## ✨ Key Features

- ✅ **JWT Authentication** - Secure login with role-based access
- ✅ **Dashboard** - Real-time school statistics
- ✅ **Students** - Browse and search student records
- ✅ **Attendance** - Track daily attendance
- ✅ **Exams** - View schedules and results
- ✅ **Fees** - Payment history and tracking
- ✅ **Profile** - User account management

---

## 🛠 Tech Stack

- **React Native** 0.74.1 - Mobile framework
- **Expo** 51.0.0 - Development platform
- **TypeScript** - Type safety
- **React Navigation** - Navigation
- **Axios** - HTTP client
- **AsyncStorage** - Local storage

---

## 📁 Project Structure

```
mobile/
├── src/
│   ├── components/      # UI components
│   ├── config/          # Configuration
│   ├── contexts/        # React contexts
│   ├── navigation/      # Navigation setup
│   ├── screens/         # App screens
│   ├── services/        # API services
│   ├── types/           # TypeScript types
│   └── utils/           # Utilities
├── App.tsx              # Root component
├── package.json         # Dependencies
└── [Documentation files]
```

---

## 🎯 Getting Help

### Installation Issues?
👉 Read [SETUP_GUIDE.md](SETUP_GUIDE.md)

### Development Questions?
👉 Read [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)

### Authentication Not Working?
👉 Read [AUTHENTICATION_FLOW.md](AUTHENTICATION_FLOW.md)

### Want Project Overview?
👉 Read [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)

---

## 🔧 Common Commands

```bash
# Start development server
npm start

# Run on Android
npm run android

# Run on iOS (Mac only)
npm run ios

# Clear cache
expo start -c

# Install new package
npm install package-name
```

---

## 🌐 Backend Requirements

**FastAPI Backend must be running:**
```bash
cd C:\Users\oruga\OneDrive\Documents\Projects\WorkingCopies\SchoolERP
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Verify backend is accessible:**
- Open: `http://YOUR_IP:8000/docs`
- Should see FastAPI documentation

---

## 📱 Testing on Device

1. **Install Expo Go**
   - iOS: [App Store](https://apps.apple.com/app/expo-go/id982107779)
   - Android: [Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)

2. **Connect to Same WiFi** as your computer

3. **Scan QR Code** shown in terminal

---

## ⚙️ Configuration Checklist

Before running the app:

- [ ] Node.js installed (v16+)
- [ ] Expo CLI installed globally
- [ ] Dependencies installed (`npm install`)
- [ ] Backend running and accessible
- [ ] `API_BASE_URL` updated in `constants.ts`
- [ ] Expo Go app installed on phone
- [ ] Phone connected to same WiFi

---

## 🚨 Troubleshooting

**Cannot connect to backend?**
```bash
# Check if backend is running
curl http://YOUR_IP:8000/api/dashboard

# Update API_BASE_URL in src/config/constants.ts
```

**Metro bundler issues?**
```bash
# Clear cache and restart
expo start -c
```

**Module errors?**
```bash
# Reinstall dependencies
rm -rf node_modules
npm install
```

---

## 📊 Project Stats

- **7 Screens** - Complete mobile experience
- **15+ API Endpoints** - Full backend integration
- **Type-Safe** - Full TypeScript coverage
- **Cross-Platform** - iOS & Android from one codebase
- **Production Ready** - Ready to deploy

---

## 🎓 Learning Resources

- [React Native Docs](https://reactnative.dev/)
- [Expo Documentation](https://docs.expo.dev/)
- [React Navigation](https://reactnavigation.org/)
- [TypeScript Guide](https://www.typescriptlang.org/docs/)

---

## 👥 User Roles Supported

- 🔴 **Super Admin** - Full system access
- 🟠 **Admin** - Administrative features
- 🟡 **Teacher** - Teaching features
- 🟢 **Student** - Student portal
- 🔵 **Parent** - Parent portal

---

## 📞 Need Help?

1. Check the documentation files listed above
2. Review error messages in terminal
3. Verify backend is running
4. Check network connectivity
5. Contact development team

---

## 🚀 Next Steps

After setup:

1. ✅ **Test Login** - Use backend credentials
2. ✅ **Explore Dashboard** - View statistics
3. ✅ **Browse Students** - Check student list
4. ✅ **Review Code** - Read DEVELOPER_GUIDE.md
5. ✅ **Customize** - Adapt to your needs

---

## 📜 License

Proprietary - School ERP Management System

---

## 🌟 Features Coming Soon

- Push notifications
- Offline support
- Photo uploads
- Biometric authentication
- Dark mode
- PDF reports
- In-app messaging

---

**Version**: 1.0.0  
**Platform**: iOS & Android  
**Status**: ✅ Production Ready  

---

<div align="center">

**Built with ❤️ for School ERP Management**

[![React Native](https://img.shields.io/badge/React_Native-0.74-blue.svg)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo-51.0-black.svg)](https://expo.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.1-blue.svg)](https://www.typescriptlang.org/)

</div>
