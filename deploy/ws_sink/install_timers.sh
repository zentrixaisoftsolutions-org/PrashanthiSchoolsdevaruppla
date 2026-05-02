#!/bin/bash
set -e
PWORD='11kR0Y[4PwbQ'
echo "$PWORD" | sudo -S -p '' cp /home/ktsbnd/ws_sink-start.timer  /etc/systemd/system/
echo "$PWORD" | sudo -S -p '' cp /home/ktsbnd/ws_sink-stop.timer   /etc/systemd/system/
echo "$PWORD" | sudo -S -p '' cp /home/ktsbnd/ws_sink-stop.service /etc/systemd/system/
echo "$PWORD" | sudo -S -p '' systemctl daemon-reload
echo "$PWORD" | sudo -S -p '' systemctl enable --now ws_sink-start.timer ws_sink-stop.timer

# Decide current state: if local hour in Asia/Kolkata is 7..20 -> start, else stop
HOUR=$(TZ=Asia/Kolkata date +%H)
if [ "$HOUR" -ge 7 ] && [ "$HOUR" -lt 21 ]; then
    echo "[$(date)] within window ($HOUR) -> starting ws_sink"
    echo "$PWORD" | sudo -S -p '' systemctl start ws_sink.service
else
    echo "[$(date)] outside window ($HOUR) -> stopping ws_sink"
    echo "$PWORD" | sudo -S -p '' systemctl stop ws_sink.service || true
fi

echo "---- timers ----"
systemctl list-timers --all | grep ws_sink || true
echo "---- service ----"
systemctl is-active ws_sink.service || true
