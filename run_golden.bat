@echo off
call "%~dp0tests\run_golden.bat" %*
exit /b %ERRORLEVEL%
