$body = @{
    deviceId = "2C3341-G663%2DXPON-GGCL25574599"
    serial = "GGCL25574599" 
    tag = "081321960111"
    lat = -6.1754
    lng = 106.8250
    address = "Monas Jakarta Pusat"
} | ConvertTo-Json

$headers = @{
    "Content-Type" = "application/json"
}

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3001/admin/genieacs/save-location" -Method POST -Body $body -Headers $headers
    Write-Host "✅ Location added successfully:"
    Write-Host $response | ConvertTo-Json
} catch {
    Write-Host "❌ Error adding location:"
    Write-Host $_.Exception.Message
}

# Add location for second customer too
$body2 = @{
    deviceId = "68D482-F650-ZICG094F9AFE"
    serial = "68D482-F650-ZICG094F9AFE"
    tag = "083159616518" 
    lat = -6.1951
    lng = 106.8229
    address = "Bundaran HI Jakarta Pusat"
} | ConvertTo-Json

try {
    $response2 = Invoke-RestMethod -Uri "http://localhost:3001/admin/genieacs/save-location" -Method POST -Body $body2 -Headers $headers
    Write-Host "✅ Location added for second customer:"
    Write-Host $response2 | ConvertTo-Json
} catch {
    Write-Host "❌ Error adding location for second customer:"
    Write-Host $_.Exception.Message
}