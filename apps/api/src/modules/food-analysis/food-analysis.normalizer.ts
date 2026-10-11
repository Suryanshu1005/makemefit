import { NormalizedFoodAnalysis, NormalizedFoodAnalysisSchema } from '@makemefit/shared';
import { AppError } from '../../core/errors/app-error';

export class FoodAnalysisNormalizer {
  /**
   * Safely parses and strips markdown code fences if output is stringified JSON.
   */
  public static parseJsonPayload(raw: unknown): Record<string, any> {
    if (typeof raw === 'object' && raw !== null) {
      return raw as Record<string, any>;
    }

    if (typeof raw !== 'string') {
      throw new AppError('AI provider returned unexpected non-string/non-object response', 422, 'INVALID_AI_RESPONSE');
    }

    let cleaned = raw.trim();
    // Strip markdown code fences if present (```json ... ``` or ``` ...)
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    }

    try {
      const parsed = JSON.parse(cleaned);
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Parsed payload is not an object');
      }
      return parsed;
    } catch (err: any) {
      throw new AppError(
        `Failed to parse AI output as valid JSON: ${err.message}`,
        422,
        'MALFORMED_AI_JSON',
        { rawSample: cleaned.slice(0, 300) }
      );
    }
  }

  /**
   * Validates raw parsed object against strict application schema,
   * enforces Atwater physiological energy consistency (4*P + 4*C + 9*F),
   * and authoritatively computes meal totals from individual items.
   */
  public static normalize(
    raw: unknown,
    modelProvider: string,
    latencyMs: number
  ): NormalizedFoodAnalysis {
    const parsedObj = this.parseJsonPayload(raw);

    // Merge system metadata
    const candidateData = {
      ...parsedObj,
      modelProvider,
      latencyMs,
    };

    const result = NormalizedFoodAnalysisSchema.safeParse(candidateData);

    if (!result.success) {
      throw new AppError(
        'AI response conforms neither to nutritional nor structural requirements',
        422,
        'INVALID_AI_SCHEMA',
        result.error.format()
      );
    }

    const validated = result.data;

    // Reconcile item macros & calories using Atwater physiological energy law (4P + 4C + 9F)
    const reconciledItems = validated.items.map((item) => {
      const proteinG = Math.round(item.proteinG * 10) / 10;
      const carbsG = Math.round(item.carbsG * 10) / 10;
      const fatG = Math.round(item.fatG * 10) / 10;
      const estimatedWeightG = Math.round(item.estimatedWeightG * 10) / 10;

      const atwaterCalories = Math.round(proteinG * 4 + carbsG * 4 + fatG * 9);
      const diff = Math.abs(item.calories - atwaterCalories);
      const relativeDiff = atwaterCalories > 0 ? diff / atwaterCalories : 0;

      // Allow up to 12% variance (or 15 kcal) for high-fiber foods (e.g. broccoli/avocado where insoluble fiber < 4 kcal/g);
      // if variance exceeds this threshold, lock calories to the exact Atwater macro sum.
      const reconciledCalories =
        diff > 15 && relativeDiff > 0.12 ? atwaterCalories : Math.round(item.calories);

      return {
        ...item,
        estimatedWeightG,
        proteinG,
        carbsG,
        fatG,
        calories: reconciledCalories,
      };
    });

    // Authoritatively sum totals from the reconciled items
    let totalCalories = 0;
    let totalProteinG = 0;
    let totalCarbsG = 0;
    let totalFatG = 0;

    for (const item of reconciledItems) {
      totalCalories += item.calories;
      totalProteinG += item.proteinG;
      totalCarbsG += item.carbsG;
      totalFatG += item.fatG;
    }

    return {
      ...validated,
      items: reconciledItems,
      totals: {
        totalCalories: Math.round(totalCalories),
        totalProteinG: Math.round(totalProteinG * 10) / 10,
        totalCarbsG: Math.round(totalCarbsG * 10) / 10,
        totalFatG: Math.round(totalFatG * 10) / 10,
      },
    };
  }
}
