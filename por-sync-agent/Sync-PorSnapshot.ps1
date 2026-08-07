<#
.SYNOPSIS
  Read-only POR SQL snapshot -> Command Center POST /api/por/sync

.NOTES
  Tuned for Party Perfect ENTERPRISE (POR on SQLEXP).
  SELECT only. Never INSERT/UPDATE/DELETE against POR.
#>
[CmdletBinding()]
param(
  [string]$ConfigPath = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch {}

if (-not $PSScriptRoot) {
  $PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}
if (-not $ConfigPath) {
  $ConfigPath = Join-Path $PSScriptRoot "config.json"
}

function Write-Log {
  param([string]$Message, [string]$Level = "INFO")
  $logDir = Join-Path $PSScriptRoot "logs"
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $line = "{0:o} [{1}] {2}" -f (Get-Date).ToUniversalTime(), $Level, $Message
  $line | Tee-Object -FilePath (Join-Path $logDir ("sync-{0:yyyyMMdd}.log" -f (Get-Date))) -Append
}

function Get-Config {
  if (-not (Test-Path $ConfigPath)) {
    throw "Missing config.json. Copy config.example.json to config.json and fill secrets."
  }
  Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json
}

function New-SqlConnection([object]$Config) {
  if ($Config.UseWindowsAuth) {
    $cs = "Server=$($Config.SqlServer);Database=$($Config.SqlDatabase);Integrated Security=True;TrustServerCertificate=True;ApplicationIntent=ReadOnly;"
  } else {
    if (-not $Config.SqlUser -or -not $Config.SqlPassword) {
      throw "SqlUser/SqlPassword required when UseWindowsAuth is false."
    }
    $cs = "Server=$($Config.SqlServer);Database=$($Config.SqlDatabase);User ID=$($Config.SqlUser);Password=$($Config.SqlPassword);TrustServerCertificate=True;ApplicationIntent=ReadOnly;"
  }
  $conn = New-Object System.Data.SqlClient.SqlConnection $cs
  $conn.Open()
  return $conn
}

function Assert-SelectOnly([string]$Query) {
  $trimmed = $Query.TrimStart()
  if ($trimmed -notmatch '^(SELECT|WITH)\b') { throw "Blocked non-SELECT query." }
  if ($trimmed -match '\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|TRUNCATE|EXEC|EXECUTE)\b') {
    throw "Blocked dangerous SQL keyword."
  }
}

function Get-Scalar {
  param([System.Data.SqlClient.SqlConnection]$Connection, [string]$Query)
  Assert-SelectOnly $Query
  $cmd = $Connection.CreateCommand()
  $cmd.CommandText = $Query
  $cmd.CommandTimeout = 120
  $value = $cmd.ExecuteScalar()
  if ($null -eq $value -or $value -is [DBNull]) { return 0 }
  return [double]$value
}

function Read-Rows {
  param([System.Data.SqlClient.SqlConnection]$Connection, [string]$Query)
  Assert-SelectOnly $Query
  $cmd = $Connection.CreateCommand()
  $cmd.CommandText = $Query
  $cmd.CommandTimeout = 180
  $reader = $cmd.ExecuteReader()
  $rows = New-Object System.Collections.Generic.List[hashtable]
  try {
    while ($reader.Read()) {
      $map = @{}
      for ($i = 0; $i -lt $reader.FieldCount; $i++) {
        $name = $reader.GetName($i)
        if ($reader.IsDBNull($i)) {
          $map[$name] = $null
        } else {
          $map[$name] = $reader.GetValue($i)
        }
      }
      [void]$rows.Add($map)
    }
  } finally {
    $reader.Close()
  }
  return ,$rows.ToArray()
}

$config = Get-Config
Write-Log "Starting read-only POR sync -> $($config.CommandCenterUrl)"

$conn = $null
try {
  $conn = New-SqlConnection $config

  # Exclude POR "FEE - ..." and "DISCOUNT" categories from stock math - they are
  # service/fee lines (delivery, setup, waivers), NOT rentable inventory, and their
  # QTY/QYOT hold garbage counters that inflate out-on-rent and low-stock numbers.
  $notFee = "AND ISNULL(Category,'') NOT LIKE 'FEE%' AND ISNULL(Category,'') NOT LIKE 'DISCOUNT%'"

  $totalItems = [int](Get-Scalar $conn "SELECT COUNT(*) FROM dbo.ItemFile WHERE ISNULL(Inactive,0)=0 $notFee")
  $totalQty = Get-Scalar $conn @"
SELECT SUM(CASE WHEN ISNULL(QTY,0) > 100000 THEN 0 ELSE ISNULL(QTY,0) END)
FROM dbo.ItemFile WHERE ISNULL(Inactive,0)=0 $notFee
"@
  $outQty = Get-Scalar $conn @"
SELECT SUM(CASE WHEN ISNULL(QYOT,0) > 100000 THEN 0 ELSE ISNULL(QYOT,0) END)
FROM dbo.ItemFile WHERE ISNULL(Inactive,0)=0 $notFee
"@
  $availQty = [math]::Max(0, $totalQty - $outQty)

  $catRows = Read-Rows $conn @"
SELECT TOP 165
  ISNULL(NULLIF(LTRIM(RTRIM(Category)), ''), N'Uncategorized') AS CategoryName,
  COUNT(*) AS ItemCount,
  SUM(CASE WHEN ISNULL(QTY,0) > 100000 THEN 0 ELSE ISNULL(QTY,0) END) AS Quantity,
  SUM(CASE WHEN ISNULL(QYOT,0) > 100000 THEN 0 ELSE ISNULL(QYOT,0) END) AS QtyOut
FROM dbo.ItemFile
WHERE ISNULL(Inactive,0)=0 $notFee
GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(Category)), ''), N'Uncategorized')
ORDER BY ItemCount DESC
"@

  $categories = @()
  foreach ($row in $catRows) {
    $q = [double]$row.Quantity
    $o = [double]$row.QtyOut
    $a = [math]::Max(0, $q - $o)
    $categories += @{
      name = [string]$row.CategoryName
      itemCount = [int]$row.ItemCount
      quantity = [math]::Round($q, 2)
      available = [math]::Round($a, 2)
    }
  }

  $itemRows = Read-Rows $conn @"
