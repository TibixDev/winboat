@echo off
set WB_DIR=C:\Program Files\WinBoat
set OEM_DIR=C:\OEM
set NSSM=%WB_DIR%\nssm.exe

:: Registry tweaks (imported once at install time)
reg import "%OEM_DIR%\RDPApps.reg"

:: Create the install directory and exclude it from Windows Defender before
:: copying anything in, so the guest binaries aren't scanned on write.
if not exist "%WB_DIR%" mkdir "%WB_DIR%"
powershell -ExecutionPolicy Bypass -Command "Add-MpPreference -ExclusionPath '%WB_DIR%'"

:: Copy the OEM payload into the install directory. This lays down:
::   server\   - the Guest Server (updatable)
::   updater\  - the Guest Server Updater (never updated)
::   guest_token, nssm.exe, RDPApps.reg, install.bat
xcopy "%OEM_DIR%\*" "%WB_DIR%\" /Y /E

:: --- Guest Server service ---
"%NSSM%" install WinBoatGuestServer "%WB_DIR%\server\winboat_guest_server.exe"
"%NSSM%" set WinBoatGuestServer Start SERVICE_AUTO_START
"%NSSM%" set WinBoatGuestServer AppDirectory "%WB_DIR%\server"
"%NSSM%" set WinBoatGuestServer Description "WinBoat Guest Server API on port 7148"
"%NSSM%" set WinBoatGuestServer ObjectName "NT AUTHORITY\SYSTEM"

:: --- Guest Server Updater service ---
"%NSSM%" install WinBoatGuestServerUpdater "%WB_DIR%\updater\winboat_guest_server_updater.exe"
"%NSSM%" set WinBoatGuestServerUpdater Start SERVICE_AUTO_START
"%NSSM%" set WinBoatGuestServerUpdater AppDirectory "%WB_DIR%\updater"
"%NSSM%" set WinBoatGuestServerUpdater Description "WinBoat Guest Server Updater on port 7150"
"%NSSM%" set WinBoatGuestServerUpdater ObjectName "NT AUTHORITY\SYSTEM"

:: Firewall rules for both services
netsh advfirewall firewall add rule name="Allow WinBoat API 7148" dir=in action=allow protocol=TCP localport=7148
netsh advfirewall firewall add rule name="Allow WinBoat Updater 7150" dir=in action=allow protocol=TCP localport=7150

:: Start both services
"%NSSM%" start WinBoatGuestServer
"%NSSM%" start WinBoatGuestServerUpdater

:: Startup Tasks
schtasks /create /tn "TimeSyncTask" /sc ONSTART /RL HIGHEST /tr "\"%WB_DIR%\server\scripts\time-sync.bat\"" /RU SYSTEM
