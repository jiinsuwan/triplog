param(
    [string]$OutputDir = "data/tourapi/out",
    [int[]]$ContentTypeIds = @(12, 14, 15, 25, 28, 32, 38, 39),
    [ValidateSet("Default", "NationalBasic", "JejuDetailed")]
    [string]$Preset = "Default",
    [ValidateRange(0, [int]::MaxValue)]
    [int]$AreaCode = 0,
    [ValidateRange(0, [int]::MaxValue)]
    [int]$SigunguCode = 0,
    [ValidateRange(0, [int]::MaxValue)]
    [int]$MaxItemsPerType = 20,
    [ValidateRange(0, [int]::MaxValue)]
    [int]$MaxTotalItems = 0,
    [ValidateRange(1, 1000)]
    [int]$RowsPerPage = 100,
    [ValidateRange(0, [int]::MaxValue)]
    [int]$DelayMs = 100,
    [switch]$SkipDetails,
    [switch]$Resume,
    [switch]$ForceReset,
    [switch]$RetryFailedIds,
    [ValidateRange(0, 100)]
    [int]$ResumeOverlapPages = 1,
    [string[]]$DedupeInputPaths = @(),
    [string]$ServiceKeyEnvName = "TOUR_API_KEY",
    [string]$OutputFileName = "",
    [string]$SummaryFileName = "",
    [string]$StateFileName = "",
    [string]$BaseUrl = "https://apis.data.go.kr/B551011/KorService2",
    [string]$MobileOs = "ETC",
    [string]$MobileApp = "TripLog"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ResolvedOutputBaseDir = if ([System.IO.Path]::IsPathRooted($OutputDir)) {
    [System.IO.Path]::GetFullPath($OutputDir)
} else {
    [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $OutputDir))
}

$PresetConfigs = @{
    Default = @{
        OutputSubDir = "default"
        OutputFileName = "tourapi_places_embedding_candidates.jsonl"
        SummaryFileName = "tourapi_fetch_summary.json"
        StateFileName = "state.json"
        FetchDetailCommon = $true
        FetchDetailIntro = $true
        FetchAreaIndex = $true
        DefaultAreaCode = 0
        Purpose = "embedding candidates"
        Note = "Full detail sample for human review and embedding preparation only. It does not write to MySQL."
    }
    NationalBasic = @{
        OutputSubDir = "national-basic"
        OutputFileName = "places.jsonl"
        SummaryFileName = "summary.json"
        StateFileName = "state.json"
        FetchDetailCommon = $false
        FetchDetailIntro = $false
        FetchAreaIndex = $false
        DefaultAreaCode = 0
        Purpose = "national map/search basic data"
        Note = "Nationwide shallow collection for map/search. It intentionally skips per-place detail calls."
    }
    JejuDetailed = @{
        OutputSubDir = "jeju-detailed"
        OutputFileName = "places.jsonl"
        SummaryFileName = "summary.json"
        StateFileName = "state.json"
        FetchDetailCommon = $true
        FetchDetailIntro = $true
        FetchAreaIndex = $true
        DefaultAreaCode = 39
        Purpose = "Jeju recommendation detailed data"
        Note = "Jeju-only detailed collection for recommendation and embedding quality checks. It does not write to MySQL."
    }
}

$PresetConfig = $PresetConfigs[$Preset]
$EffectiveOutputSubDir = [string]$PresetConfig["OutputSubDir"]
$EffectiveOutputFileName = if ($OutputFileName) { $OutputFileName } else { $PresetConfig["OutputFileName"] }
$EffectiveSummaryFileName = if ($SummaryFileName) { $SummaryFileName } else { $PresetConfig["SummaryFileName"] }
$EffectiveStateFileName = if ($StateFileName) { $StateFileName } else { $PresetConfig["StateFileName"] }
$EffectiveAreaCode = if ($AreaCode -gt 0) { $AreaCode } else { [int]$PresetConfig["DefaultAreaCode"] }
$FetchDetailCommon = (-not $SkipDetails) -and [bool]$PresetConfig["FetchDetailCommon"]
$FetchDetailIntro = (-not $SkipDetails) -and [bool]$PresetConfig["FetchDetailIntro"]
$FetchAreaIndex = [bool]$PresetConfig["FetchAreaIndex"]
$ResolvedOutputDir = if ($EffectiveOutputSubDir) {
    [System.IO.Path]::GetFullPath((Join-Path $ResolvedOutputBaseDir $EffectiveOutputSubDir))
} else {
    $ResolvedOutputBaseDir
}

foreach ($fileNameCheck in @(
        @{ Name = "OutputFileName"; Value = $EffectiveOutputFileName },
        @{ Name = "SummaryFileName"; Value = $EffectiveSummaryFileName },
        @{ Name = "StateFileName"; Value = $EffectiveStateFileName }
    )) {
    $name = [string]$fileNameCheck["Name"]
    $value = [string]$fileNameCheck["Value"]
    $reservedNames = @("CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9")
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($value).ToUpperInvariant()
    if ([string]::IsNullOrWhiteSpace($value) -or $value -ne $value.TrimEnd(" ", ".") -or
            $value -eq "." -or $value -eq ".." -or
            $value.IndexOfAny([System.IO.Path]::GetInvalidFileNameChars()) -ge 0 -or
            $reservedNames -contains $baseName) {
        throw "$name is not a safe file name: $value"
    }
    if ([System.IO.Path]::IsPathRooted($value) -or [System.IO.Path]::GetFileName($value) -ne $value) {
        throw "$name must be a file name only: $value"
    }
}

$OutputPath = Join-Path $ResolvedOutputDir $EffectiveOutputFileName
$SummaryPath = Join-Path $ResolvedOutputDir $EffectiveSummaryFileName
$StatePath = Join-Path $ResolvedOutputDir $EffectiveStateFileName
$AreaIndexPath = Join-Path $ResolvedOutputDir "area-index.json"

