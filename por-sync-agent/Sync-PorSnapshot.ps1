<#
.SYNOPSIS
  Read-only POR SQL snapshot + CRM -> Command Center

.NOTES
  Tuned for Party Perfect ENTERPRISE.
  Connect with host,port only — e.g. ENTERPRISE,9676.
  Never use localhost\SQLEXP or any named instance (SQL Browser is disabled).
  SELECT only. Never INSERT/UPDATE/DELETE against POR.
  Never SELECT CheckCardFile. Never pull PaymentFile.Encrypted/EncryptedCard/CCAlias.
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

# Status classification (STAT is two chars; blank primary = Completed; never LTRIM).
# See PorStatus.ps1 and "00 - Reference/POR_OPERATING_SYSTEM_MAP.md".
. (Join-Path $PSScriptRoot "PorStatus.ps1")

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
  $server = [string]$Config.SqlServer
  if ($server -match '\\') {
    throw "SqlServer must be host,port (e.g. ENTERPRISE,9676). Named instances like \SQLEXP are blocked — SQL Browser is disabled."
  }
  if ($server -notmatch ',') {
    Write-Log "SqlServer has no port — prefer ENTERPRISE,9676" "WARN"
  }
  if ($Config.UseWindowsAuth) {
    $cs = "Server=$server;Database=$($Config.SqlDatabase);Integrated Security=True;TrustServerCertificate=True;ApplicationIntent=ReadOnly;"
  } else {
    if (-not $Config.SqlUser -or -not $Config.SqlPassword) {
      throw "SqlUser/SqlPassword required when UseWindowsAuth is false."
    }
    $cs = "Server=$server;Database=$($Config.SqlDatabase);User ID=$($Config.SqlUser);Password=$($Config.SqlPassword);TrustServerCertificate=True;ApplicationIntent=ReadOnly;"
  }
  $conn = New-Object System.Data.SqlClient.SqlConnection $cs
  $conn.Open()
  return $conn
}

