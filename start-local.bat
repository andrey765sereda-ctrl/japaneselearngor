@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  start "Bunka Japanese Studio" http://localhost:8765
  py -m http.server 8765
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "Bunka Japanese Studio" http://localhost:8765
  python -m http.server 8765
  goto :eof
)
echo Python 3 was not found.
echo Open index.html directly in your browser, or install Python 3 and run this file again.
pause
