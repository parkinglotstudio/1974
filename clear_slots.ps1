$avatars = Get-Content "c:\1974\data\avatars.json" -Raw | ConvertFrom-Json
$filtered = $avatars | Where-Object { $_.id -ne 114 -and $_.id -ne 115 }
$filtered | ConvertTo-Json -Depth 20 -Compress | Out-File "c:\1974\data\avatars.json" -Encoding utf8
Write-Host "Characters 114 and 115 removed successfully!"
