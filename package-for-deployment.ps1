# SchoolERP Packaging Script (PowerShell)
# Creates a deployment ZIP package matching the pattern used on existing servers
# Usage: .\package-for-deployment.ps1

param(
    [string]$ProjectRoot = $PSScriptRoot,
    [string]$OutputDir = $PSScriptRoot,
    [switch]$SkipFrontendBuild = $false,
    [switch]$SkipBackendOnly = $false,
    [string]$ServerIP = "178.104.244.231",
    [switch]$Upload = $false,
    [switch]$Deploy = $false,
    [switch]$FirstTime = $false
)

$ErrorActionPreference = "Stop"

# Default to the directory containing this script. Override with -ProjectRoot
# if you keep this script in a shared location and want to package a different
# project tree.
if (-not $ProjectRoot) { $ProjectRoot = $PSScriptRoot }
if (-not $OutputDir)   { $OutputDir   = $PSScriptRoot }
$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$OutputDir   = (Resolve-Path $OutputDir).Path

Write-Host "Packaging from: $ProjectRoot" -ForegroundColor Cyan
Write-Host "Output dir    : $OutputDir" -ForegroundColor Cyan

# .NET ZIP API — used instead of Compress-Archive because the latter writes
# entries with Windows backslashes ("routers\auth.py"), which makes Linux unzip
# warn ("appears to use backslashes as path separators") and some unzippers
# extract everything into one flat file.
Add-Type -AssemblyName System.IO.Compression.FileSystem

Write-Host "================================================" -ForegroundColor Green
Write-Host "  SchoolERP Deployment Packaging Script" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""

# ============================================
# Step 1: Build React Frontend
# ============================================
if (-not $SkipFrontendBuild) {
    Write-Host "[1/4] Building React frontend..." -ForegroundColor Yellow
    Set-Location "$ProjectRoot\React"

    if (-not (Test-Path "node_modules")) {
        Write-Host "Installing npm packages..." -ForegroundColor Cyan
        npm install --legacy-peer-deps
    }

    Write-Host "Running npm run build..." -ForegroundColor Cyan
    npm run build

    if (-not (Test-Path "dist")) {
        Write-Host "ERROR: Frontend build failed - dist folder not created" -ForegroundColor Red
        exit 1
    }
    Write-Host "Frontend built successfully" -ForegroundColor Green
    Set-Location $ProjectRoot
} else {
    Write-Host "[1/4] Skipping frontend build (--SkipFrontendBuild)" -ForegroundColor Yellow
}

# ============================================
# Step 2: Create Backend ZIP
# ============================================
Write-Host ""
Write-Host "[2/4] Creating backend.zip..." -ForegroundColor Yellow

$BackendZip = "$OutputDir\backend.zip"
if (Test-Path $BackendZip) { Remove-Item $BackendZip -Force }

# Files and folders to include in backend.
# Optional items (e.g. backup_database.py, migrations/) are added via Test-Path
# below if they happen to exist; missing ones are silently skipped.
$BackendItems = @(
    "main.py",
    "config.py",
    "database.py",
    "models.py",
    "schemas.py",
    "auth.py",
    "initialize_deployment.py",
    "requirements.txt",
    "routers",
    "services",
    "utils"
)

# Optional items — included only if present in the project tree.
$OptionalBackendItems = @(
    "backup_database.py",
    "restore_database.py",
    "migrations"
)
foreach ($opt in $OptionalBackendItems) {
    if (Test-Path "$ProjectRoot\$opt") { $BackendItems += $opt }
}

# Create temporary staging directory
$StagingDir = "$env:TEMP\schoolerp-backend-stage"
if (Test-Path $StagingDir) { Remove-Item $StagingDir -Recurse -Force }
New-Item -ItemType Directory -Path $StagingDir | Out-Null

