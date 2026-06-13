@echo off
chcp 65001 > nul
title 골목길의 하루

cd /d "%~dp0..\.."
call dev.bat golmok
