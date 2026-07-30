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

# Server 2016 often defaults to older TLS; Command Center requires TLS 1.2+
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

function Invoke-SelectTable {
  param(
    [System.Data.SqlClient.SqlConnection]$Connection,
    [string]$Query
  )
  $trimmed = $Query.TrimStart()
  if ($trimmed -notmatch '^(SELECT|WITH)\b') { throw "Blocked non-SELECT query." }
  if ($trimmed -match '\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|TRUNCATE|EXEC|EXECUTE)\b') {
    throw "Blocked dangerous SQL keyword."
  }

  $cmd = $Connection.CreateCommand()
  $cmd.CommandText = $Query
  $cmd.CommandTimeout = 180
  $reader = $cmd.ExecuteReader()
  $table = New-Object System.Data.DataTable
  $table.Load($reader)
  $reader.Close()
  return $table
}

function Get-Scalar {
  param(
    [System.Data.SqlClient.SqlConnection]$Connection,
    [string]$Query
  )
  $trimmed = $Query.TrimStart()
  if ($trimmed -notmatch '^(SELECT|WITH)\b') { throw "Blocked non-SELECT query." }
  if ($trimmed -match '\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|TRUNCATE|EXEC|EXECUTE)\b') {
    throw "Blocked dangerous SQL keyword."
  }
  $cmd = $Connection.CreateCommand()
  $cmd.CommandText = $Query
  $cmd.CommandTimeout = 120
  $value = $cmd.ExecuteScalar()
  if ($null -eq $value -or $value -is [DBNull]) { return 0 }
  return [double]$value
}

$config = Get-Config
Write-Log "Starting read-only POR sync -> $($config.CommandCenterUrl)"

$conn = $null
try {
  $conn = New-SqlConnection $config

  # Inventory: ItemFile uses KEY/Name/Category/QTY/QYOT/RATE1 (Party Perfect POR)
  # Sanity-cap QTY so one bad bulk row cannot dominate totals.
  $totalItems = [int](Get-Scalar $conn "SELECT COUNT(*) FROM dbo.ItemFile WHERE ISNULL(Inactive,0)=0")
  $totalQty = Get-Scalar $conn @"
SELECT SUM(CASE WHEN ISNULL(QTY,0) > 100000 THEN 0 ELSE ISNULL(QTY,0) END)
FROM dbo.ItemFile WHERE ISNULL(Inactive,0)=0
"@
  $outQty = Get-Scalar $conn @"
SELECT SUM(CASE WHEN ISNULL(QYOT,0) > 100000 THEN 0 ELSE ISNULL(QYOT,0) END)
FROM dbo.ItemFile WHERE ISNULL(Inactive,0)=0
"@
  $availQty = [math]::Max(0, $totalQty - $outQty)

  $catTable = Invoke-SelectTable $conn @"
SELECT TOP 165
  ISNULL(NULLIF(LTRIM(RTRIM(Category)), ''), N'Uncategorized') AS CategoryName,
  COUNT(*) AS ItemCount,
  SUM(CASE WHEN ISNULL(QTY,0) > 100000 THEN 0 ELSE ISNULL(QTY,0) END) AS Quantity,
  SUM(CASE WHEN ISNULL(QYOT,0) > 100000 THEN 0 ELSE ISNULL(QYOT,0) END) AS QtyOut
FROM dbo.ItemFile
WHERE ISNULL(Inactive,0)=0
GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(Category)), ''), N'Uncategorized')
ORDER BY ItemCount DESC
"@

  $categories = @()
  for ($i = 0; $i -lt $catTable.Rows.Count; $i++) {
    $row = $catTable.Rows[$i]
    $q = [double]$row.Item("Quantity")
    $o = [double]$row.Item("QtyOut")
    $a = [math]::Max(0, $q - $o)
    $categories += @{
      name = [string]$row.Item("CategoryName")
      itemCount = [int]$row.Item("ItemCount")
      quantity = [math]::Round($q, 2)
      available = [math]::Round($a, 2)
    }
  }

  $itemTable = Invoke-SelectTable $conn @"
SELECT TOP 250
  CAST([KEY] AS nvarchar(64)) AS ItemKey,
  CAST([Name] AS nvarchar(200)) AS ItemName,
  ISNULL(NULLIF(LTRIM(RTRIM(Category)), ''), N'Uncategorized') AS CategoryName,
  CASE WHEN ISNULL(QTY,0) > 100000 THEN 0 ELSE ISNULL(QTY,0) END AS Quantity,
  CASE WHEN ISNULL(QYOT,0) > 100000 THEN 0 ELSE ISNULL(QYOT,0) END AS QtyOut,
  ISNULL(RATE1, ISNULL(SELL, 0)) AS Rate