$distinctOutputFiles = @(@(
    [System.IO.Path]::GetFullPath($OutputPath).ToLowerInvariant(),
    [System.IO.Path]::GetFullPath($SummaryPath).ToLowerInvariant(),
    [System.IO.Path]::GetFullPath($StatePath).ToLowerInvariant(),
    [System.IO.Path]::GetFullPath($AreaIndexPath).ToLowerInvariant()
) | Select-Object -Unique)
if ($distinctOutputFiles.Count -ne 4) {
    throw "OutputFileName, SummaryFileName, StateFileName, and area-index.json must be distinct."
}

$ContentTypes = @{
    "12" = @{ PlaceType = "ATTRACTION"; Label = "attraction"; Category = "ATTRACTION" };
    "14" = @{ PlaceType = "CULTURE"; Label = "culture facility"; Category = "CULTURE" };
    "15" = @{ PlaceType = "EVENT"; Label = "event festival"; Category = "EVENT" };
    "25" = @{ PlaceType = "TRAVEL_COURSE"; Label = "travel course"; Category = "TRAVEL_COURSE" };
    "28" = @{ PlaceType = "LEISURE"; Label = "leisure sports"; Category = "LEISURE" };
    "32" = @{ PlaceType = "LODGING"; Label = "lodging"; Category = "LODGING" };
    "38" = @{ PlaceType = "SHOPPING"; Label = "shopping"; Category = "SHOPPING" };
    "39" = @{ PlaceType = "RESTAURANT"; Label = "restaurant"; Category = "RESTAURANT" };
}

$DetailLabels = @{
    accomcount = "capacity"
    chkbabycarriage = "stroller rental"
    chkcreditcard = "credit card"
    chkpet = "pet allowed"
    expagerange = "experience age"
    expguide = "experience guide"
    infocenter = "info center"
    opendate = "open date"
    parking = "parking"
    restdate = "closed days"
    useseason = "season"
    usetime = "use time"
    scale = "scale"
    usefee = "fee"
    discountinfo = "discount"
    parkingfee = "parking fee"
    playtime = "play time"
    eventstartdate = "event start date"
    eventenddate = "event end date"
    eventplace = "event place"
    agelimit = "age limit"
    spendtimefestival = "duration"
    sponsor1 = "host"
    sponsor1tel = "host contact"
    sponsor2 = "organizer"
    sponsor2tel = "organizer contact"
    eventhomepage = "event homepage"
    firstmenu = "signature menu"
    treatmenu = "menu"
    opentimefood = "opening hours"
    restdatefood = "closed days"
    parkingfood = "parking"
    chkcreditcardfood = "credit card"
    discountinfofood = "discount"
    infocenterfood = "info center"
    checkintime = "check-in"
    checkouttime = "check-out"
    roomcount = "room count"
    reservationlodging = "reservation"
    parkinglodging = "parking"
    pickup = "pickup"
    foodplace = "food place"
    barbecue = "barbecue"
    campfire = "campfire"
    fitness = "fitness"
    sauna = "sauna"
    sports = "sports facility"
    refundregulation = "refund policy"
    saleitem = "sale item"
    saleitemcost = "price"
    fairday = "market day"
    opentime = "opening hours"
    restdateshopping = "closed days"
    parkingshopping = "parking"
}

function Get-Field {
    param(
        [object]$Object,
        [string]$Name
    )

    if ($null -eq $Object) {
        return $null
    }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property -or $null -eq $property.Value) {
        return $null
    }
    $value = [string]$property.Value
    if (-not $value.Trim()) {
        return $null
    }
    return $value.Trim()
}

function Get-PropValue {
    param(
        [object]$Object,
        [string]$Name
    )

    if ($null -eq $Object) {
        return $null
    }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) {
        return $null
    }
    return $property.Value
}

function Get-ServiceKey {
    param([string]$Name)

    $envValue = [Environment]::GetEnvironmentVariable($Name)
    if ($envValue -and $envValue.Trim()) {
        return $envValue.Trim()
    }

    $envPath = Join-Path $RepoRoot ".env"
    if (Test-Path -LiteralPath $envPath) {
        $escapedName = [regex]::Escape($Name)
        foreach ($line in Get-Content -LiteralPath $envPath) {
            if ($line -match "^\s*$escapedName\s*=\s*(.+?)\s*$") {
                $value = $Matches[1].Trim().Trim('"').Trim("'")
                if ($value) {
                    return $value
                }
            }
        }
    }

    throw "$Name is required. Set it in the current shell or root .env."
}

$script:ServiceKey = Get-ServiceKey -Name $ServiceKeyEnvName

function New-TourApiUri {
    param(
        [string]$Path,
        [hashtable]$Params
    )

    $pairs = New-Object System.Collections.Generic.List[string]
    # Use the data.go.kr Encoding key as-is. Other params are encoded below.
    $pairs.Add("serviceKey=$script:ServiceKey")
    foreach ($key in $Params.Keys) {
        $value = $Params[$key]
        if ($null -eq $value -or [string]$value -eq "") {
            continue
        }
        $pair = "{0}={1}" -f ([uri]::EscapeDataString([string]$key)), ([uri]::EscapeDataString([string]$value))
        $pairs.Add($pair)
    }

    return "{0}/{1}?{2}" -f $BaseUrl.TrimEnd("/"), $Path.TrimStart("/"), ($pairs -join "&")
}