foreach ($item in $BackendItems) {
    $src = "$ProjectRoot\$item"
    if (Test-Path $src) {
        Write-Host "  Adding: $item" -ForegroundColor Gray
        if ((Get-Item $src) -is [System.IO.DirectoryInfo]) {
            Copy-Item -Path $src -Destination "$StagingDir\$item" -Recurse -Force `
                -Exclude @("__pycache__", "*.pyc", ".pytest_cache", "*.log")
        } else {
            Copy-Item -Path $src -Destination "$StagingDir\$item" -Force
        }
    } else {
        Write-Host "  Skipping (not found): $item" -ForegroundColor DarkYellow
    }
}

# Remove __pycache__ folders from staging
Get-ChildItem -Path $StagingDir -Recurse -Directory -Force |
    Where-Object { $_.Name -eq "__pycache__" -or $_.Name -eq ".pytest_cache" } |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# Remove .pyc files
Get-ChildItem -Path $StagingDir -Recurse -File -Force |
    Where-Object { $_.Extension -eq ".pyc" -or $_.Extension -eq ".log" } |
    Remove-Item -Force -ErrorAction SilentlyContinue

# Create the ZIP using .NET API (writes POSIX-style "/" separators)
[System.IO.Compression.ZipFile]::CreateFromDirectory(
    $StagingDir, $BackendZip,
    [System.IO.Compression.CompressionLevel]::Optimal, $false
)
Remove-Item $StagingDir -Recurse -Force

$backendSize = [Math]::Round((Get-Item $BackendZip).Length / 1MB, 2)
Write-Host "Backend packaged: $BackendZip ($backendSize MB)" -ForegroundColor Green

# ============================================
# Step 3: Create Frontend ZIP
# ============================================
if (-not $SkipBackendOnly) {
    Write-Host ""
    Write-Host "[3/4] Creating frontend.zip..." -ForegroundColor Yellow

    $FrontendZip = "$OutputDir\frontend.zip"
    if (Test-Path $FrontendZip) { Remove-Item $FrontendZip -Force }

    $FrontendDist = "$ProjectRoot\React\dist"
    if (-not (Test-Path $FrontendDist)) {
        Write-Host "ERROR: $FrontendDist not found. Run with frontend build first." -ForegroundColor Red
        exit 1
    }

    [System.IO.Compression.ZipFile]::CreateFromDirectory(
        $FrontendDist, $FrontendZip,
        [System.IO.Compression.CompressionLevel]::Optimal, $false
    )

    $frontendSize = [Math]::Round((Get-Item $FrontendZip).Length / 1MB, 2)
    Write-Host "Frontend packaged: $FrontendZip ($frontendSize MB)" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[3/4] Skipping frontend zip (--SkipBackendOnly)" -ForegroundColor Yellow
}

# ============================================
# Step 4: Summary & Next Steps
# ============================================
Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "  Packaging Complete!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Created packages:" -ForegroundColor Cyan
if (Test-Path "$OutputDir\backend.zip") {
    Write-Host "  $OutputDir\backend.zip" -ForegroundColor White
}
if (Test-Path "$OutputDir\frontend.zip") {
    Write-Host "  $OutputDir\frontend.zip" -ForegroundColor White
}
Write-Host ""
Write-Host "Next Steps - Upload to server ($ServerIP):" -ForegroundColor Yellow
Write-Host ""
Write-Host "  scp `"$OutputDir\backend.zip`" root@${ServerIP}:/tmp/" -ForegroundColor White
Write-Host "  scp `"$OutputDir\frontend.zip`" root@${ServerIP}:/tmp/" -ForegroundColor White
Write-Host "  scp `"$OutputDir\deploy-on-server.sh`" root@${ServerIP}:/tmp/" -ForegroundColor White
Write-Host ""
Write-Host "Then SSH and run deployment:" -ForegroundColor Yellow
Write-Host "  ssh root@$ServerIP" -ForegroundColor White
Write-Host "  bash /tmp/deploy-on-server.sh" -ForegroundColor White
Write-Host ""

# ============================================
# Optional: Upload + Deploy in one shot
# ============================================
if ($Upload -or $Deploy) {
    Write-Host "================================================" -ForegroundColor Yellow
    Write-Host "  Uploading to $ServerIP..." -ForegroundColor Yellow
    Write-Host "================================================" -ForegroundColor Yellow

    scp "$OutputDir\backend.zip" "root@${ServerIP}:/tmp/"
    scp "$OutputDir\frontend.zip" "root@${ServerIP}:/tmp/"

    # Write deploy script to a staging copy with LF line endings before scp.
    # Windows git/editors often leave CRLF on .sh files, which makes bash
    # choke with `$'\r': command not found`.
    $DeployStaging = "$env:TEMP\schoolerp-deploy-on-server.sh"
    $deployContent = [System.IO.File]::ReadAllText("$ProjectRoot\deploy-on-server.sh") -replace "`r`n", "`n"
    [System.IO.File]::WriteAllText($DeployStaging, $deployContent)
    scp $DeployStaging "root@${ServerIP}:/tmp/deploy-on-server.sh"
    Remove-Item $DeployStaging -Force
    Write-Host "Upload complete" -ForegroundColor Green

    if ($Deploy) {
        Write-Host ""
        Write-Host "================================================" -ForegroundColor Yellow
        if ($FirstTime) {
            Write-Host "  Running FIRST-TIME deployment on server..." -ForegroundColor Yellow
            Write-Host "================================================" -ForegroundColor Yellow
            ssh "root@$ServerIP" "bash /tmp/deploy-on-server.sh --first-time"
        } else {
            Write-Host "  Running update deployment on server..." -ForegroundColor Yellow
            Write-Host "================================================" -ForegroundColor Yellow
            ssh "root@$ServerIP" "bash /tmp/deploy-on-server.sh"
        }
    }
}
