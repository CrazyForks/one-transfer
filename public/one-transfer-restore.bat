@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion
title One Transfer 通用文件还原

echo.
echo ========================================
echo One Transfer 通用文件还原
echo 当前协议：ONE_TRANSFER_V2 / Base91 / gzip / SHA-256
echo 向后兼容：ONE_TRANSFER_V1 / Base64
echo ========================================
echo.

where powershell >nul 2>nul
if errorlevel 1 (
  echo [失败] 当前 Windows 未找到 PowerShell，无法读取文本剪贴板。
  exit /b 1
)

set "RESTORE_SCRIPT=%~f0"
set "RESTORE_DIR=%~dp0"

echo 文件将保存到：%RESTORE_DIR%
echo 正在读取文本剪贴板并校验还原文件...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try{$raw=[IO.File]::ReadAllText($env:RESTORE_SCRIPT,[Text.Encoding]::UTF8); $marker=('# ONE_TRANSFER_'+'POWERSHELL'); $offset=$raw.IndexOf($marker,[StringComparison]::Ordinal); if($offset -lt 0){throw '还原脚本缺少 PowerShell 主体。'}; & ([ScriptBlock]::Create($raw.Substring($offset+$marker.Length)))}catch{$errorItem=$_.Exception; while($null -ne $errorItem){[Console]::Error.WriteLine('[PowerShell] '+$errorItem.Message); $errorItem=$errorItem.InnerException}; exit 1}"
if errorlevel 1 (
  echo.
  echo [失败] 未能还原文件。
  echo 请回到发送端重新选择文件或文件夹，并复制新的 ASCII 兼容数据。
  exit /b 1
)

echo.
echo [完成] 文件已还原到脚本所在目录。
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
    private const string Base91Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~\"";

    private static Dictionary<char, int> CreateBase32768Decode()
    {
        Dictionary<char, int> decode = new Dictionary<char, int>(32896);
        int[][] repertoireRanges = {
            new int[] {
                0x04A0, 0x04BF, 0x0500, 0x051F, 0x0680, 0x06BF, 0x0760, 0x079F, 0x07C0, 0x07DF, 0x1000, 0x101F,
                0x10A0, 0x10BF, 0x1100, 0x115F, 0x1180, 0x119F, 0x11E0, 0x123F, 0x1260, 0x127F, 0x12E0, 0x12FF,
                0x1320, 0x133F, 0x13A0, 0x13DF, 0x1420, 0x165F, 0x16A0, 0x16DF, 0x1780, 0x179F, 0x1820, 0x185F,
                0x18C0, 0x18DF, 0x1980, 0x199F, 0x19E0, 0x19FF, 0x1A20, 0x1A3F, 0x1BC0, 0x1BDF, 0x1C00, 0x1C1F,
                0x1D00, 0x1D1F, 0x21E0, 0x21FF, 0x22C0, 0x22DF, 0x2340, 0x23DF, 0x2400, 0x241F, 0x2500, 0x275F,
                0x2780, 0x27BF, 0x2800, 0x297F, 0x29A0, 0x29BF, 0x2A20, 0x2A5F, 0x2A80, 0x2ABF, 0x2AE0, 0x2B5F,
                0x2C00, 0x2C1F, 0x2C80, 0x2CDF, 0x2D00, 0x2D1F, 0x2D40, 0x2D5F, 0x2EA0, 0x2EDF, 0x31C0, 0x31DF,
                0x3400, 0x4D9F, 0x4DC0, 0x9FBF, 0xA000, 0xA47F, 0xA4A0, 0xA4BF, 0xA500, 0xA5FF, 0xA640, 0xA65F,
                0xA6A0, 0xA6DF, 0xA700, 0xA75F, 0xA780, 0xA79F, 0xA840, 0xA85F
            },
            new int[] { 0x0180, 0x019F, 0x0240, 0x029F }
        };
        for (int repertoire = 0; repertoire < repertoireRanges.Length; repertoire++)
        {
            int bitCount = BitsPerCharacter - 8 * repertoire;
            int value = 0;
            int[] ranges = repertoireRanges[repertoire];
            for (int index = 0; index < ranges.Length; index += 2)
            {
                int first = ranges[index];
                int last = ranges[index + 1];
                for (int codePoint = first; codePoint <= last; codePoint++)
                {
                    decode[(char)codePoint] = (bitCount << 16) | value;
                    value++;
                }
            }
        }
        return decode;
    }

    private static Dictionary<char, int> CreateBase91Decode()
    {
        Dictionary<char, int> decode = new Dictionary<char, int>(91);
        for (int index = 0; index < Base91Alphabet.Length; index++)
            decode[Base91Alphabet[index]] = index;
        return decode;
    }

    public static byte[] DecodeBase32768(string text)
    {
        Dictionary<char, int> decode = CreateBase32768Decode();
        byte[] output = new byte[(text.Length * BitsPerCharacter) / 8];
        int outputLength = 0;
        int currentByte = 0;
        int currentBits = 0;
        for (int index = 0; index < text.Length; index++)
        {
            int entry;
            if (!decode.TryGetValue(text[index], out entry))
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
                    if (outputLength >= output.Length)
                        throw new InvalidDataException("Base32768 解码长度异常，剪贴板或还原脚本可能已损坏。");
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
        Dictionary<char, int> decode = CreateBase91Decode();
        byte[] output = new byte[text.Length];
        int outputLength = 0;
        int queue = 0;
        int queuedBits = 0;
        int value = -1;
        for (int index = 0; index < text.Length; index++)
        {
            int decoded;
            if (!decode.TryGetValue(text[index], out decoded))
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
        if (-not [Int64]::TryParse($parts[4], [ref]$originalSize) -or $originalSize -lt 0) {
            throw '协议声明的原始文件大小无效。'
        }
        $expectedSha256 = $parts[5].ToLowerInvariant()
        if ($expectedSha256 -notmatch '^[0-9a-f]{64}$') { throw '协议 SHA-256 字段无效。' }
        $name = [Uri]::UnescapeDataString($parts[6])
        $payload = $parts[7] -replace '\s', ''
        if ($codec -ne 'base91') { throw ('不支持的 V2 文本编码：' + $codec) }
        [byte[]] $transmitted = [OneTransferTextCodec]::DecodeBase91($payload)
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