function Invoke-TourApi {
    param(
        [string]$Path,
        [hashtable]$Params
    )

    $uri = New-TourApiUri -Path $Path -Params $Params
    $webResponse = Invoke-WebRequest -Method Get -Uri $uri -TimeoutSec 30 -UseBasicParsing
    $content = $webResponse.Content
    if ($webResponse.RawContentStream) {
        $webResponse.RawContentStream.Position = 0
        $reader = New-Object System.IO.StreamReader($webResponse.RawContentStream, [System.Text.Encoding]::UTF8)
        $content = $reader.ReadToEnd()
    }
    $response = $content | ConvertFrom-Json
    $responseNode = Get-PropValue $response "response"
    $headerNode = Get-PropValue $responseNode "header"
    $code = Get-Field $headerNode "resultCode"
    if ($code -and $code -ne "0000") {
        $message = Get-Field $headerNode "resultMsg"
        throw "TourAPI error code=$code message=$message path=$Path"
    }
    return $response
}

function Get-Items {
    param([object]$Response)

    $responseNode = Get-PropValue $Response "response"
    $bodyNode = Get-PropValue $responseNode "body"
    $itemsNode = Get-PropValue $bodyNode "items"
    if ($null -eq $itemsNode -or $itemsNode -is [string]) {
        return @()
    }
    $item = Get-PropValue $itemsNode "item"
    if ($null -eq $item) {
        return @()
    }
    return @($item)
}

function Get-TotalCount {
    param([object]$Response)

    $responseNode = Get-PropValue $Response "response"
    $bodyNode = Get-PropValue $responseNode "body"
    $value = Get-Field $bodyNode "totalCount"
    $totalCount = 0
    if (-not [int]::TryParse([string]$value, [ref]$totalCount)) {
        throw "TourAPI response missing numeric totalCount."
    }
    return $totalCount
}

function Resolve-InputFiles {
    param([string[]]$Paths)

    $files = New-Object System.Collections.Generic.List[string]
    foreach ($path in $Paths) {
        if (-not $path) {
            continue
        }

        $candidate = if ([System.IO.Path]::IsPathRooted($path)) {
            [System.IO.Path]::GetFullPath($path)
        } else {
            [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $path))
        }

        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            $files.Add($candidate)
            continue
        }
        if (Test-Path -LiteralPath $candidate -PathType Container) {
            foreach ($file in Get-ChildItem -LiteralPath $candidate -File -ErrorAction SilentlyContinue) {
                $files.Add($file.FullName)
            }
            continue
        }

        Write-Warning "Dedupe input path not found: $candidate"
    }
    return $files
}

function Add-ExistingIdsFromJsonl {
    param(
        [System.Collections.Generic.HashSet[string]]$Ids,
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return 0
    }

    $added = 0
    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        if (-not $line.Trim()) {
            continue
        }

        try {
            $record = $line | ConvertFrom-Json
            $sourceId = First-Field "sourceId" @($record)
            if (-not $sourceId) {
                $sourceId = First-Field "contentid" @($record)
            }
            if ($sourceId -and $Ids.Add($sourceId)) {
                $added++
            }
        } catch {
            Write-Warning "Failed to parse dedupe input line path=${Path}: $($_.Exception.Message)"
        }
    }

    return $added
}

function New-FetchState {
    return [ordered]@{
        schemaVersion = 1
        preset = $Preset
        outputPath = [System.IO.Path]::GetFullPath($OutputPath)
        areaCode = $EffectiveAreaCode
        sigunguCode = $SigunguCode
        rowsPerPage = $RowsPerPage
        fetchDetailCommon = $FetchDetailCommon
        fetchDetailIntro = $FetchDetailIntro
        cursors = [ordered]@{}
        failedIds = @()
        updatedAt = (Get-Date).ToString("o")
    }
}

function Convert-CursorsToHashtable {
    param([object]$Cursors)

    $result = [ordered]@{}
    if ($null -eq $Cursors) {
        return $result
    }

    foreach ($property in $Cursors.PSObject.Properties) {
        $value = $property.Value
        $nextPageNo = 1
        $lastCompletedPageNo = 0
        $totalCount = $null
        $savedTotalForType = 0
        $completed = $false

        if ($null -ne $value) {
            if ($value.PSObject.Properties["nextPageNo"]) {
                $nextPageNo = [int]$value.nextPageNo
            }
            if ($value.PSObject.Properties["lastCompletedPageNo"]) {
                $lastCompletedPageNo = [int]$value.lastCompletedPageNo
            }
            if ($value.PSObject.Properties["totalCount"] -and $null -ne $value.totalCount) {
                $totalCount = [int]$value.totalCount
            }
            if ($value.PSObject.Properties["savedTotalForType"]) {
                $savedTotalForType = [int]$value.savedTotalForType
            } elseif ($value.PSObject.Properties["savedForType"]) {
                $savedTotalForType = [int]$value.savedForType
            }
            if ($value.PSObject.Properties["completed"]) {
                $completed = [bool]$value.completed
            }
        }

        if ($nextPageNo -lt 1) {
            $nextPageNo = 1
        }
        if (-not $completed -and $null -ne $totalCount -and $totalCount -gt 0 -and
                ($lastCompletedPageNo * $RowsPerPage -ge $totalCount)) {
            $completed = $true
        }

        $result[$property.Name] = [ordered]@{
            nextPageNo = $nextPageNo
            lastCompletedPageNo = $lastCompletedPageNo
            totalCount = $totalCount
            savedTotalForType = $savedTotalForType
            completed = $completed
            updatedAt = (Get-Date).ToString("o")
        }
    }

    return $result
}

