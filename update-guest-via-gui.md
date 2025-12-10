# Updating the Guest Server

The guest server inside the Windows VM needs to be updated to listen on `0.0.0.0:7148` instead of `:7148`.

## Problem
The old guest server binds to `:7148` which only listens on localhost inside the container,  
making it inaccessible from the host machine.

## Solution Applied
Changed `main.go` line 411-412:
```go
// OLD (only listens on localhost):
log.Println("Starting WinBoat Guest Server on :7148...")
if err := http.ListenAndServe(":7148", handler); err != nil {

// NEW (listens on all interfaces):
log.Println("Starting WinBoat Guest Server on 0.0.0.0:7148...")
if err := http.ListenAndServe("0.0.0.0:7148", handler); err != nil {
```

## How to Update

### Option 1: Use WinBoat GUI (Recommended)
1. Run the WinBoat app: `npm run dev`
2. Wait for Windows VM to boot completely (~2-3 minutes)
3. The app should detect the version mismatch and offer to update
4. Accept the update and wait for it to complete

### Option 2: Manual Update via Container
If the GUI can't connect (which is the current issue), you need to update from inside the Windows VM:

```bash
# Copy the new executable to the Windows VM storage
cp guest_server/winboat_guest_server.exe ~/.winboat/oem/

# Access the Windows VM console via noVNC
# Open: http://127.0.0.1:8006/
# Login with your Windows credentials (from docker-compose.yml)

# Inside Windows, open PowerShell as Administrator and run:
cd "C:\Program Files\WinBoat"
.\nssm.exe stop WinBoatGuestServer
Copy-Item C:\OEM\winboat_guest_server.exe "C:\Program Files\WinBoat\winboat_guest_server.exe" -Force
.\nssm.exe start WinBoatGuestServer
```

### Option 3: Recreate the Container (Clean Slate)
```bash
# Stop and remove the existing container
docker stop WinBoat
docker rm WinBoat

# Remove the old data volume (⚠️ THIS WILL DELETE WINDOWS!)
docker volume rm winboat_data

# Start fresh - Windows will reinstall with the new guest server
cd ~/Work/WinBoat
npm run dev
# Follow the setup wizard to install Windows again
```

## Verification
After updating, test the API:
```bash
curl http://localhost:47280/health
# Should return: {"status":"healthy"}

# Or use the CLI:
winboat -status
# Should show "✓ API is responding correctly"
```

