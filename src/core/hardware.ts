import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import { HardwareProfile, GpuDeviceInfo } from '../types';

const execAsync = promisify(exec);

export async function detectHardware(): Promise<HardwareProfile> {
  const gpus: GpuDeviceInfo[] = [];

  // System Memory via os module
  const totalRamBytes = os.totalmem();
  const freeRamBytes = os.freemem();

  // CPU details
  const cpus = os.cpus();
  const cpuLogicalCores = cpus.length;
  const cpuArch = os.arch() === 'arm64' ? 'arm64' : 'x86_64';

  // On Windows, query Win32_VideoController via PowerShell for accurate GPU & VRAM details
  if (process.platform === 'win32') {
    try {
      const psCommand = `Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion | ConvertTo-Json`;
      const { stdout } = await execAsync(`powershell.exe -NoProfile -Command "${psCommand}"`, { timeout: 3500 });

      if (stdout && stdout.trim()) {
        const parsed = JSON.parse(stdout.trim());
        const controllers = Array.isArray(parsed) ? parsed : [parsed];

        for (const [index, ctrl] of controllers.entries()) {
          const name = ctrl.Name || 'Unknown GPU';
          const nameLower = name.toLowerCase();

          let vendor: GpuDeviceInfo['vendor'] = 'unknown';
          if (nameLower.includes('nvidia') || nameLower.includes('geforce') || nameLower.includes('quadro') || nameLower.includes('rtx')) {
            vendor = 'nvidia';
          } else if (nameLower.includes('amd') || nameLower.includes('radeon')) {
            vendor = 'amd';
          } else if (nameLower.includes('intel') || nameLower.includes('arc') || nameLower.includes('iris')) {
            vendor = 'intel';
          } else if (nameLower.includes('qualcomm') || nameLower.includes('snapdragon')) {
            vendor = 'qualcomm';
          }

          // AdapterRAM is reported in bytes by Win32_VideoController. For 64-bit GPUs exceeding 4GB,
          // 32-bit AdapterRAM may wrap around to ~4GB; let's check high VRAM via query or standard detection
          let vramBytes = Number(ctrl.AdapterRAM) || 0;
          if (vramBytes <= 0 || vramBytes === 4293918720) {
            // Check specific common modern GPUs (e.g. RX 7800 XT = 16 GB, RTX 4090 = 24 GB, etc.)
            if (nameLower.includes('7800 xt') || nameLower.includes('6800') || nameLower.includes('4080')) {
              vramBytes = 16 * 1024 * 1024 * 1024;
            } else if (nameLower.includes('4090') || nameLower.includes('3090') || nameLower.includes('7900 xtx')) {
              vramBytes = 24 * 1024 * 1024 * 1024;
            } else if (nameLower.includes('7900 xt') || nameLower.includes('4070 ti super')) {
              vramBytes = 20 * 1024 * 1024 * 1024;
            } else if (nameLower.includes('4070') || nameLower.includes('3080') || nameLower.includes('6700')) {
              vramBytes = 12 * 1024 * 1024 * 1024;
            } else if (nameLower.includes('4060') || nameLower.includes('3070') || nameLower.includes('3060 ti')) {
              vramBytes = 8 * 1024 * 1024 * 1024;
            } else if (vramBytes === 4293918720) {
              // 4293918720 is uint32 max - offset, typical 32-bit truncation for >= 8GB
              vramBytes = 16 * 1024 * 1024 * 1024;
            }
          }

          // Free VRAM estimate: reserve 1.5 GB for Windows Desktop Window Manager (DWM)
          const dwmReservedBytes = 1.5 * 1024 * 1024 * 1024;
          const vramFreeBytes = Math.max(0, vramBytes - dwmReservedBytes);

          gpus.push({
            id: `gpu-${index}`,
            name,
            vendor,
            vramTotalBytes: vramBytes,
            vramFreeBytes: vramFreeBytes,
            driverVersion: ctrl.DriverVersion || 'Unknown',
          });
        }
      }
    } catch {
      // Fallback if PowerShell query times out
    }
  }

  // Fallback if no GPU detected via PowerShell or on non-Windows
  if (gpus.length === 0) {
    gpus.push({
      id: 'gpu-default',
      name: 'Generic Direct3D / Software Renderer',
      vendor: 'unknown',
      vramTotalBytes: 4 * 1024 * 1024 * 1024,
      vramFreeBytes: 3 * 1024 * 1024 * 1024,
      driverVersion: '1.0',
    });
  }

  return {
    gpus,
    systemRamTotalBytes: totalRamBytes,
    systemRamAvailableBytes: freeRamBytes,
    cpuArchitecture: cpuArch,
    cpuLogicalCores,
    supportsAvx2: true, // Modern x86_64 host standard
    supportsAvx512: false,
    capturedAtIso: new Date().toISOString(),
  };
}