function Assert-FetchStateMatches {
    param([object]$Stored)

    $storedPreset = Get-Field $Stored "preset"
    if ($storedPreset -and $storedPreset -ne $Preset) {
        throw "State preset mismatch. state=$storedPreset current=$Preset. Use the matching preset or -ForceReset."
    }

    $storedOutputPath = Get-Field $Stored "outputPath"
    if ($storedOutputPath) {
        $storedOutputFullPath = [System.IO.Path]::GetFullPath($storedOutputPath).ToLowerInvariant()
        $currentOutputFullPath = [System.IO.Path]::GetFullPath($OutputPath).ToLowerInvariant()
        if ($storedOutputFullPath -ne $currentOutputFullPath) {
            throw "State outputPath mismatch. state=$storedOutputPath current=$OutputPath. Use the matching output or -ForceReset."
        }
    }

    foreach ($check in @(
            @{ Name = "areaCode"; Current = $EffectiveAreaCode },
            @{ Name = "sigunguCode"; Current = $SigunguCode },
            @{ Name = "rowsPerPage"; Current = $RowsPerPage }
        )) {
        $name = [string]$check["Name"]
        $storedValue = Get-Field $Stored $name
        if ($storedValue -and [int]$storedValue -ne [int]$check["Current"]) {
            throw "State $name mismatch. state=$storedValue current=$($check["Current"]). Use the same option or -ForceReset."
        }
    }

    foreach ($check in @(
            @{ Name = "fetchDetailCommon"; Current = $FetchDetailCommon },
            @{ Name = "fetchDetailIntro"; Current = $FetchDetailIntro }
        )) {
        $name = [string]$check["Name"]
        $storedValue = Get-PropValue $Stored $name
        if ($null -eq $storedValue) {
            throw "State missing $name. Use -ForceReset to rebuild state with the current script."
        }
        if ([bool]$storedValue -ne [bool]$check["Current"]) {
            throw "State $name mismatch. state=$storedValue current=$($check["Current"]). Use the same detail options or -ForceReset."
        }
    }
}

function Read-FetchState {
    if (-not $Resume -or -not (Test-Path -LiteralPath $StatePath)) {
        return New-FetchState
    }

    if (-not (Test-Path -LiteralPath $OutputPath)) {
        throw "Cannot resume because state exists but output file is missing. state=$StatePath output=$OutputPath. Use -ForceReset to start over."
    }

    try {
        $stored = Get-Content -LiteralPath $StatePath -Encoding UTF8 -Raw | ConvertFrom-Json
        Assert-FetchStateMatches $stored
        $state = New-FetchState
        $state["cursors"] = Convert-CursorsToHashtable $stored.cursors
        $storedFailedIds = Get-PropValue $stored "failedIds"
        if ($null -ne $storedFailedIds) {
            $state["failedIds"] = @($storedFailedIds)
        }
        return $state
    } catch {
        throw "Failed to read or validate state file. path=${StatePath}: $($_.Exception.Message)"
    }
}

function Get-FailedIdsFromState {
    param([System.Collections.IDictionary]$State)

    $ids = New-Object "System.Collections.Generic.HashSet[string]"
    if ($State.Contains("failedIds") -and $null -ne $State["failedIds"]) {
        foreach ($id in @($State["failedIds"])) {
            if ($id) {
                $ids.Add([string]$id) | Out-Null
            }
        }
    }
    return ,$ids
}

function Get-NextPageNo {
    param(
        [System.Collections.IDictionary]$State,
        [int]$ContentTypeId
    )

    $key = [string]$ContentTypeId
    if ($State["cursors"].Contains($key)) {
        $nextPageNo = [int]$State["cursors"][$key]["nextPageNo"]
        if ($nextPageNo -gt 0) {
            return $nextPageNo
        }
    }
    return 1
}

function Test-ContentTypeCompleted {
    param(
        [System.Collections.IDictionary]$State,
        [int]$ContentTypeId
    )

    $key = [string]$ContentTypeId
    return $State["cursors"].Contains($key) -and [bool]$State["cursors"][$key]["completed"]
}

function Get-SavedTotalForType {
    param(
        [System.Collections.IDictionary]$State,
        [int]$ContentTypeId
    )

    $key = [string]$ContentTypeId
    if ($State["cursors"].Contains($key)) {
        return [int]$State["cursors"][$key]["savedTotalForType"]
    }
    return 0
}

function Save-FetchState {
    param(
        [System.Collections.IDictionary]$State,
        [System.Collections.Generic.HashSet[string]]$FailedIds
    )

    $State["failedIds"] = @($FailedIds | Sort-Object)
    $State["updatedAt"] = (Get-Date).ToString("o")
    $State | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $StatePath -Encoding UTF8
}

function Update-FetchState {
    param(
        [System.Collections.IDictionary]$State,
        [int]$ContentTypeId,
        [int]$CompletedPageNo,
        [int]$NextPageNo,
        [int]$TotalCount,
        [int]$SavedTotalForType,
        [bool]$Completed,
        [System.Collections.Generic.HashSet[string]]$FailedIds
    )

    $key = [string]$ContentTypeId
    $State["cursors"][$key] = [ordered]@{
        nextPageNo = $NextPageNo
        lastCompletedPageNo = $CompletedPageNo
        totalCount = $TotalCount
        savedTotalForType = $SavedTotalForType
        completed = $Completed
        updatedAt = (Get-Date).ToString("o")
    }
    Save-FetchState $State $FailedIds
}

function First-Field {
    param(
        [string]$Name,
        [object[]]$Objects
    )

    foreach ($object in $Objects) {
        $value = Get-Field $object $Name
        if ($value) {
            return $value
        }
    }
    return $null
}

function Clean-Text {
    param([string]$Text)

    if (-not $Text) {
        return $null
    }
    $decoded = [System.Net.WebUtility]::HtmlDecode($Text)
    $cleaned = $decoded -replace "<[^>]+>", " "
    $cleaned = $cleaned -replace "\s+", " "
    $cleaned = $cleaned.Trim()
    if (-not $cleaned) {
        return $null
    }
    return $cleaned
}

