@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "BACKEND_ROOT=%%~fI"
if not defined SAMI_AI_DUBBING_ROOT set "SAMI_AI_DUBBING_ROOT=%BACKEND_ROOT%\var\ai-dubbing"
set "PYTHON=%SAMI_AI_DUBBING_ROOT%\venv\Scripts\python.exe"
if not exist "%PYTHON%" (
  echo Runtime de doublage IA absent. Executez npm run setup:ai-dubbing. 1>&2
  exit /b 1
)
if not defined HF_HOME set "HF_HOME=%SAMI_AI_DUBBING_ROOT%\cache\huggingface"
if not defined BANDIT_INFER_WEIGHTS set "BANDIT_INFER_WEIGHTS=%SAMI_AI_DUBBING_ROOT%\models\bandit"
set "HF_HUB_DISABLE_TELEMETRY=1"
set "PYANNOTE_METRICS_ENABLED=0"
set "DO_NOT_TRACK=1"
set "TOKENIZERS_PARALLELISM=false"
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
"%PYTHON%" "%SCRIPT_DIR%runtime.py" %*
exit /b %ERRORLEVEL%
