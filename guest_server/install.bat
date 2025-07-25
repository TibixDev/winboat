@echo off
set INSTALL_DIR=C:\Program Files\WinBoat
set EXE_PATH=%INSTALL_DIR%\winboat_guest_server.exe
set PS1_PATH=%INSTALL_DIR%\apps.ps1
set NSSM_PATH=%INSTALL_DIR%\nssm.exe
set OEM_DIR=C:\OEM

:: Registry tweaks
reg import "%OEM_DIR%\RDPApps.reg"

:: Create install directory if it doesn't exist
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: Copy files from OEM to install directory
copy "%OEM_DIR%\winboat_guest_server.exe" "%EXE_PATH%" /Y
copy "%OEM_DIR%\apps.ps1" "%PS1_PATH%" /Y
copy "%OEM_DIR%\rdp-status.ps1" "%PS1_PATH%" /Y
copy "%OEM_DIR%\nssm.exe" "%NSSM_PATH%" /Y

:: Install the service with NSSM
"%NSSM_PATH%" install WinBoatGuestServer "%EXE_PATH%"
"%NSSM_PATH%" set WinBoatGuestServer Start SERVICE_AUTO_START
"%NSSM_PATH%" set WinBoatGuestServer AppDirectory "%INSTALL_DIR%"
"%NSSM_PATH%" set WinBoatGuestServer Description "WinBoat Guest Server API on port 7148"
"%NSSM_PATH%" set WinBoatGuestServer ObjectName "NT AUTHORITY\SYSTEM"

:: Add firewall rule for port 7148
netsh advfirewall firewall add rule name="Allow WinBoat API 7148" dir=in action=allow protocol=TCP localport=7148

:: Start the service
"%NSSM_PATH%" start WinBoatGuestServer