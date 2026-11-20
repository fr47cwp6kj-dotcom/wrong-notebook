@echo off
setlocal
chcp 65001 >nul

set "APP_SCRIPT=%~dp0..\app\cuoyin_v1.py"
where py >nul 2>nul
if %errorlevel%==0 (
    py -3 "%APP_SCRIPT%" %*
    goto done
)

where python >nul 2>nul
if %errorlevel%==0 (
    python "%APP_SCRIPT%" %*
    goto done
)

echo Python 3 was not found. Please install Python from python.org or the Microsoft Store.
exit /b 1

:done
exit /b %errorlevel%
