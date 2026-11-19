; HF Browser installer (Inno Setup 6)
; Keep AppVersion in sync with package.json version.

#ifndef PublishDir
  #define PublishDir "dist-release\win-x64"
#endif

[Setup]
AppId={{8B1A2C3D-4E5F-6A7B-8C9D-0E1F2A3B4C5D}}
AppName=HF Browser
AppVersion=0.1.2
AppPublisher=ClinicalSuppression
DefaultDirName={autopf}\HF Browser
DefaultGroupName=HF Browser
OutputDir=dist-installer
OutputBaseFilename=huggingface-browser-Setup-v0.1.2
SetupIconFile=assets\icon.ico
Compression=lzma2/fast
SolidCompression=yes
PrivilegesRequired=lowest
MinVersion=10.0.17763
ArchitecturesInstallIn64BitMode=x64os
ArchitecturesAllowed=x64compatible
WizardStyle=modern
DisableProgramGroupPage=yes
UninstallDisplayName=HF Browser

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#PublishDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\HF Browser"; Filename: "{app}\HF-Browser.exe"; IconFilename: "{app}\assets\icon.ico"
Name: "{group}\Uninstall HF Browser"; Filename: "{uninstallexe}"
Name: "{autodesktop}\HF Browser"; Filename: "{app}\HF-Browser.exe"; IconFilename: "{app}\assets\icon.ico"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop icon"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Run]
Filename: "{app}\HF-Browser.exe"; Description: "Launch HF Browser now"; Flags: nowait postinstall skipifsilent
