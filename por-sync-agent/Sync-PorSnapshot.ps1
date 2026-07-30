<#
.SYNOPSIS
  Read-only POR SQL snapshot -> Command Center POST /api/por/sync

.NOTES
  - SELECT only. Never INSERT/UPDATE/DELETE against POR.
  - Prefer a SQL login with db_datareader only.
  - Column mapping uses INFORMATION_SCHEMA with safe fallbacks for Party Perfect POR.
#>
[CmdletBinding()]
param(
  [string]$ConfigPath = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

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

function Invoke-Select {
  param(
    [System.Data.SqlClient.SqlConnection]$Connection,
    [string]$Query
  )
  # Hard rail: reject non-SELECT statements
  $trimmed = $Query.TrimStart()
  if ($trimmed -notmatch '^(SELECT|WITH)\b') {
    throw "Blocked non-SELECT query."
  }
  if ($trimmed -match '\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|TRUNCATE|EXEC|EXECUTE)\b') {
    throw "Blocked dangerous SQL keyword."
  }

  $cmd = $Connection.CreateCommand()
  $cmd.CommandText = $Query
  $cmd.CommandTimeout = 120
  $adapter = New-Object System.Data.SqlClient.SqlDataAdapter $cmd
  $table = New-Object System.Data.DataTable
  [void]$adapter.Fill($table)
  return $table
}

function Get-ColumnMap {
  param([System.Data.SqlClient.SqlConnection]$Connection, [string]$TableName)
  $q = @"
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = N'$TableName'
"@
  $rows = Invoke-Select -Connection $Connection -Query $q
  $set = @{}
  if ($null -eq $rows -or $rows.Rows.Count -eq 0) {
    return $set
  }
  foreach ($r in $rows.Rows) {
    $name = [string]$r["COLUMN_NAME"]
    if (-not [string]::IsNullOrWhiteSpace($name)) {
      $set[$name] = $true
    }
  }
  return $set
}

function Pick-Column([hashtable]$Cols, [string[]]$Candidates, [string]$Fallback = $null) {
  foreach ($c in $Candidates) {
    if ($Cols.ContainsKey($c)) { return $c }
  }
  return $Fallback
}

function Get-ScalarNumber($table, [string]$col = $null) {
  if ($null -eq $table -or $table.Rows.Count -eq 0) { return 0 }
  $row = $table.Rows[0]
  if ($col) { return [double]($row[$col]) }
  return [double]($row[0])
}

$config = Get-Config
Write-Log "Starting read-only POR sync -> $($config.CommandCenterUrl)"

$conn = $null
try {
  $conn = New-SqlConnection $config

  # --- Inventory categories ---
  $itemCols = Get-ColumnMap $conn "ItemFile"
  $catCols = Get-ColumnMap $conn "ItemCategory"

  $itemId = Pick-Column $itemCols @("ItemID","ItemId","ID","ItemNumber")
  $itemName = Pick-Column $itemCols @("Description","ItemDescription","Name","ItemName")
  $itemCatId = Pick-Column $itemCols @("CategoryID","CategoryId","ItemCategoryID","CatID")
  $qtyCol = Pick-Column $itemCols @("Quantity","Qty","QtyOnHand","OnHand","StockQuantity","TotalQuantity")
  $availCol = Pick-Column $itemCols @("Available","QtyAvailable","AvailableQuantity","QtyAvail","Availability")
  $rateCol = Pick-Column $itemCols @("DailyRate","Rate","Price","RentalRate","PricePerDay")

  $catId = Pick-Column $catCols @("CategoryID","CategoryId","ID")
  $catName = Pick-Column $catCols @("Description","Category","Name","CategoryName","CategoryDescription")

  $categories = @()
  $items = @()
  $totalItems = 0
  $totalQty = 0.0
  $availQty = 0.0

  if ($itemId -and $itemName) {
    $qtyExpr = if ($qtyCol) { "ISNULL(i.[$qtyCol],0)" } else { "0" }
    $availExpr = if ($availCol) { "ISNULL(i.[$availCol],0)" } else { $qtyExpr }
    $rateExpr = if ($rateCol) { "ISNULL(i.[$rateCol],0)" } else { "0" }

    if ($itemCatId -and $catId -and $catName) {
      $catSql = @"
SELECT TOP 165
  ISNULL(c.[$catName], N'Uncategorized') AS CategoryName,
  COUNT(*) AS ItemCount,
  SUM($qtyExpr) AS Quantity,
  SUM($availExpr) AS Available
FROM dbo.ItemFile i
LEFT JOIN dbo.ItemCategory c ON i.[$itemCatId] = c.[$catId]
GROUP BY ISNULL(c.[$catName], N'Uncategorized')
ORDER BY ItemCount DESC
"@
      $catTable = Invoke-Select $conn $catSql
      foreach ($row in $catTable.Rows) {
        $q = [double]$row.Quantity
        $a = [double]$row.Available
        $totalQty += $q
        $availQty += $a
        $totalItems += [int]$row.ItemCount
        $categories += @{
          name = [string]$row.CategoryName
          itemCount = [int]$row.ItemCount
          quantity = [math]::Round($q, 2)
          available = [math]::Round($a, 2)
        }
      }
    }

    $itemSql = @"
SELECT TOP 250
  CAST(i.[$itemId] AS nvarchar(64)) AS ItemKey,
  CAST(i.[$itemName] AS nvarchar(200)) AS ItemName,
  $(if ($itemCatId -and $catId -and $catName) { "ISNULL(c.[$catName], N'Uncategorized')" } else { "N'Uncategorized'" }) AS CategoryName,
  $qtyExpr AS Quantity,
  $availExpr AS Available,
  $rateExpr AS Rate
FROM dbo.ItemFile i
$(if ($itemCatId -and $catId -and $catName) { "LEFT JOIN dbo.ItemCategory c ON i.[$itemCatId] = c.[$catId]" } else { "" })
ORDER BY i.[$itemId]
"@
    $itemTable = Invoke-Select $conn $itemSql
    if ($totalItems -eq 0) { $totalItems = $itemTable.Rows.Count }
    foreach ($row in $itemTable.Rows) {
      $q = [double]$row.Quantity
      $a = [double]$row.Available
      if ($categories.Count -eq 0) {
        $totalQty += $q
        $availQty += $a
      }
      $status = if ($a -le 0) { "reserved" } elseif (($a / [math]::Max($q, 1)) -lt 0.25) { "maintenance" } else { "available" }
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
  } else {
    Write-Log "ItemFile columns not mapped; inventory section will be empty." "WARN"
  }

  # --- AR ---
  $arCols = Get-ColumnMap $conn "AccountsReceivable"
  $arBalance = Pick-Column $arCols @("Balance","OpenBalance","AmountDue","Amount","CurrentBalance","ARBalance")
  $arCurrent = Pick-Column $arCols @("Current","AgingCurrent","AgeCurrent","Bucket0")
  $ar30 = Pick-Column $arCols @("Days30","Aging30","Age30","Bucket30","Over30")
  $ar60 = Pick-Column $arCols @("Days60","Aging60","Age60","Bucket60","Over60")
  $ar90 = Pick-Column $arCols @("Days90","Aging90","Age90","Bucket90","Over90")
  $ar120 = Pick-Column $arCols @("Days120","Aging120","Age120","Bucket120","Over120","Days120Plus")

  $arOpen = 0.0
  $arCount = 0
  $aging = @{ current = 0.0; days30 = 0.0; days60 = 0.0; days90 = 0.0; days120Plus = 0.0 }

  if ($arBalance) {
    $arSql = @"
SELECT
  COUNT(*) AS CustomerCount,
  SUM(ISNULL([$arBalance],0)) AS OpenBalance
  $(if ($arCurrent) { ", SUM(ISNULL([$arCurrent],0)) AS AgingCurrent" } else { ", CAST(0 AS float) AS AgingCurrent" })
  $(if ($ar30) { ", SUM(ISNULL([$ar30],0)) AS Aging30" } else { ", CAST(0 AS float) AS Aging30" })
  $(if ($ar60) { ", SUM(ISNULL([$ar60],0)) AS Aging60" } else { ", CAST(0 AS float) AS Aging60" })
  $(if ($ar90) { ", SUM(ISNULL([$ar90],0)) AS Aging90" } else { ", CAST(0 AS float) AS Aging90" })
  $(if ($ar120) { ", SUM(ISNULL([$ar120],0)) AS Aging120" } else { ", CAST(0 AS float) AS Aging120" })
FROM dbo.AccountsReceivable
WHERE ISNULL([$arBalance],0) <> 0 OR 1=1
"@
    $arTable = Invoke-Select $conn $arSql
    $arCount = [int](Get-ScalarNumber $arTable "CustomerCount")
    $arOpen = Get-ScalarNumber $arTable "OpenBalance"
    $aging.current = Get-ScalarNumber $arTable "AgingCurrent"
    $aging.days30 = Get-ScalarNumber $arTable "Aging30"
    $aging.days60 = Get-ScalarNumber $arTable "Aging60"
    $aging.days90 = Get-ScalarNumber $arTable "Aging90"
    $aging.days120Plus = Get-ScalarNumber $arTable "Aging120"
  } else {
    Write-Log "AccountsReceivable balance column not found." "WARN"
  }

  # --- Payments last 24h (summary only) ---
  $payCols = Get-ColumnMap $conn "PaymentDetail"
  $payAmt = Pick-Column $payCols @("Amount","PaymentAmount","PaidAmount","Total","PaymentTotal")
  $payDate = Pick-Column $payCols @("PaymentDate","Date","TransDate","TransactionDate","CreatedDate","PaidDate")
  $payCount = 0
  $payVolume = 0.0
  if ($payAmt -and $payDate) {
    $paySql = @"
SELECT COUNT(*) AS PaymentCount, SUM(ISNULL([$payAmt],0)) AS PaymentVolume
FROM dbo.PaymentDetail
WHERE [$payDate] >= DATEADD(hour, -24, GETDATE())
"@
    $payTable = Invoke-Select $conn $paySql
    $payCount = [int](Get-ScalarNumber $payTable "PaymentCount")
    $payVolume = Get-ScalarNumber $payTable "PaymentVolume"
  }

  # --- Ops: contracts / deliveries / returns (best-effort table discovery) ---
  $openContracts = 0
  $deliveriesToday = 0
  $returnsDueToday = 0

  $tableNames = Invoke-Select $conn "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' AND TABLE_SCHEMA='dbo'"
  $nameList = @()
  foreach ($r in $tableNames.Rows) { $nameList += [string]$r.TABLE_NAME }

  $contractTable = $nameList | Where-Object { $_ -match '^(Contract|Contracts|ContractHeader|RentalContract)$' } | Select-Object -First 1
  if ($contractTable) {
    $cCols = Get-ColumnMap $conn $contractTable
    $statusCol = Pick-Column $cCols @("Status","ContractStatus","OpenClosed","State")
    if ($statusCol) {
      $oc = Invoke-Select $conn "SELECT COUNT(*) AS Cnt FROM dbo.[$contractTable] WHERE CAST([$statusCol] AS nvarchar(40)) NOT LIKE N'%Close%' AND CAST([$statusCol] AS nvarchar(40)) NOT LIKE N'%Cancel%'"
      $openContracts = [int](Get-ScalarNumber $oc "Cnt")
    } else {
      $oc = Invoke-Select $conn "SELECT COUNT(*) AS Cnt FROM dbo.[$contractTable]"
      $openContracts = [int](Get-ScalarNumber $oc "Cnt")
    }

    $delivCol = Pick-Column $cCols @("DeliveryDate","DeliverDate","OutDate","ShipDate")
    $retCol = Pick-Column $cCols @("ReturnDate","DueDate","InDate","ExpectedReturnDate")
    if ($delivCol) {
      $dt = Invoke-Select $conn "SELECT COUNT(*) AS Cnt FROM dbo.[$contractTable] WHERE CAST([$delivCol] AS date) = CAST(GETDATE() AS date)"
      $deliveriesToday = [int](Get-ScalarNumber $dt "Cnt")
    }
    if ($retCol) {
      $rt = Invoke-Select $conn "SELECT COUNT(*) AS Cnt FROM dbo.[$contractTable] WHERE CAST([$retCol] AS date) = CAST(GETDATE() AS date)"
      $returnsDueToday = [int](Get-ScalarNumber $rt "Cnt")
    }
  }

  $outQty = [math]::Max(0, [math]::Round($totalQty - $availQty, 2))

  $snapshot = [ordered]@{
    version = 1
    syncedAt = (Get-Date).ToUniversalTime().ToString("o")
    sourceHost = [string]$config.SourceHost
    sourceDatabase = [string]$config.SqlDatabase
    inventory = [ordered]@{
      totalItems = [int]$totalItems
      totalQuantity = [math]::Round($totalQty, 2)
      availableQuantity = [math]::Round($availQty, 2)
      outQuantity = $outQty
      categories = $categories
      items = $items
    }
    money = [ordered]@{
      arOpenBalance = [math]::Round($arOpen, 2)
      arCustomerCount = [int]$arCount
      aging = [ordered]@{
        current = [math]::Round($aging.current, 2)
        days30 = [math]::Round($aging.days30, 2)
        days60 = [math]::Round($aging.days60, 2)
        days90 = [math]::Round($aging.days90, 2)
        days120Plus = [math]::Round($aging.days120Plus, 2)
      }
      paymentsLast24h = [ordered]@{
        count = [int]$payCount
        volume = [math]::Round($payVolume, 2)
      }
    }
    ops = [ordered]@{
      openContracts = [int]$openContracts
      deliveriesToday = [int]$deliveriesToday
      returnsDueToday = [int]$returnsDueToday
    }
  }

  $json = $snapshot | ConvertTo-Json -Depth 8 -Compress
  $uri = "$($config.CommandCenterUrl.TrimEnd('/'))/api/por/sync"
  $headers = @{
    Authorization = "Bearer $($config.PorSyncSecret)"
    "Content-Type" = "application/json"
  }

  $response = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $json -TimeoutSec 60
  Write-Log ("Push OK. AR={0} items={1} openContracts={2}" -f $arOpen, $totalItems, $openContracts)
  $response | ConvertTo-Json -Depth 4 | Write-Log
}
catch {
  Write-Log $_.Exception.Message "ERROR"
  throw
}
finally {
  if ($conn) { $conn.Close(); $conn.Dispose() }
}
