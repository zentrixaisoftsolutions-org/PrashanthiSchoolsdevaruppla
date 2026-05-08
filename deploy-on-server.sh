#!/bin/bash
# SchoolERP Server-Side Deployment Script
# Captures the exact steps that worked during first deployment.
#
# Usage:
#   bash /tmp/deploy-on-server.sh --first-time   (initial install: installs SQL Server, deps, app)
#   bash /tmp/deploy-on-server.sh                (update: re-deploys backend + frontend)
#
# Prerequisites:
#   - Ubuntu 22.04 LTS
#   - Run as root
#   - /tmp/backend.zip and /tmp/frontend.zip must be uploaded first
#
# Optional environment variables:
#   DB_NAME         SQL Server database name (default: prashanthiSchools)
#   SA_PASSWORD     SQL Server SA password   (default: Password96123)
#   SECRET_KEY      JWT secret key           (default: random, --first-time only)
#   APP_USER        Linux user for the app   (default: schoolerp)
#   SCHOOL_NAME     Seed value for school_settings.school_name (--first-time only)

set -e

# ============================================
# Configuration
# ============================================
APP_USER="${APP_USER:-schoolerp}"
APP_DIR="/var/www/schoolerp"
FRONTEND_DIR="/var/www/html/schoolerp"
BACKEND_PORT=8000
DB_NAME="${DB_NAME:-prashanthiSchools}"
SA_PASSWORD="${SA_PASSWORD:-Password96123}"
SECRET_KEY="${SECRET_KEY:-$(openssl rand -hex 32 2>/dev/null || echo "change-this-secret-key-in-production")}"
SCHOOL_NAME="${SCHOOL_NAME:-My School}"
SERVER_IP="$(hostname -I | awk '{print $1}')"

# Mode flag
FIRST_TIME=false
if [[ "$1" == "--first-time" ]]; then
    FIRST_TIME=true
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()    { echo -e "${YELLOW}[$(date +%H:%M:%S)] $1${NC}"; }
ok()     { echo -e "${GREEN}    ✓ $1${NC}"; }
fail()   { echo -e "${RED}    ✗ $1${NC}"; exit 1; }
info()   { echo -e "${CYAN}    ℹ $1${NC}"; }

# ============================================
# Pre-flight checks
# ============================================
echo -e "${GREEN}================================================${NC}"
if [ "$FIRST_TIME" = true ]; then
    echo -e "${GREEN}  SchoolERP FIRST-TIME Deployment${NC}"
else
    echo -e "${GREEN}  SchoolERP Update Deployment${NC}"
fi
echo -e "${GREEN}================================================${NC}"

[[ $EUID -ne 0 ]] && fail "Must be run as root"
[ ! -f "/tmp/backend.zip" ] && fail "/tmp/backend.zip not found - upload it first"
[ ! -f "/tmp/frontend.zip" ] && fail "/tmp/frontend.zip not found - upload it first"

# ============================================
# FIRST-TIME ONLY: System & SQL Server install
# ============================================
if [ "$FIRST_TIME" = true ]; then
    log "[1/12] Installing system dependencies..."
    apt update -qq
    apt install -y -qq \
        build-essential curl wget unzip gnupg \
        python3.11 python3.11-venv python3.11-dev python3-pip \
        nginx unixodbc-dev openssl
    ok "System dependencies installed"

    log "[2/12] Installing Node.js 20..."
    if ! command -v node &>/dev/null || [[ "$(node -v)" != v20* ]]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
        apt install -y -qq nodejs
    fi
    ok "Node.js $(node -v) installed"

    log "[3/12] Installing SQL Server 2022..."
    if ! systemctl list-unit-files | grep -q mssql-server; then
        curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | apt-key add - 2>/dev/null
        curl -fsSL https://packages.microsoft.com/config/ubuntu/22.04/mssql-server-2022.list \
            | tee /etc/apt/sources.list.d/mssql-server-2022.list >/dev/null
        apt update -qq
        apt install -y -qq mssql-server

        # Non-interactive setup: Developer edition (free)
        MSSQL_PID=Developer ACCEPT_EULA=Y MSSQL_SA_PASSWORD="$SA_PASSWORD" \
            /opt/mssql/bin/mssql-conf -n setup accept-eula
        systemctl enable --now mssql-server
        sleep 5
    fi
    ok "SQL Server installed and running"

    log "[4/12] Installing SQL Server tools & ODBC driver..."
    if [ ! -f "/etc/apt/sources.list.d/mssql-release.list" ]; then
        curl -fsSL https://packages.microsoft.com/config/ubuntu/22.04/prod.list \
            | tee /etc/apt/sources.list.d/mssql-release.list >/dev/null
        apt update -qq
    fi
    ACCEPT_EULA=Y apt install -y -qq mssql-tools msodbcsql17
    grep -q "/opt/mssql-tools/bin" /etc/profile || \
        echo 'export PATH="$PATH:/opt/mssql-tools/bin"' >> /etc/profile
    export PATH="$PATH:/opt/mssql-tools/bin"
    ok "mssql-tools and msodbcsql17 installed"

    log "[5/12] Creating application user '$APP_USER'..."
    if ! id "$APP_USER" &>/dev/null; then
        useradd -m -s /bin/bash "$APP_USER"
        usermod -aG sudo "$APP_USER"
        echo "$APP_USER ALL=(ALL) NOPASSWD: /bin/systemctl" >> /etc/sudoers
    fi
    ok "User '$APP_USER' ready"

    log "[6/12] Creating directory structure..."
    mkdir -p "$APP_DIR" "$FRONTEND_DIR" "$APP_DIR/uploads/logos" /var/log/schoolerp
    chown -R "$APP_USER:$APP_USER" "$APP_DIR" /var/log/schoolerp
    chown -R www-data:www-data "$FRONTEND_DIR"
    ok "Directories created"
