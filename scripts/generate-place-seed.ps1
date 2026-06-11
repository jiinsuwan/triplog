param(
    [string]$Source = "data.local\tourist_attractions.csv",
    [string]$Output = "backend\src\main\resources\db\migration\V7__seed_public_tourist_places.sql"
)

$ErrorActionPreference = "Stop"

$headers = @(
    "name",
    "category",
    "roadAddress",
    "address",
    "latitude",
    "longitude",
    "area",
    "publicFacilities",
    "lodgingFacilities",
    "sportsEntertainmentFacilities",
    "recreationCultureFacilities",
    "hospitalityFacilities",
    "supportFacilities",
    "designatedDate",
    "capacity",
    "parkingCount",
    "description",
    "phone",
    "managementAgency",
    "dataReferenceDate",
    "providerCode",
    "providerName"
)

function SqlString([string]$value) {
    if ([string]::IsNullOrWhiteSpace($value)) {
        return "NULL"
    }
    return "'" + $value.Trim().Replace("'", "''") + "'"
}

function SqlDecimal([string]$value) {
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Required decimal field is blank."
    }
    return $value.Trim()
}

function NormalizeText([string]$value) {
    if ($null -eq $value) {
        return $null
    }
    $trimmed = $value.Trim()
    if ($trimmed.Length -eq 0) {
        return $null
    }
    return $trimmed
}

function Summary([string]$value) {
    $text = NormalizeText $value
    if ($null -eq $text) {
        return $null
    }
    if ($text.Length -le 240) {
        return $text
    }
    return $text.Substring(0, 240)
}

function RegionParts($row) {
    $base = NormalizeText $row.roadAddress
    if ($null -eq $base) {
        $base = NormalizeText $row.address
    }
    if ($null -eq $base) {
        $base = NormalizeText $row.providerName
    }
    $tokens = @($base -split "\s+" | Where-Object { $_.Length -gt 0 })
    if ($tokens.Count -eq 0) {
        throw "Cannot derive region from row: $($row.name)"
    }
    $region1 = $tokens[0]
    $region2 = if ($tokens.Count -gt 1) { $tokens[1] } else { $null }
    return @($region1, $region2)
}

function PlaceType([string]$category) {
    $touristComplexMarker = ([string][char]0xB2E8) + ([string][char]0xC9C0) # Korean "dan-ji"
    if ($category -and $category.Contains($touristComplexMarker)) {
        return "TOURIST_COMPLEX"
    }
    return "ATTRACTION"
}

function SourceId($row) {
    $raw = @(
        (NormalizeText $row.providerCode),
        (NormalizeText $row.name),
        (NormalizeText $row.latitude),
        (NormalizeText $row.longitude)
    ) -join "|"
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($raw)
        $hash = $sha.ComputeHash($bytes)
        return -join ($hash | ForEach-Object { $_.ToString("x2") })
    } finally {
        $sha.Dispose()
    }
}

function Facilities($row) {
    $parts = @(
        @("public", $row.publicFacilities),
        @("lodging", $row.lodgingFacilities),
        @("sports_entertainment", $row.sportsEntertainmentFacilities),
        @("recreation_culture", $row.recreationCultureFacilities),
        @("hospitality", $row.hospitalityFacilities),
        @("support", $row.supportFacilities)
    )
    $values = @()
    foreach ($part in $parts) {
        $text = NormalizeText $part[1]
        if ($null -ne $text) {
            $values += "$($part[0]): $text"
        }
    }
    if ($values.Count -eq 0) {
        return $null
    }
    return $values -join "; "
}

if (-not (Test-Path -LiteralPath $Source)) {
    throw "Source CSV not found: $Source"
}

$rows = Import-Csv -LiteralPath $Source -Encoding Default -Header $headers | Select-Object -Skip 1
if ($rows.Count -eq 0) {
    throw "Source CSV has no rows."
}

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("-- Generated from public tourist attraction standard data.")
$lines.Add("-- Source CSV is intentionally kept in data.local/ and not committed.")
$lines.Add("INSERT INTO places (source, source_id, place_type, name, category, region1, region2, address, road_address, latitude, longitude, phone, summary, description, facilities, raw_payload)")
$lines.Add("VALUES")

$valueLines = New-Object System.Collections.Generic.List[string]
foreach ($row in $rows) {
    if ([string]::IsNullOrWhiteSpace($row.name) -or [string]::IsNullOrWhiteSpace($row.latitude) -or [string]::IsNullOrWhiteSpace($row.longitude)) {
        continue
    }

    $regions = RegionParts $row
    $raw = [ordered]@{
        area = NormalizeText $row.area
        publicFacilities = NormalizeText $row.publicFacilities
        lodgingFacilities = NormalizeText $row.lodgingFacilities
        sportsEntertainmentFacilities = NormalizeText $row.sportsEntertainmentFacilities
        recreationCultureFacilities = NormalizeText $row.recreationCultureFacilities
        hospitalityFacilities = NormalizeText $row.hospitalityFacilities
        supportFacilities = NormalizeText $row.supportFacilities
        designatedDate = NormalizeText $row.designatedDate
        capacity = NormalizeText $row.capacity
        parkingCount = NormalizeText $row.parkingCount
        dataReferenceDate = NormalizeText $row.dataReferenceDate
        providerCode = NormalizeText $row.providerCode
        providerName = NormalizeText $row.providerName
    } | ConvertTo-Json -Compress

    $columns = @(
        (SqlString "PUBLIC_TOURIST_STANDARD"),
        (SqlString (SourceId $row)),
        (SqlString (PlaceType $row.category)),
        (SqlString $row.name),
        (SqlString $row.category),
        (SqlString $regions[0]),
        (SqlString $regions[1]),
        (SqlString $row.address),
        (SqlString $row.roadAddress),
        (SqlDecimal $row.latitude),
        (SqlDecimal $row.longitude),
        (SqlString $row.phone),
        (SqlString (Summary $row.description)),
        (SqlString $row.description),
        (SqlString (Facilities $row)),
        (SqlString $raw)
    )
    $valueLines.Add("    (" + ($columns -join ", ") + ")")
}

if ($valueLines.Count -eq 0) {
    throw "No valid place rows were generated."
}

for ($i = 0; $i -lt $valueLines.Count; $i++) {
    $suffix = if ($i -eq $valueLines.Count - 1) { ";" } else { "," }
    $lines.Add($valueLines[$i] + $suffix)
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($Output, $lines, $utf8NoBom)
Write-Output "Generated $($valueLines.Count) place rows -> $Output"
