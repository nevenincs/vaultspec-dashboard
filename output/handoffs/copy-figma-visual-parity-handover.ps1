$handoverPath = Join-Path $PSScriptRoot "figma-visual-parity-skill-handover.md"
Get-Content -LiteralPath $handoverPath -Raw | Set-Clipboard
Write-Host "Copied $handoverPath to clipboard."
