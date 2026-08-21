@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion
title One Transfer 通用文件还原

echo.
echo ========================================
echo One Transfer 通用文件还原
echo 当前协议：ONE_TRANSFER_V2 / Base32768 / Base91 / gzip / SHA-256
echo 向后兼容：ONE_TRANSFER_V1 / Base64
echo ========================================
echo.

where powershell >nul 2>nul
if errorlevel 1 (
  echo [失败] 当前 Windows 未找到 PowerShell，无法读取文本剪贴板。
  pause
  exit /b 1
)

set "RESTORE_SCRIPT=%~f0"
set "RESTORE_DIR=%~dp0"

echo 文件将保存到：%RESTORE_DIR%
echo 正在读取文本剪贴板并校验还原文件...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $raw=[IO.File]::ReadAllText($env:RESTORE_SCRIPT,[Text.Encoding]::UTF8); $marker=('# ONE_TRANSFER_'+'POWERSHELL'); $offset=$raw.IndexOf($marker,[StringComparison]::Ordinal); if($offset -lt 0){throw '还原脚本缺少 PowerShell 主体。'}; Invoke-Expression $raw.Substring($offset+$marker.Length)"
if errorlevel 1 (
  echo.
  echo [失败] 未能还原文件。
  echo 请回到发送端重新复制；如果高密度 Unicode 被通道修改，请切换 ASCII 兼容模式。
  pause
  exit /b 1
)

echo.
echo [完成] 文件已还原到脚本所在目录。
pause
exit /b 0

# ONE_TRANSFER_POWERSHELL
$ErrorActionPreference = 'Stop'

$codecSource = @'
using System;
using System.Collections.Generic;
using System.IO;

public static class OneTransferTextCodec
{
    private const int BitsPerCharacter = 15;
    private static readonly Dictionary<char, int> Base32768Decode = new Dictionary<char, int>(32896);
    private const string Base91Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~\"";
    private static readonly Dictionary<char, int> Base91Decode = new Dictionary<char, int>(91);

    static OneTransferTextCodec()
    {
        string[] pairStrings = {
            "ҠҿԀԟڀڿݠޟ߀ߟကဟႠႿᄀᅟᆀᆟᇠሿበቿዠዿጠጿᎠᏟᐠᙟᚠᛟកសᠠᡟᣀᣟᦀᦟ᧠᧿ᨠᨿᯀᯟᰀᰟᴀᴟ⇠⇿⋀⋟⍀⏟␀␟─❟➀➿⠀⥿⦠⦿⨠⩟⪀⪿⫠⭟ⰀⰟⲀⳟⴀⴟⵀⵟ⺠⻟㇀㇟㐀䶟䷀龿ꀀꑿ꒠꒿ꔀꗿꙀꙟꚠꛟ꜀ꝟꞀꞟꡀꡟ",
            "ƀƟɀʟ"
        };
        for (int repertoire = 0; repertoire < pairStrings.Length; repertoire++)
        {
            int bitCount = BitsPerCharacter - 8 * repertoire;
            int value = 0;
            string ranges = pairStrings[repertoire];
            for (int index = 0; index < ranges.Length; index += 2)
            {
                int first = ranges[index];
                int last = ranges[index + 1];
                for (int codePoint = first; codePoint <= last; codePoint++)
                {
                    Base32768Decode.Add((char)codePoint, (bitCount << 16) | value);
                    value++;
                }
            }
        }
        for (int index = 0; index < Base91Alphabet.Length; index++)
            Base91Decode.Add(Base91Alphabet[index], index);
    }

