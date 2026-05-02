# IIS Hosting Guide for Student Management System

## Prerequisites

1. **Windows Server** or Windows 10/11 with IIS enabled
2. **URL Rewrite Module** installed on IIS
   - Download from: https://www.iis.net/downloads/microsoft/url-rewrite

## Step 1: Enable IIS (if not already enabled)

### Windows 10/11:
1. Open **Control Panel** → **Programs** → **Turn Windows features on or off**
2. Check **Internet Information Services**
3. Expand and ensure these are checked:
   - Web Management Tools → IIS Management Console
   - World Wide Web Services → Application Development Features → ASP.NET 4.8
   - World Wide Web Services → Common HTTP Features (all)
4. Click **OK** and wait for installation

### Windows Server:
1. Open **Server Manager**
2. Click **Add roles and features**
3. Select **Web Server (IIS)** role
4. Complete the wizard

## Step 2: Install URL Rewrite Module

1. Download URL Rewrite Module from: https://www.iis.net/downloads/microsoft/url-rewrite
2. Run the installer
3. Restart IIS Manager if it was open

## Step 3: Build the Application

```powershell
cd C:\Users\oruga\OneDrive\Documents\Projects\WorkingCopies\SMS\React
npm run build
```

This creates the `dist` folder with production files.

## Step 4: Create IIS Website

1. Open **IIS Manager** (search for "IIS" in Start menu)
2. In the left panel, expand your server name
3. Right-click **Sites** → **Add Website**
4. Configure:
   - **Site name**: StudentManagementSystem (or your preferred name)
   - **Physical path**: Browse to the `dist` folder location
   - **Binding**:
     - Type: http (or https if you have SSL certificate)
     - IP Address: All Unassigned (or specific IP)
     - Port: 80 (or your preferred port)
     - Host name: your-domain.com (optional)
5. Click **OK**

## Step 5: Verify web.config

Ensure the `dist` folder contains `web.config` with URL rewrite rules:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="React Routes" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/" />
        </rule>
      </rules>
    </rewrite>
    <staticContent>
      <mimeMap fileExtension=".json" mimeType="application/json" />
      <mimeMap fileExtension=".woff" mimeType="font/woff" />
      <mimeMap fileExtension=".woff2" mimeType="font/woff2" />
    </staticContent>
  </system.webServer>
</configuration>
```

## Step 6: Set Folder Permissions

1. Navigate to the `dist` folder in File Explorer
2. Right-click → **Properties** → **Security** tab
3. Click **Edit** → **Add**
4. Add `IIS_IUSRS` and grant **Read & Execute** permissions
5. Click **Apply** → **OK**

## Step 7: Configure Backend API URL

If your FastAPI backend is hosted separately, update the API base URL:

1. Edit `src/services/api.ts` before building:
   ```typescript
   const API_BASE_URL = 'https://your-api-server.com';
   ```
2. Rebuild: `npm run build`

## Step 8: Test the Application

1. Open browser and navigate to your site URL (e.g., `http://localhost` or your configured domain)
2. Verify all pages load correctly
3. Test navigation to ensure URL rewriting works

## Troubleshooting

### 404 errors on page refresh
- Ensure URL Rewrite Module is installed
- Verify `web.config` exists in the `dist` folder

### MIME type errors
- Add missing MIME types to `web.config` under `<staticContent>`

### API connection errors
- Check CORS settings on your FastAPI backend
- Verify the API base URL is correct

### Blank page
- Check browser console for JavaScript errors
- Ensure all files were copied correctly

## HTTPS Configuration (Recommended for Production)

1. Obtain an SSL certificate (Let's Encrypt, commercial CA, or self-signed for testing)
2. In IIS Manager, select your site
3. Click **Bindings** in the right panel
4. **Add** → Type: https, select your SSL certificate
5. Optionally add HTTP to HTTPS redirect in `web.config`:

```xml
<rule name="HTTP to HTTPS" stopProcessing="true">
  <match url="(.*)" />
  <conditions>
    <add input="{HTTPS}" pattern="off" ignoreCase="true" />
  </conditions>
  <action type="Redirect" url="https://{HTTP_HOST}/{R:1}" redirectType="Permanent" />
</rule>
```

## File Structure After Deployment

```
IIS Website Root/
├── index.html
├── web.config
└── assets/
    ├── index-[hash].js
    ├── index-[hash].css
    └── logo-[hash].jpg
```
