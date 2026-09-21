@echo off
chcp 65001 >nul
setlocal
rem  Todays-Haenuri : remove the auto start shortcut made by autostart-on.bat
set "NAME=Todays-Haenuri"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "FOUND="
if exist "%STARTUP%\%NAME%.lnk" set "FOUND=1"
if exist "%STARTUP%\%NAME%.url" set "FOUND=1"
del "%STARTUP%\%NAME%.lnk" >nul 2>&1
del "%STARTUP%\%NAME%.url" >nul 2>&1
echo.
if defined FOUND goto :removed
echo  자동 실행 바로가기가 없습니다. 이미 꺼져 있거나 다른 방법으로 켜 둔 상태입니다.
goto :end
:removed
echo  [완료] 자동 실행을 껐습니다. 다음부터 PC를 켜도 「오늘의 해누리」가 저절로 열리지 않습니다.
:end
echo  * 다시 켜려면 autostart-on.bat 을 실행하세요.
echo.
pause
endlocal
