#ifndef AppVersion
  #define AppVersion "1.0.1"
#endif
#ifndef PublishDir
  #define PublishDir "dist-release\win-unpacked"
#endif
#ifndef OutputDir
  #define OutputDir "dist-release"
#endif
#ifndef OutputName
  #define OutputName "HF-Browser-" + AppVersion + "-Setup-x64"
#endif

[Setup]
AppId={{689B4A7F-D9F0-47A1-A5FB-31B5FB657D24}
AppName=Hugging Face Browser
AppVersion={#AppVersion}
AppVerName=Hugging Face Browser {#AppVersion}
AppPublisher=ClinicalSuppression
DefaultDirName={localappdata}\Programs\huggingface-browser
DefaultGroupName=Hugging Face Browser
DisableProgramGroupPage=yes
OutputDir={#OutputDir}
OutputBaseFilename={#OutputName}
SetupIconFile=assets\icon.ico
Compression=lzma2/fast
SolidCompression=yes
PrivilegesRequired=lowest
MinVersion=10.0.17763
ArchitecturesInstallIn64BitMode=x64os
ArchitecturesAllowed=x64compatible
WizardStyle=modern
UninstallDisplayName=Hugging Face Browser
CloseApplications=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Code]
function InitializeSetup(): Boolean;
var
  UninstallKey, DisplayName, DisplayVersion, MessageText: string;
  SubkeyNames: TArrayOfString;
  Index: Integer;
  FoundLegacy: Boolean;
begin
  Result := True;
  UninstallKey := 'Software\Microsoft\Windows\CurrentVersion\Uninstall\';
  FoundLegacy := False;
  if RegGetSubkeyNames(HKCU, UninstallKey, SubkeyNames) then
    for Index := 0 to GetArrayLength(SubkeyNames) - 1 do
    begin
      if RegQueryStringValue(HKCU, UninstallKey + SubkeyNames[Index], 'DisplayName', DisplayName) and
         RegQueryStringValue(HKCU, UninstallKey + SubkeyNames[Index], 'DisplayVersion', DisplayVersion) then
      begin
        if ((DisplayName = 'Hugging Face Browser 0.1.3') and (DisplayVersion = '0.1.3')) or
           ((DisplayName = 'Hugging Face Browser 1.0.0') and (DisplayVersion = '1.0.0')) then
          FoundLegacy := True;
      end;
    end;
  if RegQueryStringValue(HKCU, UninstallKey + '{8B1A2C3D-4E5F-6A7B-8C9D-0E1F2A3B4C5D}_is1', 'DisplayName', DisplayName) then
    FoundLegacy := True;
  if FoundLegacy then
  begin
    MessageText := 'A previous installation of Hugging Face Browser was detected. Please uninstall it through Windows Settings > Apps, then rerun this installer. No files or user data have been removed.';
    MsgBox(MessageText, mbError, MB_OK);
    Result := False;
  end;
end;

[Files]
Source: "{#PublishDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "CHANGELOG.md"; DestDir: "{app}"; Flags: ignoreversion

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Icons]
Name: "{group}\Hugging Face Browser"; Filename: "{app}\Hugging Face Browser.exe"
Name: "{autodesktop}\Hugging Face Browser"; Filename: "{app}\Hugging Face Browser.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Hugging Face Browser.exe"; Description: "Launch Hugging Face Browser"; Flags: nowait postinstall skipifsilent
