export interface QuantInfo {
  readonly quant: string;
  readonly bitsPerWeight: number;
  readonly isKQuant: boolean;
  readonly isIQuant: boolean;
  readonly isLegacy: boolean;
}

export interface GgufShardGroup {
  readonly baseName: string;
  readonly shards: string[];
  readonly totalShards: number;
  readonly isComplete: boolean;
  readonly quant: string;
}

export function parseQuantFromFilename(filename: string): QuantInfo {
  const upper = filename.toUpperCase();
  
  const match = upper.match(/([I]?[Q][0-9]_[A-Z0-9_]+|[F]16|[B][F]16|[F][P]8)/);
  const quant = match ? match[1] : 'UNKNOWN';

  const isKQuant = quant.includes('_K') || quant.includes('-K');
  const isIQuant = quant.startsWith('IQ');
  const isLegacy = quant === 'Q4_0' || quant === 'Q4_1' || quant === 'Q5_0' || quant === 'Q5_1' || quant === 'Q8_0';

  let bitsPerWeight = 16.0;
  if (quant === 'IQ4_XS' || quant === 'IQ4_NL') {
    bitsPerWeight = 4.25;
  } else if (quant.startsWith('Q2') || quant.startsWith('IQ2')) {
    bitsPerWeight = 2.5;
  } else if (quant.startsWith('Q3') || quant.startsWith('IQ3')) {
    bitsPerWeight = 3.5;
  } else if (quant.startsWith('Q4') || quant.startsWith('IQ4')) {
    bitsPerWeight = 4.5;
  } else if (quant.startsWith('Q5')) {
    bitsPerWeight = 5.5;
  } else if (quant.startsWith('Q6')) {
    bitsPerWeight = 6.5;
  } else if (quant.startsWith('Q8')) {
    bitsPerWeight = 8.5;
  } else if (quant === 'F16' || quant === 'BF16') {
    bitsPerWeight = 16.0;
  } else if (quant === 'FP8') {
    bitsPerWeight = 8.0;
  }

  return {
    quant,
    bitsPerWeight,
    isKQuant,
    isIQuant,
    isLegacy,
  };
}

export function groupGgufShards(filenames: string[]): GgufShardGroup[] {
  const shardRegex = /^(.*?)-([0-9]{5})-of-([0-9]{5})\.gguf$/i;
  const shardMap = new Map<string, { shards: Map<number, string>; total: number; quant: string }>();
  const singleFiles: string[] = [];

  for (const file of filenames) {
    if (!file.toLowerCase().endsWith('.gguf')) {
      continue;
    }
    const match = file.match(shardRegex);
    if (match) {
      const baseName = match[1];
      const shardIndex = parseInt(match[2], 10);
      const totalShards = parseInt(match[3], 10);
      
      let entry = shardMap.get(baseName);
      if (!entry) {
        const { quant } = parseQuantFromFilename(baseName);
        entry = { shards: new Map<number, string>(), total: totalShards, quant };
        shardMap.set(baseName, entry);
      }
      entry.shards.set(shardIndex, file);
    } else {
      singleFiles.push(file);
    }
  }

  const results: GgufShardGroup[] = [];

  for (const [baseName, data] of shardMap.entries()) {
    const sortedShards: string[] = [];
    let isComplete = true;
    for (let i = 1; i <= data.total; i++) {
      const filename = data.shards.get(i);
      if (filename) {
        sortedShards.push(filename);
      } else {
        isComplete = false;
      }
    }
    results.push({
      baseName,
      shards: sortedShards,
      totalShards: data.total,
      isComplete,
      quant: data.quant,
    });
  }

  for (const file of singleFiles) {
    const baseName = file.replace(/\.gguf$/i, '');
    const { quant } = parseQuantFromFilename(file);
    results.push({
      baseName,
      shards: [file],
      totalShards: 1,
      isComplete: true,
      quant,
    });
  }

  return results;
}

export function findMatchingMultimodalProjector(modelFiles: string[]): string | undefined {
  const projectorRegex = /^mmproj.*\.gguf$/i;
  for (const file of modelFiles) {
    const parts = file.split(/[/\\]/);
    const filename = parts[parts.length - 1];
    if (projectorRegex.test(filename)) {
      return file;
    }
  }
  return undefined;
}
