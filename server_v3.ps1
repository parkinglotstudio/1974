$port = 8088
$rootPath = "C:\1974"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Prefixes.Add("http://127.0.0.1:$port/")
$listener.Start()
Write-Host "--- Server v3 started at http://localhost:$port/ ---"

function Get-MimeType($ext) {
    switch ($ext) {
        ".html" { return "text/html; charset=utf-8" }
        ".css"  { return "text/css" }
        ".js"   { return "application/javascript" }
        ".json" { return "application/json; charset=utf-8" }
        ".png"  { return "image/png" }
        ".jpg"  { return "image/jpeg" }
        ".mp4"  { return "video/mp4" }
        ".csv"  { return "text/csv" }
        default { return "application/octet-stream" }
    }
}

function Send-Json($response, $obj, $status = 200) {
    $json = ConvertTo-Json $obj -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $response.StatusCode = $status
    $response.ContentType = "application/json; charset=utf-8"
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
}

while ($listener.IsListening) {
    $response = $null
    try {
        $context  = $listener.GetContext()
        $request  = $context.Request
        $response = $context.Response
        
        $path   = $request.Url.LocalPath
        $method = $request.HttpMethod
        Write-Host "[$method] $path"

        $response.Headers.Add("Access-Control-Allow-Origin", "*")
        $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")

        if ($method -eq "OPTIONS") {
            $response.StatusCode = 204
            $response.Close()
            continue
        }

        # API: list
        if ($path -eq "/api/list-pixelart" -and $method -eq "GET") {
            $dir = Join-Path $rootPath "assets\pixelart"
            if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
            $files = Get-ChildItem $dir -Filter "*.json" | Sort-Object LastWriteTime -Descending | Select-Object -ExpandProperty Name
            Send-Json $response $files

        # API: save
        } elseif ($path -eq "/api/save-pixelart" -and $method -eq "POST") {
            $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            $reader.Close()
            
            # Remove -Depth for compatibility with older PowerShell
            $data = ConvertFrom-Json $body
            
            if ($null -eq $data) { throw "Invalid JSON body" }

            $dir = Join-Path $rootPath "assets\pixelart"
            if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }

            $raw = $data.filename -replace '[\\/:*?"<>|]', '_'
            if (-not $raw.EndsWith('.json')) { $raw += '.json' }
            $filePath = Join-Path $dir $raw

            Write-Host "Saving to: $filePath"
            [System.IO.File]::WriteAllText($filePath, $data.content, [System.Text.Encoding]::UTF8)
            Send-Json $response @{ success = $true; filename = $raw }

        # API: rename
        } elseif ($path -eq "/api/rename-pixelart" -and $method -eq "POST") {
            $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            $reader.Close()
            $data = ConvertFrom-Json $body

            $oldPath = Join-Path $rootPath "assets\pixelart\$($data.oldName)"
            $newName = $data.newName -replace '[\\/:*?"<>|]', '_'
            if (-not $newName.EndsWith('.json')) { $newName += '.json' }
            $newPath = Join-Path $rootPath "assets\pixelart\$newName"

            if (Test-Path $oldPath) {
                Rename-Item -Path $oldPath -NewName $newName -Force
                Send-Json $response @{ success = $true; newName = $newName }
            } else {
                Send-Json $response @{ success = $false; error = "not found" } 404
            }

        # API: delete
        } elseif ($path -like "/api/delete-pixelart/*" -and $method -eq "DELETE") {
            $filename = [System.IO.Path]::GetFileName($path)
            $filePath = Join-Path $rootPath "assets\pixelart\$filename"
            if (Test-Path $filePath) {
                Remove-Item $filePath -Force
                Send-Json $response @{ success = $true }
            } else {
                Send-Json $response @{ success = $false; error = "not found" } 404
            }

        # Static File Serving
        } else {
            if ($path -eq "/") { $path = "/index.html" }
            $rel = $path.TrimStart('/').Replace('/', '\')
            $fullPath = Join-Path $rootPath $rel

            if (Test-Path $fullPath -PathType Leaf) {
                $bytes = [System.IO.File]::ReadAllBytes($fullPath)
                $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()
                $response.ContentType = Get-MimeType $ext
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 404
            }
        }
        if ($null -ne $response) { $response.Close() }
    } catch {
        Write-Host "Error processing request: $_" -ForegroundColor Red
        if ($null -ne $response) {
            try {
                # Try to send error back to client
                Send-Json $response @{ success = $false; error = $_.ToString() } 500
                $response.Close()
            } catch {
                try { $response.Close() } catch {}
            }
        }
    }
}