    public static byte[] DecodeBase32768(string text)
    {
        byte[] output = new byte[(text.Length * BitsPerCharacter) / 8];
        int outputLength = 0;
        int currentByte = 0;
        int currentBits = 0;
        for (int index = 0; index < text.Length; index++)
        {
            int entry;
            if (!Base32768Decode.TryGetValue(text[index], out entry))
                throw new InvalidDataException("Base32768 包含无法识别的字符，剪贴板可能已被修改。");
            int bitCount = entry >> 16;
            int value = entry & 0xffff;
            if (bitCount != BitsPerCharacter && index != text.Length - 1)
                throw new InvalidDataException("Base32768 结束字符出现在负载中间。");
            for (int bit = bitCount - 1; bit >= 0; bit--)
            {
                currentByte = (currentByte << 1) | ((value >> bit) & 1);
                currentBits++;
                if (currentBits == 8)
                {
                    output[outputLength++] = (byte)currentByte;
                    currentByte = 0;
                    currentBits = 0;
                }
            }
        }
        if (currentByte != ((1 << currentBits) - 1))
            throw new InvalidDataException("Base32768 填充校验失败。");
        if (outputLength == output.Length) return output;
        byte[] result = new byte[outputLength];
        Buffer.BlockCopy(output, 0, result, 0, outputLength);
        return result;
    }

    public static byte[] DecodeBase91(string text)
    {
        byte[] output = new byte[text.Length];
        int outputLength = 0;
        int queue = 0;
        int queuedBits = 0;
        int value = -1;
        for (int index = 0; index < text.Length; index++)
        {
            int decoded;
            if (!Base91Decode.TryGetValue(text[index], out decoded))
                throw new InvalidDataException("Base91 包含无法识别的字符，剪贴板可能已被修改。");
            if (value < 0)
            {
                value = decoded;
                continue;
            }
            value += decoded * 91;
            queue |= value << queuedBits;
            queuedBits += (value & 8191) > 88 ? 13 : 14;
            while (queuedBits >= 8)
            {
                output[outputLength++] = (byte)(queue & 255);
                queue >>= 8;
                queuedBits -= 8;
            }
            value = -1;
        }
        if (value >= 0) output[outputLength++] = (byte)((queue | value << queuedBits) & 255);
        byte[] result = new byte[outputLength];
        Buffer.BlockCopy(output, 0, result, 0, outputLength);
        return result;
    }
}
'@

Add-Type -TypeDefinition $codecSource -Language CSharp

function Get-Sha256Hex([byte[]] $Bytes) {
    $hasher = [Security.Cryptography.SHA256]::Create()
    try {
        return [BitConverter]::ToString($hasher.ComputeHash($Bytes)).Replace('-', '').ToLowerInvariant()
    } finally {
        $hasher.Dispose()
    }
}

