import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import { HardwareProfile, GpuDeviceInfo } from '../types';

const execAsync = promisify(exec);

interface VramCacheEntry {
  timestamp: number;
  usageMap: Map<number, { totalBytes: number; usedBytes: number; freeBytes: number }>;
}
let vramCache: VramCacheEntry | null = null;
const VRAM_CACHE_TTL = 1500;

export async function detectHardware(): Promise<HardwareProfile> {
  const gpus: GpuDeviceInfo[] = [];

  const totalRamBytes = os.totalmem();
  const freeRamBytes = os.freemem();

  const cpus = os.cpus();
  const cpuLogicalCores = cpus.length;
  const cpuArch = os.arch() === 'arm64' ? 'arm64' : 'x86_64';

  if (process.platform === 'win32') {
    try {
      const psCommand = `
        $pnp = Get-PnpDevice -Class Display -ErrorAction SilentlyContinue | Select-Object InstanceId, Status, Problem, ConfigManagerErrorCode, FriendlyName, PNPDeviceID
        $cim = Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue | Select-Object Name, AdapterRAM, DriverVersion, PNPDeviceID
        $controllers = foreach ($ctrl in $cim) {
            $match = $pnp | Where-Object { $_.PNPDeviceID -eq $ctrl.PNPDeviceID -or ($_.FriendlyName -and $ctrl.Name -and $_.FriendlyName.Trim() -eq $ctrl.Name.Trim()) } | Select-Object -First 1
            $status = if ($match -and $match.Status) { $match.Status } else { 'OK' }
            $problem = if ($match) { $match.Problem } else { $null }
            $cmError = if ($match -and $match.ConfigManagerErrorCode) { [int]$match.ConfigManagerErrorCode } else { 0 }

            [PSCustomObject]@{
                Name = $ctrl.Name
                AdapterRAM = $ctrl.AdapterRAM
                DriverVersion = $ctrl.DriverVersion
                Status = $status
                Problem = $problem
                ConfigManagerErrorCode = $cmError
            }
        }
        $controllers | ConvertTo-Json -Depth 3
      `;
      const { stdout } = await execAsync(`powershell.exe -NoProfile -Command "${psCommand.replace(/\n/g, ' ')}"`, { timeout: 4000 });

      if (stdout && stdout.trim()) {
        const parsed = JSON.parse(stdout.trim());
        const controllers = Array.isArray(parsed) ? parsed : [parsed];

        for (const [index, ctrl] of controllers.entries()) {
          const status = ctrl.Status || 'OK';
          const problem = ctrl.Problem || '';
          const cmError = Number(ctrl.ConfigManagerErrorCode) || 0;

          // Exclude device if Status != 'OK' or Problem == 'CM_PROB_PHANTOM' or ConfigManagerErrorCode != 0
          if (status !== 'OK' || problem === 'CM_PROB_PHANTOM' || cmError !== 0) {
            continue;
          }

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

          let vramBytes = Number(ctrl.AdapterRAM) || 0;
          if (vramBytes <= 0 || vramBytes === 4293918720) {
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
              vramBytes = 16 * 1024 * 1024 * 1024;
            }
          }

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
      // Fallback
    }
  }

  // Sort detected GPUs by dedicated VRAM descending so discrete GPU is primary (index 0)
  gpus.sort((a, b) => b.vramTotalBytes - a.vramTotalBytes);
  gpus.forEach((gpu, idx) => {
    (gpu as any).id = `gpu-${idx}`;
  });

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
    supportsAvx2: true,
    supportsAvx512: false,
    capturedAtIso: new Date().toISOString(),
  };
}

export async function getLiveVramUsage(gpuIndex: number = 0): Promise<{ totalBytes: number; usedBytes: number; freeBytes: number }> {
  const now = Date.now();
  if (vramCache && (now - vramCache.timestamp) < VRAM_CACHE_TTL) {
    const cached = vramCache.usageMap.get(gpuIndex);
    if (cached) return cached;
  }

  const usageMap = new Map<number, { totalBytes: number; usedBytes: number; freeBytes: number }>();

  if (process.platform === 'win32') {
    try {
      const psCommand = `Get-Counter '\\GPU Adapter Memory(*)\\Dedicated Usage' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CounterSamples | Select-Object InstanceName, CookedValue | ConvertTo-Json`;
      const { stdout } = await execAsync(`powershell.exe -NoProfile -Command "${psCommand}"`, { timeout: 3000 });
      if (stdout && stdout.trim()) {
        const parsed = JSON.parse(stdout.trim());
        const samples = Array.isArray(parsed) ? parsed : [parsed];
        const hw = await detectHardware();
        samples.forEach((sample, idx) => {
          const usedBytes = Number(sample.CookedValue) || 0;
          const gpu = hw.gpus[idx] || hw.gpus[0] || { vramTotalBytes: 16 * 1024 * 1024 * 1024 };
          const totalBytes = gpu.vramTotalBytes;
          const freeBytes = Math.max(0, totalBytes - usedBytes);
          usageMap.set(idx, { totalBytes, usedBytes, freeBytes });
        });
      }
    } catch {
      // Fallback
    }
  }

  if (usageMap.size === 0) {
    const hw = await detectHardware();
    const gpu = hw.gpus[gpuIndex] || hw.gpus[0];
    const totalBytes = gpu ? gpu.vramTotalBytes : 16 * 1024 * 1024 * 1024;
    const usedBytes = Math.round(totalBytes * 0.25);
    const freeBytes = totalBytes - usedBytes;
    usageMap.set(gpuIndex, { totalBytes, usedBytes, freeBytes });
  }

  vramCache = { timestamp: now, usageMap };
  return usageMap.get(gpuIndex) || usageMap.get(0) || { totalBytes: 16 * 1024 * 1024 * 1024, usedBytes: 0, freeBytes: 16 * 1024 * 1024 * 1024 };
}
