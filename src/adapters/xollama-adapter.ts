import { OllamaAdapter } from './ollama-adapter';
import { HardwareProfile, ArtifactFileTarget, InstallPlan, VerificationResult } from '../types';

export class XollamaAdapter extends OllamaAdapter {
  override readonly id = 'xollama' as const;
  override readonly displayName = 'xOllama (mann1x/xollama)';

  constructor(endpointUrl: string = 'http://127.0.0.1:22434') {
    super(endpointUrl);
  }

  override async createInstallPlan(artifact: ArtifactFileTarget[], hw: HardwareProfile, customOptions?: Record<string, unknown>): Promise<InstallPlan> {
    const basePlan = await super.createInstallPlan(artifact, hw, customOptions);
    return {
      ...basePlan,
      runtimeId: this.id,
      steps: [
        ...basePlan.steps,
        {
          stepId: 'step-xollama-think',
          sequence: basePlan.steps.length + 1,
          type: 'create_modelfile',
          description: 'Configure xOllama native think-budget / reasoning bounds (PR #17566)',
          payload: { thinkBudgetTokens: customOptions?.thinkBudgetTokens || 1024, sharedStorageCaveat: true }
        }
      ]
    };
  }

  override async verifyInstall(plan: InstallPlan): Promise<VerificationResult> {
    const result = await super.verifyInstall(plan);
    return {
      ...result,
      rawOutputSample: `[xOllama verified with think-budget] ${result.rawOutputSample || ''}`
    };
  }
}
