# Test script for optimized endpoints
$base = "http://localhost:3000"

Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "TESTING 6 OPTIMIZED ENDPOINTS" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan

# 1. /api/vin-suggest
Write-Host "`n[1/6] Testing /api/vin-suggest?q=AA" -ForegroundColor Yellow
$t1 = Get-Date -AsUTC
try {
  $r = Invoke-WebRequest -Uri "$base/api/vin-suggest?q=AA" -TimeoutSec 5 -ErrorAction Stop
  $t2 = Get-Date -AsUTC
  $ms = ($t2 - $t1).TotalMilliseconds
  $json = $r.Content | ConvertFrom-Json
  Write-Host "✅ Status: $($r.StatusCode) | Time: ${ms}ms | Items: $($json.items.Count)" -ForegroundColor Green
} catch {
  Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# 2. /api/name-suggest
Write-Host "`n[2/6] Testing /api/name-suggest?q=test" -ForegroundColor Yellow
$t1 = Get-Date -AsUTC
try {
  $r = Invoke-WebRequest -Uri "$base/api/name-suggest?q=test" -TimeoutSec 5 -ErrorAction Stop
  $t2 = Get-Date -AsUTC
  $ms = ($t2 - $t1).TotalMilliseconds
  $json = $r.Content | ConvertFrom-Json
  Write-Host "✅ Status: $($r.StatusCode) | Time: ${ms}ms | Items: $($json.items.Count)" -ForegroundColor Green
} catch {
  Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# 3. /api/tecnicos-list
Write-Host "`n[3/6] Testing /api/tecnicos-list" -ForegroundColor Yellow
$t1 = Get-Date -AsUTC
try {
  $r = Invoke-WebRequest -Uri "$base/api/tecnicos-list" -TimeoutSec 5 -ErrorAction Stop
  $t2 = Get-Date -AsUTC
  $ms = ($t2 - $t1).TotalMilliseconds
  $json = $r.Content | ConvertFrom-Json
  Write-Host "✅ Status: $($r.StatusCode) | Time: ${ms}ms | Items: $($json.items.Count)" -ForegroundColor Green
} catch {
  Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# 4. /api/sync (POST)
Write-Host "`n[4/6] Testing /api/sync (POST)" -ForegroundColor Yellow
$t1 = Get-Date -AsUTC
try {
  $body = @{ email = "test@test.com" } | ConvertTo-Json
  $r = Invoke-WebRequest -Uri "$base/api/sync" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 5 -ErrorAction Stop
  $t2 = Get-Date -AsUTC
  $ms = ($t2 - $t1).TotalMilliseconds
  $json = $r.Content | ConvertFrom-Json
  Write-Host "✅ Status: $($r.StatusCode) | Time: ${ms}ms | Items: $($json.items.Count) | Source: $($json._source)" -ForegroundColor Green
} catch {
  Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# 5. /api/mis-activas (POST)
Write-Host "`n[5/6] Testing /api/mis-activas (POST)" -ForegroundColor Yellow
$t1 = Get-Date -AsUTC
try {
  $body = @{ email = "test@test.com" } | ConvertTo-Json
  $r = Invoke-WebRequest -Uri "$base/api/mis-activas" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 5 -ErrorAction Stop
  $t2 = Get-Date -AsUTC
  $ms = ($t2 - $t1).TotalMilliseconds
  $json = $r.Content | ConvertFrom-Json
  Write-Host "✅ Status: $($r.StatusCode) | Time: ${ms}ms | Items: $($json.items.Count)" -ForegroundColor Green
} catch {
  Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# 6. /api/mis-finalizadas (POST)
Write-Host "`n[6/6] Testing /api/mis-finalizadas (POST)" -ForegroundColor Yellow
$t1 = Get-Date -AsUTC
try {
  $body = @{ email = "test@test.com" } | ConvertTo-Json
  $r = Invoke-WebRequest -Uri "$base/api/mis-finalizadas" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 5 -ErrorAction Stop
  $t2 = Get-Date -AsUTC
  $ms = ($t2 - $t1).TotalMilliseconds
  $json = $r.Content | ConvertFrom-Json
  Write-Host "✅ Status: $($r.StatusCode) | Time: ${ms}ms | Items: $($json.items.Count)" -ForegroundColor Green
} catch {
  Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "TEST COMPLETE" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
