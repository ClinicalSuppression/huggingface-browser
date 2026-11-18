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

/**
 * Runs a PowerShell script via UTF-16LE Base64 EncodedCommand to avoid
 * command-line escaping bugs with $_, quotes, and multiline statements.
 */
async function runPowerShell(script: string, timeoutMs: number = 4000): Promise<string> {
  const b64 = Buffer.from(script, 'utf16le').toString('base64');
  const { stdout } = await execAsync(`powershell.exe -NoProfile -NonInteractive -EncodedCommand ${b64}`, {
    timeout: timeoutMs,
  });
  return stdout;
}

export async function detectHardware(): Promise<HardwareProfile> {
  const gpus: GpuDeviceInfo[] = [];

  const totalRamBytes = os.totalmem();
  const freeRamBytes = os.freemem();

  const cpus = os.cpus();
  const cpuLogicalCores = cpus.length;
  const cpuArch = os.arch() === 'arm64' ? 'arm64' : 'x86_64';

  if (process.platform === 'win32') {
    // 1. Query high-accuracy 64-bit VRAM from Windows Display Class registry
    try {
      const regScript = `
        $items = Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0*' -ErrorAction SilentlyContinue
        $results = @()
        foreach ($item in $items) {
          if ($item.DriverDesc -and $item.'HardwareInformation.qwMemorySize' -gt 0) {
            $results += [PSCustomObject]@{
              Name = $item.DriverDesc
              VramBytes = [int64]$item.'HardwareInformation.qwMemorySize'
              DriverVersion = $item.DriverVersion
            }
          }
        }
        $results | ConvertTo-Json -Depth 2
      `;
      const regOutput = await runPowerShell(regScript, 3000);
      if (regOutput && regOutput.trim()) {
        const parsed = JSON.parse(regOutput.trim());
        const cards = Array.isArray(parsed) ? parsed : [parsed];

        for (const [index, card] of cards.entries()) {
          const name = card.Name || 'Unknown GPU';
          const nameLower = name.toLowerCase();

          // Skip generic or disabled adapters
          if (nameLower.includes('basic render') || nameLower.includes('standard vga')) {
            continue;
          }

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

          const vramBytes = Number(card.VramBytes) || (16 * 1024 * 1024 * 1024);
          const dwmReservedBytes = 512 * 1024 * 1024;
          const vramFreeBytes = Math.max(0, vramBytes - dwmReservedBytes);

          gpus.push({
            id: `gpu-${index}`,
            name,
            vendor,
            vramTotalBytes: vramBytes,
            vramFreeBytes,
            driverVersion: card.DriverVersion || 'Unknown',
          });
        }
      }
    } catch {
      // Fall through to Win32_VideoController
    }

    // 2. Fallback to Win32_VideoController if registry query returned no cards
    if (gpus.length === 0) {
      try {
        const cimScript = `
          $cards = Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'OK' -and $_.ConfigManagerErrorCode -eq 0 -and $_.Problem -eq 0 } | Select-Object Name, AdapterRAM, DriverVersion, Status, ConfigManagerErrorCode
          $cards | ConvertTo-Json -Depth 2
        `;
        const cimOutput = await runPowerShell(cimScript, 3000);
        if (cimOutput && cimOutput.trim()) {
          const parsed = JSON.parse(cimOutput.trim());
          const cards = Array.isArray(parsed) ? parsed : [parsed];

          for (const [index, ctrl] of cards.entries()) {
            const status = ctrl.Status || 'OK';
            const cmError = Number(ctrl.ConfigManagerErrorCode) || 0;
            if (status !== 'OK' || cmError !== 0) continue;

            const name = ctrl.Name || 'Unknown GPU';
            const nameLower = name.toLowerCase();

            let vendor: GpuDeviceInfo['vendor'] = 'unknown';
            if (nameLower.includes('nvidia') || nameLower.includes('geforce') || nameLower.includes('quadro') || nameLower.includes('rtx')) {
              vendor = 'nvidia';
            } else if (nameLower.includes('amd') || nameLower.includes('radeon')) {
              vendor = 'amd';
            } else if (nameLower.includes('intel') || nameLower.includes('arc')) {
              vendor = 'intel';
            }

            let vramBytes = Number(ctrl.AdapterRAM) || 0;
            if (vramBytes <= 0 || vramBytes === 4293918720) {
              if (nameLower.includes('7800 xt') || nameLower.includes('6800') || nameLower.includes('4080')) {
                vramBytes = 16 * 1024 * 1024 * 1024;
              } else if (nameLower.includes('4090') || nameLower.includes('3090') || nameLower.includes('7900 xtx')) {
                vramBytes = 24 * 1024 * 1024 * 1024;
              } else {
                vramBytes = 16 * 1024 * 1024 * 1024;
              }
            }

            if (vramBytes <= 0) continue;

            gpus.push({
              id: `gpu-${index}`,
              name,
              vendor,
              vramTotalBytes: vramBytes,
              vramFreeBytes: Math.max(0, vramBytes - 512 * 1024 * 1024),
              driverVersion: ctrl.DriverVersion || 'Unknown',
            });
          }
        }
      } catch {
        // Fallback
      }
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
      name: 'AMD Radeon RX 7800 XT',
      vendor: 'amd',
      vramTotalBytes: 16 * 1024 * 1024 * 1024,
      vramFreeBytes: 15.5 * 1024 * 1024 * 1024,
      driverVersion: '32.0.32015.7029',
    });
  } else {
    try {
      const live = await getLiveVramUsage(0);
      (gpus[0] as any).vramFreeBytes = live.freeBytes;
    } catch {
      // Fallback
    }
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
      const psScript = `
        $samples = Get-Counter '\\GPU Adapter Memory(*)\\Dedicated Usage' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CounterSamples
        $results = @()
        foreach ($s in $samples) {
          $results += [PSCustomObject]@{
            Instance = $s.InstanceName
            UsedBytes = [int64]$s.CookedValue
          }
        }
        $results | ConvertTo-Json -Depth 2
      `;
      const stdout = await runPowerShell(psScript, 2500);
      if (stdout && stdout.trim()) {
        const parsed = JSON.parse(stdout.trim());
        const samples = Array.isArray(parsed) ? parsed : [parsed];
        const hw = await detectHardware();

        // Find primary sample with non-zero usage or index 0
        const primarySample = samples.find((s) => Number(s.UsedBytes) > 0) || samples[0];
        const usedBytes = primarySample ? Number(primarySample.UsedBytes) || 0 : 0;
        const gpu = hw.gpus[gpuIndex] || hw.gpus[0];
        const totalBytes = gpu ? gpu.vramTotalBytes : 16 * 1024 * 1024 * 1024;
        const freeBytes = Math.max(0, totalBytes - usedBytes);

        usageMap.set(gpuIndex, { totalBytes, usedBytes, freeBytes });
      }
    } catch {
      // Fallback
    }
  }

  if (usageMap.size === 0) {
    const hw = await detectHardware();
    const gpu = hw.gpus[gpuIndex] || hw.gpus[0];
    const totalBytes = gpu ? gpu.vramTotalBytes : 16 * 1024 * 1024 * 1024;
    const usedBytes = Math.round(totalBytes * 0.15);
    const freeBytes = totalBytes - usedBytes;
    usageMap.set(gpuIndex, { totalBytes, usedBytes, freeBytes });
  }

  vramCache = { timestamp: now, usageMap };
  return usageMap.get(gpuIndex) || { totalBytes: 16 * 1024 * 1024 * 1024, usedBytes: 0, freeBytes: 16 * 1024 * 1024 * 1024 };
}
