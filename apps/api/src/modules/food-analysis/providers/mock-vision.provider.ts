import { IFoodVisionProvider, AnalyzeFoodImageInput, RawFoodVisionResult } from '../food-analysis.interface';
import { AppError } from '../../../core/errors/app-error';

export interface MockProviderOptions {
  shouldFail?: boolean;
  failureMessage?: string;
  shouldTimeout?: boolean;
  timeoutMs?: number;
  returnMalformedJson?: boolean;
  returnInvalidSchema?: boolean;
  returnEmptyItems?: boolean;
  returnLowConfidence?: boolean;
  customPayload?: Record<string, any>;
  latencyMs?: number;
}

export class MockFoodVisionProvider implements IFoodVisionProvider {
  public readonly providerName = 'mock-vision-v1';
  private static globalOverrideOptions: MockProviderOptions | null = null;
  private instanceOptions: MockProviderOptions;

  constructor(options: MockProviderOptions = {}) {
    this.instanceOptions = options;
  }

  public static setMockScenario(options: MockProviderOptions | null) {
    this.globalOverrideOptions = options;
  }

  public static reset() {
    this.globalOverrideOptions = null;
  }

  public async analyzeImage(input: AnalyzeFoodImageInput): Promise<RawFoodVisionResult> {
    const opts = { ...this.instanceOptions, ...MockFoodVisionProvider.globalOverrideOptions };
    const simulatedLatency = opts.latencyMs ?? 50;

    // 1. Simulate Timeout
    if (opts.shouldTimeout) {
      await new Promise((resolve) => setTimeout(resolve, (input.timeoutMs ?? 200) + 50));
      throw new AppError('AI vision provider request timed out', 504, 'AI_TIMEOUT');
    }

    // Small delay to simulate inference
    if (simulatedLatency > 0) {
      await new Promise((resolve) => setTimeout(resolve, simulatedLatency));
    }

    // 2. Simulate Upstream Provider Failure (e.g. 500 error / rate limit)
    if (opts.shouldFail) {
      throw new AppError(
        opts.failureMessage || 'Simulated upstream AI provider service unavailable',
        502,
        'AI_PROVIDER_ERROR'
      );
    }

    // 3. Simulate Malformed Non-JSON String
    if (opts.returnMalformedJson) {
      return {
        rawPayload: 'I cannot analyze this image because it is blurry and not valid JSON {[[',
        latencyMs: simulatedLatency,
        modelProvider: this.providerName,
      };
    }

    // 4. Simulate Invalid Schema (e.g., negative calories or invalid fields)
    if (opts.returnInvalidSchema) {
      return {
        rawPayload: {
          dishName: 'Mystery Dish',
          items: [
            {
              name: 'Invalid Item',
              calories: -100, // Invalid: negative calories
              proteinG: 'lots of protein', // Invalid: string instead of number
            },
          ],
        },
        latencyMs: simulatedLatency,
        modelProvider: this.providerName,
      };
    }

    // 5. Simulate Missing Items (empty detection or non-food)
    if (opts.returnEmptyItems) {
      return {
        rawPayload: {
          dishName: 'Non-Food Object',
          isIdentifiedAsFood: false,
          items: [],
          totals: {
            totalCalories: 0,
            totalProteinG: 0,
            totalCarbsG: 0,
            totalFatG: 0,
          },
          uncertainty: {
            overallConfidence: 'low',
            confidenceScore: 0.1,
            uncertainties: ['No recognizable food items found in the image.'],
            hasHiddenIngredients: false,
            isAmbiguous: true,
            portionEstimationCertainty: 'low',
          },
        },
        latencyMs: simulatedLatency,
        modelProvider: this.providerName,
      };
    }

    // 6. Simulate Low-Confidence / Needs Review Result
    if (opts.returnLowConfidence) {
      return {
        rawPayload: {
          dishName: 'Stew or Soup (Visually Ambiguous)',
          mealSlotSuggestion: 'dinner',
          isIdentifiedAsFood: true,
          items: [
            {
              name: 'Mixed Stew with Unclear Meat and Vegetables',
              quantity: 1,
              unit: 'bowl',
              estimatedWeightG: 350,
              calories: 420,
              proteinG: 22,
              carbsG: 35,
              fatG: 20,
              confidence: 'low',
              notes: 'Thick opaque broth conceals exact ingredients and oil content.',
            },
          ],
          totals: {
            totalCalories: 420,
            totalProteinG: 22,
            totalCarbsG: 35,
            totalFatG: 20,
          },
          uncertainty: {
            overallConfidence: 'low',
            confidenceScore: 0.42,
            uncertainties: [
              'Ingredients are submerged in opaque broth or sauce',
              'Cooking oils or heavy cream cannot be visually measured',
              'Hidden sodium and sugar in prepared soup base',
            ],
            hasHiddenIngredients: true,
            isAmbiguous: true,
            portionEstimationCertainty: 'low',
          },
        },
        latencyMs: simulatedLatency,
        modelProvider: this.providerName,
      };
    }

    // 7. Custom Payload Override
    if (opts.customPayload) {
      return {
        rawPayload: opts.customPayload,
        latencyMs: simulatedLatency,
        modelProvider: this.providerName,
      };
    }

    // 8. Default Realistic High-Fidelity Food Detection Result
    const defaultResult = {
      dishName: 'Grilled Chicken Bowl with Brown Rice & Avocado',
      mealSlotSuggestion: 'lunch',
      isIdentifiedAsFood: true,
      items: [
        {
          name: 'Grilled Chicken Breast',
          quantity: 1,
          unit: 'breast',
          estimatedWeightG: 160,
          calories: 265,
          proteinG: 49.5,
          carbsG: 0.0,
          fatG: 5.8,
          confidence: 'high',
          notes: 'Skinless, distinct grill marks visible',
        },
        {
          name: 'Cooked Brown Rice',
          quantity: 1,
          unit: 'cup',
          estimatedWeightG: 195,
          calories: 218,
          proteinG: 4.5,
          carbsG: 45.8,
          fatG: 1.6,
          confidence: 'high',
          notes: 'Standard cooked medium grain',
        },
        {
          name: 'Fresh Avocado Slices',
          quantity: 0.5,
          unit: 'medium avocado',
          estimatedWeightG: 75,
          calories: 120,
          proteinG: 1.5,
          carbsG: 6.4,
          fatG: 11.0,
          confidence: 'high',
          notes: 'Half avocado sliced neatly',
        },
        {
          name: 'Steamed Broccoli Florets',
          quantity: 1,
          unit: 'cup',
          estimatedWeightG: 90,
          calories: 31,
          proteinG: 2.6,
          carbsG: 6.0,
          fatG: 0.3,
          confidence: 'high',
          notes: 'Bright green, lightly steamed',
        },
      ],
      totals: {
        totalCalories: 634,
        totalProteinG: 58.1,
        totalCarbsG: 58.2,
        totalFatG: 18.7,
      },
      uncertainty: {
        overallConfidence: 'high',
        confidenceScore: 0.88,
        uncertainties: [
          'Cooking oils or butter used during chicken grilling estimated at standard cooking levels',
          'Portion depth estimated without 3D depth calibration',
        ],
        hasHiddenIngredients: false,
        isAmbiguous: false,
        portionEstimationCertainty: 'medium',
      },
    };

    return {
      rawPayload: defaultResult,
      latencyMs: simulatedLatency,
      modelProvider: this.providerName,
    };
  }
}
