import { CapabilityStatus, HardwareProfile } from '../types';

export function calculateWeightMemoryBytes(
  paramCountBillions: number,
  bitsPerWeight: number,
  overheadMultiplier: number = 1.15
): number {
  const rawBytes = paramCountBillions * 1_000_000_000 * (bitsPerWeight / 8);
  return Math.ceil(rawBytes * overheadMultiplier);
}

export function calculateKvCacheMemoryBytes(
  layers: number,
  kvHeads: number,
  headDim: number,
  contextTokens: number,
  bytesPerElement: number = 2
): number {
  const rawBytes = 2 * layers * kvHeads * headDim * contextTokens * bytesPerElement;
  return Math.ceil(rawBytes);
}

export interface HardwareFitResult {
  readonly status: CapabilityStatus;
  readonly fitDescription: string;
  readonly fitsInVram: boolean;
  readonly estimatedVramBytes: number;
  readonly estimatedSystemRamBytes: number;
  readonly maxOffloadLayers: number;
  readonly totalLayers: number;
}

export function evaluateHardwareFit(
  modelParamsBillions: number,
  bitsPerWeight: number,
  layers: number,
  kvHeads: number,
  headDim: number,
  contextTokens: number,
  hw: HardwareProfile
): HardwareFitResult {
  const weightBytes = calculateWeightMemoryBytes(modelParamsBillions, bitsPerWeight);
  const kvBytes = calculateKvCacheMemoryBytes(layers, kvHeads, headDim, contextTokens);
  const cudaOverheadBytes = 1_073_741_824; // ~1.0 GB base overhead

  const totalFreeVram = hw.gpus.reduce((acc, gpu) => acc + gpu.vramFreeBytes, 0);
  const totalFreeRam = hw.systemRamAvailableBytes;

  const estimatedVramBytes = weightBytes + kvBytes + cudaOverheadBytes;
  const estimatedSystemRamBytes = weightBytes;

  const fitsInVram = estimatedVramBytes <= totalFreeVram * 0.90;

  if (fitsInVram) {
    return {
      status: 'supported',
      fitDescription: 'Model fits entirely in GPU VRAM with optimal performance.',
      fitsInVram: true,
      estimatedVramBytes,
      estimatedSystemRamBytes: 0,
      maxOffloadLayers: layers,
      totalLayers: layers,
    };
  }

  const totalAvailableCapacity = totalFreeVram + totalFreeRam;
  if (estimatedVramBytes <= totalAvailableCapacity || weightBytes <= totalAvailableCapacity) {
    const bytesPerLayer = layers > 0 ? weightBytes / layers : weightBytes;
    const availableVramForWeights = Math.max(0, totalFreeVram - kvBytes - cudaOverheadBytes);
    const calculatedLayers = bytesPerLayer > 0 ? Math.floor(availableVramForWeights / bytesPerLayer) : 0;
    const maxOffloadLayers = Math.min(Math.max(calculatedLayers, 0), layers);

    return {
      status: 'conditional',
      fitDescription: `Model requires partial CPU offload (${maxOffloadLayers}/${layers} layers in VRAM). Performance will be reduced.`,
      fitsInVram: false,
      estimatedVramBytes,
      estimatedSystemRamBytes,
      maxOffloadLayers,
      totalLayers: layers,
    };
  }

  return {
    status: 'unsupported',
    fitDescription: 'Model exceeds combined available VRAM and System RAM capacity.',
    fitsInVram: false,
    estimatedVramBytes,
    estimatedSystemRamBytes,
    maxOffloadLayers: 0,
    totalLayers: layers,
  };
}
