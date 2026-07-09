param(
  [string]$ProjectName = "quest-tracker",
  [string]$CustomDomain = "quest-tracker.ishanmadusanka.dev",
  [string]$ZoneName = "ishanmadusanka.dev",
  [string]$AccountId = "d1e88c3b8ef4d2fd63a29286331cdd6a",
  [string]$ZoneId = "481403d38104ef2c2435436b0bc3dfc2"
)

$ErrorActionPreference = "Stop"

function Get-AuthToken {
  if ($env:CLOUDFLARE_API_TOKEN) {
    return $env:CLOUDFLARE_API_TOKEN
  }

  $configPath = Join-Path $env:APPDATA "xdg.config\.wrangler\config\default.toml"
  if (-not (Test-Path $configPath)) {
    throw "No CLOUDFLARE_API_TOKEN set and wrangler config not found."
  }

  $match = Select-String -Path $configPath -Pattern 'oauth_token = "(.*)"'
  if (-not $match) {
    throw "No auth token available. Set CLOUDFLARE_API_TOKEN or run wrangler login."
  }

  return $match.Matches.Groups[1].Value
}

function Invoke-CfApi {
  param(
    [string]$Method,
    [string]$Uri,
    [string]$Token,
    [string]$Body = $null
  )

  $headers = @{
    Authorization = "Bearer $Token"
    "Content-Type" = "application/json"
  }

  if ($Body) {
    return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -Body $Body
  }

  return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers
}

$token = Get-AuthToken
$pagesBase = "https://api.cloudflare.com/client/v4/accounts/$AccountId/pages/projects/$ProjectName"

try {
  Invoke-CfApi -Method GET -Uri "$pagesBase/domains/$CustomDomain" -Token $token | Out-Null
  Write-Host "Pages domain already attached: $CustomDomain"
} catch {
  $payload = @{ name = $CustomDomain } | ConvertTo-Json
  Invoke-CfApi -Method POST -Uri "$pagesBase/domains" -Token $token -Body $payload | Out-Null
  Write-Host "Attached Pages domain: $CustomDomain"
}

$project = Invoke-CfApi -Method GET -Uri $pagesBase -Token $token
$dnsTarget = $project.result.subdomain

$dnsBase = "https://api.cloudflare.com/client/v4/zones/$ZoneId/dns_records"
$query = [uri]::EscapeDataString("name=$CustomDomain")

try {
  $existing = Invoke-CfApi -Method GET -Uri "$dnsBase?$query" -Token $token

  $dnsPayload = @{
    type = "CNAME"
    name = $CustomDomain
    content = $dnsTarget
    proxied = $true
    ttl = 1
  } | ConvertTo-Json

  if ($existing.result.Count -gt 0) {
    $recordId = $existing.result[0].id
    Invoke-CfApi -Method PUT -Uri "$dnsBase/$recordId" -Token $token -Body $dnsPayload | Out-Null
    Write-Host "Updated DNS: $CustomDomain -> $dnsTarget"
  } else {
    Invoke-CfApi -Method POST -Uri $dnsBase -Token $token -Body $dnsPayload | Out-Null
    Write-Host "Created DNS: $CustomDomain -> $dnsTarget"
  }

  Write-Host "Custom domain setup complete. SSL may take a few minutes to activate."
} catch {
  Write-Warning "Could not create DNS automatically. Wrangler OAuth does not include DNS write permissions."
  Write-Host ""
  Write-Host "Add this DNS record in Cloudflare Dashboard for $ZoneName:"
  Write-Host "  Type: CNAME"
  Write-Host "  Name: quest-tracker"
  Write-Host "  Target: $dnsTarget"
  Write-Host "  Proxy: Proxied (orange cloud)"
  Write-Host ""
  Write-Host "Dashboard: https://dash.cloudflare.com/$ZoneId/$ZoneName/dns/records"
  exit 1
}
