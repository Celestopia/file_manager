param([string]$Executable = '')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $Executable) { $Executable = Join-Path $projectRoot 'dist\File Manager\File Manager.exe' }
$Executable = (Resolve-Path -LiteralPath $Executable).Path
$fixture = Join-Path $projectRoot ('others\smoke-' + [Guid]::NewGuid().ToString('N'))
node (Join-Path $projectRoot 'scripts\create-test-vault.mjs') $fixture
if ($LASTEXITCODE -ne 0) { throw 'Fixture creation failed' }
$source = Join-Path $fixture 'Welcome.pdf'
$beforeHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
$beforeModified = (Get-Item -LiteralPath $source).LastWriteTimeUtc
foreach ($round in 1..2) {
    $resultPath = Join-Path $fixture '.file_manager\smoke-result.json'
    if (Test-Path -LiteralPath $resultPath) { Remove-Item -LiteralPath $resultPath }
    $process = Start-Process -FilePath $Executable -ArgumentList @('--vault', ('"{0}"' -f $fixture), '--smoke') -WindowStyle Hidden -PassThru
    try {
        if (-not $process.WaitForExit(45000)) { throw "Native smoke round $round timed out: $fixture" }
        if (-not (Test-Path -LiteralPath $resultPath)) { throw "No PDF render result from round $round. Exit code: $($process.ExitCode). Fixture: $fixture" }
        $result = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json
        if (-not $result.success) { throw $result.detail }
        Write-Output "Round ${round}: $($result.detail)"
    } finally {
        if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
        $process.Dispose()
    }
}
if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $beforeHash) { throw 'Source bytes changed' }
if ((Get-Item -LiteralPath $source).LastWriteTimeUtc -ne $beforeModified) { throw 'Source modification time changed' }
Write-Output "PASS: native create/reopen/PDF rendering; source bytes and modification time preserved. Fixture: $fixture"
