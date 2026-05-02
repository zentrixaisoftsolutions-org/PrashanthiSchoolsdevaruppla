#!/bin/bash
# Run on the VPS as ktsbnd. One-time install / re-deploy.
set -e
PWORD='11kR0Y[4PwbQ'
SUDO="echo $PWORD | sudo -S -p ''"

if ! python3 -c 'import psycopg2' 2>/dev/null; then
  echo "Installing python3-psycopg2..."
  eval "$SUDO apt-get update -qq"
  eval "$SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y python3-psycopg2"
fi

eval "$SUDO cp /home/ktsbnd/ws_sink.service /etc/systemd/system/ws_sink.service"
eval "$SUDO systemctl daemon-reload"
eval "$SUDO systemctl enable ws_sink.service"
eval "$SUDO systemctl restart ws_sink.service"

sleep 2
echo '=== status ==='
eval "$SUDO systemctl --no-pager -l status ws_sink.service" | head -15
echo
echo "Live tail:  tail -F /home/ktsbnd/device_messages.log"