FROM dbo.ItemFile
WHERE ISNULL(Inactive,0)=0
ORDER BY QtyOut DESC, [Name]
"@

  $items = @()
  for ($i = 0; $i -lt $itemTable.Rows.Count; $i++) {
    $row = $itemTable.Rows[$i]
    $q = [double]$row.Item("Quantity")
    $o = [double]$row.Item("QtyOut")
    $a = [math]::Max(0, $q - $o)
    $status = if ($a -le 0 -and $o -gt 0) { "reserved" } elseif (($a / [math]::Max($q, 1)) -lt 0.25) { "maintenance" } else { "available" }
    $items += @{
      id = "por-item-$($row.Item('ItemKey'))"
      name = [string]$row.Item("ItemName")
      category = [string]$row.Item("CategoryName")
      quantity = [math]::Round($q, 2)
      available = [math]::Round($a, 2)
      pricePerDay = [math]::Round([double]$row.Item("Rate"), 2)
      status = $status
      notes = "Live from Point of Rental (read-only)"
    }
  }

  # Money: open AR lives on CustomerFile.CurrentBalance (AccountsReceivable is a journal)
  $arOpen = Get-Scalar $conn "SELECT SUM(ISNULL(CurrentBalance,0)) FROM dbo.CustomerFile"
  $arCount = [int](Get-Scalar $conn "SELECT COUNT(*) FROM dbo.CustomerFile WHERE ISNULL(CurrentBalance,0) <> 0")

  $agingTable = Invoke-SelectTable $conn @"
SELECT
  SUM(CASE WHEN AgeDate IS NULL OR AgeDate >= DATEADD(day, -30, GETDATE()) THEN ISNULL(CurrentBalance,0) ELSE 0 END) AS AgingCurrent,
  SUM(CASE WHEN AgeDate < DATEADD(day, -30, GETDATE()) AND AgeDate >= DATEADD(day, -60, GETDATE()) THEN ISNULL(CurrentBalance,0) ELSE 0 END) AS Aging30,
  SUM(CASE WHEN AgeDate < DATEADD(day, -60, GETDATE()) AND AgeDate >= DATEADD(day, -90, GETDATE()) THEN ISNULL(CurrentBalance,0) ELSE 0 END) AS Aging60,
  SUM(CASE WHEN AgeDate < DATEADD(day, -90, GETDATE()) AND AgeDate >= DATEADD(day, -120, GETDATE()) THEN ISNULL(CurrentBalance,0) ELSE 0 END) AS Aging90,
  SUM(CASE WHEN AgeDate < DATEADD(day, -120, GETDATE()) THEN ISNULL(CurrentBalance,0) ELSE 0 END) AS Aging120
FROM dbo.CustomerFile
WHERE ISNULL(CurrentBalance,0) <> 0
"@
  $aging = @{
    current = 0.0
    days30 = 0.0
    days60 = 0.0
    days90 = 0.0
    days120Plus = 0.0
  }
  if ($agingTable.Rows.Count -gt 0) {
    $ar = $agingTable.Rows[0]
    $aging.current = [math]::Round([double]$ar.Item("AgingCurrent"), 2)
    $aging.days30 = [math]::Round([double]$ar.Item("Aging30"), 2)
    $aging.days60 = [math]::Round([double]$ar.Item("Aging60"), 2)
    $aging.days90 = [math]::Round([double]$ar.Item("Aging90"), 2)
    $aging.days120Plus = [math]::Round([double]$ar.Item("Aging120"), 2)
  }

  # Payments last 24h from PaymentFile (amount only — never card fields)
  $payCount = [int](Get-Scalar $conn @"
SELECT COUNT(*) FROM dbo.PaymentFile
WHERE [Date] >= DATEADD(hour, -24, GETDATE())
"@)
  $payVolume = Get-Scalar $conn @"
SELECT SUM(ISNULL(Amount,0)) FROM dbo.PaymentFile
WHERE [Date] >= DATEADD(hour, -24, GETDATE())
"@

  # Ops proxy until contract line schema is mapped further:
  # customers with qty currently out, plus customers last-active today.
  $openContracts = [int](Get-Scalar $conn "SELECT COUNT(*) FROM dbo.CustomerFile WHERE ISNULL(QtyOut,0) > 0")
  $deliveriesToday = [int](Get-Scalar $conn @"
SELECT COUNT(*) FROM dbo.CustomerFile
WHERE LastActive IS NOT NULL AND CAST(LastActive AS date) = CAST(GETDATE() AS date)
"@)
  $returnsDueToday = 0

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
    }
    ops = [ordered]@{
      openContracts = $openContracts
      deliveriesToday = $deliveriesToday
      returnsDueToday = $returnsDueToday
    }
  }

  $json = $snapshot | ConvertTo-Json -Depth 8 -Compress
  $uri = "$($config.CommandCenterUrl.TrimEnd('/'))/api/por/sync"
  $headers = @{
    Authorization = "Bearer $($config.PorSyncSecret)"
    "Content-Type" = "application/json"
  }

  $response = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $json -TimeoutSec 90
  Write-Log ("Push OK. items={0} AR={1} out={2} pay24h={3}" -f $totalItems, $arOpen, $outQty, $payCount)
  ($response | ConvertTo-Json -Depth 4 -Compress) | ForEach-Object { Write-Log $_ }
}
catch {
  Write-Log $_.Exception.Message "ERROR"
  throw
}
finally {
  if ($conn) { $conn.Close(); $conn.Dispose() }
}
