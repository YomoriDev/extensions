@echo off
title Yomori - Publicar RN Scanlation
setlocal
cd /d "%~dp0"

echo ======================================================================
echo   Publicar actualizacion de RN Scanlation (se firma con TU keystore)
echo ======================================================================
echo.
echo 1. Compilando la extension...
call gradlew.bat :rnscanlation:assembleRelease -q
if errorlevel 1 goto fail

echo.
echo 2. Firmando y actualizando los indices (te pedira la contrasena del keystore)...
python publish_rnscanlation.py
if errorlevel 1 goto fail

echo.
echo 3. Guardando el cambio en git...
cd /d "%~dp0.."
for /f "delims=" %%b in ('git branch --show-current') do set WORK=%%b
git add manga-extensions apk dist index.json repo.json
git commit -m "fix(rnscanlation): v1.4.13 - cover from the comic folder, rate limit and retry on HTTP 429"

echo.
echo 4. Subiendo a GitHub: main y repo (la rama que lee ZENTU)...
git checkout main
git merge --no-edit %WORK%
if errorlevel 1 goto fail
git push origin main
git checkout repo
git merge --no-edit main
if errorlevel 1 goto fail
git push origin repo
git checkout %WORK%

echo.
echo ======================================================================
echo   LISTO. En ZENTU: Mas ^> Extensiones ^> actualizar RN Scanlation.
echo ======================================================================
pause
exit /b 0

:fail
echo.
echo Algo fallo. Revisa el mensaje de arriba. No se publico nada mas.
pause
exit /b 1
