# Building Android APK for School ERP Mobile App

## Prerequisites

- **Node.js** — installed and on PATH
- **Java JDK 17** — e.g. Eclipse Adoptium (`C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot`)
- **Android SDK** — installed at `C:\Users\<you>\AppData\Local\Android\Sdk` (or wherever `local.properties` points)
- **npm dependencies** — `node_modules` must exist (run `npm install` if not)

The `android/` directory is already pre-built via `npx expo prebuild`. You do **not** need to re-run prebuild unless native dependencies change.

---

## Option 1: Local Gradle Build (Recommended)

### Step 1 — Set environment variables

Open PowerShell and set `JAVA_HOME` and `ANDROID_HOME`:

```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot"
$env:ANDROID_HOME = "C:\Users\<you>\AppData\Local\Android\Sdk"
```

### Step 2 — Navigate to the android directory

```powershell
cd <project-root>\android
```

### Step 3 — Build the release APK

```powershell
.\gradlew.bat assembleRelease
```

### Step 4 — Locate the APK

On success the APK is at:

```
android\app\build\outputs\apk\release\app-release.apk
```

### Step 5 — Copy to project root (optional)

```powershell
Copy-Item "android\app\build\outputs\apk\release\app-release.apk" "..\app-release.apk"
```

---

## Known Issue: OneDrive Long-Path Errors

If the project lives inside OneDrive (e.g. `C:\Users\<you>\OneDrive\Documents\...`), two problems may occur:

### 1. CMake `CMAKE_OBJECT_PATH_MAX` warnings / `ninja: manifest still dirty`

The path to `node_modules/react-native-reanimated/android/.cxx/...` can exceed 250 characters.

**Fix:** Add a temporary block in `android/build.gradle` (right after the `apply plugin` line) to redirect CMake intermediates to a short path:

```groovy
// Redirect all build directories outside of OneDrive
def buildBase = new File("C:/b/school-erp")
rootProject.layout.buildDirectory.set(new File(buildBase, "root"))

gradle.afterProject { proj ->
    proj.layout.buildDirectory.set(new File(buildBase, proj.name))
    if (proj.hasProperty('android')) {
        try {
            proj.android.externalNativeBuild.cmake.buildStagingDirectory =
                new File(buildBase, "cxx/${proj.name}")
        } catch (Exception ignored) {}
    }
}
```

This redirects **all** Gradle build directories (including CMake staging) to `C:\b\school-erp\`, keeping paths short.

### 2. `Unable to delete directory` / file-locking errors

OneDrive's file-sync daemon holds locks on intermediate build files, causing Gradle to fail with messages like:

```
Unable to delete directory '...\build\intermediates\library_jni\release\jni'
New files were found. This might happen because a process is still writing...
```

**Fix:** The same `buildBase` redirect above solves this, since `C:\b\` is outside OneDrive. If the error persists, you can also try:

- Pausing OneDrive sync during the build
- Running `.\gradlew.bat assembleRelease --no-parallel`

> **Important:** Remove the `buildBase` redirect from `build.gradle` after the build if you don't want it permanently.

---

## Option 2: Expo Go (Quick Testing — No Build Required)

1. Install **Expo Go** from Google Play Store
2. Ensure your laptop and phone are on the **same Wi-Fi network**
3. Run `npm start` in the project root
4. Scan the QR code with Expo Go
5. The app runs on your phone instantly

## Option 3: EAS Cloud Build

```bash
# Login (create account at https://expo.dev/signup if needed)
eas login

# Configure
eas build:configure

# Build APK (takes ~10-15 min in the cloud)
eas build --platform android --profile preview
```

---

## Build Details

| Property        | Value                   |
|-----------------|-------------------------|
| Package name    | `com.schoolerp.mobile`  |
| Min SDK         | 23 (Android 6.0)        |
| Target SDK      | 34 (Android 14)         |
| Signing         | Debug keystore (release build type uses `signingConfigs.debug`) |
| JS Engine       | Hermes                  |
| Output size     | ~74 MB                  |

> **Note:** The release build currently uses the debug keystore. For production distribution, generate a dedicated release keystore. See [React Native Signed APK docs](https://reactnative.dev/docs/signed-apk-android).
