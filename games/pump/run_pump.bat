@echo off
chcp 65001 > nul
title 펌프

cd /d "%~dp0..\.."
call dev.bat pump
