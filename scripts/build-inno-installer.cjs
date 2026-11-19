const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

if (process.platform !== 'win32') {
  console.error('The Inno Setup installer can only be built on Windows.');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const stage = path.join(root, 'dist-release', 'win-unpacked');
const output = path.join(root, 'dist-release');
if (!fs.existsSync(stage)) {
  console.error(`Missing staged app directory: ${stage}. Run electron-builder portable first.`);
  process.exit(1);
}

const pathLookup = spawnSync('where.exe', ['ISCC.exe'], { encoding: 'utf8' });
const pathCandidates = pathLookup.status === 0
  ? pathLookup.stdout.split(/\r?\n/).map(candidate => candidate.trim()).filter(Boolean)
  : [];
const candidates = [
  process.env.ISCC_EXE,
  ...pathCandidates,
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Inno Setup 6', 'ISCC.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Inno Setup 6', 'ISCC.exe'),
].filter(Boolean);
const compiler = candidates.find(candidate =>
  fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
);
if (!compiler) {
  console.error('Inno Setup Compiler (ISCC.exe) not found. Set ISCC_EXE or install Inno Setup 6.');
  process.exit(1);
}

fs.mkdirSync(output, { recursive: true });
const args = [
  `/DAppVersion=${pkg.version}`,
  `/DPublishDir=${stage}`,
  `/DOutputDir=${output}`,
  `/DOutputName=HF-Browser-${pkg.version}-Setup-x64`,
  path.join(root, 'installer.iss'),
];
const result = spawnSync(compiler, args, { cwd: root, stdio: 'inherit' });
if (result.error) {
  console.error(`Failed to launch Inno Setup Compiler: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