SELECT TOP 300
  CAST([KEY] AS nvarchar(64)) AS ItemKey,
  CAST([Name] AS nvarchar(200)) AS ItemName,
  ISNULL(NULLIF(LTRIM(RTRIM(Category)), ''), N'Uncategorized') AS CategoryName,
  CASE WHEN ISNULL(QTY,0) > 100000 THEN 0 ELSE ISNULL(QTY,0) END AS Quantity,
  CASE WHEN ISNULL(QYOT,0) > 100000 THEN 0 ELSE ISNULL(QYOT,0) END AS QtyOut,
  ISNULL(RATE1, ISNULL(SELL, 0)) AS Rate
FROM dbo.ItemFile
WHERE ISNULL(Inactive,0)=0 $notFee
ORDER BY QtyOut DESC, [Name]
"@

  $items = @()
  foreach ($row in $itemRows) {
    $q = [double]$row.Quantity
    $o = [double]$row.QtyOut
    $a = [math]::Max(0, $q - $o)
    $status = if ($a -le 0 -and $o -gt 0) { "reserved" } elseif (($a / [math]::Max($q, 1)) -lt 0.25) { "maintenance" } else { "available" }
    $items += @{
      id = "por-item-$($row.ItemKey)"
      name = [string]$row.ItemName
      category = [string]$row.CategoryName
      quantity = [math]::Round($q, 2)
      available = [math]::Round($a, 2)
      pricePerDay = [math]::Round([double]$row.Rate, 2)
      status = $status
      notes = "Live from Point of Rental (read-only)"
    }
  }

  $arOpen = Get-Scalar $conn "SELECT SUM(ISNULL(CurrentBalance,0)) FROM dbo.CustomerFile"
  $arCount = [int](Get-Scalar $conn "SELECT COUNT(*) FROM dbo.CustomerFile WHERE ISNULL(CurrentBalance,0) <> 0")

  $agingRows = Read-Rows $conn @"
