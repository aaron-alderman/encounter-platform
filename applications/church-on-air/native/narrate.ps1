param([Parameter(Mandatory=$true)][string]$Source,[Parameter(Mandatory=$true)][string]$OutDir)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$scriptSource = Get-Content -LiteralPath $Source -Raw | ConvertFrom-Json
[System.IO.Directory]::CreateDirectory($OutDir) | Out-Null
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$eventName = 'ChurchOnAirVoice-' + [guid]::NewGuid().ToString('N')
Register-ObjectEvent -InputObject $synth -EventName SpeakProgress -SourceIdentifier $eventName | Out-Null
try {
  $synth.SelectVoice($scriptSource.voice.name)
  $synth.Rate = [int]$scriptSource.voice.rate
  $synth.Volume = 100
  $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo([int]$scriptSource.voice.sampleRate,[System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,[System.Speech.AudioFormat.AudioChannel]::Mono)
  foreach ($chapter in $scriptSource.chapters) {
    if ($chapter.id -notmatch '^[a-z][a-z0-9-]*$') { throw 'Unsafe narration chapter identity' }
    $wave = Join-Path $OutDir ($chapter.id + '.wav')
    $synth.SetOutputToWaveFile($wave,$format)
    $text = [System.Security.SecurityElement]::Escape([string]$chapter.text)
    $ssml = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-AU"><p><s>' + $text + '</s></p><break time="280ms"/></speak>'
    $synth.SpeakSsml($ssml)
    $synth.SetOutputToNull()
    $words = @(Get-Event -SourceIdentifier $eventName -ErrorAction SilentlyContinue | ForEach-Object {
      [pscustomobject]@{ time = $_.SourceEventArgs.AudioPosition.TotalSeconds; text = $_.SourceEventArgs.Text }
      Remove-Event -EventIdentifier $_.EventIdentifier
    })
    ConvertTo-Json -Depth 4 -InputObject $words | Set-Content -Encoding utf8 -LiteralPath (Join-Path $OutDir ($chapter.id + '.words.json'))
    Write-Output ('VOICE ' + $chapter.id + ' / ' + $scriptSource.voice.name)
  }
} finally { Unregister-Event -SourceIdentifier $eventName -ErrorAction SilentlyContinue; $synth.Dispose() }
