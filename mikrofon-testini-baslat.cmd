@echo off
setlocal
cd /d "%~dp0"
set "OMNI_MIC_PORT=8765"
set "OMNI_MIC_URL=http://127.0.0.1:%OMNI_MIC_PORT%/index.html#/mikrofon-testi"

where python >nul 2>nul
if %errorlevel%==0 goto start_python

where py >nul 2>nul
if %errorlevel%==0 goto start_py

echo Mikrofon testini yerel sunucuda acmak icin Python bulunamadi.
echo GitHub Pages surumunu kullanabilirsiniz:
echo https://ardaltunel.github.io/omni-tools/mikrofon-testi
pause
exit /b 1

:start_python
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 900; Start-Process '%OMNI_MIC_URL%'"
python -m http.server %OMNI_MIC_PORT% --bind 127.0.0.1
goto end

:start_py
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 900; Start-Process '%OMNI_MIC_URL%'"
py -3 -m http.server %OMNI_MIC_PORT% --bind 127.0.0.1

:end
endlocal
