@echo off
setlocal
set "ROOT=%~dp0.."
pushd "%ROOT%"
if exist "%ROOT%\python\python.exe" (
  "%ROOT%\python\python.exe" "%ROOT%\tests\run_golden.py" %*
) else (
  python "%ROOT%\tests\run_golden.py" %*
)
set "CODE=%ERRORLEVEL%"
popd
exit /b %CODE%
