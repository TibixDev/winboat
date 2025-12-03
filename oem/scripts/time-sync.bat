@echo off
net stop w32time
net start w32time
w32tm /resync