function To-NumberOrNull {
    param([string]$Value)

    if (-not $Value) {
        return $null
    }
    $number = 0.0
    if ([double]::TryParse($Value, [Globalization.NumberStyles]::Float,
            [Globalization.CultureInfo]::InvariantCulture, [ref]$number)) {
        return $number
    }
    return $null
}

function Test-KoreaCoordinate {
    param(
        [object]$Latitude,
        [object]$Longitude
    )

    if ($null -eq $Latitude -or $null -eq $Longitude) {
        return $false
    }
    return $Latitude -ge 32 -and $Latitude -le 39 -and $Longitude -ge 124 -and $Longitude -le 132
}

function Get-AreaIndex {
    param([int]$OnlyAreaCode = 0)

    $areas = @{}
    $sigungus = @{}
    $areaResponse = Invoke-TourApi "areaCode2" @{
        numOfRows = 200
        pageNo = 1
        MobileOS = $MobileOs
        MobileApp = $MobileApp
        _type = "json"
    }

    foreach ($area in Get-Items $areaResponse) {
        $areaCode = Get-Field $area "code"
        $areaName = Get-Field $area "name"
        if ($areaCode -and $areaName) {
            $areas[$areaCode] = $areaName
            if ($OnlyAreaCode -gt 0 -and [string]$OnlyAreaCode -ne $areaCode) {
                continue
            }
            $sigunguResponse = Invoke-TourApi "areaCode2" @{
                numOfRows = 300
                pageNo = 1
                MobileOS = $MobileOs
                MobileApp = $MobileApp
                _type = "json"
                areaCode = $areaCode
            }
            foreach ($sigungu in Get-Items $sigunguResponse) {
                $sigunguCode = Get-Field $sigungu "code"
                $sigunguName = Get-Field $sigungu "name"
                if ($sigunguCode -and $sigunguName) {
                    $sigungus["${areaCode}:$sigunguCode"] = $sigunguName
                }
            }
            Start-Sleep -Milliseconds $DelayMs
        }
    }

    return @{ Areas = $areas; Sigungus = $sigungus }
}

function Convert-PropertiesToHashtable {
    param([object]$Object)

    $table = @{}
    if ($null -eq $Object) {
        return $table
    }
    foreach ($property in $Object.PSObject.Properties) {
        if ($null -ne $property.Value) {
            $table[$property.Name] = [string]$property.Value
        }
    }
    return $table
}

function Read-AreaIndex {
    if (-not $Resume -or -not (Test-Path -LiteralPath $AreaIndexPath)) {
        return $null
    }

    try {
        $stored = Get-Content -LiteralPath $AreaIndexPath -Encoding UTF8 -Raw | ConvertFrom-Json
        $storedAreaCode = Get-Field $stored "areaCode"
        if ($storedAreaCode -and [int]$storedAreaCode -ne $EffectiveAreaCode) {
            Write-Warning "Cached area index areaCode mismatch; it will be fetched again. cache=$storedAreaCode current=$EffectiveAreaCode"
            return $null
        }
        return @{
            Areas = Convert-PropertiesToHashtable $stored.Areas
            Sigungus = Convert-PropertiesToHashtable $stored.Sigungus
        }
    } catch {
        Write-Warning "Failed to read cached area index; it will be fetched again. path=${AreaIndexPath}: $($_.Exception.Message)"
        return $null
    }
}

function Save-AreaIndex {
    param([hashtable]$AreaIndex)

    $payload = [ordered]@{
        fetchedAt = (Get-Date).ToString("o")
        areaCode = $EffectiveAreaCode
        Areas = $AreaIndex["Areas"]
        Sigungus = $AreaIndex["Sigungus"]
    }
    $payload | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $AreaIndexPath -Encoding UTF8
}

function Get-DetailCommon {
    param(
        [string]$ContentId,
        [int]$ContentTypeId
    )

    $response = Invoke-TourApi "detailCommon2" @{
        MobileOS = $MobileOs
        MobileApp = $MobileApp
        _type = "json"
        contentId = $ContentId
    }
    $items = @(Get-Items $response)
    if ($items.Count -eq 0) {
        return $null
    }
    return $items[0]
}

function Get-DetailIntro {
    param(
        [string]$ContentId,
        [int]$ContentTypeId
    )

    $response = Invoke-TourApi "detailIntro2" @{
        MobileOS = $MobileOs
        MobileApp = $MobileApp
        _type = "json"
        contentId = $ContentId
        contentTypeId = $ContentTypeId
    }
    $items = @(Get-Items $response)
    if ($items.Count -eq 0) {
        return $null
    }
    return $items[0]
}

function Get-DetailEntries {
    param([object]$Intro)

    $skip = @("contentid", "contenttypeid")
    $entries = @()
    if ($null -eq $Intro) {
        return $entries
    }

    foreach ($property in $Intro.PSObject.Properties) {
        if ($skip -contains $property.Name.ToLowerInvariant()) {
            continue
        }
        $value = Clean-Text ([string]$property.Value)
        if (-not $value) {
            continue
        }
        $label = $DetailLabels[$property.Name.ToLowerInvariant()]
        if (-not $label) {
            $label = $property.Name
        }
        $entries += [ordered]@{
            key = $property.Name
            label = $label
            value = $value
        }
    }
    return $entries
}

function Add-TextPart {
    param(
        [System.Collections.Generic.List[string]]$Parts,
        [string]$Label,
        [string]$Value
    )

    if ($Value) {
        $Parts.Add("${Label}: $Value")
    }
}

