$port = 8005
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Server started at http://localhost:$port/"
try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $path = $request.Url.LocalPath
        if ($path -eq "/") { $path = "/index.html" }
        
        $relativePath = $path.TrimStart('/')
        $fullPath = Join-Path (Get-Location).Path $relativePath.Replace('/', '\')
        
        if (Test-Path $fullPath -PathType Leaf) {
            $content = [System.IO.File]::ReadAllBytes($fullPath)
            $response.ContentLength64 = $content.Length
            
            $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()
            if ($ext -eq ".html") { $response.ContentType = "text/html" }
            elseif ($ext -eq ".css") { $response.ContentType = "text/css" }
            elseif ($ext -eq ".js") { $response.ContentType = "application/javascript" }
            elseif ($ext -eq ".csv") { $response.ContentType = "text/csv" }
            elseif ($ext -eq ".png") { $response.ContentType = "image/png" }
            elseif ($ext -eq ".jpg") { $response.ContentType = "image/jpeg" }
            
            $response.OutputStream.Write($content, 0, $content.Length)
        } else {
            $response.StatusCode = 404
        }
        $response.Close()
    }
} catch {
    Write-Error $_
} finally {
    $listener.Stop()
}

