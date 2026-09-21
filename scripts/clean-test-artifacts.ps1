# Delete only known, generated artifacts under this project's others directory.
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$artifactRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'others'))
$obsoleteScripts = @('document-panel-refinements.cjs','finalize-metadata.cjs','metadata-ui.cjs','panel-refinements.cjs','styles-update.cjs','styles-verification.cjs','update-metadata-tests.cjs','update-ui.mjs')
$targets = Get-ChildItem -LiteralPath $artifactRoot -Force | Where-Object { $_.Name -match '^(native-\d+|smoke-[a-f0-9]{32})$' -or $_.Name -eq 'npm-cache' -or $_.Name -in $obsoleteScripts }
foreach ($target in $targets) {
    $resolved = [IO.Path]::GetFullPath($target.FullName)
    if (-not $resolved.StartsWith($artifactRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetDirectoryName($resolved) -ne $artifactRoot) { throw "Unsafe cleanup target: $resolved" }
    if ($target.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Refusing linked cleanup target: $resolved" }
    # Never follow a directory junction in a generated tree.
    if ($target.PSIsContainer -and (Get-ChildItem -LiteralPath $resolved -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })) { throw "Linked entry inside: $resolved" }
    Remove-Item -LiteralPath $resolved -Recurse -Force
    Write-Output "Removed $($target.Name)"
}
