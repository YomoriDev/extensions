@echo off
title Yomori - Publicar Peelink2
cd /d "%~dp0"
echo ======================================================================
echo   Publicar Peelink2 en el repo de anime (se firma con TU keystore)
echo ======================================================================
python publish_anime.py
echo.
pause
