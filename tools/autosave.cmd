@echo off
chcp 65001 >nul
title 像塑自动保存守护（关掉此窗口即停止）

rem 优先用系统 Python；没有则回退到 WorkBuddy 自带的运行时。
set "PY=C:\Users\Administrator\AppData\Local\Programs\Python\Python312\python.exe"
if not exist "%PY%" set "PY=C:\Users\Administrator\.workbuddy\binaries\python\versions\3.13.12\python.exe"
if not exist "%PY%" (
    echo [错误] 没找到 Python，请自行确认安装路径。
    pause
    exit /b 1
)

echo ============================================
echo  像塑工程自动保存守护
echo  改完几秒内自动落盘；关掉本窗口即停止
echo ============================================
echo.

"%PY%" "%~dp0xs_autosave.py" %*

echo.
echo [已停止] 守护进程退出。
pause