function Expand-GzipBounded([byte[]] $CompressedBytes, [int64] $ExpectedSize) {
    $inputStream = New-Object IO.MemoryStream(,$CompressedBytes)
    $gzip = New-Object IO.Compression.GZipStream($inputStream, [IO.Compression.CompressionMode]::Decompress)
    $output = New-Object IO.MemoryStream
    try {
        $buffer = New-Object byte[] 65536
        $total = 0L
        while (($read = $gzip.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $total += $read
            if ($total -gt $ExpectedSize) { throw 'gzip 解压结果超过协议声明大小。' }
            $output.Write($buffer, 0, $read)
        }
        return $output.ToArray()
    } finally {
        $output.Dispose()
        $gzip.Dispose()
        $inputStream.Dispose()
    }
}

function Assert-WindowsFileName([string] $Name) {
    $stem = [IO.Path]::GetFileNameWithoutExtension($Name)
    if (
        [string]::IsNullOrWhiteSpace($Name) -or
        $Name -ne [IO.Path]::GetFileName($Name) -or
        $Name.IndexOfAny([IO.Path]::GetInvalidFileNameChars()) -ge 0 -or
        $Name.EndsWith('.') -or
        $Name.EndsWith(' ') -or
        $stem -match '^(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$'
    ) { throw '文件名无法在 Windows 中使用。' }
}

function Restore-Transfer([string] $Content) {
    $trimmed = $Content.Trim()
    if ($trimmed.StartsWith('ONE_TRANSFER_V2|', [StringComparison]::Ordinal)) {
        $parts = $trimmed -split '\|', 8
        if ($parts.Count -ne 8) { throw 'V2 文本字段不完整，剪贴板可能已被截断。' }
        $itemType = $parts[1]
        $codec = $parts[2]
        $compression = $parts[3]
        $originalSize = 0L
        if (-not [Int64]::TryParse($parts[4], [ref]$originalSize) -or $originalSize -lt 0 -or $originalSize -gt 67108864) {
            throw '协议声明的原始文件大小无效。'
        }
        $expectedSha256 = $parts[5].ToLowerInvariant()
        if ($expectedSha256 -notmatch '^[0-9a-f]{64}$') { throw '协议 SHA-256 字段无效。' }
        $name = [Uri]::UnescapeDataString($parts[6])
        $payload = $parts[7] -replace '\s', ''
        if ($codec -eq 'b32768') {
            [byte[]] $transmitted = [OneTransferTextCodec]::DecodeBase32768($payload)
        } elseif ($codec -eq 'base91') {
            [byte[]] $transmitted = [OneTransferTextCodec]::DecodeBase91($payload)
        } else {
            throw ('不支持的 V2 文本编码：' + $codec)
        }
        if ($compression -eq 'gzip') {
            [byte[]] $bytes = Expand-GzipBounded $transmitted $originalSize
        } elseif ($compression -eq 'none') {
            [byte[]] $bytes = $transmitted
        } else {
            throw ('不支持的 V2 压缩方式：' + $compression)
        }
        if ($bytes.LongLength -ne $originalSize) { throw '文件长度校验失败，剪贴板内容可能不完整。' }
        $actualSha256 = Get-Sha256Hex $bytes
        if ($actualSha256 -ne $expectedSha256) { throw 'SHA-256 校验失败，文件不会写入磁盘。' }
        Write-Host ('协议：V2 / ' + $codec + ' / ' + $compression)
    } elseif ($trimmed.StartsWith('ONE_TRANSFER_V1|', [StringComparison]::Ordinal)) {
        $parts = $trimmed -split '\|', 4
        if ($parts.Count -ne 4) { throw 'V1 文本字段不完整，剪贴板可能已被截断。' }
        $itemType = $parts[1]
        $name = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parts[2]))
        [byte[]] $bytes = [Convert]::FromBase64String(($parts[3] -replace '\s', ''))
        $actualSha256 = Get-Sha256Hex $bytes
        Write-Host '协议：V1 / Base64（兼容模式）'
    } else {
        throw '剪贴板内容不是 One Transfer 文件数据。'
    }

    Assert-WindowsFileName $name
    $target = Join-Path $env:RESTORE_DIR $name
    if (Test-Path -LiteralPath $target) { throw ('目标已存在，请先移动或重命名：' + $target) }

    if ($itemType -eq 'file') {
        [IO.File]::WriteAllBytes($target, $bytes)
        Write-Host ('已还原文件：' + $target)
    } elseif ($itemType -eq 'directory') {
        $token = [Guid]::NewGuid().ToString('N')
        $archive = Join-Path $env:TEMP ('one-transfer-' + $token + '.zip')
        $staging = Join-Path $env:TEMP ('one-transfer-' + $token)
        try {
            [IO.File]::WriteAllBytes($archive, $bytes)
            Expand-Archive -LiteralPath $archive -DestinationPath $staging
            $source = Join-Path $staging $name
            if (-not (Test-Path -LiteralPath $source -PathType Container)) { throw '压缩包中未找到预期目录。' }
            Move-Item -LiteralPath $source -Destination $target
        } finally {
            Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
            Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
        }
        Write-Host ('已还原目录：' + $target)
    } else {
        throw ('不支持的内容类型：' + $itemType)
    }
    Write-Host ('原始数据 SHA-256：' + $actualSha256)
}

$content = Get-Clipboard -Raw
if ([string]::IsNullOrWhiteSpace($content)) { throw '剪贴板为空。' }
Restore-Transfer $content