function Build-EmbeddingText {
    param(
        [string]$Name,
        [string]$TypeLabel,
        [string]$Region1,
        [string]$Region2,
        [string]$Address,
        [string]$Overview,
        [array]$Details
    )

    $parts = New-Object System.Collections.Generic.List[string]
    Add-TextPart $parts "name" $Name
    Add-TextPart $parts "type" $TypeLabel
    Add-TextPart $parts "region" (($Region1, $Region2 | Where-Object { $_ }) -join " ")
    Add-TextPart $parts "address" $Address
    Add-TextPart $parts "overview" $Overview
    foreach ($detail in $Details) {
        Add-TextPart $parts $detail.label $detail.value
    }
    return ($parts -join "`n")
}

function Convert-ToCandidate {
    param(
        [object]$ListItem,
        [object]$DetailCommon,
        [object]$DetailIntro,
        [hashtable]$AreaIndex,
        [int]$ContentTypeId
    )

    $contentId = First-Field "contentid" @($ListItem, $DetailCommon)
    $name = Clean-Text (First-Field "title" @($DetailCommon, $ListItem))
    if (-not $contentId -or -not $name) {
        return $null
    }

    $typeInfo = $ContentTypes[[string]$ContentTypeId]
    if ($null -eq $typeInfo) {
        $typeInfo = @{ PlaceType = "PLACE"; Label = "place"; Category = "PLACE" }
    }

    $areaCode = First-Field "areacode" @($DetailCommon, $ListItem)
    $sigunguCode = First-Field "sigungucode" @($DetailCommon, $ListItem)
    $areas = $AreaIndex["Areas"]
    $sigungus = $AreaIndex["Sigungus"]
    $region1 = if ($areaCode -and $areas.ContainsKey($areaCode)) { $areas[$areaCode] } else { $null }
    $region2Key = if ($areaCode -and $sigunguCode) { "${areaCode}:$sigunguCode" } else { $null }
    $region2 = if ($region2Key -and $sigungus.ContainsKey($region2Key)) { $sigungus[$region2Key] } else { $null }
    $addr1 = Clean-Text (First-Field "addr1" @($DetailCommon, $ListItem))
    $addr2 = Clean-Text (First-Field "addr2" @($DetailCommon, $ListItem))
    $address = (($addr1, $addr2 | Where-Object { $_ }) -join " ")
    if (-not $region1 -and $addr1) {
        $addressParts = @($addr1 -split "\s+" | Where-Object { $_ })
        if ($addressParts.Count -gt 0) {
            $region1 = $addressParts[0]
        }
        if ($addressParts.Count -gt 1) {
            $region2 = $addressParts[1]
        }
    }
    $overview = Clean-Text (First-Field "overview" @($DetailCommon))
    $details = Get-DetailEntries $DetailIntro
    $embeddingText = Build-EmbeddingText $name $typeInfo["Label"] $region1 $region2 $address $overview $details

    return [ordered]@{
        schemaVersion = 1
        source = "TOUR_API"
        sourceId = $contentId
        contentTypeId = $ContentTypeId
        placeType = $typeInfo["PlaceType"]
        typeLabel = $typeInfo["Label"]
        category = $typeInfo["Category"]
        name = $name
        region = [ordered]@{
            areaCode = $areaCode
            sigunguCode = $sigunguCode
            region1 = $region1
            region2 = $region2
        }
        categoryCodes = [ordered]@{
            cat1 = First-Field "cat1" @($DetailCommon, $ListItem)
            cat2 = First-Field "cat2" @($DetailCommon, $ListItem)
            cat3 = First-Field "cat3" @($DetailCommon, $ListItem)
        }
        localCodes = [ordered]@{
            lDongRegnCd = First-Field "lDongRegnCd" @($DetailCommon, $ListItem)
            lDongSignguCd = First-Field "lDongSignguCd" @($DetailCommon, $ListItem)
            lclsSystm1 = First-Field "lclsSystm1" @($DetailCommon, $ListItem)
            lclsSystm2 = First-Field "lclsSystm2" @($DetailCommon, $ListItem)
            lclsSystm3 = First-Field "lclsSystm3" @($DetailCommon, $ListItem)
        }
        address = $address
        latitude = To-NumberOrNull (First-Field "mapy" @($DetailCommon, $ListItem))
        longitude = To-NumberOrNull (First-Field "mapx" @($DetailCommon, $ListItem))
        phone = Clean-Text (First-Field "tel" @($DetailCommon, $ListItem))
        overview = $overview
        details = $details
        embeddingText = $embeddingText
        fetchedAt = (Get-Date).ToString("o")
    }
}

[System.IO.Directory]::CreateDirectory($ResolvedOutputDir) | Out-Null

if ($Resume -and $ForceReset) {
    throw "Use either -Resume or -ForceReset, not both."
}

if (-not $Resume -and -not $ForceReset -and
        ((Test-Path -LiteralPath $OutputPath) -or (Test-Path -LiteralPath $StatePath))) {
    throw "Output/state already exists. Use -Resume to continue or -ForceReset to delete and start over. output=$OutputPath state=$StatePath"
}

$existingIds = New-Object "System.Collections.Generic.HashSet[string]"
$dedupeFiles = New-Object System.Collections.Generic.List[string]

if ($Resume -and (Test-Path -LiteralPath $OutputPath)) {
    $dedupeFiles.Add($OutputPath)
} elseif ($ForceReset -and (Test-Path -LiteralPath $OutputPath)) {
    Remove-Item -LiteralPath $OutputPath -Force
}
if ($ForceReset -and (Test-Path -LiteralPath $StatePath)) {
    Remove-Item -LiteralPath $StatePath -Force
}
if ($ForceReset -and (Test-Path -LiteralPath $SummaryPath)) {
    Remove-Item -LiteralPath $SummaryPath -Force
}
if ($ForceReset -and (Test-Path -LiteralPath $AreaIndexPath)) {
    Remove-Item -LiteralPath $AreaIndexPath -Force
}

