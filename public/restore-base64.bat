@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion
title 文本剪贴板文件还原

echo.
echo ========================================
echo 文本剪贴板文件还原
echo 用途：通过文本剪贴板接收并还原文件数据
echo ========================================
echo.

where powershell >nul 2>nul
if errorlevel 1 (
  echo [失败] 当前 Windows 未找到 PowerShell，无法读取文本剪贴板。
  pause
  exit /b 1
)

set "RESTORE_DIR=%~dp0"

echo 文件将保存到：%RESTORE_DIR%
echo 正在读取文本剪贴板并还原文件...
powershell -NoProfile -Command "$ErrorActionPreference = 'Stop'; $content = Get-Clipboard -Raw; if ([string]::IsNullOrWhiteSpace($content)) { throw '剪贴板为空。' }; $parts = $content.Trim() -split '\|', 4; if ($parts.Count -ne 4 -or $parts[0] -ne 'ONE_TRANSFER_V1') { throw '剪贴板内容不是文件传输数据。' }; $itemType = $parts[1]; $name = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parts[2])); $stem = [IO.Path]::GetFileNameWithoutExtension($name); if ([string]::IsNullOrWhiteSpace($name) -or $name -ne [IO.Path]::GetFileName($name) -or $name.IndexOfAny([IO.Path]::GetInvalidFileNameChars()) -ge 0 -or $name.EndsWith('.') -or $name.EndsWith(' ') -or $stem -match '^(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$') { throw '文件名无法在 Windows 中使用。' }; $bytes = [Convert]::FromBase64String(($parts[3] -replace '\s', '')); $target = Join-Path $env:RESTORE_DIR $name; if (Test-Path -LiteralPath $target) { throw ('目标已存在，请先移动或重命名：' + $target) }; $hasher = [Security.Cryptography.MD5]::Create(); try { $hash = [BitConverter]::ToString($hasher.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant() } finally { $hasher.Dispose() }; if ($itemType -eq 'file') { [IO.File]::WriteAllBytes($target, $bytes); Write-Host ('已还原文件：' + $target) } elseif ($itemType -eq 'directory') { $token = [Guid]::NewGuid().ToString('N'); $archive = Join-Path $env:TEMP ('one-transfer-' + $token + '.zip'); $staging = Join-Path $env:TEMP ('one-transfer-' + $token); try { [IO.File]::WriteAllBytes($archive, $bytes); Expand-Archive -LiteralPath $archive -DestinationPath $staging; $source = Join-Path $staging $name; if (-not (Test-Path -LiteralPath $source -PathType Container)) { throw '压缩包中未找到预期目录。' }; Move-Item -LiteralPath $source -Destination $target } finally { Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue; Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue }; Write-Host ('已还原目录：' + $target) } else { throw ('不支持的内容类型：' + $itemType) }; Write-Host ('原始数据 MD5：' + $hash)"
if errorlevel 1 (
  echo.
  echo [失败] 未能还原文件。
  echo 请回到发送端，重新选择文件并点击“复制到剪贴板”。
  pause
  exit /b 1
)

echo.
echo [完成] 文件已还原到脚本所在目录。
pause
exit /b 0
