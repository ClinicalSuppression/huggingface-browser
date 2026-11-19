!macro customInstall
  ; Migrate only the known v0.1.2 per-user Inno installation. Never trust its
  ; UninstallString or remove its files/registry entries ourselves.
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\{8B1A2C3D-4E5F-6A7B-8C9D-0E1F2A3B4C5D}}_is1" "DisplayName"
  ReadRegStr $1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\{8B1A2C3D-4E5F-6A7B-8C9D-0E1F2A3B4C5D}}_is1" "DisplayVersion"
  ReadRegStr $2 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\{8B1A2C3D-4E5F-6A7B-8C9D-0E1F2A3B4C5D}}_is1" "InstallLocation"
  StrCpy $3 "$LOCALAPPDATA\Programs\HF Browser"
  StrCmp $0 "HF Browser" 0 hfBrowserMigrationDone
  StrCmp $1 "0.1.2" 0 hfBrowserMigrationDone
  StrCmp $2 "$3\" 0 hfBrowserMigrationDone
  StrCpy $4 "$3\unins000.exe"
  IfFileExists "$4" 0 hfBrowserMigrationDone
  ExecWait '"$4" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART' $5
  StrCmp $5 "0" 0 hfBrowserMigrationFailed
  ReadRegStr $6 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\{8B1A2C3D-4E5F-6A7B-8C9D-0E1F2A3B4C5D}}_is1" "DisplayName"
  StrCmp $6 "" hfBrowserMigrationDone hfBrowserMigrationFailed

hfBrowserMigrationFailed:
  IfSilent hfBrowserMigrationDone
  MessageBox MB_ICONEXCLAMATION|MB_OK "Hugging Face Browser was installed, but the previous HF Browser installation could not be removed. You can uninstall it from Windows Settings > Apps."
hfBrowserMigrationDone:
!macroend