foreach ($file in Resolve-InputFiles $DedupeInputPaths) {
    $dedupeFiles.Add($file)
}

foreach ($dedupeFile in ($dedupeFiles | Select-Object -Unique)) {
    $added = Add-ExistingIdsFromJsonl $existingIds $dedupeFile
    Write-Host "Loaded dedupe ids: $added from $dedupeFile"
}

$fetchState = Read-FetchState
if (-not (Test-Path -LiteralPath $OutputPath)) {
    [System.IO.File]::WriteAllText($OutputPath, "", [System.Text.Encoding]::UTF8)
}
$failedIds = Get-FailedIdsFromState $fetchState
if ($RetryFailedIds) {
    $failedIds.Clear()
    $fetchState["failedIds"] = @()
    foreach ($cursorKey in @($fetchState["cursors"].Keys)) {
        $fetchState["cursors"][$cursorKey]["nextPageNo"] = 1
        $fetchState["cursors"][$cursorKey]["lastCompletedPageNo"] = 0
        $fetchState["cursors"][$cursorKey]["completed"] = $false
    }
    Save-FetchState $fetchState $failedIds
} else {
    foreach ($failedId in $failedIds) {
        $existingIds.Add($failedId) | Out-Null
    }
}

Write-Host "Fetching TourAPI data..."
Write-Host "Preset: $Preset ($($PresetConfig["Purpose"]))"
Write-Host "OutputDir: $ResolvedOutputDir"
Write-Host "Output: $OutputPath"
Write-Host "Summary: $SummaryPath"
Write-Host "State: $StatePath"
Write-Host "AreaIndex: $AreaIndexPath"
Write-Host "ServiceKeyEnvName: $ServiceKeyEnvName"
Write-Host "Resume: $Resume"
Write-Host "ForceReset: $ForceReset"
Write-Host "RetryFailedIds: $RetryFailedIds"
Write-Host "ResumeOverlapPages: $ResumeOverlapPages"
Write-Host "ExistingIds: $($existingIds.Count)"
Write-Host "FailedIds: $($failedIds.Count)"
Write-Host "DetailCommon: $FetchDetailCommon"
Write-Host "DetailIntro: $FetchDetailIntro"
Write-Host "AreaIndex: $FetchAreaIndex"
Write-Host "AreaCode: $EffectiveAreaCode"
Write-Host "SigunguCode: $SigunguCode"
Write-Host "MaxItemsPerType: $MaxItemsPerType"
Write-Host "MaxTotalItems: $MaxTotalItems"

$allRequestedContentTypesCompleted = $true
foreach ($contentTypeId in $ContentTypeIds) {
    if (-not (Test-ContentTypeCompleted $fetchState $contentTypeId)) {
        $allRequestedContentTypesCompleted = $false
        break
    }
}

$areaIndex = @{ Areas = @{}; Sigungus = @{} }
if ($FetchAreaIndex -and -not $allRequestedContentTypesCompleted) {
    $areaIndex = Read-AreaIndex
    if ($null -eq $areaIndex) {
        $areaIndex = Get-AreaIndex -OnlyAreaCode $EffectiveAreaCode
        Save-AreaIndex $areaIndex
    } else {
        Write-Host "Loaded cached area index: $AreaIndexPath"
    }
} elseif ($FetchAreaIndex) {
    Write-Host "Skipping area index because all requested content types are completed."
}
$counts = [ordered]@{}
$skipped = 0
$duplicateSkipped = 0
$failedDetailSkipped = 0
$invalidCoordinateSkipped = 0
$totalSaved = 0

