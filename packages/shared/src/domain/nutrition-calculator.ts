import { ActivityLevel, FitnessGoal, Gender } from '../schemas/user';
import { CalorieCalculationBreakdown, TargetResolution } from '../schemas/nutrition';

export interface CalorieCalculationInput {
  gender: Gender;
  weightKg: number;
  heightCm: number;
  ageYears: number;
  activityLevel: ActivityLevel;
  goal: FitnessGoal;
}

export interface TargetResolutionInput extends CalorieCalculationInput {
  isTargetOverridden?: boolean;
  customCalories?: number | null;
  customProteinG?: number | null;
  customCarbsG?: number | null;
  customFatG?: number | null;
}

export const NUTRITION_DISCLAIMER =
  'DISCLAIMER: Calorie and macronutrient estimates are calculated using evidence-based metabolic formulas for informational and fitness tracking purposes only. They do not constitute medical, clinical, or dietary advice. Individual metabolic rates vary. Consult a physician or registered dietitian before beginning an aggressive caloric deficit or specialized nutritional protocol.';

/**
 * Dedicated Nutrition and Calorie Calculation Service
 *
 * Methodological Basis:
 * - Basal Metabolic Rate (BMR): Calculated using the Mifflin-St Jeor Equation (1990).
 *   Recognized by the American Dietetic Association (ADA) as the most clinically
 *   reliable predictive equation for healthy individuals without body fat measurement.
 *
 * - Total Daily Energy Expenditure (TDEE): Derived from physical activity multipliers
 *   accounting for Non-Exercise Activity Thermogenesis (NEAT) and Exercise Activity (EAT).
 *
 * - Goal Adjustment: Calibrated caloric modifications designed for sustainable fat loss
 *   or lean muscle accretion with physiological safety floors.
 */
export class NutritionCalculator {
  /**
   * Calculates Basal Metabolic Rate (BMR) using the Mifflin-St Jeor Equation.
   *
   * Formula:
   *   Male:   BMR = 10 * weight(kg) + 6.25 * height(cm) - 5 * age(years) + 5
   *   Female: BMR = 10 * weight(kg) + 6.25 * height(cm) - 5 * age(years) - 161
   */
  static calculateBMR(gender: Gender, weightKg: number, heightCm: number, ageYears: number): number {
    const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
    const bmr = gender === 'male' ? base + 5 : base - 161;
    return Math.round(Math.max(500, bmr));
  }

