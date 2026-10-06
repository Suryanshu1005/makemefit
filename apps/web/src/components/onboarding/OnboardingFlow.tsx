import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { NutritionCalculator } from '@makemefit/shared';
import {
  ChevronLeft,
  ChevronRight,
  User,
  Scale,
  Zap,
  Target,
  Calculator,
  CheckCircle,
  Sparkles,
} from 'lucide-react';

export interface OnboardingDraft {
  gender: 'male' | 'female';
  birthDate: string;
  heightCm: number;
  weightKg: number;
  heightUnit: 'cm' | 'ft';
  weightUnit: 'kg' | 'lbs';
  heightFt: number;
  heightIn: number;
  weightLbs: number;
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'very_active' | 'extra_active';
  goal: 'weight_loss' | 'maintain' | 'weight_gain';
  isTargetOverridden: boolean;
  customCalories: number;
  customProteinG: number;
  customCarbsG: number;
  customFatG: number;
  timezone: string;
}

export interface OnboardingFlowProps {
  onComplete?: () => void;
}

const STORAGE_KEY = 'makemefit_onboarding_draft';

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onComplete }) => {
  const { user, completeOnboarding } = useAuth();
  const [step, setStep] = useState<number>(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Initial draft loaded from localStorage if available, or sensible defaults
  const [draft, setDraft] = useState<OnboardingDraft>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore parse error
      }
    }
    const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return {
      gender: 'male',
      birthDate: '1998-05-15',
      heightCm: 175,
      weightKg: 70,
      heightUnit: 'cm',
      weightUnit: 'kg',
      heightFt: 5,
      heightIn: 9,
      weightLbs: 154,
      activityLevel: 'moderate',
      goal: 'maintain',
      isTargetOverridden: false,
      customCalories: 2000,
      customProteinG: 150,
      customCarbsG: 200,
      customFatG: 67,
      timezone: user?.timezone || detectedTz,
    };
  });

  // Save draft on every change to prevent lost data upon refresh
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  }, [draft]);

  // Derived calculations
  const age = useMemo(() => {
    return NutritionCalculator.calculateAge(draft.birthDate);
  }, [draft.birthDate]);

  const bmr = useMemo(() => {
    return NutritionCalculator.calculateBMR(draft.gender, draft.weightKg, draft.heightCm, age);
  }, [draft.gender, draft.weightKg, draft.heightCm, age]);

  const tdee = useMemo(() => {
    return NutritionCalculator.calculateTDEE(bmr, draft.activityLevel);
  }, [bmr, draft.activityLevel]);

  const recommendedCalories = useMemo(() => {
    return NutritionCalculator.calculateTargetCalories(tdee, draft.goal);
  }, [tdee, draft.goal]);

  const recommendedMacros = useMemo(() => {
    return NutritionCalculator.calculateDefaultMacros(recommendedCalories);
  }, [recommendedCalories]);

  // Height / Weight unit converters
  const handleHeightUnitChange = (unit: 'cm' | 'ft') => {
    if (unit === 'ft') {
      const totalInches = draft.heightCm / 2.54;
      const ft = Math.floor(totalInches / 12);
      const inches = Math.round(totalInches % 12);
      setDraft((prev) => ({ ...prev, heightUnit: 'ft', heightFt: ft, heightIn: inches }));
    } else {
      setDraft((prev) => ({ ...prev, heightUnit: 'cm' }));
    }
  };

  const handleFtInChange = (ft: number, inches: number) => {
    const totalInches = ft * 12 + inches;
    const cm = Math.round(totalInches * 2.54);
    setDraft((prev) => ({ ...prev, heightFt: ft, heightIn: inches, heightCm: cm }));
  };

  const handleWeightUnitChange = (unit: 'kg' | 'lbs') => {
    if (unit === 'lbs') {
      const lbs = Math.round(draft.weightKg * 2.20462);
      setDraft((prev) => ({ ...prev, weightUnit: 'lbs', weightLbs: lbs }));
    } else {
      setDraft((prev) => ({ ...prev, weightUnit: 'kg' }));
    }
  };

  const handleWeightLbsChange = (lbs: number) => {
    const kg = Math.round((lbs / 2.20462) * 10) / 10;
    setDraft((prev) => ({ ...prev, weightLbs: lbs, weightKg: kg }));
  };

  // Step Validation
  const validateCurrentStep = (): boolean => {
    setErrorMsg(null);

    if (step === 1) {
      if (!draft.birthDate) {
        setErrorMsg('Please select your date of birth.');
        return false;
      }
      if (age < 13 || age > 120) {
        setErrorMsg('Age must be between 13 and 120 years.');
        return false;
      }
    }

    if (step === 2) {
      if (draft.heightCm < 50 || draft.heightCm > 280) {
        setErrorMsg('Height must be between 50 cm and 280 cm.');
        return false;
      }
      if (draft.weightKg < 20 || draft.weightKg > 500) {
        setErrorMsg('Weight must be between 20 kg and 500 kg.');
        return false;
      }
    }

    if (step === 5) {
      if (draft.isTargetOverridden) {
        if (draft.customCalories < 800 || draft.customCalories > 10000) {
          setErrorMsg('Custom calories must be between 800 and 10,000 kcal.');
          return false;
        }
      }
    }

    return true;
  };

  const handleNext = () => {
    if (!validateCurrentStep()) return;
    setStep((s) => Math.min(6, s + 1));
  };

  const handleBack = () => {
    setErrorMsg(null);
    setStep((s) => Math.max(1, s - 1));
  };

  const handleSubmitOnboarding = async () => {
    if (!validateCurrentStep()) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await completeOnboarding({
        gender: draft.gender,
        birthDate: draft.birthDate,
        heightCm: draft.heightCm,
        weightKg: draft.weightKg,
        activityLevel: draft.activityLevel,
        goal: draft.goal,
        isTargetOverridden: draft.isTargetOverridden,
        customCalories: draft.isTargetOverridden ? draft.customCalories : undefined,
        customProteinG: draft.isTargetOverridden ? draft.customProteinG : undefined,
        customCarbsG: draft.isTargetOverridden ? draft.customCarbsG : undefined,
        customFatG: draft.isTargetOverridden ? draft.customFatG : undefined,
        timezone: draft.timezone,
      });
      localStorage.removeItem(STORAGE_KEY);
      onComplete?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save onboarding information');
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepLabels = [
    'Personal Info',
    'Body Metrics',
    'Activity Level',
    'Fitness Goal',
    'Calorie Target',
    'Confirmation',
  ];

  return (
    <div className="w-full max-w-2xl mx-auto py-4 sm:py-8 px-4 flex flex-col gap-6">
      {/* Progress Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
          <span className="text-kinetic font-semibold uppercase tracking-wider">
            Step {step} of 6: {stepLabels[step - 1]}
          </span>
          <span className="tabular-nums">{Math.round((step / 6) * 100)}% Complete</span>
        </div>

        {/* Multi-step progress line */}
        <div className="w-full h-1.5 bg-obsidian-border rounded-full overflow-hidden flex gap-1">
          {[1, 2, 3, 4, 5, 6].map((s) => (
            <div
              key={s}
              className={`flex-1 h-full rounded-full transition-all duration-300 ${
                s <= step ? 'bg-kinetic shadow-glow-kinetic' : 'bg-obsidian-border/50'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Main Form Container */}
      <Card className="flex flex-col gap-6 p-6 sm:p-8">
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-medium">
            {errorMsg}
          </div>
        )}

        {/* STEP 1: Personal Info */}
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-kinetic/10 border border-kinetic/20 flex items-center justify-center text-kinetic">
                <User className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100">Personal Information</h2>
                <p className="text-xs text-slate-400">
                  Required to calculate your baseline metabolic rate accurately.
                </p>
              </div>
            </div>

            {/* Biological Sex Selection */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-slate-300">
                Biological Sex (for metabolic baseline)
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDraft((p) => ({ ...p, gender: 'male' }))}
                  className={`p-4 rounded-xl border text-sm font-semibold flex flex-col items-center gap-1 transition-all ${
                    draft.gender === 'male'
                      ? 'border-kinetic bg-kinetic/10 text-slate-100 shadow-glow-kinetic'
                      : 'border-obsidian-border bg-obsidian-input text-slate-400 hover:border-obsidian-hover'
                  }`}
                >
                  <span className="text-lg">♂</span>
                  <span>Male</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDraft((p) => ({ ...p, gender: 'female' }))}
                  className={`p-4 rounded-xl border text-sm font-semibold flex flex-col items-center gap-1 transition-all ${
                    draft.gender === 'female'
                      ? 'border-kinetic bg-kinetic/10 text-slate-100 shadow-glow-kinetic'
                      : 'border-obsidian-border bg-obsidian-input text-slate-400 hover:border-obsidian-hover'
                  }`}
                >
                  <span className="text-lg">♀</span>
                  <span>Female</span>
                </button>
              </div>
            </div>

            {/* Birth Date & Age */}
            <div className="flex flex-col gap-1.5">
              <Input
                label="Date of Birth"
                type="date"
                value={draft.birthDate}
                onChange={(e) => setDraft((p) => ({ ...p, birthDate: e.target.value }))}
                helperText={`Calculated Age: ${age} years old`}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>

            {/* Timezone */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-300">Timezone (for midnight rollover)</label>
              <input
                type="text"
                value={draft.timezone}
                onChange={(e) => setDraft((p) => ({ ...p, timezone: e.target.value }))}
                className="w-full bg-obsidian-input border border-obsidian-border rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-kinetic"
              />
              <span className="text-[11px] text-slate-500">
                Daily calorie counters reset at midnight in this timezone.
              </span>
            </div>
          </div>
        )}

        {/* STEP 2: Body Metrics */}
        {step === 2 && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-streak/10 border border-streak/20 flex items-center justify-center text-streak">
                <Scale className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100">Body Measurements</h2>
                <p className="text-xs text-slate-400">
                  Used in the Mifflin-St Jeor formula to determine your exact daily burn.
                </p>
              </div>
            </div>

            {/* Height Input with Unit Toggle */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300">Height</label>
                <div className="flex rounded-lg bg-obsidian-input p-0.5 border border-obsidian-border text-xs">
                  <button
                    type="button"
                    onClick={() => handleHeightUnitChange('cm')}
                    className={`px-2.5 py-0.5 rounded-md font-semibold transition-colors ${
                      draft.heightUnit === 'cm' ? 'bg-kinetic text-obsidian-bg' : 'text-slate-400'
                    }`}
                  >
                    cm
                  </button>
                  <button
                    type="button"
                    onClick={() => handleHeightUnitChange('ft')}
                    className={`px-2.5 py-0.5 rounded-md font-semibold transition-colors ${
                      draft.heightUnit === 'ft' ? 'bg-kinetic text-obsidian-bg' : 'text-slate-400'
                    }`}
                  >
                    ft/in
                  </button>
                </div>
              </div>

              {draft.heightUnit === 'cm' ? (
                <Input
                  type="number"
                  min={50}
                  max={280}
                  value={draft.heightCm}
                  onChange={(e) => setDraft((p) => ({ ...p, heightCm: Number(e.target.value) }))}
                  placeholder="e.g. 175"
                  helperText="Standard range: 50 – 280 cm"
                />
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Feet"
                    type="number"
                    min={1}
                    max={9}
                    value={draft.heightFt}
                    onChange={(e) => handleFtInChange(Number(e.target.value), draft.heightIn)}
                  />
                  <Input
                    label="Inches"
                    type="number"
                    min={0}
                    max={11}
                    value={draft.heightIn}
                    onChange={(e) => handleFtInChange(draft.heightFt, Number(e.target.value))}
                  />
                </div>
              )}
            </div>

            {/* Weight Input with Unit Toggle */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300">Weight</label>
                <div className="flex rounded-lg bg-obsidian-input p-0.5 border border-obsidian-border text-xs">
                  <button
                    type="button"
                    onClick={() => handleWeightUnitChange('kg')}
                    className={`px-2.5 py-0.5 rounded-md font-semibold transition-colors ${
                      draft.weightUnit === 'kg' ? 'bg-kinetic text-obsidian-bg' : 'text-slate-400'
                    }`}
                  >
                    kg
                  </button>
                  <button
                    type="button"
                    onClick={() => handleWeightUnitChange('lbs')}
                    className={`px-2.5 py-0.5 rounded-md font-semibold transition-colors ${
                      draft.weightUnit === 'lbs' ? 'bg-kinetic text-obsidian-bg' : 'text-slate-400'
                    }`}
                  >
                    lbs
                  </button>
                </div>
              </div>

              {draft.weightUnit === 'kg' ? (
                <Input
                  type="number"
                  step="0.1"
                  min={20}
                  max={500}
                  value={draft.weightKg}
                  onChange={(e) => setDraft((p) => ({ ...p, weightKg: Number(e.target.value) }))}
                  placeholder="e.g. 70"
                  helperText="Standard range: 20 – 500 kg"
                />
              ) : (
                <Input
                  type="number"
                  min={44}
                  max={1100}
                  value={draft.weightLbs}
                  onChange={(e) => handleWeightLbsChange(Number(e.target.value))}
                  helperText={`Equivalent to: ${draft.weightKg} kg`}
                />
              )}
            </div>
          </div>
        )}

        {/* STEP 3: Activity Level */}
        {step === 3 && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-400">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100">Activity Level</h2>
                <p className="text-xs text-slate-400">
                  Select your typical physical activity to determine your TDEE multiplier.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {[
                {
                  id: 'sedentary',
                  label: 'Sedentary',
                  desc: 'Desk job, little to no exercise',
                  mult: '1.20x',
                },
                {
                  id: 'light',
                  label: 'Lightly Active',
                  desc: 'Light exercise or sports 1–3 days/week',
                  mult: '1.38x',
                },
                {
                  id: 'moderate',
                  label: 'Moderately Active',
                  desc: 'Moderate exercise or training 3–5 days/week',
                  mult: '1.55x',
                },
                {
                  id: 'very_active',
                  label: 'Very Active',
                  desc: 'Hard exercise or sports 6–7 days/week',
                  mult: '1.73x',
                },
                {
                  id: 'extra_active',
                  label: 'Extra Active',
                  desc: 'Intense daily training or physical labor job',
                  mult: '1.90x',
                },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setDraft((p) => ({ ...p, activityLevel: item.id as any }))}
                  className={`p-3.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                    draft.activityLevel === item.id
                      ? 'border-kinetic bg-kinetic/10 text-slate-100 shadow-glow-kinetic'
                      : 'border-obsidian-border bg-obsidian-input text-slate-300 hover:border-obsidian-hover'
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm">{item.label}</span>
                    <span className="text-xs text-slate-400">{item.desc}</span>
                  </div>
                  <Badge variant={draft.activityLevel === item.id ? 'kinetic' : 'neutral'}>
                    {item.mult}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 4: Fitness Goal */}
        {step === 4 && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-xp/10 border border-xp/20 flex items-center justify-center text-xp">
                <Target className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100">Primary Goal</h2>
                <p className="text-xs text-slate-400">
                  We automatically adjust your daily calories based on metabolic science.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {[
                {
                  id: 'weight_loss',
                  title: 'Lose Weight / Fat Loss',
                  delta: '-500 kcal / day',
                  desc: 'Healthy, sustainable calorie deficit aiming for ~0.5kg loss per week.',
                  color: 'protein',
                },
                {
                  id: 'maintain',
                  title: 'Maintain Weight & Tone',
                  delta: '0 kcal offset',
                  desc: 'Matches your daily energy burn for stable body composition and energy.',
                  color: 'kinetic',
                },
                {
                  id: 'weight_gain',
                  title: 'Build Muscle / Gain Weight',
                  delta: '+300 kcal / day',
                  desc: 'Controlled caloric surplus paired with resistance training to build mass.',
                  color: 'carbs',
                },
                {
                  id: 'general_fitness',
                  title: 'General Fitness & Performance',
                  delta: '0 kcal offset',
                  desc: 'Isocaloric baseline supporting athletic recovery, energy, and body recomposition.',
                  color: 'xp',
                },
              ].map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setDraft((p) => ({ ...p, goal: g.id as any }))}
                  className={`p-4 rounded-xl border text-left flex flex-col gap-1.5 transition-all ${
                    draft.goal === g.id
                      ? 'border-kinetic bg-kinetic/10 text-slate-100 shadow-glow-kinetic'
                      : 'border-obsidian-border bg-obsidian-input text-slate-300 hover:border-obsidian-hover'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-100">{g.title}</span>
                    <Badge variant={g.color as any}>{g.delta}</Badge>
                  </div>
                  <p className="text-xs text-slate-400">{g.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 5: Calorie Target Calculator */}
        {step === 5 && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-kinetic/10 border border-kinetic/20 flex items-center justify-center text-kinetic">
                <Calculator className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100">Your Daily Targets</h2>
                <p className="text-xs text-slate-400">
                  Calculated using the Mifflin-St Jeor metabolic expenditure equation.
                </p>
              </div>
            </div>

            {/* Metabolic Breakdown Cards */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-obsidian-input border border-obsidian-border flex flex-col gap-1">
                <span className="text-slate-400 font-medium">Basal Metabolic Rate (BMR)</span>
                <span className="text-xl font-bold text-slate-100 tabular-nums">{bmr} kcal</span>
                <span className="text-[10px] text-slate-500">Burned at complete rest</span>
              </div>
              <div className="p-3.5 rounded-xl bg-obsidian-input border border-obsidian-border flex flex-col gap-1">
                <span className="text-slate-400 font-medium">Daily Energy Burn (TDEE)</span>
                <span className="text-xl font-bold text-slate-100 tabular-nums">{tdee} kcal</span>
                <span className="text-[10px] text-slate-500">Factoring activity multiplier</span>
              </div>
            </div>

            {/* Recommended Target Hero */}
            <div className="p-4 rounded-xl bg-kinetic/10 border border-kinetic/30 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-kinetic">
                  <Sparkles className="h-4 w-4" />
                  <span>Recommended Daily Plan</span>
                </div>
                <Badge variant="kinetic">Auto-Calculated</Badge>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-slate-50 tabular-nums">
                  {draft.isTargetOverridden ? draft.customCalories : recommendedCalories}
                </span>
                <span className="text-xs text-slate-400 font-semibold uppercase">kcal / day</span>
              </div>

              {/* Macro breakdown pills */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-kinetic/20 text-center text-xs">
                <div className="flex flex-col">
                  <span className="text-rose-400 font-bold tabular-nums">
                    {draft.isTargetOverridden ? draft.customProteinG : recommendedMacros.proteinG}g
                  </span>
                  <span className="text-[10px] text-slate-400">Protein (30%)</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-amber-300 font-bold tabular-nums">
                    {draft.isTargetOverridden ? draft.customCarbsG : recommendedMacros.carbsG}g
                  </span>
                  <span className="text-[10px] text-slate-400">Carbs (40%)</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sky-400 font-bold tabular-nums">
                    {draft.isTargetOverridden ? draft.customFatG : recommendedMacros.fatG}g
                  </span>
                  <span className="text-[10px] text-slate-400">Fat (30%)</span>
                </div>
              </div>
            </div>

            {/* Manual Override Checkbox */}
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-obsidian-border bg-obsidian-input">
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-200">
                  Customize targets manually
                </span>
                <span className="text-[11px] text-slate-400">
                  Override automatic metabolic calculation with custom numbers
                </span>
              </div>
              <input
                type="checkbox"
                checked={draft.isTargetOverridden}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setDraft((p) => ({
                    ...p,
                    isTargetOverridden: checked,
                    customCalories: recommendedCalories,
                    customProteinG: recommendedMacros.proteinG,
                    customCarbsG: recommendedMacros.carbsG,
                    customFatG: recommendedMacros.fatG,
                  }));
                }}
                className="h-5 w-5 accent-kinetic rounded cursor-pointer"
              />
            </div>

            {/* Manual Inputs if Overridden */}
            {draft.isTargetOverridden && (
              <div className="grid grid-cols-2 gap-3 p-4 rounded-xl border border-obsidian-border bg-obsidian-card">
                <div className="col-span-2">
                  <Input
                    label="Daily Calorie Target (kcal)"
                    type="number"
                    min={800}
                    max={10000}
                    value={draft.customCalories}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, customCalories: Number(e.target.value) }))
                    }
                  />
                </div>
                <Input
                  label="Protein (g)"
                  type="number"
                  min={0}
                  value={draft.customProteinG}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, customProteinG: Number(e.target.value) }))
                  }
                />
                <Input
                  label="Carbs (g)"
                  type="number"
                  min={0}
                  value={draft.customCarbsG}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, customCarbsG: Number(e.target.value) }))
                  }
                />
                <div className="col-span-2">
                  <Input
                    label="Fat (g)"
                    type="number"
                    min={0}
                    value={draft.customFatG}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, customFatG: Number(e.target.value) }))
                    }
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 6: Confirmation & Summary */}
        {step === 6 && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-kinetic/10 border border-kinetic/20 flex items-center justify-center text-kinetic">
                <CheckCircle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100">Review & Confirm Plan</h2>
                <p className="text-xs text-slate-400">
                  Review your settings before initializing your daily dashboard.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-obsidian-input border border-obsidian-border flex justify-between items-center">
                <span className="text-slate-400 font-medium">Profile</span>
                <span className="font-semibold text-slate-100">
                  {draft.gender === 'male' ? 'Male' : 'Female'} • {age} yrs ({draft.birthDate})
                </span>
              </div>

              <div className="p-3 rounded-xl bg-obsidian-input border border-obsidian-border flex justify-between items-center">
                <span className="text-slate-400 font-medium">Height & Weight</span>
                <span className="font-semibold text-slate-100">
                  {draft.heightCm} cm • {draft.weightKg} kg
                </span>
              </div>

              <div className="p-3 rounded-xl bg-obsidian-input border border-obsidian-border flex justify-between items-center">
                <span className="text-slate-400 font-medium">Activity & Goal</span>
                <span className="font-semibold text-slate-100 capitalize">
                  {draft.activityLevel.replace('_', ' ')} • {draft.goal.replace('_', ' ')}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-kinetic/10 border border-kinetic/30 flex justify-between items-center">
                <div>
                  <span className="text-[11px] text-slate-400 font-medium uppercase">
                    Daily Caloric Target
                  </span>
                  <div className="text-2xl font-extrabold text-slate-50 tabular-nums">
                    {draft.isTargetOverridden ? draft.customCalories : recommendedCalories} kcal
                  </div>
                </div>
                <div className="text-right text-xs text-slate-300">
                  <div>
                    P: {draft.isTargetOverridden ? draft.customProteinG : recommendedMacros.proteinG}g
                  </div>
                  <div>
                    C: {draft.isTargetOverridden ? draft.customCarbsG : recommendedMacros.carbsG}g
                  </div>
                  <div>
                    F: {draft.isTargetOverridden ? draft.customFatG : recommendedMacros.fatG}g
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-obsidian-input border border-obsidian-border flex justify-between items-center">
                <span className="text-slate-400 font-medium">Timezone</span>
                <span className="font-mono text-slate-300">{draft.timezone}</span>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-obsidian-border">
          {step > 1 ? (
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={handleBack}
              disabled={isSubmitting}
              className="gap-1.5"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Back</span>
            </Button>
          ) : (
            <div />
          )}

          {step < 6 ? (
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleNext}
              className="gap-1.5"
            >
              <span>Continue</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              size="lg"
              onClick={handleSubmitOnboarding}
              isLoading={isSubmitting}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              <span>Activate My Plan & Go to Dashboard</span>
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
};