foreach ($contentTypeId in $ContentTypeIds) {
    if ($MaxTotalItems -gt 0 -and $totalSaved -ge $MaxTotalItems) {
        break
    }

    if (Test-ContentTypeCompleted $fetchState $contentTypeId) {
        $counts[[string]$contentTypeId] = 0
        Write-Host "Skipping completed contentTypeId=$contentTypeId"
        continue
    }

    $savedForType = 0
    $savedTotalBefore = Get-SavedTotalForType $fetchState $contentTypeId
    $pageNo = Get-NextPageNo $fetchState $contentTypeId
    if ($Resume -and $ResumeOverlapPages -gt 0) {
        $pageNo = [Math]::Max(1, $pageNo - $ResumeOverlapPages)
    }
    $typeKey = [string]$contentTypeId
    $typeLabel = if ($ContentTypes.ContainsKey($typeKey)) { $ContentTypes[$typeKey]["Label"] } else { "unknown" }
    Write-Host "Fetching contentTypeId=$contentTypeId ($typeLabel) from page=$pageNo"

    while ($true) {
        $listParams = @{
            numOfRows = $RowsPerPage
            pageNo = $pageNo
            MobileOS = $MobileOs
            MobileApp = $MobileApp
            _type = "json"
            arrange = "C"
            contentTypeId = $contentTypeId
        }
        if ($EffectiveAreaCode -gt 0) {
            $listParams["areaCode"] = $EffectiveAreaCode
        }
        if ($SigunguCode -gt 0) {
            $listParams["sigunguCode"] = $SigunguCode
        }

        $response = Invoke-TourApi "areaBasedList2" $listParams
        $items = @(Get-Items $response)
        if ($items.Count -eq 0) {
            Update-FetchState $fetchState $contentTypeId ($pageNo - 1) $pageNo 0 ($savedTotalBefore + $savedForType) $true $failedIds
            break
        }

        $pageStoppedEarly = $false
        foreach ($item in $items) {
            if ($MaxTotalItems -gt 0 -and $totalSaved -ge $MaxTotalItems) {
                $pageStoppedEarly = $true
                break
            }
            if ($MaxItemsPerType -gt 0 -and $savedForType -ge $MaxItemsPerType) {
                $pageStoppedEarly = $true
                break
            }

            $contentId = Get-Field $item "contentid"
            if ($contentId -and $existingIds.Contains($contentId)) {
                $duplicateSkipped++
                continue
            }

            $detailCommon = $null
            $detailIntro = $null
            $detailFetchFailed = $false
            if ($FetchDetailCommon -and $contentId) {
                try {
                    $detailCommon = Get-DetailCommon $contentId $contentTypeId
                    Start-Sleep -Milliseconds $DelayMs
                } catch {
                    Write-Warning "DetailCommon fetch failed contentId=$contentId contentTypeId=${contentTypeId}: $($_.Exception.Message)"
                    $detailFetchFailed = $true
                }
            }
            if ($FetchDetailCommon -and $null -eq $detailCommon) {
                Write-Warning "DetailCommon empty contentId=$contentId contentTypeId=$contentTypeId"
                $detailFetchFailed = $true
            }
            if ($FetchDetailIntro -and $contentId -and -not $detailFetchFailed) {
                try {
                    $detailIntro = Get-DetailIntro $contentId $contentTypeId
                    Start-Sleep -Milliseconds $DelayMs
                } catch {
                    Write-Warning "DetailIntro fetch failed contentId=$contentId contentTypeId=${contentTypeId}: $($_.Exception.Message)"
                    $detailFetchFailed = $true
                }
            }
            if ($FetchDetailIntro -and $null -eq $detailIntro) {
                Write-Warning "DetailIntro empty contentId=$contentId contentTypeId=$contentTypeId"
                $detailFetchFailed = $true
            }
            if ($detailFetchFailed) {
                $failedIds.Add($contentId) | Out-Null
                $existingIds.Add($contentId) | Out-Null
                $failedDetailSkipped++
                Save-FetchState $fetchState $failedIds
                continue
            }

            $candidate = Convert-ToCandidate $item $detailCommon $detailIntro $areaIndex $contentTypeId
            if ($null -eq $candidate) {
                if ($contentId) {
                    $failedIds.Add($contentId) | Out-Null
                    $existingIds.Add($contentId) | Out-Null
                    Save-FetchState $fetchState $failedIds
                }
                $skipped++
                continue
            }
            if (-not (Test-KoreaCoordinate $candidate.latitude $candidate.longitude)) {
                if ($contentId) {
                    $existingIds.Add($contentId) | Out-Null
                }
                $invalidCoordinateSkipped++
                Write-Warning "Skipping out-of-Korea coordinate contentId=$contentId contentTypeId=$contentTypeId latitude=$($candidate.latitude) longitude=$($candidate.longitude)"
                continue
            }

            $candidate | ConvertTo-Json -Depth 20 -Compress | Add-Content -LiteralPath $OutputPath -Encoding UTF8
            if ($contentId) {
                $existingIds.Add($contentId) | Out-Null
            }
            $savedForType++
            $totalSaved++
        }

        $totalCount = Get-TotalCount $response
        Write-Host "  page=$pageNo savedForType=$savedForType totalCount=$totalCount"
        $completed = ($pageNo * $RowsPerPage -ge $totalCount)
        if (-not $pageStoppedEarly) {
            Update-FetchState $fetchState $contentTypeId $pageNo ($pageNo + 1) $totalCount ($savedTotalBefore + $savedForType) $completed $failedIds
        }

        if ($pageStoppedEarly -or
                ($MaxTotalItems -gt 0 -and $totalSaved -ge $MaxTotalItems) -or
                ($MaxItemsPerType -gt 0 -and $savedForType -ge $MaxItemsPerType) -or
                $completed) {
            if ($pageStoppedEarly) {
                Update-FetchState $fetchState $contentTypeId ($pageNo - 1) $pageNo $totalCount ($savedTotalBefore + $savedForType) $false $failedIds
            }
            break
        }

        $pageNo++
        Start-Sleep -Milliseconds $DelayMs
    }

    $counts[[string]$contentTypeId] = $savedForType
}

$summary = [ordered]@{
    fetchedAt = (Get-Date).ToString("o")
    preset = $Preset
    purpose = $PresetConfig["Purpose"]
    outputDir = $ResolvedOutputDir
    outputPath = $OutputPath
    summaryPath = $SummaryPath
    statePath = $StatePath
    areaIndexPath = $AreaIndexPath
    totalSaved = $totalSaved
    skipped = $skipped
    duplicateSkipped = $duplicateSkipped
    failedDetailSkipped = $failedDetailSkipped
    invalidCoordinateSkipped = $invalidCoordinateSkipped
    resume = $Resume.IsPresent
    forceReset = $ForceReset.IsPresent
    retryFailedIds = $RetryFailedIds.IsPresent
    resumeOverlapPages = $ResumeOverlapPages
    dedupeInputPaths = @($DedupeInputPaths)
    contentTypeCounts = $counts
    contentTypeIds = $ContentTypeIds
    areaCode = $EffectiveAreaCode
    sigunguCode = $SigunguCode
    rowsPerPage = $RowsPerPage
    maxItemsPerType = $MaxItemsPerType
    areaIndexFetched = $FetchAreaIndex
    detailCommonFetched = $FetchDetailCommon
    detailIntroFetched = $FetchDetailIntro
    serviceKeyEnvName = $ServiceKeyEnvName
    imagesIncluded = $false
    note = $PresetConfig["Note"]
}
$summary | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $SummaryPath -Encoding UTF8

Write-Host "Done. saved=$totalSaved skipped=$skipped duplicateSkipped=$duplicateSkipped failedDetailSkipped=$failedDetailSkipped invalidCoordinateSkipped=$invalidCoordinateSkipped"
Write-Host "Summary: $SummaryPath"
