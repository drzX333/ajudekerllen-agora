param(
    [int]$Port = 8080
)

$rootDir = $PSScriptRoot
if (-not $rootDir) {
    $rootDir = (Get-Location).Path
}

$flevoSecretKey = "sk_fdc7594e7eb1486ea3e282cc0a8249b55f1e0270b6844a8f506060f75d529968"
$flevoBaseUrl   = "https://app.flevopay.com.br"

$mimeTypes = @{
    ".html"  = "text/html; charset=utf-8"
    ".htm"   = "text/html; charset=utf-8"
    ".css"   = "text/css; charset=utf-8"
    ".js"    = "application/javascript; charset=utf-8"
    ".json"  = "application/json; charset=utf-8"
    ".svg"   = "image/svg+xml"
    ".png"   = "image/png"
    ".jpg"   = "image/jpeg"
    ".jpeg"  = "image/jpeg"
    ".webp"  = "image/webp"
    ".gif"   = "image/gif"
    ".ico"   = "image/x-icon"
    ".woff"  = "font/woff"
    ".woff2" = "font/woff2"
    ".ttf"   = "font/ttf"
}

$prefix = "http://localhost:$Port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Error "Erro ao iniciar o servidor em $prefix : $_"
    exit 1
}

Write-Output "Servidor rodando em: $prefix"
Write-Output "Pasta: $rootDir"

