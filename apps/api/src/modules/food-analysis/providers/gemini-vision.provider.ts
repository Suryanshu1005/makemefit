import crypto from 'crypto';
import { IFoodVisionProvider, AnalyzeFoodImageInput, RawFoodVisionResult } from '../food-analysis.interface';
import { AppError } from '../../../core/errors/app-error';

const SYSTEM_PROMPT = `You are a clinical sports nutritionist, food scientist, and deterministic AI computer vision system.
Your task is to analyze food photos with reproducible, scientifically grounded macronutrient calculations based on USDA FoodData Central and ICMR-NIN Indian Food Composition Tables (IFCT).

FOLLOW THIS MANDATORY 5-STEP CALCULATION PROTOCOL:

STEP 1 — VOLUMETRIC & GEOMETRIC PORTION WEIGHT ESTIMATION (estimatedWeightG):
- Use plate, bowl (katori), cup, glass, and utensil geometry for scale:
  * Standard dinner plate diameter = 26–28 cm
  * Standard Indian katori / small bowl = 150 ml (~150g–170g cooked dal/curry/curd)
  * Standard medium serving bowl = 250–300 ml (~250g–300g)
  * Standard cooked cup of rice/grains = 185g–195g
  * Standard Indian breads: 1 medium phulka/chapati = 35g–40g; 1 medium paratha = 65g–75g; 1 naan/bhatura = 80g–100g; 1 poori = 25g–30g
  * Standard discrete items: 1 medium idli = 45g; 1 plain dosa = 90g; 1 masala dosa = 160g; 1 whole egg = 50g; 1 slice sandwich bread = 30g

STEP 2 — PER-100g BASE NUTRITIONAL DENSITY:
- Anchor every food item to its canonical cooked per-100g protein, carbohydrate, and fat density from USDA / IFCT tables.
- Multiply the per-100g base macros by (estimatedWeightG / 100).

STEP 3 — EXPLICIT COOKING OIL, GHEE, BUTTER & HIDDEN FAT ACCOUNTING:
- You MUST evaluate visual surface sheen, gravy separation, browning, and culinary preparation method:
  * Raw / Boiled / Steamed / Plain Roasted (e.g. steamed rice, boiled egg, raw salad, dry phulka): +0g added oil.
  * Lightly Pan-Cooked / Brushed / Tawa (e.g. ghee-brushed chapati, cheela, omelette, grilled meat): +3g to 5g oil/ghee per serving (+27 to 45 kcal).
  * Home-Style Sautéed Sabzi / Dal Tadka / Curry: +6g to 9g cooking oil/ghee per 150g bowl (+54 to 81 kcal).
  * Restaurant / Dhaba / Rich Gravy (e.g. Paneer Butter Masala, Dal Makhani, Chicken Tikka Masala, Biryani, Korma, Chole): +12g to 18g fat per serving (+108 to 162 kcal) from oil, butter, cream, or cashew/melon-seed paste. If a visible floating oil layer (rogan) or butter pat is present, include it in fatG.
  * Deep-Fried Foods (e.g. Samosa, Pakora, Poori, Bhatura, Vada, French Fries, Fried Chicken, Namkeen): Account for 15% to 22% absorbed frying oil/ghee by weight.
- Always state the estimated grams of cooking oil/ghee/butter included inside each cooked item's "notes" field (e.g. "Cooked weight 160g; includes ~8g tadka oil/ghee").

STEP 4 — EXPLICIT SWEETNESS, ADDED SUGAR, JAGGERY & SYRUP ACCOUNTING:
- Evaluate beverages, sauces, glazes, and desserts for added refined sugar, jaggery (gur), honey, or sugar syrup (chasni):
  * Unsweetened items: 0g added sugar.
  * Sweetened Hot Beverages (Chai, Milk Coffee - 150ml cup): Assume 1.5 tsp (~6g–8g added sugar = 24–32 kcal) unless user notes specify "no sugar / unsweetened".
  * Sweet Cold Beverages (Sweet Lassi, Milkshake, Cold Coffee, Packaged Juice - 250–300ml): Account for 16g to 26g added sugar/syrup (+64 to 104 kcal).
  * Syrup-Soaked Indian Sweets (Gulab Jamun, Rasgulla, Jalebi, Imarti, Malpua): Account for sugar syrup saturation (42% to 55% of total weight is carbohydrates, plus 10% to 16% fat from ghee/khoya; e.g. 1 medium 50g Gulab Jamun = ~165 kcal, 24g carbs, 6g fat, 2.5g protein).
  * Dense Milk/Nut/Grain Sweets (Halwa, Barfi, Kaju Katli, Laddu, Peda, Kheer): Account for 30% to 45% carbohydrates (sugar) and 14% to 22% fat (ghee + khoya/nuts).
  * Baked Desserts & Pastries (Cake, Brownie, Donut, Cookie): Account for refined sugar (35%–50% carbs) and butter/shortening (15%–25% fat).
- Always state the estimated grams of added sugar/syrup inside the item's "notes" field (e.g. "Includes ~15g sugar syrup & ~6g ghee").
- If the user provides contextual notes (e.g. "no sugar", "air-fried", "cooked in 1 tsp olive oil", "extra butter"), strictly override default assumptions with the user's stated preparation.

STEP 5 — STRICT ATWATER CALORIE RECONCILIATION:
- For every item, "calories" MUST equal the physiological energy of its macros:
  calories = round((4 * proteinG) + (4 * carbsG) + (9 * fatG))
- Round proteinG, carbsG, and fatG to 1 decimal place.
- "totals" MUST equal the exact mathematical sum of all items.

OUTPUT JSON SCHEMA:
{
  "dishName": "string",
  "mealSlotSuggestion": "breakfast" | "lunch" | "dinner" | "snack",
  "isIdentifiedAsFood": boolean,
  "items": [
    {
      "name": "string",
      "quantity": number,
      "unit": "string",
      "estimatedWeightG": number,
      "calories": number,
      "proteinG": number,
      "carbsG": number,
      "fatG": number,
      "confidence": "high" | "medium" | "low",
      "notes": "string (must mention cooking method, estimated oil/ghee g, and added sugar g where applicable)"
    }
  ],
  "totals": {
    "totalCalories": number,
    "totalProteinG": number,
    "totalCarbsG": number,
    "totalFatG": number
  },
  "uncertainty": {
    "overallConfidence": "high" | "medium" | "low",
    "confidenceScore": number,
    "uncertainties": ["string"],
    "hasHiddenIngredients": boolean,
    "isAmbiguous": boolean,
    "portionEstimationCertainty": "high" | "medium" | "low"
  }
}

CRITICAL: Return ONLY raw valid JSON. Do not include markdown fences or commentary.`;

