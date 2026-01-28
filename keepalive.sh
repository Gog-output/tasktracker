#!/bin/bash
# Keep TaskTracker running permanently

LOG_FILE="/tmp/tasktracker.log"
cd /home/ubuntu/clawd/tasktracker

echo "[$(date)] Starting TaskTracker..." >> $LOG_FILE

while true; do
    # Ensure server is running
    if ! curl -s http://localhost:3000 >/dev/null 2>&1; then
        echo "[$(date)] Starting server..." >> $LOG_FILE
        node server.js >> /tmp/server.log 2>&1 &
        sleep 3
    fi
    
    # Ensure tunnel is running
    if ! pgrep -f "cloudflared.*localhost:3000" >/dev/null; then
        echo "[$(date)] Starting tunnel..." >> $LOG_FILE
        cd /tmp
        ./cloudflared tunnel --url http://localhost:3000 >> /tmp/cf.log 2>&1 &
        sleep 8
        NEW_URL=$(grep -o 'https://[^[:space:]]*\.trycloudflare.com' /tmp/cf.log | tail -1)
        echo "[$(date)] New URL: $NEW_URL" >> $LOG_FILE
    fi
    
    sleep 30
done
