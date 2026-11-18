const { app } = require('electron');

app.whenReady().then(() => {
  console.log(`[ELECTRON_SMOKE] Successfully initialized Electron ${process.versions.electron}`);
  console.log(`[ELECTRON_SMOKE] Platform: ${process.platform}, Arch: ${process.arch}`);
  process.exit(0);
});
