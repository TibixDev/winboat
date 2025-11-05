#!/bin/bash

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║          WINBOAT FIX-IT - Restart Everything Clean       ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "This will:"
echo "  1. Check for port conflicts"
echo "  2. Close WinBoat"
echo "  3. Stop Windows cleanly"
echo "  4. Restart everything fresh"
echo ""
echo "Takes about 2 minutes..."
echo ""

# Check for xrdp service
echo "→ Checking for port conflicts..."
if systemctl is-active --quiet xrdp 2>/dev/null; then
    echo "⚠️  WARNING: xrdp is running and may conflict with WinBoat (port 3389)"
    echo ""
    read -p "Stop xrdp service? [Y/n] " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
        echo "→ Stopping xrdp..."
        sudo systemctl stop xrdp
        echo "✓ xrdp stopped"
    else
        echo "⚠️  Continuing anyway - WinBoat may fail to start if port 3389 is in use"
    fi
    echo ""
fi

# Check if port 3389 is in use
if ss -tuln | grep -q ':3389 ' | grep -v '127.0.0.1:3389'; then
    echo "⚠️  WARNING: Port 3389 is in use by another service"
    echo "   WinBoat may fail to start. Check with: sudo ss -tuln | grep 3389"
    echo ""
    read -p "Continue anyway? [y/N] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Exiting. Please free port 3389 and try again."
        exit 1
    fi
    echo ""
fi


# Close WinBoat GUI
echo "→ Closing WinBoat application..."
pkill -f winboat 2>/dev/null || true
sleep 2

# Stop container cleanly
echo "→ Stopping Windows..."
docker stop WinBoat 2>/dev/null || true
sleep 5

# Start container
echo "→ Starting Windows..."
docker start WinBoat

# Wait for Windows to boot
echo "→ Waiting for Windows to start (30 seconds)..."
sleep 30

# Check if Guest API is responding
echo "→ Checking Guest API..."
for i in {1..10}; do
    if curl -s http://127.0.0.1:7148/health | grep -q "ok"; then
        echo "✓ Guest API is online!"
        break
    fi
    echo "  Waiting... ($i/10)"
    sleep 3
done

# Open WinBoat
echo "→ Opening WinBoat..."
winboat &

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                        ✓ DONE!                            ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "WinBoat should now be working."
echo "Go to the 'Apps' tab and try launching an app."
echo ""
echo "If you still have issues, check:"
echo "  • sudo systemctl status xrdp    (should be inactive)"
echo "  • sudo ss -tuln | grep 3389     (should show WinBoat only)"
echo ""
