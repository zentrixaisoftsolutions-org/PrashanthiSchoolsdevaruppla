# PowerShell script to login and build APK
$email = "muraritechoffice@gmail.com"
$password = "DareDevil@071520"

# Create temporary expect-like script
@"
$email
$password
"@ | eas login

# If login successful, build APK
if ($LASTEXITCODE -eq 0) {
    Write-Host "Login successful, starting build..."
    eas build --platform android --profile preview
} else {
    Write-Host "Login failed, exit code: $LASTEXITCODE"
}
