param(
  [Parameter(Mandatory = $true)]
  [string]$ExcelPath,
  [string]$OutputPath = "src/common/mappings/feature-catalogue.mapping.json"
)

if (-not (Test-Path -LiteralPath $ExcelPath)) {
  throw "Excel file not found: $ExcelPath"
}

$excel = $null
$workbook = $null
$worksheet = $null

try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false

  $workbook = $excel.Workbooks.Open($ExcelPath)
  $worksheet = $workbook.Worksheets.Item(1)
  $usedRange = $worksheet.UsedRange

  $rowCount = $usedRange.Rows.Count
  $colCount = $usedRange.Columns.Count

  $headers = @{}
  for ($c = 1; $c -le $colCount; $c++) {
    $headerText = [string]$worksheet.Cells.Item(1, $c).Text
    if ($headerText) {
      $headers[$headerText] = $c
    }
  }

  foreach ($required in @("Feature ID", "Category", "Feature Name", "Product Module", "Area")) {
    if (-not $headers.ContainsKey($required)) {
      throw "Missing required column '$required' in workbook."
    }
  }

  $rows = @()
  for ($r = 2; $r -le $rowCount; $r++) {
    $module = [string]$worksheet.Cells.Item($r, $headers["Product Module"]).Text
    $featureName = [string]$worksheet.Cells.Item($r, $headers["Feature Name"]).Text
    if (-not $module -or -not $featureName) {
      continue
    }

    $rows += [pscustomobject]@{
      module = $module.Trim()
      featureName = $featureName.Trim()
      featureId = ([string]$worksheet.Cells.Item($r, $headers["Feature ID"]).Text).Trim()
      category = ([string]$worksheet.Cells.Item($r, $headers["Category"]).Text).Trim()
      area = ([string]$worksheet.Cells.Item($r, $headers["Area"]).Text).Trim()
    }
  }

  $modulesMap = [ordered]@{}
  foreach ($moduleName in ($rows.module | Sort-Object -Unique)) {
    $moduleRows = $rows | Where-Object { $_.module -eq $moduleName }

    $featuresMap = [ordered]@{}
    foreach ($row in ($moduleRows | Sort-Object featureName, featureId)) {
      $featuresMap[$row.featureName] = [ordered]@{
        featureId = $row.featureId
        category = $row.category
        area = $row.area
      }
    }

    $uniqueCategories = @($moduleRows.category | Where-Object { $_ } | Sort-Object -Unique)
    $uniqueAreas = @($moduleRows.area | Where-Object { $_ } | Sort-Object -Unique)
    $defaults = [ordered]@{}
    if ($uniqueCategories.Count -eq 1) {
      $defaults["category"] = $uniqueCategories[0]
    }
    if ($uniqueAreas.Count -eq 1) {
      $defaults["area"] = $uniqueAreas[0]
    }

    $moduleValue = [ordered]@{
      features = $featuresMap
    }
    if ($defaults.Keys.Count -gt 0) {
      $moduleValue["defaults"] = $defaults
    }

    $modulesMap[$moduleName] = $moduleValue
  }

  $result = [ordered]@{
    generatedAtUtc = [DateTime]::UtcNow.ToString("o")
    sourceFile = (Resolve-Path -LiteralPath $ExcelPath).Path
    modules = $modulesMap
  }

  $outputDirectory = Split-Path -Path $OutputPath -Parent
  if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
  }

  $result | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
  Write-Output "Generated mapping at: $OutputPath"
}
finally {
  if ($workbook -ne $null) {
    $workbook.Close($false)
  }
  if ($excel -ne $null) {
    $excel.Quit()
  }
  if ($worksheet -ne $null) {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($worksheet)
  }
  if ($workbook -ne $null) {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook)
  }
  if ($excel -ne $null) {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
