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
   * Validates raw parsed object against strict application schema.
   * Attaches provider metadata and returns canonical NormalizedFoodAnalysis.
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

    return result.data;
  }
}
