$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    node scripts/create-icon.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Icon generation failed' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
    cargo build --release --locked
    if ($LASTEXITCODE -ne 0) { throw 'Native build failed' }
    $destination = Join-Path $projectRoot 'dist\File Manager'
    $distRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'dist'))
    $stage = Join-Path $distRoot ('.package-' + [Guid]::NewGuid().ToString('N'))
    $previous = Join-Path $distRoot ('.previous-' + [Guid]::NewGuid().ToString('N'))
    # Check every recursive cleanup/move target before publishing.
    foreach ($targetPath in @($stage, $previous, $destination)) {
        if (-not [IO.Path]::GetFullPath($targetPath).StartsWith($distRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe package path' }
    }
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    try {
        Copy-Item -LiteralPath (Join-Path $projectRoot 'target\release\file-manager.exe') -Destination (Join-Path $stage 'File Manager.exe')
        Copy-Item -LiteralPath (Join-Path $projectRoot 'README.md') -Destination (Join-Path $stage 'README.md')
        Copy-Item -LiteralPath (Join-Path $projectRoot 'node_modules\pdfjs-dist\LICENSE') -Destination (Join-Path $stage 'PDF.js-LICENSE.txt')
        $hash = Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $stage 'File Manager.exe')
        "$($hash.Hash)  File Manager.exe" | Set-Content -LiteralPath (Join-Path $stage 'SHA256SUMS.txt') -Encoding ascii
        $oldExe = Join-Path $destination 'File Manager.exe'
        if (Test-Path -LiteralPath $oldExe) {
            try {
                $probe = [IO.File]::Open($oldExe, 'Open', 'ReadWrite', 'None')
                $probe.Dispose()
            } catch { throw 'The existing executable is in use. Close File Manager and run this build script again. The existing package was preserved.' }
        }
        if (Test-Path -LiteralPath $destination) { Move-Item -LiteralPath $destination -Destination $previous }
        try { Move-Item -LiteralPath $stage -Destination $destination }
        catch {
            if (Test-Path -LiteralPath $previous) { Move-Item -LiteralPath $previous -Destination $destination }
            throw
        }
        if (Test-Path -LiteralPath $previous) { Remove-Item -LiteralPath $previous -Recurse -Force }
    } finally {
        if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
    }
    Get-ChildItem -LiteralPath $destination | Select-Object Name,Length
} finally { Pop-Location }