SELECT
  SUM(CASE WHEN AgeDate IS NULL OR AgeDate >= DATEADD(day, -30, GETDATE()) THEN ISNULL(CurrentBalance,0) ELSE 0 END) AS AgingCurrent,
  SUM(CASE WHEN AgeDate < DATEADD(day, -30, GETDATE()) AND AgeDate >= DATEADD(day, -60, GETDATE()) THEN ISNULL(CurrentBalance,0) ELSE 0 END) AS Aging30,
  SUM(CASE WHEN AgeDate < DATEADD(day, -60, GETDATE()) AND AgeDate >= DATEADD(day, -90, GETDATE()) THEN ISNULL(CurrentBalance,0) ELSE 0 END) AS Aging60,
  SUM(CASE WHEN AgeDate < DATEADD(day, -90, GETDATE()) AND AgeDate >= DATEADD(day, -120, GETDATE()) THEN ISNULL(CurrentBalance,0) ELSE 0 END) AS Aging90,
  SUM(CASE WHEN AgeDate < DATEADD(day, -120, GETDATE()) THEN ISNULL(CurrentBalance,0) ELSE 0 END) AS Aging120
FROM dbo.CustomerFile
WHERE ISNULL(CurrentBalance,0) <> 0
"@

  $aging = @{ current = 0.0; days30 = 0.0; days60 = 0.0; days90 = 0.0; days120Plus = 0.0 }
  if ($agingRows.Count -gt 0) {
    $ar = $agingRows[0]
    $aging.current = [math]::Round([double]$ar.AgingCurrent, 2)
    $aging.days30 = [math]::Round([double]$ar.Aging30, 2)
    $aging.days60 = [math]::Round([double]$ar.Aging60, 2)
    $aging.days90 = [math]::Round([double]$ar.Aging90, 2)
    $aging.days120Plus = [math]::Round([double]$ar.Aging120, 2)
  }

  $payCount = [int](Get-Scalar $conn "SELECT COUNT(*) FROM dbo.PaymentFile WHERE [Date] >= DATEADD(hour, -24, GETDATE())")
  $payVolume = Get-Scalar $conn "SELECT SUM(ISNULL(Amount,0)) FROM dbo.PaymentFile WHERE [Date] >= DATEADD(hour, -24, GETDATE())"

  # Revenue over time (real collected payments) so Mike can answer "how did we do this week/month/year".
  $revWeek = Get-Scalar $conn "SELECT SUM(ISNULL(Amount,0)) FROM dbo.PaymentFile WHERE [Date] >= DATEADD(day, -7, GETDATE())"
  $revMonthToDate = Get-Scalar $conn "SELECT SUM(ISNULL(Amount,0)) FROM dbo.PaymentFile WHERE [Date] >= DATEADD(day, 1-DAY(GETDATE()), CAST(CAST(GETDATE() AS date) AS datetime))"
  $rev30 = Get-Scalar $conn "SELECT SUM(ISNULL(Amount,0)) FROM dbo.PaymentFile WHERE [Date] >= DATEADD(day, -30, GETDATE())"
  $revYearToDate = Get-Scalar $conn "SELECT SUM(ISNULL(Amount,0)) FROM dbo.PaymentFile WHERE [Date] >= DATEFROMPARTS(YEAR(GETDATE()),1,1)"

  $openContracts = [int](Get-Scalar $conn "SELECT COUNT(*) FROM dbo.CustomerFile WHERE ISNULL(QtyOut,0) > 0")
  $deliveriesToday = [int](Get-Scalar $conn @"
SELECT COUNT(*) FROM dbo.CustomerFile
WHERE LastActive IS NOT NULL AND CAST(LastActive AS date) = CAST(GETDATE() AS date)
"@)

  # --- Sales pipeline + catalog for Mike ticket completion (best-effort; never fail sync) ---
  $openQuotes = 0
  $openReservations = 0
  $quotesWithin14 = 0
  try {
    $openQuotes = [int](Get-Scalar $conn @"
SELECT COUNT(*) FROM dbo.ContractFile
WHERE UPPER(LTRIM(RTRIM(CAST(Status AS nvarchar(10))))) IN (N'Q')
"@)
    $openReservations = [int](Get-Scalar $conn @"
SELECT COUNT(*) FROM dbo.ContractFile
WHERE UPPER(LTRIM(RTRIM(CAST(Status AS nvarchar(10))))) IN (N'R')
"@)
    $quotesWithin14 = [int](Get-Scalar $conn @"
SELECT COUNT(*) FROM dbo.ContractFile
WHERE UPPER(LTRIM(RTRIM(CAST(Status AS nvarchar(10))))) IN (N'Q')
  AND BegDate IS NOT NULL
  AND CAST(BegDate AS date) >= CAST(GETDATE() AS date)
  AND CAST(BegDate AS date) <= DATEADD(day, 14, CAST(GETDATE() AS date))
"@)
    Write-Log ("ContractFile quotes={0} reservations={1} quotes<=14d={2}" -f $openQuotes, $openReservations, $quotesWithin14)
  } catch {
    Write-Log ("ContractFile quote counts unavailable: {0}" -f $_.Exception.Message) "WARN"
  }

  $serviceItems = @()
  try {
    $serviceRows = Read-Rows $conn @"
SELECT TOP 40
  CAST([KEY] AS nvarchar(64)) AS ItemKey,
  CAST([Name] AS nvarchar(200)) AS ItemName,
  ISNULL(NULLIF(LTRIM(RTRIM(Category)), ''), N'Uncategorized') AS CategoryName,
  CASE WHEN ISNULL(QTY,0) > 100000 THEN 0 ELSE ISNULL(QTY,0) END AS Quantity,
  CASE WHEN ISNULL(QYOT,0) > 100000 THEN 0 ELSE ISNULL(QYOT,0) END AS QtyOut,
  ISNULL(RATE1, ISNULL(SELL, 0)) AS Rate
FROM dbo.ItemFile
WHERE ISNULL(Inactive,0)=0
  AND (
    [Name] LIKE N'%Delivery%'
    OR [Name] LIKE N'%Pick%Up%'
    OR [Name] LIKE N'%Pickup%'
    OR [Name] LIKE N'%Linen Bag%'
    OR [Name] LIKE N'%Room Flip%'
    OR [Name] LIKE N'%Flip%'
    OR [Name] LIKE N'%Labor%'
    OR [Name] LIKE N'%Convenience%'
    OR Category LIKE N'%Service%'
    OR Category LIKE N'%Fee%'
    OR Category LIKE N'%Labor%'
  )
ORDER BY [Name]
"@
    foreach ($row in $serviceRows) {
      $q = [double]$row.Quantity
      $o = [double]$row.QtyOut
      $a = [math]::Max(0, $q - $o)
      $serviceItems += @{
        id = "por-svc-$($row.ItemKey)"
        name = [string]$row.ItemName
        category = [string]$row.CategoryName
        quantity = [math]::Round($q, 2)
        available = [math]::Round($a, 2)
        pricePerDay = [math]::Round([double]$row.Rate, 2)
        kind = "service"
      }
    }
  } catch {
    Write-Log ("Service SKU pull failed: {0}" -f $_.Exception.Message) "WARN"
  }

  $catalogItems = @()
  try {
    $catalogRows = Read-Rows $conn @"
SELECT TOP 300
  CAST([KEY] AS nvarchar(64)) AS ItemKey,
  CAST([Name] AS nvarchar(200)) AS ItemName,
  ISNULL(NULLIF(LTRIM(RTRIM(Category)), ''), N'Uncategorized') AS CategoryName,
  CASE WHEN ISNULL(QTY,0) > 100000 THEN 0 ELSE ISNULL(QTY,0) END AS Quantity,
  CASE WHEN ISNULL(QYOT,0) > 100000 THEN 0 ELSE ISNULL(QYOT,0) END AS QtyOut,
  ISNULL(RATE1, ISNULL(SELL, 0)) AS Rate
FROM dbo.ItemFile
WHERE ISNULL(Inactive,0)=0
  AND LTRIM(RTRIM(ISNULL([Name], N''))) <> N''
ORDER BY CategoryName, [Name]
"@
    foreach ($row in $catalogRows) {
      $q = [double]$row.Quantity
      $o = [double]$row.QtyOut
      $a = [math]::Max(0, $q - $o)
      $catalogItems += @{
        id = "por-cat-$($row.ItemKey)"
        name = [string]$row.ItemName
        category = [string]$row.CategoryName
        quantity = [math]::Round($q, 2)
        available = [math]::Round($a, 2)
        pricePerDay = [math]::Round([double]$row.Rate, 2)
        kind = "product"
      }
    }
  } catch {
    Write-Log ("Catalog pull failed: {0}" -f $_.Exception.Message) "WARN"
  }

  # --- Full catalog (with NUM) + reservations for quoting / availability ---
  # Best-effort: never fail the main inventory snapshot if these tables differ.
  $fullCatalogItems = @()
  $reservationLines = @()
  $reservationsQueryOk = $false
  try {
    $fullRows = Read-Rows $conn @"
SELECT
  CAST([KEY] AS nvarchar(64)) AS Sku,
  CAST([Name] AS nvarchar(200)) AS ItemName,
  CAST(ISNULL(Category, N'') AS nvarchar(64)) AS CategoryCode,
  CAST(ISNULL(NUM, N'') AS nvarchar(64)) AS Num,
  CASE WHEN ISNULL(QTY,0) > 100000 THEN 0 ELSE ISNULL(QTY,0) END AS Quantity,
  CASE WHEN ISNULL(QYOT,0) > 100000 THEN 0 ELSE ISNULL(QYOT,0) END AS QtyOut,
  ISNULL(RATE1, ISNULL(SELL, 0)) AS Rate
FROM dbo.ItemFile
WHERE ISNULL(Inactive,0)=0
  AND LTRIM(RTRIM(ISNULL([Name], N''))) <> N''
ORDER BY [Name]
"@
    foreach ($row in $fullRows) {
      $q = [double]$row.Quantity
      $o = [double]$row.QtyOut
      $a = [math]::Max(0, $q - $o)
      $catCode = [string]$row.CategoryCode
      $fullCatalogItems += @{
        sku = [string]$row.Sku
        name = [string]$row.ItemName
        categoryCode = $catCode
        category = $catCode
        num = ([string]$row.Num).Trim()
        ratePerDay = [math]::Round([double]$row.Rate, 2)
        qty = [math]::Round($q, 2)
        available = [math]::Round($a, 2)
      }
    }
    Write-Log ("Full catalog rows={0} withNum={1}" -f $fullCatalogItems.Count, @($fullCatalogItems | Where-Object { $_.num }).Count)
  } catch {
    Write-Log ("Full catalog (NUM) pull failed: {0}" -f $_.Exception.Message) "WARN"
  }

  try {
    $resRows = Read-Rows $conn @"
SELECT
  CAST(ti.ITEM AS nvarchar(64)) AS ItemKey,
  CASE WHEN ISNULL(ti.QTY,0) > 100000 THEN 0 ELSE ISNULL(ti.QTY,0) END AS Qty,
  ti.CNTR AS ContractNumber,
  t.DeliveryDate,
  t.PickupDate,
  t.EventEndDate,
  CAST(ISNULL(t.STAT, N'') AS nvarchar(10)) AS Status
FROM dbo.TransactionItems ti
INNER JOIN dbo.Transactions t ON t.CNTR = ti.CNTR
WHERE ISNULL(ti.Archived,0)=0
  AND ISNULL(t.Archived,0)=0
  AND ISNULL(t.Cancelled,0)=0
  AND (t.PickupDate IS NULL OR CAST(t.PickupDate AS date) >= CAST(GETDATE() AS date))
  AND ISNULL(ti.QTY,0) BETWEEN 1 AND 100000
  AND UPPER(LEFT(LTRIM(RTRIM(CAST(ISNULL(t.STAT, N'') AS nvarchar(10)))), 1)) IN (N'R', N'O', N'Q')
"@
    $reservationsQueryOk = $true
    foreach ($row in $resRows) {
      $status = ([string]$row.Status).Trim().ToUpperInvariant()
      if (-not $status) { continue }
      $first = $status.Substring(0, 1)
      if ($first -notin @('R', 'O', 'Q')) { continue }
      $firm = ($first -eq 'R' -or $first -eq 'O')
      $delivery = $null
      $pickup = $null
      if ($null -ne $row.DeliveryDate -and $row.DeliveryDate -isnot [DBNull]) {
        $delivery = ([datetime]$row.DeliveryDate).ToString("yyyy-MM-dd")
      }
      if ($null -ne $row.PickupDate -and $row.PickupDate -isnot [DBNull]) {
        $pickup = ([datetime]$row.PickupDate).ToString("yyyy-MM-dd")
      }
      if (-not $delivery -and $null -ne $row.EventEndDate -and $row.EventEndDate -isnot [DBNull]) {
        $delivery = ([datetime]$row.EventEndDate).ToString("yyyy-MM-dd")
      }
      if (-not $delivery) { continue }
      if (-not $pickup) { $pickup = $delivery }
      $reservationLines += @{
        itemKey = ([string]$row.ItemKey).Trim()
        qty = [math]::Round([double]$row.Qty, 2)
        delivery = $delivery
        pickup = $pickup
        status = $status
        firm = [bool]$firm
      }
    }
    Write-Log ("Reservation lines={0} firm={1}" -f $reservationLines.Count, @($reservationLines | Where-Object { $_.firm }).Count)
  } catch {
    Write-Log ("Reservations pull failed: {0}" -f $_.Exception.Message) "WARN"
  }

  $snapshot = [ordered]@{
    version = 1
    syncedAt = (Get-Date).ToUniversalTime().ToString("o")
    sourceHost = [string]$config.SourceHost
    sourceDatabase = [string]$config.SqlDatabase
    inventory = [ordered]@{
      totalItems = $totalItems
      totalQuantity = [math]::Round($totalQty, 2)
      availableQuantity = [math]::Round($availQty, 2)
      outQuantity = [math]::Round($outQty, 2)
      categories = $categories
      items = $items
    }
    money = [ordered]@{
      arOpenBalance = [math]::Round($arOpen, 2)
      arCustomerCount = $arCount
      aging = [ordered]@{
        current = $aging.current
        days30 = $aging.days30
        days60 = $aging.days60
        days90 = $aging.days90
        days120Plus = $aging.days120Plus
      }
      paymentsLast24h = [ordered]@{
        count = $payCount
        volume = [math]::Round($payVolume, 2)
      }
      revenue = [ordered]@{
        last7Days = [math]::Round($revWeek, 2)
        monthToDate = [math]::Round($revMonthToDate, 2)
        last30Days = [math]::Round($rev30, 2)
        yearToDate = [math]::Round($revYearToDate, 2)
      }
    }
    ops = [ordered]@{
      openContracts = $openContracts
      deliveriesToday = $deliveriesToday
      returnsDueToday = 0
    }
    sales = [ordered]@{
      openQuotes = $openQuotes
      openReservations = $openReservations
      quotesEventWithin14Days = $quotesWithin14
      serviceItems = $serviceItems
      catalogItems = $catalogItems
    }
  }

  $json = $snapshot | ConvertTo-Json -Depth 8 -Compress
  $baseUrl = $config.CommandCenterUrl.TrimEnd('/')
  $headers = @{
    Authorization = "Bearer $($config.PorSyncSecret)"
    "Content-Type" = "application/json"
  }

  $response = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/por/sync" -Headers $headers -Body $json -TimeoutSec 90
  Write-Log ("Push OK. items={0} AR={1} out={2} pay24h={3} catalog={4} services={5} quotes={6}" -f $totalItems, $arOpen, $outQty, $payCount, $catalogItems.Count, $serviceItems.Count, $openQuotes)
  ($response | ConvertTo-Json -Depth 4 -Compress) | ForEach-Object { Write-Log $_ }

  if ($fullCatalogItems.Count -gt 0) {
    try {
      $catalogPayload = [ordered]@{
        source = "ENTERPRISE Sync-PorSnapshot ItemFile"
        syncedAt = (Get-Date).ToUniversalTime().ToString("o")
        activeItems = $fullCatalogItems.Count
        items = $fullCatalogItems
      }
      $catalogJson = $catalogPayload | ConvertTo-Json -Depth 6 -Compress
      $catResp = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/por/sync/catalog" -Headers $headers -Body $catalogJson -TimeoutSec 180
      Write-Log ("Full catalog push OK. items={0}" -f $fullCatalogItems.Count)
      ($catResp | ConvertTo-Json -Depth 4 -Compress) | ForEach-Object { Write-Log $_ }
    } catch {
      Write-Log ("Full catalog push failed: {0}" -f $_.Exception.Message) "WARN"
    }
  }

  if ($reservationsQueryOk) {
    try {
      # Push even when empty so Redis doesn't keep stale future holds forever.
      $resPayload = [ordered]@{
        source = "ENTERPRISE Sync-PorSnapshot Transactions+TransactionItems"
        syncedAt = (Get-Date).ToUniversalTime().ToString("o")
        reservations = @($reservationLines)
      }
      $resJson = $resPayload | ConvertTo-Json -Depth 6 -Compress
      $resResp = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/por/sync/reservations" -Headers $headers -Body $resJson -TimeoutSec 180
      Write-Log ("Reservations push OK. lines={0}" -f $reservationLines.Count)
      ($resResp | ConvertTo-Json -Depth 4 -Compress) | ForEach-Object { Write-Log $_ }
    } catch {
      Write-Log ("Reservations push failed: {0}" -f $_.Exception.Message) "WARN"
    }
  }
}
catch {
  Write-Log $_.Exception.Message "ERROR"
  throw
}
finally {
  if ($conn) { $conn.Close(); $conn.Dispose() }
}
