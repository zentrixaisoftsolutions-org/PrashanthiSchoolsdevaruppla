# Quick Installation Script for School ERP Mobile App
# Run this script from PowerShell in the mobile directory

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "School ERP Mobile App - Installation" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is installed
Write-Host "Checking Node.js installation..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js installed: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js not found. Please install from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Check if npm is installed
Write-Host "Checking npm installation..." -ForegroundColor Yellow
try {
    $npmVersion = npm --version
    Write-Host "✓ npm installed: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ npm not found." -ForegroundColor Red
    exit 1
}

# Install Expo CLI globally
Write-Host ""
Write-Host "Installing Expo CLI..." -ForegroundColor Yellow
npm install -g expo-cli
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Expo CLI installed successfully" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to install Expo CLI" -ForegroundColor Red
    exit 1
}

# Install project dependencies
Write-Host ""
Write-Host "Installing project dependencies..." -ForegroundColor Yellow
Write-Host "This may take a few minutes..." -ForegroundColor Gray
npm install
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Dependencies installed successfully" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to install dependencies" -ForegroundColor Red
    exit 1
}

# Get local IP address
Write-Host ""
Write-Host "Detecting your local IP address..." -ForegroundColor Yellow
$ipAddress = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi*","Ethernet*" | Where-Object {$_.IPAddress -like "192.168.*" -or $_.IPAddress -like "10.*"} | Select-Object -First 1).IPAddress

if ($ipAddress) {
    Write-Host "✓ Your local IP address: $ipAddress" -ForegroundColor Green
    Write-Host ""
    Write-Host "⚠ IMPORTANT: Update src/config/constants.ts" -ForegroundColor Yellow
    Write-Host "Change API_BASE_URL to: http://$ipAddress:8000" -ForegroundColor Cyan
} else {
    Write-Host "⚠ Could not detect IP address automatically" -ForegroundColor Yellow
    Write-Host "Run 'ipconfig' and update API_BASE_URL in src/config/constants.ts" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Installation Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Update API_BASE_URL in src/config/constants.ts" -ForegroundColor White
Write-Host "2. Ensure backend is running: python -m uvicorn main:app --reload --host 0.0.0.0" -ForegroundColor White
Write-Host "3. Start the app: npm start" -ForegroundColor White
Write-Host "4. Scan QR code with Expo Go app on your mobile device" -ForegroundColor White
Write-Host ""
Write-Host "For detailed instructions, see SETUP_GUIDE.md" -ForegroundColor Gray
