$ErrorActionPreference = "Stop"

$certificateDirectory = Join-Path $PSScriptRoot "..\certificates"
New-Item -ItemType Directory -Path $certificateDirectory -Force | Out-Null

$wifiAddress = Get-NetIPAddress -AddressFamily IPv4 -AddressState Preferred |
  Where-Object {
    $_.IPAddress -notlike "127.*" -and
    $_.IPAddress -notlike "169.254.*" -and
    $_.InterfaceAlias -notmatch "Loopback|VMware|VirtualBox|Hyper-V|WSL"
  } |
  Sort-Object @{ Expression = { if ($_.InterfaceAlias -match "Wi-Fi|Wireless") { 0 } else { 1 } } } |
  Select-Object -First 1

if (-not $wifiAddress) {
  throw "No active Wi-Fi IPv4 address found. Connect this PC to Wi-Fi and retry."
}

$ip = $wifiAddress.IPAddress
$caSubject = "CN=Bright Mind Chat LAN Development CA"
$ca = Get-ChildItem "Cert:\CurrentUser\My" |
  Where-Object {
    $_.Subject -eq $caSubject -and
    $_.FriendlyName -eq "Bright Mind Chat LAN Development CA" -and
    $_.HasPrivateKey -and
    $_.NotAfter -gt (Get-Date)
  } |
  Sort-Object NotAfter -Descending |
  Select-Object -First 1

if (-not $ca) {
  $ca = New-SelfSignedCertificate `
    -Type Custom `
    -Subject $caSubject `
    -FriendlyName "Bright Mind Chat LAN Development CA" `
    -KeyUsage CertSign, CRLSign, DigitalSignature `
    -TextExtension @("2.5.29.19={critical}{text}ca=TRUE&pathlength=0") `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -KeyExportPolicy Exportable `
    -NotAfter (Get-Date).AddYears(5)
}

$certificate = Get-ChildItem "Cert:\CurrentUser\My" |
  Where-Object {
    $_.Subject -eq "CN=$ip" -and
    $_.FriendlyName -eq "Bright Mind Chat LAN HTTPS" -and
    $_.Issuer -eq $ca.Subject -and
    $_.HasPrivateKey -and
    $_.NotAfter -gt (Get-Date)
  } |
  Sort-Object NotAfter -Descending |
  Select-Object -First 1

if (-not $certificate) {
  $certificate = New-SelfSignedCertificate `
    -Type Custom `
    -Subject "CN=$ip" `
    -FriendlyName "Bright Mind Chat LAN HTTPS" `
    -Signer $ca `
    -KeyUsage DigitalSignature, KeyEncipherment `
    -TextExtension @(
      "2.5.29.17={text}DNS=localhost&IPAddress=$ip",
      "2.5.29.37={text}1.3.6.1.5.5.7.3.1"
    ) `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -KeyExportPolicy Exportable `
    -NotAfter (Get-Date).AddYears(2)
}

$pfxPath = Join-Path $certificateDirectory "bright-mind-lan.pfx"
$caCertificatePath = Join-Path $certificateDirectory "bright-mind-lan-ca.cer"
$publicCertificatePath = Join-Path $PSScriptRoot "..\public\bright-mind-lan.cer"
$pfxPassword = ConvertTo-SecureString -String "bright-mind-local-dev-only" -AsPlainText -Force

Export-PfxCertificate -Cert $certificate -FilePath $pfxPath -Password $pfxPassword | Out-Null
Export-Certificate -Cert $ca -FilePath $caCertificatePath | Out-Null
Copy-Item -Path $caCertificatePath -Destination $publicCertificatePath -Force
certutil.exe -addstore -f -user Root $caCertificatePath | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Could not trust the HTTPS certificate for the current Windows user."
}

Write-Host "HTTPS certificate created for $ip and trusted by this Windows user."
Write-Host "On this laptop open: https://${ip}:5173"
Write-Host "On a phone on the same Wi-Fi, download: https://${ip}:5173/bright-mind-lan.cer"
Write-Host "Accept the first certificate warning, install the CA profile, then enable full trust in iPhone Certificate Trust Settings."