interface CachedVisionEntry {
  rawPayload: string;
  modelProvider: string;
  timestamp: number;
}

export class GeminiFoodVisionProvider implements IFoodVisionProvider {
  public readonly providerName = 'gemini-vision';
  private apiKey: string;
  private model: string;

  // Deterministic content-addressable cache keyed by SHA-256(imageBytes + normalizedUserNotes + model)
  // Ensures re-analyzing the exact same image with the same notes never produces drifting numbers
  private static deterministicCache = new Map<string, CachedVisionEntry>();

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || '';
    this.model = model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  }

  private static computeDeterministicFingerprint(
    imageBuffer: Buffer,
    userNotes: string | undefined,
    model: string
  ): string {
    const normalizedNotes = (userNotes || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return crypto
      .createHash('sha256')
      .update(imageBuffer)
      .update(`|notes:${normalizedNotes}|model:${model}|v2`)
      .digest('hex');
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
    const fingerprint = GeminiFoodVisionProvider.computeDeterministicFingerprint(
      input.imageBuffer,
      input.userNotes,
      this.model
    );

    // Return deterministic cached result if identical image + identical userNotes was already analyzed
    const cached = GeminiFoodVisionProvider.deterministicCache.get(fingerprint);
    if (cached) {
      return {
        rawPayload: cached.rawPayload,
        latencyMs: Math.max(1, Date.now() - startTime),
        modelProvider: cached.modelProvider,
      };
    }

    const timeoutMs = input.timeoutMs ?? 25000;
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

    const base64Image = input.imageBuffer.toString('base64');
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const userPrompt = input.userNotes?.trim()
      ? `Analyze this food image using the 5-step clinical nutrition protocol (volumetric weight, USDA/IFCT per-100g density, explicit oil/ghee accounting, explicit sugar/sweetness accounting, and Atwater calorie reconciliation).\nUSER PREPARATION / CONTEXT NOTES (prioritize these): "${input.userNotes.trim()}"`
      : `Analyze this food image using the 5-step clinical nutrition protocol (volumetric weight, USDA/IFCT per-100g density, explicit oil/ghee accounting, explicit sugar/sweetness accounting, and Atwater calorie reconciliation).`;

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
              text: userPrompt,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.0,
        topP: 0.1,
        topK: 1,
        seed: 42,
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
      const modelProvider = `${this.providerName}-${this.model}`;

      // Store in deterministic cache (cap size at 500 entries to prevent unbounded memory growth)
      if (GeminiFoodVisionProvider.deterministicCache.size >= 500) {
        const oldestKey = GeminiFoodVisionProvider.deterministicCache.keys().next().value;
        if (oldestKey) GeminiFoodVisionProvider.deterministicCache.delete(oldestKey);
      }
      GeminiFoodVisionProvider.deterministicCache.set(fingerprint, {
        rawPayload: rawText,
        modelProvider,
        timestamp: Date.now(),
      });

      return {
        rawPayload: rawText,
        latencyMs,
        modelProvider,
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