  /**
   * Returns the scientific activity level multiplier.
   * - sedentary: 1.2 (Desk work, little to no intentional movement)
   * - light: 1.375 (Light physical activity or 1-3 training sessions/week)
   * - moderate: 1.55 (Moderate exercise 3-5 sessions/week)
   * - very_active: 1.725 (Rigorous training 6-7 days/week)
   * - extra_active: 1.9 (Intense athletic training twice daily or physical labor)
   */
  static getActivityMultiplier(activityLevel: ActivityLevel): number {
    const multipliers: Record<ActivityLevel, number> = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      very_active: 1.725,
      extra_active: 1.9,
    };
    return multipliers[activityLevel] ?? 1.2;
  }

  /**
   * Calculates Total Daily Energy Expenditure (TDEE) in kcal/day.
   */
  static calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
    const multiplier = this.getActivityMultiplier(activityLevel);
    return Math.round(bmr * multiplier);
  }

  /**
   * Returns the caloric adjustment for a given fitness goal.
   * - weight_loss: -500 kcal/day (targeting ~0.45 kg / 1 lb fat loss per week)
   * - maintain: 0 kcal/day (energy balance)
   * - weight_gain: +300 kcal/day (hypertrophic caloric surplus for muscle synthesis)
   * - general_fitness: 0 kcal/day (isocaloric performance & metabolic conditioning)
   */
  static getGoalAdjustment(goal: FitnessGoal): number {
    switch (goal) {
      case 'weight_loss':
        return -500;
      case 'weight_gain':
        return 300;
      case 'maintain':
      case 'general_fitness':
      default:
        return 0;
    }
  }

  /**
   * Calculates Recommended Target Calories with physiological safety floor.
   * Minimum floor: 1200 kcal/day to safeguard essential hormonal and metabolic functions.
   */
  static calculateTargetCalories(tdee: number, goal: FitnessGoal): number {
    const adjustment = this.getGoalAdjustment(goal);
    const target = tdee + adjustment;
    return Math.round(Math.max(1200, target));
  }

  /**
   * Calculates default macronutrient distribution based on the target calories:
   * - Protein: 30% of energy (4 kcal/g) -> supports muscle protein synthesis & satiety
   * - Carbohydrates: 40% of energy (4 kcal/g) -> primary glycolytic fuel for physical performance
   * - Fats: 30% of energy (9 kcal/g) -> essential fatty acids and endocrine optimization
   */
  static calculateDefaultMacros(targetCalories: number) {
    const proteinCalories = Math.round(targetCalories * 0.3);
    const carbsCalories = Math.round(targetCalories * 0.4);
    const fatCalories = Math.round(targetCalories * 0.3);

    return {
      proteinG: Math.round(proteinCalories / 4),
      carbsG: Math.round(carbsCalories / 4),
      fatG: Math.round(fatCalories / 9),
      proteinCalories,
      carbsCalories,
      fatCalories,
      proteinPct: 30,
      carbsPct: 40,
      fatPct: 30,
    };
  }

  /**
   * Calculates age in full years from a YYYY-MM-DD birth date string.
   */
  static calculateAge(birthDateString: string, referenceDate: Date = new Date()): number {
    const birthDate = new Date(birthDateString);
    if (isNaN(birthDate.getTime())) {
      return 25; // fallback default
    }
    let age = referenceDate.getFullYear() - birthDate.getFullYear();
    const monthDiff = referenceDate.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < birthDate.getDate())) {
      age--;
    }
    return Math.max(0, age);
  }

  /**
   * Dedicated structured calorie calculation service.
   * Returns a complete breakdown separating:
   * 1. Estimated BMR
   * 2. Activity adjustment
   * 3. Maintenance calories (TDEE)
   * 4. Goal adjustment
   * 5. Recommended daily calorie target & macros
   * 6. Methodological documentation & medical disclaimer
   */
  static calculatePlan(input: CalorieCalculationInput): CalorieCalculationBreakdown {
    const bmr = this.calculateBMR(input.gender, input.weightKg, input.heightCm, input.ageYears);
    const activityMultiplier = this.getActivityMultiplier(input.activityLevel);
    const tdee = Math.round(bmr * activityMultiplier);
    const activityAdjustmentCalories = tdee - bmr;

    const goalAdjustmentCalories = this.getGoalAdjustment(input.goal);
    const recommendedCalories = Math.round(Math.max(1200, tdee + goalAdjustmentCalories));
    const macros = this.calculateDefaultMacros(recommendedCalories);

    return {
      bmr,
      activityMultiplier,
      activityAdjustmentCalories,
      tdee,
      goal: input.goal,
      goalAdjustmentCalories,
      recommendedCalories,
      recommendedMacros: macros,
      formula: {
        name: 'Mifflin-St Jeor Equation (1990)',
        description:
          'Peer-reviewed energy expenditure formula selected for its validated accuracy across athletic and non-athletic cohorts.',
        bmrFormula:
          input.gender === 'male'
            ? 'BMR = 10 * weight(kg) + 6.25 * height(cm) - 5 * age(yr) + 5'
            : 'BMR = 10 * weight(kg) + 6.25 * height(cm) - 5 * age(yr) - 161',
        activityExplanation: `Activity level "${input.activityLevel}" applies a ${activityMultiplier}x multiplier (+${activityAdjustmentCalories} kcal) for daily movement.`,
        goalRationale:
          input.goal === 'weight_loss'
            ? 'Moderate deficit of -500 kcal/day targets healthy fat reduction without excessive muscle loss.'
            : input.goal === 'weight_gain'
            ? 'Surplus of +300 kcal/day promotes muscle hypertrophy while minimizing fat accumulation.'
            : 'Isocaloric maintenance target keeps energy balance stable and supports consistent training performance.',
      },
      disclaimer: NUTRITION_DISCLAIMER,
    };
  }

  /**
   * Distinguishes and resolves:
   * 1. System-recommended target
   * 2. User-selected target (if override is enabled)
   * 3. Current active target
   */
  static resolveTargets(input: TargetResolutionInput): TargetResolution {
    const plan = this.calculatePlan(input);

    const systemRecommended = {
      calories: plan.recommendedCalories,
      proteinG: plan.recommendedMacros.proteinG,
      carbsG: plan.recommendedMacros.carbsG,
      fatG: plan.recommendedMacros.fatG,
    };

    const isOverridden = Boolean(input.isTargetOverridden && input.customCalories);

    const userSelected = isOverridden
      ? {
          calories: input.customCalories ?? null,
          proteinG: input.customProteinG ?? null,
          carbsG: input.customCarbsG ?? null,
          fatG: input.customFatG ?? null,
        }
      : null;

    const activeTarget = {
      calories: isOverridden ? (input.customCalories as number) : systemRecommended.calories,
      proteinG: isOverridden && input.customProteinG != null
        ? input.customProteinG
        : systemRecommended.proteinG,
      carbsG: isOverridden && input.customCarbsG != null
        ? input.customCarbsG
        : systemRecommended.carbsG,
      fatG: isOverridden && input.customFatG != null
        ? input.customFatG
        : systemRecommended.fatG,
      isOverridden,
    };

    return {
      calculation: plan,
      systemRecommended,
      userSelected,
      activeTarget,
    };
  }
}
