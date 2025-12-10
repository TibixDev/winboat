@echo off
set INSTALL_DIR=C:\Program Files\WinBoat
set EXE_PATH=%INSTALL_DIR%\winboat_guest_server.exe
set TIME_SYNC_SCRIPT_PATH=%INSTALL_DIR%\scripts\time-sync.bat
set NSSM_PATH=%INSTALL_DIR%\nssm.exe
set OEM_DIR=C:\OEM

:: Setup RDP Applications and Tweaks
reg import "%OEM_DIR%\RDPApps.reg" 
reg import "%OEM_DIR%\RDPTweaks.reg"

:: Create install directory if it doesn't exist
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: Copy files from OEM to install directory
xcopy "%OEM_DIR%\*" "%INSTALL_DIR%\" /Y /E

:: Install the service with NSSM
"%NSSM_PATH%" install WinBoatGuestServer "%EXE_PATH%"
"%NSSM_PATH%" set WinBoatGuestServer Start SERVICE_AUTO_START
"%NSSM_PATH%" set WinBoatGuestServer AppDirectory "%INSTALL_DIR%"
"%NSSM_PATH%" set WinBoatGuestServer Description "WinBoat Guest Server API on port 7148"
"%NSSM_PATH%" set WinBoatGuestServer ObjectName "NT AUTHORITY\SYSTEM"

:: Add firewall rule for port 7148 (remove existing first to avoid errors)
netsh advfirewall firewall delete rule name="Allow WinBoat API 7148" >nul 2>&1
netsh advfirewall firewall add rule name="Allow WinBoat API 7148" dir=in action=allow protocol=TCP localport=7148

:: Start the service
"%NSSM_PATH%" start WinBoatGuestServer

:: Startup Tasks
schtasks /create /tn "TimeSyncTask" /sc ONSTART /RL HIGHEST /tr "\"%TIME_SYNC_SCRIPT_PATH%\"" /RU SYSTEM