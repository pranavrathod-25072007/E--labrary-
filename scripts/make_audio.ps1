# Synthesise the demo audio books (spoken excerpts) as WAV files using Windows built-in TTS.
# Input : scripts/_audio_texts/*.txt   (produced by make_assets.py)
# Output: uploads/audio/*.wav
Add-Type -AssemblyName System.Speech

$txtDir = Join-Path $PSScriptRoot "_audio_texts"
$outDir = Join-Path (Split-Path $PSScriptRoot -Parent) "uploads\audio"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try { $synth.Rate = 0 } catch {}

Get-ChildItem $txtDir -Filter *.txt | ForEach-Object {
    $text = (Get-Content $_.FullName -Raw -Encoding UTF8)
    $wav = Join-Path $outDir ($_.BaseName + ".wav")
    $synth.SetOutputToWaveFile($wav)
    $synth.Speak($text)
    $synth.SetOutputToNull()
    Write-Output ("AUDIO -> " + $wav)
}

$synth.Dispose()
Write-Output "done"