fi

# ============================================
# COMMON: Stop service before update
# ============================================
log "[7/12] Stopping schoolerp-api service (if running)..."
if systemctl list-unit-files | grep -q schoolerp-api.service; then
    systemctl stop schoolerp-api 2>/dev/null || true
    ok "Service stopped"
else
    info "Service not yet installed"
fi

# ============================================
# Deploy backend
# ============================================
log "[8/12] Deploying backend code..."

# Backup .env and uploads (preserve user data)
[ -f "$APP_DIR/.env" ] && cp "$APP_DIR/.env" /tmp/.schoolerp-env.backup
[ -d "$APP_DIR/uploads" ] && cp -r "$APP_DIR/uploads" /tmp/.schoolerp-uploads.backup

# Clean previous backend code (preserve venv + .env + uploads)
rm -rf "$APP_DIR/main.py" "$APP_DIR/config.py" "$APP_DIR/database.py" \
       "$APP_DIR/models.py" "$APP_DIR/schemas.py" "$APP_DIR/auth.py" \
       "$APP_DIR/initialize_deployment.py" "$APP_DIR/requirements.txt" \
       "$APP_DIR/routers" "$APP_DIR/services" "$APP_DIR/utils"

unzip -o -q /tmp/backend.zip -d "$APP_DIR"

# Restore uploads
[ -d "/tmp/.schoolerp-uploads.backup" ] && {
    rm -rf "$APP_DIR/uploads"
    mv /tmp/.schoolerp-uploads.backup "$APP_DIR/uploads"
}

chown -R "$APP_USER:$APP_USER" "$APP_DIR"
ok "Backend extracted"

# ============================================
# Setup Python venv & dependencies
# ============================================
log "[9/12] Installing Python dependencies..."
cd "$APP_DIR"

if [ ! -d "venv" ]; then
    sudo -u "$APP_USER" python3.11 -m venv venv
fi
sudo -u "$APP_USER" venv/bin/pip install --upgrade pip setuptools wheel --quiet
sudo -u "$APP_USER" venv/bin/pip install -r requirements.txt --quiet
sudo -u "$APP_USER" venv/bin/pip install pymssql --quiet  # required by config.py
ok "Python dependencies installed"

# ============================================
# Configure .env (first-time) or restore (update)
# ============================================
log "[10/12] Configuring .env..."
if [ -f "/tmp/.schoolerp-env.backup" ]; then
    mv /tmp/.schoolerp-env.backup "$APP_DIR/.env"
    info ".env restored from backup"
else
    cat > "$APP_DIR/.env" << ENVEOF
# SQL Server Connection
DB_SERVER=localhost
DB_NAME=$DB_NAME
DB_USER=sa
DB_PASSWORD=$SA_PASSWORD
DB_DRIVER=ODBC Driver 17 for SQL Server

# JWT
SECRET_KEY=$SECRET_KEY
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480

# EasyTimePro (ZKTeco) Server
EASYTIMEPRO_BASE_URL=http://178.104.244.231:8080
EASYTIMEPRO_USERNAME=admin
EASYTIMEPRO_PASSWORD=Zentrix@123
EASYTIMEPRO_POLL_INTERVAL=30
EASYTIMEPRO_VERIFY_SSL=False

# Application
DEBUG=False
ENVEOF
    info ".env created with defaults"
fi
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"
ok ".env configured"

