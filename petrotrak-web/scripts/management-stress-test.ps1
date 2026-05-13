param(
  [int]$Iterations = 20,
  [int]$RequestDelayMs = 0,
  [int]$Max429Retries = 2,
  [int]$RetrySleepSeconds = 21
)

$ErrorActionPreference = 'Continue'

$base = 'http://localhost:3000/api/admin/management'
$headers = @{ 'Content-Type' = 'application/json' }
$iterations = $Iterations
$results = @()

function Invoke-ManagedRequest {
  param(
    [string]$Uri,
    [string]$Method = 'GET',
    [hashtable]$Headers,
    [string]$Body
  )

  $attempt = 0
  while ($true) {
    try {
      $requestArgs = @{
        Uri = $Uri
        Method = $Method
        UseBasicParsing = $true
      }

      if ($null -ne $Headers) {
        $requestArgs.Headers = $Headers
      }

      if (-not [string]::IsNullOrWhiteSpace($Body)) {
        $requestArgs.Body = $Body
      }

      $resp = Invoke-WebRequest @requestArgs
      if ($RequestDelayMs -gt 0) {
        Start-Sleep -Milliseconds $RequestDelayMs
      }
      return $resp
    }
    catch {
      $detail = Get-ErrorDetail -Exception $_.Exception
      $isRateLimit = $detail -like '*ERROR_CODE_TOO_MANY_REQUESTS*'
      if (-not $isRateLimit -or $attempt -ge $Max429Retries) {
        throw
      }

      $attempt++
      Start-Sleep -Seconds $RetrySleepSeconds
    }
  }
}

function Get-ErrorDetail {
  param([System.Exception]$Exception)

  $detail = $Exception.Message
  try {
    $response = $Exception.Response
    if ($null -ne $response) {
      $status = [int]$response.StatusCode
      $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
      $body = $reader.ReadToEnd()
      if ($body.Length -gt 300) {
        $body = $body.Substring(0, 300)
      }
      $detail = "HTTP $status :: $body"
    }
  }
  catch {
    # Keep original message if response parsing fails.
  }

  return $detail
}

for ($i = 1; $i -le $iterations; $i++) {
  $run = [ordered]@{
    iteration = $i
    ok = $false
    step = 'init'
    error = ''
    branchCode = ''
    attendantId = ''
    assignmentId = ''
    pumpProduct = ''
    assignmentShift = ''
  }

  try {
    $stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $branchName = "Stress $i $stamp"
    $branchCode = ($branchName.ToLower() -replace '[^a-z0-9]+', '-').Trim('-')
    $run.branchCode = $branchCode

    $run.step = 'create_branch'
    $createBranch = @{ type = 'create_branch'; name = $branchName; region = 'Stress Region' } | ConvertTo-Json -Depth 4
    Invoke-ManagedRequest -Uri $base -Method 'POST' -Headers $headers -Body $createBranch | Out-Null

    $run.step = 'state_after_branch'
    $state = ((Invoke-ManagedRequest -Uri ($base + "?branchCode=$branchCode") -Method 'GET').Content | ConvertFrom-Json).state
    $pump = ($state.pumps | Where-Object { $_.branchCode -eq $branchCode } | Select-Object -First 1)
    if (-not $pump) {
      throw "No pump found for branch $branchCode"
    }

    $run.step = 'create_attendant'
    $createAttendant = @{
      type = 'create_attendant'
      name = "Stress Att $i"
      branchCode = $branchCode
      shift = 'morning'
      pumpId = [int]$pump.id
      roles = @('attendant', 'night_attendant')
    } | ConvertTo-Json -Depth 5
    Invoke-ManagedRequest -Uri $base -Method 'POST' -Headers $headers -Body $createAttendant | Out-Null

    $run.step = 'state_after_attendant'
    $state2 = ((Invoke-ManagedRequest -Uri ($base + "?branchCode=$branchCode") -Method 'GET').Content | ConvertFrom-Json).state
    $att = ($state2.attendants | Where-Object { $_.branchCode -eq $branchCode } | Select-Object -First 1)
    $asg = ($state2.assignments | Where-Object { $_.branchCode -eq $branchCode } | Select-Object -First 1)
    if (-not $att) {
      throw "No attendant found for branch $branchCode"
    }
    if (-not $asg) {
      throw "No assignment found for branch $branchCode"
    }

    $run.attendantId = [string]$att.id
    $run.assignmentId = [string]$asg.id

    $run.step = 'update_pump'
    $targetProduct = if ($i % 2 -eq 0) { 'AGO' } else { 'LPG' }
    $updatePump = @{ type = 'update_pump'; branchCode = $branchCode; pumpId = [int]$pump.id; product = $targetProduct } | ConvertTo-Json -Depth 4
    Invoke-ManagedRequest -Uri $base -Method 'PATCH' -Headers $headers -Body $updatePump | Out-Null

    $run.step = 'update_assignment'
    $updateAssignment = @{ type = 'update_assignment'; branchCode = $branchCode; assignmentId = [string]$asg.id; field = 'shift'; value = 'night' } | ConvertTo-Json -Depth 4
    Invoke-ManagedRequest -Uri $base -Method 'PATCH' -Headers $headers -Body $updateAssignment | Out-Null

    $run.step = 'final_verify'
    $final = ((Invoke-ManagedRequest -Uri ($base + "?branchCode=$branchCode") -Method 'GET').Content | ConvertFrom-Json).state
    $finalPump = ($final.pumps | Where-Object { $_.id -eq $pump.id } | Select-Object -First 1)
    $finalAsg = ($final.assignments | Where-Object { $_.id -eq $asg.id } | Select-Object -First 1)
    $finalAtt = ($final.attendants | Where-Object { $_.id -eq $att.id } | Select-Object -First 1)

    if (-not $finalPump) {
      throw 'Final pump not found'
    }
    if (-not $finalAsg) {
      throw 'Final assignment not found'
    }
    if (-not $finalAtt) {
      throw 'Final attendant not found'
    }
    if ($finalPump.product -ne $targetProduct) {
      throw "Pump product mismatch: expected $targetProduct got $($finalPump.product)"
    }
    if ($finalAsg.shift -ne 'night') {
      throw "Assignment shift mismatch: expected night got $($finalAsg.shift)"
    }

    $run.ok = $true
    $run.step = 'done'
    $run.pumpProduct = $finalPump.product
    $run.assignmentShift = $finalAsg.shift
  }
  catch {
    $run.error = Get-ErrorDetail -Exception $_.Exception
  }

  $results += [pscustomobject]$run
}

$passed = ($results | Where-Object { $_.ok }).Count
$failed = $iterations - $passed
$sampleFailures = $results | Where-Object { -not $_.ok } | Select-Object -First 5 iteration, step, error, branchCode

$summary = [ordered]@{
  iterations = $iterations
  requestDelayMs = $RequestDelayMs
  max429Retries = $Max429Retries
  passed = $passed
  failed = $failed
  failureRate = if ($iterations -gt 0) { [Math]::Round(($failed * 100.0) / $iterations, 2) } else { 0 }
  sampleFailures = $sampleFailures
}

$summary | ConvertTo-Json -Depth 6
