@echo off
chcp 65001 >nul
setlocal
rem ---------------------------------------------------------------
rem  Todays-Haenuri : PC login -> app window auto start
rem  makes one shortcut in the Startup folder (no admin rights needed)
rem ---------------------------------------------------------------
set "URL=https://scienceisjo.github.io/todays-haenuri/"
set "NAME=Todays-Haenuri"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "BROWSER="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LocalAppData%\Naver\Naver Whale\Application\whale.exe" set "BROWSER=%LocalAppData%\Naver\Naver Whale\Application\whale.exe"
if not defined BROWSER if exist "%ProgramFiles%\Naver\Naver Whale\Application\whale.exe" set "BROWSER=%ProgramFiles%\Naver\Naver Whale\Application\whale.exe"

if not exist "%STARTUP%" mkdir "%STARTUP%" >nul 2>&1
del "%STARTUP%\%NAME%.lnk" >nul 2>&1
del "%STARTUP%\%NAME%.url" >nul 2>&1

if not defined BROWSER goto :fallback

powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%STARTUP%\%NAME%.lnk'); $s.TargetPath='%BROWSER%'; $s.Arguments='--app=%URL%'; $s.WorkingDirectory=[Environment]::GetFolderPath('UserProfile'); $s.Save()"
if not exist "%STARTUP%\%NAME%.lnk" goto :fallback
echo.
echo  [완료] 이제 PC를 켜고 로그인하면 「오늘의 해누리」가 앱 창으로 저절로 열립니다.
echo         브라우저: %BROWSER%
echo         바로가기: %STARTUP%\%NAME%.lnk
echo.
echo  * 로그인 화면의 "이 컴퓨터에서 로그인 유지"에 체크해 두면 매번 로그인하지 않아도 됩니다.
echo  * 끄고 싶으면 autostart-off.bat 을 실행하세요.
echo.
echo  지금 바로 한 번 열어 봅니다...
start "" "%BROWSER%" --app=%URL%
goto :end

:fallback
> "%STARTUP%\%NAME%.url" echo [InternetShortcut]
>> "%STARTUP%\%NAME%.url" echo URL=%URL%
echo.
echo  [완료] Edge/Chrome 을 찾지 못해 기본 브라우저로 여는 바로가기를 만들었습니다.
echo         PC를 켜고 로그인하면 「오늘의 해누리」가 브라우저 탭으로 열립니다.
echo         바로가기: %STARTUP%\%NAME%.url
echo.
echo  * 끄고 싶으면 autostart-off.bat 을 실행하세요.
echo.
start "" "%URL%"

:end
echo.
pause
endlocal