function Push-Json([string]$Uri, [hashtable]$Headers, [object]$Payload, [int]$TimeoutSec = 180) {
  $json = $Payload | ConvertTo-Json -Depth 8 -Compress
  return Invoke-RestMethod -Method Post -Uri $Uri -Headers $Headers -Body $json -TimeoutSec $TimeoutSec
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

function Test-RentableCatalogItem {
  param([string]$CategoryCode, [string]$Name)
  $cat = ([string]$CategoryCode).Trim().ToUpperInvariant()
  if ($cat -in @('19','34')) { return $false }
  if ($cat.StartsWith('FEE') -or $cat.StartsWith('DISCOUNT')) { return $false }
  $n = ([string]$Name).Trim()
  if ($n -match '^(setup|breakdown|installation|removal|repack|delivery|pick ?up|convenience|service|processing)\b') { return $false }
  if ($n -match '\bfee\b') { return $false }
  return $true
}

function Resolve-ProductImageUrl {
  param(
    [string]$PictureRef,
    [string]$WebsiteBase = "https://www.partyperfecteventrental.com"
  )
  if (-not $PictureRef) { return $null }
  $p = ([string]$PictureRef).Trim()
  if (-not $p) { return $null }
  if ($p -match '^https?://') { return $p }
  $p = $p -replace '\\', '/'
  if ($p -match '^itemimages/') { return "$WebsiteBase/$p" }
  if ($p.StartsWith('/')) { return "$WebsiteBase$p" }
  return "$WebsiteBase/itemimages/$p"
}

function Get-ItemFilePictureSelect {
  param([System.Data.SqlClient.SqlConnection]$Connection)
  foreach ($col in @('WebPicture','Picture','ImageName','Photo','PictureFile')) {
    try {
      $rows = Read-Rows $Connection "SELECT TOP 1 CAST([$col] AS nvarchar(500)) AS Pic FROM dbo.ItemFile WHERE [$col] IS NOT NULL AND LTRIM(RTRIM(CAST([$col] AS nvarchar(200)))) <> N''"
      if ($rows.Count -gt 0) {
        Write-Log "ItemFile picture column detected: $col"
        return ", CAST(ISNULL([$col], N'') AS nvarchar(500)) AS PictureRef"
      }
    } catch {}
  }
  return ""
}

$config = Get-Config
Write-Log "Starting read-only POR sync -> $($config.CommandCenterUrl)"

$conn = $null
try {
  $conn = New-SqlConnection $config

  # Exclude non-rentable fee/labor/delivery categories from stock math.
  # POR stores Category as numeric codes: 34 = setup/breakdown/labor fees,
  # 19 = delivery/convenience fees. Also drop legacy FEE%/DISCOUNT% labels.
  $notFee = @"
AND LTRIM(RTRIM(ISNULL(Category,''))) NOT IN (N'19', N'34')
AND ISNULL(Category,'') NOT LIKE N'FEE%'
AND ISNULL(Category,'') NOT LIKE N'DISCOUNT%'
"@

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

  $arActiveFilter = "ISNULL(Inactive,0)=0"
  try {
    # Probe Inactive column (POR CustomerFile usually has it; fall back if not).
    [void](Get-Scalar $conn "SELECT TOP 1 ISNULL(Inactive,0) FROM dbo.CustomerFile")
  } catch {
    $arActiveFilter = "1=1"
    Write-Log "CustomerFile.Inactive unavailable — AR query will not filter inactive customers" "WARN"
  }

  # Positive balances only (credits netted out of overdue/open AR). Active customers when column exists.
  $arOpen = Get-Scalar $conn "SELECT SUM(ISNULL(CurrentBalance,0)) FROM dbo.CustomerFile WHERE $arActiveFilter AND ISNULL(CurrentBalance,0) > 0"
  $arCount = [int](Get-Scalar $conn "SELECT COUNT(*) FROM dbo.CustomerFile WHERE $arActiveFilter AND ISNULL(CurrentBalance,0) > 0")

  $agingRows = Read-Rows $conn @"
SELECT
  SUM(CASE WHEN AgeDate IS NULL OR AgeDate >= DATEADD(day, -30, GETDATE()) THEN ISNULL(CurrentBalance,0) ELSE 0 END) AS AgingCurrent,
  SUM(CASE WHEN AgeDate < DATEADD(day, -30, GETDATE()) AND AgeDate >= DATEADD(day, -60, GETDATE()) THEN ISNULL(CurrentBalance,0) ELSE 0 END) AS Aging30,
  SUM(CASE WHEN AgeDate < DATEADD(day, -60, GETDATE()) AND AgeDate >= DATEADD(day, -90, GETDATE()) THEN ISNULL(CurrentBalance,0) ELSE 0 END) AS Aging60,
  SUM(CASE WHEN AgeDate < DATEADD(day, -90, GETDATE()) AND AgeDate >= DATEADD(day, -120, GETDATE()) THEN ISNULL(CurrentBalance,0) ELSE 0 END) AS Aging90,
  SUM(CASE WHEN AgeDate < DATEADD(day, -120, GETDATE()) THEN ISNULL(CurrentBalance,0) ELSE 0 END) AS Aging120
FROM dbo.CustomerFile
WHERE $arActiveFilter AND ISNULL(CurrentBalance,0) > 0
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

  # Open contracts = live reservations + live open orders, from dbo.Transactions.
  # NOT ContractFile (Status there is a different, thinner column) and NOT
  # CustomerFile.QtyOut. Uses LEFT(STAT,1) with no LTRIM - see PorStatus.ps1.
  $openContracts = 0
  try {
    $openContracts = [int](Get-Scalar $conn @"
SELECT COUNT(*) FROM dbo.Transactions
WHERE LEFT(CAST(STAT AS nvarchar(10)),1) IN (N'R', N'O')
  AND ISNULL(Archived,0)=0 AND ISNULL(Cancelled,0)=0
"@)
  } catch {
    Write-Log ("ContractFile openContracts unavailable: {0}" -f $_.Exception.Message) "WARN"
    $openContracts = [int](Get-Scalar $conn "SELECT COUNT(*) FROM dbo.CustomerFile WHERE ISNULL(QtyOut,0) > 0")
  }

  # Deliveries / returns = Transactions on those dates (not CustomerFile.LastActive edits).
  $deliveriesToday = 0
  $returnsDueToday = 0
  try {
    $deliveriesToday = [int](Get-Scalar $conn @"
SELECT COUNT(*) FROM dbo.Transactions
WHERE DeliveryDate IS NOT NULL
  AND CAST(DeliveryDate AS date) = CAST(GETDATE() AS date)
  AND $script:PorSqlLive
  AND UPPER(ISNULL(SUBSTRING(CAST(STAT AS nvarchar(10)),2,1),N' ')) <> N'C'
"@)
    $returnsDueToday = [int](Get-Scalar $conn @"
SELECT COUNT(*) FROM dbo.Transactions
WHERE PickupDate IS NOT NULL
  AND CAST(PickupDate AS date) = CAST(GETDATE() AS date)
  AND $script:PorSqlLive
  AND UPPER(ISNULL(SUBSTRING(CAST(STAT AS nvarchar(10)),2,1),N' ')) <> N'C'
"@)
  } catch {
    Write-Log ("Transactions deliveries/returns today unavailable: {0}" -f $_.Exception.Message) "WARN"
  }

  # --- Sales pipeline + catalog for Mike ticket completion (best-effort; never fail sync) ---
  $openQuotes = 0
  $openReservations = 0
  $quotesWithin14 = 0
  try {
    # Open quotes exclude secondary 'C' (cancelled) and 'T' (converted to contract).
    # The old ContractFile filter reported every quote ever written, including
    # ~8,350 converted and ~5,474 cancelled ones.
    $openQuotes = [int](Get-Scalar $conn @"
SELECT COUNT(*) FROM dbo.Transactions
WHERE $(Get-PorScopeSql 'OpenQuotes')
"@)
    $openReservations = [int](Get-Scalar $conn @"
SELECT COUNT(*) FROM dbo.Transactions
WHERE $(Get-PorScopeSql 'ActiveReservations')
"@)
    $quotesWithin14 = [int](Get-Scalar $conn @"
SELECT COUNT(*) FROM dbo.Transactions
WHERE $(Get-PorScopeSql 'OpenQuotes')
  AND DeliveryDate IS NOT NULL
  AND CAST(DeliveryDate AS date) >= CAST(GETDATE() AS date)
  AND CAST(DeliveryDate AS date) <= DATEADD(day, 14, CAST(GETDATE() AS date))
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
    $pictureSelect = Get-ItemFilePictureSelect -Connection $conn
    $fullRows = Read-Rows $conn @"
SELECT
  CAST([KEY] AS nvarchar(64)) AS Sku,
  CAST([Name] AS nvarchar(200)) AS ItemName,
  CAST(ISNULL(Category, N'') AS nvarchar(64)) AS CategoryCode,
  CAST(ISNULL(NUM, N'') AS nvarchar(64)) AS Num,
  CAST(ISNULL(TYPE, N' ') AS nvarchar(4)) AS ItemType,
  ISNULL(RMIN, 0) AS RentalMinimum,
  ISNULL(CaseQty, 0) AS CaseQty,
  CASE WHEN ISNULL(QTY,0) > 100000 THEN 0 ELSE ISNULL(QTY,0) END AS Quantity,
  CASE WHEN ISNULL(QYOT,0) > 100000 THEN 0 ELSE ISNULL(QYOT,0) END AS QtyOut,
  ISNULL(RATE1, ISNULL(SELL, 0)) AS Rate
  $pictureSelect
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
      $item = @{
        sku = [string]$row.Sku
        name = [string]$row.ItemName
        categoryCode = $catCode
        category = $catCode
        num = ([string]$row.Num).Trim()
        ratePerDay = [math]::Round([double]$row.Rate, 2)
        qty = [math]::Round($q, 2)
        available = [math]::Round($a, 2)
        # itemType: 'K' = Rental - Package (a KIT HEADER, not dead stock). Kit
        # headers legitimately carry qty 0 / rate 0 and resolve through ItemKits
        # to real TYPE 'T' components. Never present a 'K' row as stock.
        itemType = ([string]$row.ItemType).Trim().ToUpperInvariant()
        rentalMinimum = [math]::Round([double]$row.RentalMinimum, 2)
        caseQty = [int]$row.CaseQty
      }
      if (Test-RentableCatalogItem -CategoryCode $catCode -Name $item.name) {
        $picRef = $null
        if ($row.ContainsKey('PictureRef') -and $row.PictureRef) {
          $picRef = [string]$row.PictureRef
        }
        $imageUrl = Resolve-ProductImageUrl -PictureRef $picRef
        if ($imageUrl) {
          $item.imageUrl = $imageUrl
        }
      }
      $fullCatalogItems += $item
    }
    Write-Log ("Full catalog rows={0} withNum={1} kits={2}" -f $fullCatalogItems.Count, @($fullCatalogItems | Where-Object { $_.num }).Count, @($fullCatalogItems | Where-Object { $_.itemType -eq 'K' }).Count)
  } catch {
    Write-Log ("Full catalog (NUM) pull failed: {0}" -f $_.Exception.Message) "WARN"
  }

  # --- Kit membership: kit header (ItemFile.NUM) -> component (ItemFile.KEY) ---
  # dbo.ItemKits.Num is the kit's NUM; dbo.ItemKits.ItemKey is the component's KEY.
  # Quantity 0 with SelectType/MultiGroup means "operator chooses at order time" -
  # so this is a SELECTION GROUP, not a fixed bundle. The UI must let the girl
  # pick, exactly as Counter does. Never auto-pick a component.
  $kitMembers = @()
  try {
    $kitRows = Read-Rows $conn @"
SELECT
  CAST(k.Num AS nvarchar(64)) AS KitNum,
  CAST(k.ItemKey AS nvarchar(64)) AS ComponentKey,
  ISNULL(k.Quantity, 0) AS Quantity,
  CAST(ISNULL(k.SelectType, N'') AS nvarchar(16)) AS SelectType,
  CAST(ISNULL(k.MultiGroup, N'') AS nvarchar(16)) AS MultiGroup,
  ISNULL(k.UseSpecialRate, 0) AS UseSpecialRate,
  ISNULL(k.DailyAmount, 0) AS DailyAmount
FROM dbo.ItemKits k
"@
    foreach ($row in $kitRows) {
      $kitMembers += @{
        kitNum = ([string]$row.KitNum).Trim()
        componentSku = ([string]$row.ComponentKey).Trim()
        quantity = [math]::Round([double]$row.Quantity, 2)
        selectType = ([string]$row.SelectType).Trim()
        multiGroup = ([string]$row.MultiGroup).Trim()
        useSpecialRate = [bool]$row.UseSpecialRate
        dailyAmount = [math]::Round([double]$row.DailyAmount, 2)
      }
    }
    Write-Log ("Kit membership rows={0} kits={1}" -f $kitMembers.Count, @($kitMembers | Select-Object -ExpandProperty kitNum -Unique).Count)
  } catch {
    Write-Log ("ItemKits pull failed: {0}" -f $_.Exception.Message) "WARN"
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
  AND $(Get-PorScopeSql 'ActivePipeline')
"@
    $reservationsQueryOk = $true
    foreach ($row in $resRows) {
      # NEVER LTRIM STAT — blank primary = Completed, not padding.
      $status = [string]$row.Status
      $first = Get-PorPrimaryChar $status
      if ($first -notin @('R', 'O', 'Q')) { continue }
      if ((Get-PorSecondaryChar $status) -eq 'C') { continue }
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
      returnsDueToday = $returnsDueToday
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
        kitMembers = $kitMembers
      }
      $catalogJson = $catalogPayload | ConvertTo-Json -Depth 6 -Compress
      $catResp = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/por/sync/catalog" -Headers $headers -Body $catalogJson -TimeoutSec 180
      Write-Log ("Full catalog push OK. items={0}" -f $fullCatalogItems.Count)
      ($catResp | ConvertTo-Json -Depth 4 -Compress) | ForEach-Object { Write-Log $_ }
      try {
        $imgResp = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/por/sync/catalog-images" -Headers $headers -TimeoutSec 180
        Write-Log ("Catalog image ingest OK.")
        ($imgResp | ConvertTo-Json -Depth 4 -Compress) | ForEach-Object { Write-Log $_ }
      } catch {
        Write-Log ("Catalog image ingest failed: {0}" -f $_.Exception.Message) "WARN"
      }
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

  # --- CRM entity sync (keyed Redis store). Never CheckCardFile. No card ciphertext. ---
  $crmWindowDays = 90
  try {
    if ($config.CrmWindowDays) { $crmWindowDays = [int]$config.CrmWindowDays }
  } catch {}

  try {
    Write-Log "CRM sync starting (windowDays=$crmWindowDays)"

    $crmCustomers = @()
    $custRows = Read-Rows $conn @"
SELECT
  CAST([KEY] AS nvarchar(64)) AS [KEY],
  CAST([NAME] AS nvarchar(200)) AS [NAME],
  CAST(Address AS nvarchar(200)) AS Address,
  CAST(Address2 AS nvarchar(200)) AS Address2,
  CAST(CITY AS nvarchar(100)) AS CITY,
  CAST(ZIP AS nvarchar(20)) AS ZIP,
  CAST(Phone AS nvarchar(40)) AS Phone,
  CAST(WORK AS nvarchar(40)) AS WORK,
  CAST(MOBILE AS nvarchar(40)) AS MOBILE,
  CAST(Email AS nvarchar(200)) AS Email,
  CAST(CNUM AS nvarchar(32)) AS CNUM,
  CAST(OpenDate AS nvarchar(40)) AS OpenDate,
  CAST(LastActive AS nvarchar(40)) AS LastActive,
  CAST(LastContract AS nvarchar(40)) AS LastContract,
  CreditLimit, Status, Type, CurrentBalance, HighBalance,
  LastPayAmount, CAST(LastPayDate AS nvarchar(40)) AS LastPayDate,
  NumberContracts, CAST(Salesman AS nvarchar(40)) AS Salesman,
  CAST(TaxCode AS nvarchar(40)) AS TaxCode,
  CAST(BillContact AS nvarchar(120)) AS BillContact,
  CAST(BillPhone AS nvarchar(40)) AS BillPhone,
  CAST(Message AS nvarchar(400)) AS Message
FROM dbo.CustomerFile
"@
    foreach ($row in $custRows) {
      $crmCustomers += @{
        KEY = [string]$row.KEY
        NAME = [string]$row.NAME
        Address = [string]$row.Address
        Address2 = [string]$row.Address2
        CITY = [string]$row.CITY
        ZIP = [string]$row.ZIP
        Phone = [string]$row.Phone
        WORK = [string]$row.WORK
        MOBILE = [string]$row.MOBILE
        Email = [string]$row.Email
        CNUM = [string]$row.CNUM
        OpenDate = [string]$row.OpenDate
        LastActive = [string]$row.LastActive
        LastContract = [string]$row.LastContract
        CreditLimit = $row.CreditLimit
        Status = [string]$row.Status
        Type = [string]$row.Type
        CurrentBalance = $row.CurrentBalance
        HighBalance = $row.HighBalance
        LastPayAmount = $row.LastPayAmount
        LastPayDate = [string]$row.LastPayDate
        NumberContracts = $row.NumberContracts
        Salesman = [string]$row.Salesman
        TaxCode = [string]$row.TaxCode
        BillContact = [string]$row.BillContact
        BillPhone = [string]$row.BillPhone
        Message = [string]$row.Message
      }
    }
    Write-Log ("CRM customers={0}" -f $crmCustomers.Count)

    $crmSites = @()
    try {
      $siteRows = Read-Rows $conn @"
SELECT
  CAST(Number AS nvarchar(40)) AS Number,
  CAST(Cnum AS nvarchar(32)) AS Cnum,
  CAST(Description AS nvarchar(200)) AS Description,
  CAST(ContactName AS nvarchar(120)) AS ContactName,
  CAST(ContactPhone AS nvarchar(40)) AS ContactPhone,
  CAST(SiteAddress AS nvarchar(200)) AS SiteAddress,
  CAST(SiteCity AS nvarchar(100)) AS SiteCity,
  CAST(SiteZip AS nvarchar(20)) AS SiteZip,
  CAST(SiteNotes AS nvarchar(400)) AS SiteNotes,
  CAST(PONumber AS nvarchar(80)) AS PONumber,
  CAST(JobNumber AS nvarchar(80)) AS JobNumber,
  CAST(ProjectStartDate AS nvarchar(40)) AS ProjectStartDate,
  CAST(ProjectEndDate AS nvarchar(40)) AS ProjectEndDate,
  CAST(SiteDeliveryInstructions AS nvarchar(400)) AS SiteDeliveryInstructions
FROM dbo.CustomerJobSite
"@
      foreach ($row in $siteRows) {
        $crmSites += @{
          Number = [string]$row.Number
          Cnum = [string]$row.Cnum
          Description = [string]$row.Description
          ContactName = [string]$row.ContactName
          ContactPhone = [string]$row.ContactPhone
          SiteAddress = [string]$row.SiteAddress
          SiteCity = [string]$row.SiteCity
          SiteZip = [string]$row.SiteZip
          SiteNotes = [string]$row.SiteNotes
          PONumber = [string]$row.PONumber
          JobNumber = [string]$row.JobNumber
          ProjectStartDate = [string]$row.ProjectStartDate
          ProjectEndDate = [string]$row.ProjectEndDate
          SiteDeliveryInstructions = [string]$row.SiteDeliveryInstructions
        }
      }
    } catch {
      Write-Log ("CRM CustomerJobSite failed: {0}" -f $_.Exception.Message) "WARN"
    }

    $crmComments = @()
    try {
      $commentRows = Read-Rows $conn @"
SELECT CAST(CNUM AS nvarchar(32)) AS CNUM, CAST(COMMENTS1 AS nvarchar(max)) AS COMMENTS1
FROM dbo.CustomerComments
"@
      foreach ($row in $commentRows) {
        $crmComments += @{ CNUM = [string]$row.CNUM; COMMENTS1 = [string]$row.COMMENTS1 }
      }
    } catch {
      Write-Log ("CRM CustomerComments failed: {0}" -f $_.Exception.Message) "WARN"
    }

    $crmItems = @()
    try {
      $crmItemRows = Read-Rows $conn @"
SELECT
  CAST([KEY] AS nvarchar(64)) AS [KEY],
  CAST([Name] AS nvarchar(200)) AS [Name],
  CAST(LOC AS nvarchar(40)) AS LOC,
  QTY, QYOT, Category, TYPE, RATE1, SELL,
  CAST(PartNumber AS nvarchar(80)) AS PartNumber,
  CAST(NUM AS nvarchar(64)) AS NUM
FROM dbo.ItemFile
WHERE ISNULL(Inactive,0)=0
"@
      foreach ($row in $crmItemRows) {
        $crmItems += @{
          KEY = [string]$row.KEY
          Name = [string]$row.Name
          LOC = [string]$row.LOC
          QTY = $row.QTY
          QYOT = $row.QYOT
          Category = [string]$row.Category
          TYPE = [string]$row.TYPE
          RATE1 = $row.RATE1
          SELL = $row.SELL
          PartNumber = [string]$row.PartNumber
          NUM = [string]$row.NUM
        }
      }
    } catch {
      Write-Log ("CRM ItemFile failed: {0}" -f $_.Exception.Message) "WARN"
    }

    # Payments — explicit column list; NEVER Encrypted / EncryptedCard / CCAlias
    $crmPayments = @()
    try {
      $payRows = Read-Rows $conn @"
SELECT
  CAST(Payment AS nvarchar(40)) AS Payment,
  CAST([Date] AS nvarchar(40)) AS [Date],
  CAST([Type] AS nvarchar(20)) AS [Type],
  CAST(CustNumb AS nvarchar(32)) AS CustNumb,
  Amount,
  CAST(Meth AS nvarchar(20)) AS Meth,
  CAST(RefNo AS nvarchar(80)) AS RefNo,
  CAST(Notes AS nvarchar(400)) AS Notes,
  Tendered,
  CAST(TransType AS nvarchar(20)) AS TransType
FROM dbo.PaymentFile
"@
      foreach ($row in $payRows) {
        $crmPayments += @{
          Payment = [string]$row.Payment
          Date = [string]$row.Date
          Type = [string]$row.Type
          CustNumb = [string]$row.CustNumb
          Amount = $row.Amount
          Meth = [string]$row.Meth
          RefNo = [string]$row.RefNo
          Notes = [string]$row.Notes
          Tendered = $row.Tendered
          TransType = [string]$row.TransType
        }
      }
    } catch {
      Write-Log ("CRM PaymentFile failed: {0}" -f $_.Exception.Message) "WARN"
    }

    $crmPayDetails = @()
    try {
      $pdRows = Read-Rows $conn @"
SELECT
  CAST(Payment AS nvarchar(40)) AS Payment,
  CAST(Contract AS nvarchar(40)) AS Contract,
  Amount, Discount
FROM dbo.PaymentDetail
"@
      foreach ($row in $pdRows) {
        $crmPayDetails += @{
          Payment = [string]$row.Payment
          Contract = [string]$row.Contract
          Amount = $row.Amount
          Discount = $row.Discount
        }
      }
    } catch {
      Write-Log ("CRM PaymentDetail failed: {0}" -f $_.Exception.Message) "WARN"
    }

    $crmTx = @()
    $crmTxItems = @()
    try {
      $txRows = Read-Rows $conn @"
SELECT
  CAST(CNTR AS nvarchar(40)) AS CNTR,
  CAST([DATE] AS nvarchar(40)) AS [DATE],
  CAST([TIME] AS nvarchar(40)) AS [TIME],
  CAST(STAT AS nvarchar(10)) AS STAT,
  CAST(CUSN AS nvarchar(32)) AS CUSN,
  TOTL, PAID, RENT, SALE, TAX, DPMT, PYMT,
  CAST(DeliveryDate AS nvarchar(40)) AS DeliveryDate,
  CAST(PickupDate AS nvarchar(40)) AS PickupDate,
  CAST(EventEndDate AS nvarchar(40)) AS EventEndDate,
  CAST(Contact AS nvarchar(120)) AS Contact,
  CAST(ContactPhone AS nvarchar(40)) AS ContactPhone,
  CAST(DeliveryAddress AS nvarchar(200)) AS DeliveryAddress,
  CAST(DeliveryCity AS nvarchar(100)) AS DeliveryCity,
  CAST(DeliveryZip AS nvarchar(20)) AS DeliveryZip,
  CAST(JobSite AS nvarchar(120)) AS JobSite,
  CAST(DeliveryNotes AS nvarchar(400)) AS DeliveryNotes,
  CAST(TransactionType AS nvarchar(40)) AS TransactionType,
  CAST(Salesman AS nvarchar(40)) AS Salesman,
  CAST(Completed AS nvarchar(40)) AS Completed,
  CAST(Billed AS nvarchar(40)) AS Billed
FROM dbo.Transactions
WHERE
  $(Get-PorScopeSql 'ActivePipeline')
  OR (DeliveryDate IS NOT NULL AND DeliveryDate >= DATEADD(day, -$crmWindowDays, GETDATE()))
  OR (PickupDate IS NOT NULL AND PickupDate >= DATEADD(day, -$crmWindowDays, GETDATE()))
  OR (DeliveryDate IS NOT NULL AND DeliveryDate >= CAST(GETDATE() AS date))
"@
      $cntrList = New-Object System.Collections.Generic.List[string]
      foreach ($row in $txRows) {
        $cntr = [string]$row.CNTR
        [void]$cntrList.Add($cntr)
        $crmTx += @{
          CNTR = $cntr
          DATE = [string]$row.DATE
          TIME = [string]$row.TIME
          STAT = [string]$row.STAT
          CUSN = [string]$row.CUSN
          TOTL = $row.TOTL
          PAID = $row.PAID
          RENT = $row.RENT
          SALE = $row.SALE
          TAX = $row.TAX
          DPMT = $row.DPMT
          PYMT = $row.PYMT
          DeliveryDate = [string]$row.DeliveryDate
          PickupDate = [string]$row.PickupDate
          EventEndDate = [string]$row.EventEndDate
          Contact = [string]$row.Contact
          ContactPhone = [string]$row.ContactPhone
          DeliveryAddress = [string]$row.DeliveryAddress
          DeliveryCity = [string]$row.DeliveryCity
          DeliveryZip = [string]$row.DeliveryZip
          JobSite = [string]$row.JobSite
          DeliveryNotes = [string]$row.DeliveryNotes
          TransactionType = [string]$row.TransactionType
          Salesman = [string]$row.Salesman
          Completed = [string]$row.Completed
          Billed = [string]$row.Billed
        }
      }
      Write-Log ("CRM transactions (window+open)={0}" -f $crmTx.Count)

      if ($cntrList.Count -gt 0) {
        # Chunk IN lists to avoid huge SQL
        $chunkSize = 400
        for ($i = 0; $i -lt $cntrList.Count; $i += $chunkSize) {
          $end = [math]::Min($i + $chunkSize - 1, $cntrList.Count - 1)
          $slice = $cntrList.GetRange($i, $end - $i + 1)
          $inList = ($slice | ForEach-Object { "N'" + ($_ -replace "'", "''") + "'" }) -join ","
          $tiRows = Read-Rows $conn @"
SELECT
  CAST(CNTR AS nvarchar(40)) AS CNTR,
  CAST(ITEM AS nvarchar(64)) AS ITEM,
  QTY, PRIC,
  CAST([Desc] AS nvarchar(200)) AS [Desc],
  CAST(Comments AS nvarchar(400)) AS Comments,
  LineNumber,
  CAST(OutDate AS nvarchar(40)) AS OutDate,
  TaxAmount, DailyAmount
FROM dbo.TransactionItems
WHERE CNTR IN ($inList)
"@
          foreach ($row in $tiRows) {
            $crmTxItems += @{
              CNTR = [string]$row.CNTR
              ITEM = [string]$row.ITEM
              QTY = $row.QTY
              PRIC = $row.PRIC
              Desc = [string]$row.Desc
              Comments = [string]$row.Comments
              LineNumber = $row.LineNumber
              OutDate = [string]$row.OutDate
              TaxAmount = $row.TaxAmount
              DailyAmount = $row.DailyAmount
            }
          }
        }
      }
      Write-Log ("CRM transactionItems={0}" -f $crmTxItems.Count)
    } catch {
      Write-Log ("CRM Transactions/Items window failed: {0}" -f $_.Exception.Message) "WARN"
    }

    $crmUri = "$baseUrl/api/por/sync/crm"
    $syncedAtCrm = (Get-Date).ToUniversalTime().ToString("o")

    # Push in chunks so Vercel body limits aren't hit
    function Send-CrmPart([hashtable]$Part) {
      $Part.source = "ENTERPRISE Sync-PorSnapshot CRM"
      $Part.syncedAt = $syncedAtCrm
      $resp = Push-Json -Uri $crmUri -Headers $headers -Payload $Part -TimeoutSec 240
      Write-Log ("CRM chunk OK keys={0}" -f (($Part.Keys | Where-Object { $_ -notin @('source','syncedAt','counts') }) -join ','))
      return $resp
    }

    if ($crmCustomers.Count -gt 0) {
      for ($i = 0; $i -lt $crmCustomers.Count; $i += 2000) {
        $take = [math]::Min(2000, $crmCustomers.Count - $i)
        [void](Send-CrmPart @{ customers = @($crmCustomers[$i..($i + $take - 1)]) })
      }
    }
    if ($crmSites.Count -gt 0) {
      [void](Send-CrmPart @{ jobSites = @($crmSites) })
    }
    if ($crmComments.Count -gt 0) {
      [void](Send-CrmPart @{ comments = @($crmComments) })
    }
    if ($crmItems.Count -gt 0) {
      for ($i = 0; $i -lt $crmItems.Count; $i += 2000) {
        $take = [math]::Min(2000, $crmItems.Count - $i)
        [void](Send-CrmPart @{ items = @($crmItems[$i..($i + $take - 1)]) })
      }
    }
    if ($crmPayments.Count -gt 0) {
      for ($i = 0; $i -lt $crmPayments.Count; $i += 2000) {
        $take = [math]::Min(2000, $crmPayments.Count - $i)
        [void](Send-CrmPart @{ payments = @($crmPayments[$i..($i + $take - 1)]) })
      }
    }
    if ($crmPayDetails.Count -gt 0) {
      for ($i = 0; $i -lt $crmPayDetails.Count; $i += 3000) {
        $take = [math]::Min(3000, $crmPayDetails.Count - $i)
        [void](Send-CrmPart @{ paymentDetails = @($crmPayDetails[$i..($i + $take - 1)]) })
      }
    }
    if ($crmTx.Count -gt 0) {
      for ($i = 0; $i -lt $crmTx.Count; $i += 1500) {
        $take = [math]::Min(1500, $crmTx.Count - $i)
        [void](Send-CrmPart @{ transactions = @($crmTx[$i..($i + $take - 1)]) })
      }
    }
    if ($crmTxItems.Count -gt 0) {
      for ($i = 0; $i -lt $crmTxItems.Count; $i += 2500) {
        $take = [math]::Min(2500, $crmTxItems.Count - $i)
        [void](Send-CrmPart @{ transactionItems = @($crmTxItems[$i..($i + $take - 1)]) })
      }
    }

    $countsPayload = @{
      source = "ENTERPRISE Sync-PorSnapshot CRM"
      syncedAt = $syncedAtCrm
      counts = @{
        customers = $crmCustomers.Count
        jobSites = $crmSites.Count
        comments = $crmComments.Count
        transactions = $crmTx.Count
        transactionItems = $crmTxItems.Count
        payments = $crmPayments.Count
        paymentDetails = $crmPayDetails.Count
        items = $crmItems.Count
      }
    }
    [void](Push-Json -Uri $crmUri -Headers $headers -Payload $countsPayload -TimeoutSec 60)
    Write-Log "CRM sync complete"

    # --- Also upsert Supabase por.* via Command Center (requires DATABASE_URL on Vercel) ---
    try {
      $pgUri = "$baseUrl/api/por/sync/postgres"
      $syncedAtPg = (Get-Date).ToUniversalTime().ToString("o")
      function Send-PgPart([hashtable]$Part) {
        $Part.source = "ENTERPRISE Sync-PorSnapshot Postgres"
        $Part.syncedAt = $syncedAtPg
        $resp = Push-Json -Uri $pgUri -Headers $headers -Payload $Part -TimeoutSec 240
        Write-Log ("Postgres chunk OK keys={0}" -f (($Part.Keys | Where-Object { $_ -notin @('source','syncedAt','counts') }) -join ','))
        return $resp
      }
      if ($crmCustomers.Count -gt 0) {
        for ($i = 0; $i -lt $crmCustomers.Count; $i += 1500) {
          $take = [math]::Min(1500, $crmCustomers.Count - $i)
          [void](Send-PgPart @{ customers = @($crmCustomers[$i..($i + $take - 1)]) })
        }
      }
      if ($crmItems.Count -gt 0) {
        for ($i = 0; $i -lt $crmItems.Count; $i += 1500) {
          $take = [math]::Min(1500, $crmItems.Count - $i)
          [void](Send-PgPart @{ items = @($crmItems[$i..($i + $take - 1)]) })
        }
      }
      if ($crmPayments.Count -gt 0) {
        for ($i = 0; $i -lt $crmPayments.Count; $i += 1500) {
          $take = [math]::Min(1500, $crmPayments.Count - $i)
          [void](Send-PgPart @{ payments = @($crmPayments[$i..($i + $take - 1)]) })
        }
      }
      if ($crmTx.Count -gt 0) {
        for ($i = 0; $i -lt $crmTx.Count; $i += 1000) {
          $take = [math]::Min(1000, $crmTx.Count - $i)
          [void](Send-PgPart @{ contracts = @($crmTx[$i..($i + $take - 1)]) })
        }
      }
      if ($crmTxItems.Count -gt 0) {
        for ($i = 0; $i -lt $crmTxItems.Count; $i += 2000) {
          $take = [math]::Min(2000, $crmTxItems.Count - $i)
          [void](Send-PgPart @{ contractItems = @($crmTxItems[$i..($i + $take - 1)]) })
        }
      }
      [void](Push-Json -Uri $pgUri -Headers $headers -Payload @{
        source = "ENTERPRISE Sync-PorSnapshot Postgres"
        syncedAt = $syncedAtPg
        counts = @{
          customers = $crmCustomers.Count
          contracts = $crmTx.Count
          contractItems = $crmTxItems.Count
          payments = $crmPayments.Count
          items = $crmItems.Count
        }
      } -TimeoutSec 60)
      Write-Log "Postgres por.* sync complete"
    } catch {
      Write-Log ("Postgres por.* sync failed (ok until DATABASE_URL live on Vercel): {0}" -f $_.Exception.Message) "WARN"
    }
  } catch {
    Write-Log ("CRM sync failed: {0}" -f $_.Exception.Message) "WARN"
  }
}
catch {
  Write-Log $_.Exception.Message "ERROR"
  throw
}
finally {
  if ($conn) { $conn.Close(); $conn.Dispose() }
}
