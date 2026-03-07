@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"
if errorlevel 1 (
  echo [ERROR] Failed to switch to script directory.
  set "EXIT_CODE=1"
  goto :end
)
title Monopoly Publish Script

where git >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Git not found. Please install Git first.
  set "EXIT_CODE=1"
  goto :end
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Current directory is not a Git repository.
  set "EXIT_CODE=1"
  goto :end
)

set "HAS_CHANGES="
for /f %%A in ('git status --porcelain') do (
  set "HAS_CHANGES=1"
  goto :changes_found
)

:changes_found
if not defined HAS_CHANGES (
  echo [INFO] No changes detected. Nothing to publish.
  set "EXIT_CODE=0"
  goto :end
)

for /f %%B in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%B"
for /f %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss"') do set "STAMP=%%T"
set "AUTO_TAG=[%BRANCH% %STAMP%]"

set "MSG="
set /p MSG=Commit message ^(press Enter for default^): 
if "%MSG%"=="" (
  set "MSG=Update: routine changes %AUTO_TAG%"
) else (
  set "MSG=%MSG% %AUTO_TAG%"
)

echo.
echo [1/3] Staging files...
git add .
if errorlevel 1 (
  echo [ERROR] git add failed.
  set "EXIT_CODE=1"
  goto :end
)

echo [2/3] Creating commit...
git commit -m "%MSG%"
if errorlevel 1 (
  echo [ERROR] git commit failed. Check output above.
  set "EXIT_CODE=1"
  goto :end
)

echo [3/3] Pushing to origin/%BRANCH% ...
git push origin "%BRANCH%"
if errorlevel 1 (
  echo [ERROR] git push failed. Network or auth issue possible.
  set "EXIT_CODE=1"
  goto :end
)

echo.
echo [DONE] Published successfully to origin/%BRANCH%.
set "EXIT_CODE=0"

:end
echo.
echo Press any key to close...
pause >nul
exit /b %EXIT_CODE%