# ============================================
# FIRST-TIME ONLY: Create database + initialize tables
# ============================================
if [ "$FIRST_TIME" = true ]; then
    log "[11/12] Creating database '$DB_NAME'..."

    # Wait for SQL Server to be ready
    for i in {1..30}; do
        if /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" -Q "SELECT 1" &>/dev/null; then
            break
        fi
        sleep 2
    done

    # Create database if it doesn't exist (case-insensitive name compare)
    /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" \
        -Q "IF NOT EXISTS (SELECT * FROM sys.databases WHERE name='$DB_NAME') CREATE DATABASE [$DB_NAME]" \
        || fail "Could not create database '$DB_NAME' (check SA password)"
    ok "Database '$DB_NAME' ready"

    log "Initializing tables and seed data..."
    cd "$APP_DIR"
    sudo -u "$APP_USER" --preserve-env=SCHOOL_NAME \
        env SCHOOL_NAME="$SCHOOL_NAME" venv/bin/python initialize_deployment.py
    ok "Tables created, roles + superadmin + school_settings seeded"
else
    log "[11/12] Skipping DB init (update mode)"
fi

# ============================================
# Deploy frontend
# ============================================
log "Deploying frontend..."
rm -rf "$FRONTEND_DIR"/*
unzip -o -q /tmp/frontend.zip -d "$FRONTEND_DIR"

# Critical: rewrite config.js to use relative /api path so it works on any host/HTTPS
cat > "$FRONTEND_DIR/config.js" << 'CFGEOF'
window.APP_CONFIG = {
  API_URL: "/api"
};
CFGEOF
chown -R www-data:www-data "$FRONTEND_DIR"
ok "Frontend deployed (API_URL=/api)"

# ============================================
# FIRST-TIME ONLY: systemd service + nginx config
# ============================================
if [ "$FIRST_TIME" = true ] || [ ! -f "/etc/systemd/system/schoolerp-api.service" ]; then
    log "[12/12] Creating systemd service & nginx config..."

    cat > /etc/systemd/system/schoolerp-api.service << SERVICEEOF
[Unit]
Description=SchoolERP FastAPI Backend
After=network.target mssql-server.service

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment="PATH=$APP_DIR/venv/bin"
ExecStart=$APP_DIR/venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port $BACKEND_PORT --workers 2
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
MemoryMax=2G
MemoryHigh=1G

[Install]
WantedBy=multi-user.target
SERVICEEOF

    cat > /etc/nginx/sites-available/schoolerp << NGINXEOF
upstream fastapi_backend {
    server 127.0.0.1:$BACKEND_PORT;
    keepalive 32;
}

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    access_log /var/log/nginx/schoolerp_access.log;
    error_log /var/log/nginx/schoolerp_error.log;

    gzip on;
    gzip_vary on;
    gzip_min_length 1000;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    client_max_body_size 10M;

    location / {
        root $FRONTEND_DIR;
        try_files \$uri \$uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public";
    }

    location /api/ {
        proxy_pass http://fastapi_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
    }

    location /uploads/ {
        alias $APP_DIR/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /docs       { proxy_pass http://fastapi_backend; proxy_set_header Host \$host; }
    location /openapi.json { proxy_pass http://fastapi_backend; proxy_set_header Host \$host; }

    location /health {
        access_log off;
        return 200 "OK\n";
        add_header Content-Type text/plain;
    }
}
NGINXEOF

    rm -f /etc/nginx/sites-enabled/default
    ln -sf /etc/nginx/sites-available/schoolerp /etc/nginx/sites-enabled/schoolerp
    nginx -t
    systemctl daemon-reload
    systemctl enable schoolerp-api nginx
    ok "Service & nginx configured"
fi

# ============================================
# Restart everything
# ============================================
log "Starting services..."
systemctl restart schoolerp-api
sleep 3
systemctl reload nginx 2>/dev/null || systemctl restart nginx

# Verify
systemctl is-active --quiet schoolerp-api || {
    journalctl -u schoolerp-api -n 30 --no-pager
    fail "schoolerp-api failed to start"
}
systemctl is-active --quiet nginx || fail "nginx failed to start"

# Cleanup
rm -f /tmp/backend.zip /tmp/frontend.zip

# ============================================
# Done
# ============================================
echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  ✓ Deployment Complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo -e "${CYAN}Service Status:${NC}"
echo "  schoolerp-api: $(systemctl is-active schoolerp-api)"
echo "  nginx:         $(systemctl is-active nginx)"
echo "  mssql-server:  $(systemctl is-active mssql-server 2>/dev/null || echo n/a)"
echo ""
echo -e "${CYAN}Endpoints:${NC}"
echo "  Frontend:  http://$SERVER_IP/"
echo "  API docs:  http://$SERVER_IP/docs"
echo "  Health:    http://$SERVER_IP/health"
echo ""

if [ "$FIRST_TIME" = true ]; then
    echo -e "${YELLOW}First-time login credentials:${NC}"
    echo "  Username: superadmin"
    echo "  Password: superadmin@123"
    echo ""
    echo -e "${RED}IMPORTANT: Change the superadmin password immediately!${NC}"
    echo ""
fi

echo -e "${CYAN}Logs:${NC}"
echo "  journalctl -u schoolerp-api -f"
echo "  tail -f /var/log/nginx/schoolerp_error.log"
echo ""
