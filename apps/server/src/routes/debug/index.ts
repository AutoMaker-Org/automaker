import type { Request, Response } from 'express';
import express from 'express';

import { resolveModelString, resolvePhaseModel } from '@automaker/model-resolver';
import { DEFAULT_MODELS } from '@automaker/types';
import type { SettingsService } from '../../services/settings-service.js';

/**
 * Debug routes (authenticated)
 *
 * These endpoints are intended for local verification and troubleshooting.
 * Do not return secrets.
 */
export function createDebugRoutes(settingsService: SettingsService) {
  const router = express.Router();

  /**
   * Return the raw configured model keys and their resolved effective model IDs.
   *
   * This is the authoritative source for "which model will be used" because it uses
   * the same resolver as agent runs.
   */
  router.get('/resolved-models', async (_req: Request, res: Response) => {
    const settings = await settingsService.getGlobalSettings();

    const defaultFeatureModelKey = settings.defaultFeatureModel?.model;

    const phaseModels = settings.phaseModels || ({} as any);

    const specGeneration = resolvePhaseModel(
      phaseModels.specGenerationModel,
      DEFAULT_MODELS.claude
    );
    const backlogPlanning = resolvePhaseModel(
      phaseModels.backlogPlanningModel,
      DEFAULT_MODELS.claude
    );
    const validation = resolvePhaseModel(phaseModels.validationModel, DEFAULT_MODELS.claude);

    // Also show what the legacy "validationModel" / "enhancementModel" shortcuts are set to (if present)
    const legacyValidationModelKey = (settings as any).validationModel;
    const legacyEnhancementModelKey = (settings as any).enhancementModel;

    const result = {
      now: new Date().toISOString(),
      defaults: {
        DEFAULT_MODELS,
      },
      configured: {
        defaultFeatureModelKey,
        phaseModels: {
          specGenerationModel: phaseModels.specGenerationModel,
          backlogPlanningModel: phaseModels.backlogPlanningModel,
          validationModel: phaseModels.validationModel,
        },
        legacy: {
          validationModelKey: legacyValidationModelKey,
          enhancementModelKey: legacyEnhancementModelKey,
        },
      },
      resolved: {
        defaultFeatureModel: {
          key: defaultFeatureModelKey,
          resolved: resolveModelString(defaultFeatureModelKey, DEFAULT_MODELS.claude),
        },
        phaseModels: {
          specGenerationModel: specGeneration,
          backlogPlanningModel: backlogPlanning,
          validationModel: validation,
        },
        legacy: {
          validationModel: {
            key: legacyValidationModelKey,
            resolved: resolveModelString(legacyValidationModelKey, DEFAULT_MODELS.claude),
          },
          enhancementModel: {
            key: legacyEnhancementModelKey,
            resolved: resolveModelString(legacyEnhancementModelKey, DEFAULT_MODELS.claude),
          },
        },
      },
    };

    res.json(result);
  });

  return router;
}
