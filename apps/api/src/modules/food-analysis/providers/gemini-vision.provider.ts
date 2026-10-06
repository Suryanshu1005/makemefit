import { IFoodVisionProvider, AnalyzeFoodImageInput, RawFoodVisionResult } from '../food-analysis.interface';
import { AppError } from '../../../core/errors/app-error';

const SYSTEM_PROMPT = `You are an expert clinical sports nutritionist and AI computer vision system for food and meal analysis.
Analyze the user's food photo and return a structured JSON response identifying:
1. "dishName": A concise, natural title of the dish or meal.
2. "mealSlotSuggestion": "breakfast" | "lunch" | "dinner" | "snack" based on typical eating patterns.
3. "isIdentifiedAsFood": true if real food is present, false if non-food or unrecognizable.
4. "items": Array of distinct food components with:
   - "name": ingredient / item name
   - "quantity": estimated number
   - "unit": e.g. "piece", "cup", "fillet", "slice", "serving"
   - "estimatedWeightG": estimated portion weight in grams
   - "calories": whole integer kcal
   - "proteinG": grams of protein
   - "carbsG": grams of carbohydrates
   - "fatG": grams of fat
   - "confidence": "high" | "medium" | "low"
   - "notes": brief comment on portion or preparation method
5. "totals": Sum of "totalCalories", "totalProteinG", "totalCarbsG", "totalFatG".
6. "uncertainty":
   - "overallConfidence": "high" | "medium" | "low"
   - "confidenceScore": float between 0.0 and 1.0
   - "uncertainties": array of human-readable caveats (e.g. "Oils or dressing may not be fully visible", "Ingredients are overlapping", "Portion size estimated without 3D depth reference")
   - "hasHiddenIngredients": boolean
   - "isAmbiguous": boolean
   - "portionEstimationCertainty": "high" | "medium" | "low"

CRITICAL: Return ONLY raw valid JSON. Do not include introductory text or markdown formatting.`;

export class GeminiFoodVisionProvider implements IFoodVisionProvider {
  public readonly providerName = 'gemini-vision';
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || '';
    this.model = model || process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  }

  public async analyzeImage(input: AnalyzeFoodImageInput): Promise<RawFoodVisionResult> {
    if (!this.apiKey) {
      throw new AppError(
        'Gemini API key is not configured. Set GEMINI_API_KEY in environment variables.',
        500,
        'AI_CONFIG_ERROR'
      );
    }

    const startTime = Date.now();
    const timeoutMs = input.timeoutMs ?? 25000;
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

    const base64Image = input.imageBuffer.toString('base64');
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const requestBody = {
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: input.mimeType,
                data: base64Image,
              },
            },
            {
              text: input.userNotes
                ? `Analyze this food image. User provided contextual note: "${input.userNotes}"`
                : 'Analyze this food image and estimate nutrition.',
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutTimer);

      if (!response.ok) {
        const errorText = await response.text();
        throw new AppError(
          `Gemini API request failed with status ${response.status}: ${errorText.slice(0, 200)}`,
          502,
          'AI_PROVIDER_ERROR'
        );
      }

      const json = await response.json();
      const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        throw new AppError('Gemini API returned an empty completion', 502, 'EMPTY_AI_RESPONSE');
      }

      const latencyMs = Date.now() - startTime;

      return {
        rawPayload: rawText,
        latencyMs,
        modelProvider: `${this.providerName}-${this.model}`,
      };
    } catch (err: any) {
      clearTimeout(timeoutTimer);
      if (err.name === 'AbortError' || err.code === 20) {
        throw new AppError(`AI vision request timed out after ${timeoutMs}ms`, 504, 'AI_TIMEOUT');
      }
      if (err instanceof AppError) {
        throw err;
      }
      throw new AppError(`Failed to communicate with Gemini API: ${err.message}`, 502, 'AI_PROVIDER_ERROR');
    }
  }
}