try {
    while ($listener.IsListening) {
        try {
            $context = $listener.GetContext()
            $request = $context.Request
            $response = $context.Response

            # CORS Headers
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, X-API-Key")

            if ($request.HttpMethod -eq "OPTIONS") {
                $response.StatusCode = 200
                $response.OutputStream.Close()
                continue
            }

            $rawUrl = $request.RawUrl
            $path = $rawUrl.Split('?')[0].Split('#')[0]
            $path = [System.Uri]::UnescapeDataString($path)

            # Endpoint PROXY: Criar transação Flevo Pay
            if ($path -eq "/api/flevopay/create" -and $request.HttpMethod -eq "POST") {
                $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                $reqBody = $reader.ReadToEnd()
                $reader.Close()

                $parsed = $null
                try {
                    $parsed = $reqBody | ConvertFrom-Json
                } catch {
                    $response.StatusCode = 400
                    $errBytes = [System.Text.Encoding]::UTF8.GetBytes('{"status":"error","message":"JSON invalido"}')
                    $response.ContentType = "application/json; charset=utf-8"
                    $response.ContentLength64 = $errBytes.Length
                    $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
                    $response.OutputStream.Close()
                    continue
                }

                $amount = if ($parsed.amount) { [int]$parsed.amount } else { 3000 }
                $ref = if ($parsed.reference) { $parsed.reference } else { "REF_" + [System.Guid]::NewGuid().ToString("N").Substring(0, 12) }
                $desc = if ($parsed.description) { $parsed.description } else { "Doação Amor Vivo - Kerllen" }
                
                $cust = $parsed.customer
                if (-not $cust) {
                    $cust = @{
                        name = "Doador Solidário"
                        email = "doador@amorvivo.online"
                        phone = "11999998888"
                        document = "12345678901"
                    }
                } else {
                    $name = if ($cust.name) { $cust.name } else { "Doador Solidário" }
                    $email = if ($cust.email) { $cust.email } else { "doador@amorvivo.online" }
                    $phone = if ($cust.phone) { $cust.phone } else { "11999998888" }
                    $doc = if ($cust.document) { ($cust.document -replace '\D', '') } else { "12345678901" }
                    if (-not $doc -or $doc.Length -lt 11) { $doc = "12345678901" }

                    $cust = @{
                        name = $name
                        email = $email
                        phone = $phone
                        document = $doc
                    }
                }

                $payload = @{
                    amount = $amount
                    description = $desc
                    reference = $ref
                    source = "api_externa"
                    customer = $cust
                }

                $headers = @{
                    "X-API-Key" = $flevoSecretKey
                    "Content-Type" = "application/json"
                }

                $jsonToSend = $payload | ConvertTo-Json -Depth 5

                try {
                    $apiRes = Invoke-RestMethod -Uri "$flevoBaseUrl/api/v1/transaction" -Method Post -Headers $headers -Body $jsonToSend -TimeoutSec 30
                    $resJson = $apiRes | ConvertTo-Json -Depth 5
                    $resBytes = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                    $response.StatusCode = 200
                    $response.ContentType = "application/json; charset=utf-8"
                    $response.ContentLength64 = $resBytes.Length
                    $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
                } catch {
                    $response.StatusCode = 500
                    $errMsg = $_.Exception.Message
                    if ($_.ErrorDetails) { $errMsg = $_.ErrorDetails.Message }
                    $errObj = @{ status = "error"; message = $errMsg }
                    $errBytes = [System.Text.Encoding]::UTF8.GetBytes(($errObj | ConvertTo-Json -Compress))
                    $response.ContentType = "application/json; charset=utf-8"
                    $response.ContentLength64 = $errBytes.Length
                    $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
                } finally {
                    $response.OutputStream.Close()
                }
                continue
            }

            # Endpoint PROXY: Consultar status de transação Flevo Pay
            if ($path -eq "/api/flevopay/status" -and $request.HttpMethod -eq "GET") {
                $txId = $request.QueryString["id"]
                if (-not $txId) {
                    $response.StatusCode = 400
                    $resBytes = [System.Text.Encoding]::UTF8.GetBytes('{"status":"error","message":"Parâmetro id ausente"}')
                    $response.ContentType = "application/json; charset=utf-8"
                    $response.ContentLength64 = $resBytes.Length
                    $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
                    $response.OutputStream.Close()
                    continue
                }

                $headers = @{
                    "X-API-Key" = $flevoSecretKey
                }

                try {
                    $apiRes = Invoke-RestMethod -Uri "$flevoBaseUrl/api/v1/query?action=get_transaction&id=$txId" -Method Get -Headers $headers -TimeoutSec 15
                    $resJson = $apiRes | ConvertTo-Json -Depth 5
                    $resBytes = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                    $response.StatusCode = 200
                    $response.ContentType = "application/json; charset=utf-8"
                    $response.ContentLength64 = $resBytes.Length
                    $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
                } catch {
                    $response.StatusCode = 500
                    $resBytes = [System.Text.Encoding]::UTF8.GetBytes('{"status":"error","message":"Erro ao consultar Flevo Pay"}')
                    $response.ContentType = "application/json; charset=utf-8"
                    $response.ContentLength64 = $resBytes.Length
                    $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
                } finally {
                    $response.OutputStream.Close()
                }
                continue
            }

            # Static files serving
            if ($path -eq "/" -or [string]::IsNullOrWhiteSpace($path)) {
                $path = "/index.html"
            }

            $relPath = $path.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
            $fullPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($rootDir, $relPath))

            if (Test-Path -Path $fullPath -PathType Container) {
                $fullPath = [System.IO.Path]::Combine($fullPath, "index.html")
            }

            if (-not $fullPath.StartsWith($rootDir, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -Path $fullPath -PathType Leaf)) {
                $response.StatusCode = 404
                $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
                $response.ContentType = "text/plain; charset=utf-8"
                $response.ContentLength64 = $msg.Length
                $response.OutputStream.Write($msg, 0, $msg.Length)
                $response.OutputStream.Close()
                continue
            }

            $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()
            $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
            $response.ContentType = $contentType

            try {
                $bytes = [System.IO.File]::ReadAllBytes($fullPath)
                $response.ContentLength64 = $bytes.Length
                $response.StatusCode = 200
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } catch {
                $response.StatusCode = 500
            } finally {
                $response.OutputStream.Close()
            }
        } catch {
            Write-Warning "Erro ao atender requisicao: $_"
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
