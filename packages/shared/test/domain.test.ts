import test from 'node:test';
import assert from 'node:assert/strict';
import { NutritionCalculator } from '../src/domain/nutrition-calculator';
import { GamificationEngine } from '../src/domain/gamification-rules';

test('NutritionCalculator - BMR Calculation (Mifflin-St Jeor)', () => {
  // Male: 10 * 70 + 6.25 * 175 - 5 * 25 + 5 = 700 + 1093.75 - 125 + 5 = 1673.75 -> 1674
  const maleBmr = NutritionCalculator.calculateBMR('male', 70, 175, 25);
  assert.equal(maleBmr, 1674);

  // Female: 10 * 60 + 6.25 * 165 - 5 * 28 - 161 = 600 + 1031.25 - 140 - 161 = 1330.25 -> 1330
  const femaleBmr = NutritionCalculator.calculateBMR('female', 60, 165, 28);
  assert.equal(femaleBmr, 1330);
});

test('NutritionCalculator - TDEE and Goal Targets', () => {
  const bmr = 1674;
  // Moderate: bmr * 1.55 = 2594.7 -> 2595
  const tdee = NutritionCalculator.calculateTDEE(bmr, 'moderate');
  assert.equal(tdee, 2595);

  // Weight Loss (-500)
  const deficit = NutritionCalculator.calculateTargetCalories(tdee, 'weight_loss');
  assert.equal(deficit, 2095);

  // Weight Gain (+300)
  const surplus = NutritionCalculator.calculateTargetCalories(tdee, 'weight_gain');
  assert.equal(surplus, 2895);

  // General Fitness (0)
  const generalFitness = NutritionCalculator.calculateTargetCalories(tdee, 'general_fitness');
  assert.equal(generalFitness, 2595);

  // Maintain (0)
  const maintain = NutritionCalculator.calculateTargetCalories(tdee, 'maintain');
  assert.equal(maintain, 2595);

  // Macro Split (30% Protein, 40% Carbs, 30% Fat)
  const macros = NutritionCalculator.calculateDefaultMacros(2000);
  assert.equal(macros.proteinG, 150); // 600 kcal / 4
  assert.equal(macros.carbsG, 200);   // 800 kcal / 4
  assert.equal(macros.fatG, 67);      // 600 kcal / 9 = 66.67 -> 67
});

test('NutritionCalculator - calculatePlan structured output', () => {
  const plan = NutritionCalculator.calculatePlan({
    gender: 'female',
    weightKg: 65,
    heightCm: 168,
    ageYears: 30,
    activityLevel: 'light',
    goal: 'weight_loss',
  });

  // Female BMR: 10*65 + 6.25*168 - 5*30 - 161 = 650 + 1050 - 150 - 161 = 1389
  assert.equal(plan.bmr, 1389);
  assert.equal(plan.activityMultiplier, 1.375);
  // TDEE: 1389 * 1.375 = 1909.875 -> 1910
  assert.equal(plan.tdee, 1910);
  assert.equal(plan.activityAdjustmentCalories, 1910 - 1389);
  assert.equal(plan.goalAdjustmentCalories, -500);
  assert.equal(plan.recommendedCalories, 1410);
  assert(plan.formula.name.includes('Mifflin-St Jeor'));
  assert(plan.disclaimer.includes('DISCLAIMER'));
});

test('NutritionCalculator - resolveTargets separates system vs user vs active', () => {
  const input = {
    gender: 'male' as const,
    weightKg: 80,
    heightCm: 180,
    ageYears: 28,
    activityLevel: 'moderate' as const,
    goal: 'weight_gain' as const,
    isTargetOverridden: true,
    customCalories: 3100,
    customProteinG: 200,
    customCarbsG: 350,
    customFatG: 85,
  };

  const resolved = NutritionCalculator.resolveTargets(input);

  // System recommended should be derived by formula
  assert.equal(resolved.systemRecommended.calories > 2500, true);
  // User selected should match custom input
  assert.equal(resolved.userSelected?.calories, 3100);
  assert.equal(resolved.userSelected?.proteinG, 200);
  // Active target must reflect the custom override
  assert.equal(resolved.activeTarget.calories, 3100);
  assert.equal(resolved.activeTarget.isOverridden, true);

  // When override is false:
  const noOverride = NutritionCalculator.resolveTargets({
    ...input,
    isTargetOverridden: false,
  });
  assert.equal(noOverride.userSelected, null);
  assert.equal(noOverride.activeTarget.calories, noOverride.systemRecommended.calories);
  assert.equal(noOverride.activeTarget.isOverridden, false);
});

test('GamificationEngine - Level Calculation', () => {
  assert.equal(GamificationEngine.calculateLevel(0), 1);
  assert.equal(GamificationEngine.calculateLevel(50), 1);
  assert.equal(GamificationEngine.calculateLevel(100), 2);
  assert.equal(GamificationEngine.calculateLevel(300), 3);
});

test('GamificationEngine - Streak Evaluation', () => {
  // First meal ever
  const first = GamificationEngine.evaluateStreak(null, '2026-10-06', 0, 0);
  assert.equal(first.newStreak, 1);
  assert.equal(first.isFirstMealToday, true);

  // Same day log (streak should not double increment)
  const sameDay = GamificationEngine.evaluateStreak('2026-10-06', '2026-10-06', 1, 1);
  assert.equal(sameDay.newStreak, 1);
  assert.equal(sameDay.isFirstMealToday, false);

  // Consecutive day (yesterday -> today)
  const nextDay = GamificationEngine.evaluateStreak('2026-10-05', '2026-10-06', 1, 1);
  assert.equal(nextDay.newStreak, 2);
  assert.equal(nextDay.isFirstMealToday, true);

  // Streak broken (3 days gap)
  const broken = GamificationEngine.evaluateStreak('2026-10-02', '2026-10-06', 5, 5);
  assert.equal(broken.newStreak, 1);
  assert.equal(broken.isFirstMealToday, true);
});
