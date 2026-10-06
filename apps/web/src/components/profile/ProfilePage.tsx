import React, { useState, useEffect } from 'react';
import { useAuth, UserProfile } from '../../context/AuthContext';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import {
  NutritionCalculator,
  Gender,
  ActivityLevel,
  FitnessGoal,
  NUTRITION_DISCLAIMER,
} from '@makemefit/shared';
import {
  User,
  Activity,
  Flame,
  Target,
  ShieldAlert,
  Info,
  CheckCircle2,
  Sliders,
  Scale,
  Sparkles,
  ArrowLeft,
  Calendar,
  Globe,
} from 'lucide-react';

interface ProfilePageProps {
  onBack: () => void;
}

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export const ProfilePage: React.FC<ProfilePageProps> = ({ onBack }) => {
  const { user, profile, updateProfile } = useAuth();

  // Personal info
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [timezone, setTimezone] = useState(user?.timezone || 'UTC');

  // Biometrics
  const [gender, setGender] = useState<Gender>((profile?.gender as Gender) || 'male');
  const [birthDate, setBirthDate] = useState(profile?.birthDate || '1998-01-01');

  // Height (cm vs ft/in)
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ft'>('cm');
  const [heightCm, setHeightCm] = useState<number>(profile?.heightCm || 175);
  const [heightFt, setHeightFt] = useState<number>(5);
  const [heightIn, setHeightIn] = useState<number>(9);

  // Weight (kg vs lbs)
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg');
  const [weightKg, setWeightKg] = useState<number>(profile?.weightKg || 70);
  const [weightLbs, setWeightLbs] = useState<number>(154);

  // Activity & Goal
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(
    (profile?.activityLevel as ActivityLevel) || 'moderate'
  );
  const [goal, setGoal] = useState<FitnessGoal>((profile?.goal as FitnessGoal) || 'maintain');

  // Override targets
  const [isTargetOverridden, setIsTargetOverridden] = useState<boolean>(
    profile?.isTargetOverridden || false
  );
  const [customCalories, setCustomCalories] = useState<number>(
    profile?.customCalories || profile?.targetCalories || 2000
  );
  const [customProteinG, setCustomProteinG] = useState<number>(
    profile?.targetProteinG || 150
  );
  const [customCarbsG, setCustomCarbsG] = useState<number>(
    profile?.targetCarbsG || 200
  );
  const [customFatG, setCustomFatG] = useState<number>(
    profile?.targetFatG || 65
  );

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showFormulaDetails, setShowFormulaDetails] = useState(false);

  // Synchronize metric & imperial states
  useEffect(() => {
    if (profile) {
      setHeightCm(profile.heightCm);
      const totalInches = profile.heightCm / 2.54;
      setHeightFt(Math.floor(totalInches / 12));
      setHeightIn(Math.round(totalInches % 12));

      setWeightKg(profile.weightKg);
      setWeightLbs(Math.round(profile.weightKg * 2.20462));
    }
  }, [profile]);

  const handleHeightCmChange = (cm: number) => {
    setHeightCm(cm);
    const totalInches = cm / 2.54;
    setHeightFt(Math.floor(totalInches / 12));
    setHeightIn(Math.round(totalInches % 12));
  };

  const handleHeightFtInChange = (ft: number, inches: number) => {
    setHeightFt(ft);
    setHeightIn(inches);
    const cm = Math.round((ft * 12 + inches) * 2.54);
    setHeightCm(cm);
  };

  const handleWeightKgChange = (kg: number) => {
    setWeightKg(kg);
    setWeightLbs(Math.round(kg * 2.20462));
  };

  const handleWeightLbsChange = (lbs: number) => {
    setWeightLbs(lbs);
    setWeightKg(Math.round(lbs / 2.20462 * 10) / 10);
  };

  // Live calculation of age & energy expenditure plan
  const age = NutritionCalculator.calculateAge(birthDate);
  const calculatedPlan = NutritionCalculator.calculatePlan({
    gender,
    weightKg,
    heightCm,
    ageYears: age,
    activityLevel,
    goal,
  });

  const resolvedTargets = NutritionCalculator.resolveTargets({
    gender,
    weightKg,
    heightCm,
    ageYears: age,
    activityLevel,
    goal,
    isTargetOverridden,
    customCalories: isTargetOverridden ? customCalories : null,
    customProteinG: isTargetOverridden ? customProteinG : null,
    customCarbsG: isTargetOverridden ? customCarbsG : null,
    customFatG: isTargetOverridden ? customFatG : null,
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    // Validation
    if (heightCm < 50 || heightCm > 280) {
      setErrorMessage('Height must be between 50 and 280 cm.');
      return;
    }
    if (weightKg < 20 || weightKg > 500) {
      setErrorMessage('Weight must be between 20 and 500 kg.');
      return;
    }
    if (isTargetOverridden && (customCalories < 800 || customCalories > 10000)) {
      setErrorMessage('Custom daily calories must be between 800 and 10,000 kcal.');
      return;
    }

    setIsSubmitting(true);

    try {
      await updateProfile({
        displayName,
        timezone,
        gender,
        birthDate,
        heightCm,
        weightKg,
        activityLevel,
        goal,
        isTargetOverridden,
        customCalories: isTargetOverridden ? customCalories : null,
        customProteinG: isTargetOverridden ? customProteinG : null,
        customCarbsG: isTargetOverridden ? customCarbsG : null,
        customFatG: isTargetOverridden ? customFatG : null,
      });

      setSuccessMessage(
        'Profile and fitness targets saved successfully! Today\'s active target has been updated. Historical logs remain preserved.'
      );
      setTimeout(() => setSuccessMessage(null), 6000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update profile.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-12">
      {/* 1. Header Bar */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 text-slate-400 hover:text-slate-100">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Dashboard</span>
        </Button>
        <Badge variant="kinetic">Profile & Calorie Architecture</Badge>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-kinetic/10 border border-kinetic/30 text-kinetic flex items-center gap-3 text-sm font-medium animate-fadeIn">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center gap-3 text-sm font-medium animate-fadeIn">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="flex flex-col gap-6">
        {/* 2. Personal & Account Identity */}
        <Card className="flex flex-col gap-5 p-6">
          <div className="flex items-center gap-3 pb-3 border-b border-obsidian-border/60">
            <div className="h-10 w-10 rounded-xl bg-obsidian-border/50 flex items-center justify-center text-kinetic font-bold text-lg">
              {displayName ? displayName.charAt(0).toUpperCase() : 'A'}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Athlete Profile</h2>
              <p className="text-xs text-slate-400">Manage account information and regional timezone</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Display Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Felix Vance"
              required
            />

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-slate-400" />
                <span>Timezone</span>
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full bg-obsidian-input border border-obsidian-border rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-kinetic"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Your daily calorie budget resets at midnight in this timezone.
              </p>
            </div>
          </div>
        </Card>

        {/* 3. Biometric & Physical Measurements */}
        <Card className="flex flex-col gap-5 p-6">
          <div className="flex items-center justify-between pb-3 border-b border-obsidian-border/60">
            <div className="flex items-center gap-2.5">
              <Scale className="h-5 w-5 text-kinetic" />
              <h2 className="text-lg font-bold text-slate-100">Biometrics & Fitness Info</h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">Age: {age} years old</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Biological Sex */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Biological Sex (for BMR equation)
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setGender('male')}
                  className={`p-3 rounded-xl border text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                    gender === 'male'
                      ? 'bg-kinetic/15 border-kinetic text-kinetic shadow-glow-kinetic'
                      : 'bg-obsidian-input border-obsidian-border text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>Male</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGender('female')}
                  className={`p-3 rounded-xl border text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                    gender === 'female'
                      ? 'bg-kinetic/15 border-kinetic text-kinetic shadow-glow-kinetic'
                      : 'bg-obsidian-input border-obsidian-border text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>Female</span>
                </button>
              </div>
            </div>

            {/* Date of Birth */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <span>Date of Birth</span>
              </label>
              <Input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                required
              />
            </div>

            {/* Height */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Height
                </label>
                <div className="flex rounded-lg bg-obsidian-input p-0.5 border border-obsidian-border text-xs">
                  <button
                    type="button"
                    onClick={() => setHeightUnit('cm')}
                    className={`px-2 py-0.5 rounded-md ${
                      heightUnit === 'cm' ? 'bg-kinetic text-obsidian-bg font-bold' : 'text-slate-400'
                    }`}
                  >
                    cm
                  </button>
                  <button
                    type="button"
                    onClick={() => setHeightUnit('ft')}
                    className={`px-2 py-0.5 rounded-md ${
                      heightUnit === 'ft' ? 'bg-kinetic text-obsidian-bg font-bold' : 'text-slate-400'
                    }`}
                  >
                    ft / in
                  </button>
                </div>
              </div>

              {heightUnit === 'cm' ? (
                <Input
                  type="number"
                  value={heightCm}
                  onChange={(e) => handleHeightCmChange(Number(e.target.value))}
                  min={50}
                  max={280}
                  suffix="cm"
                  required
                />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    value={heightFt}
                    onChange={(e) => handleHeightFtInChange(Number(e.target.value), heightIn)}
                    min={2}
                    max={8}
                    suffix="ft"
                  />
                  <Input
                    type="number"
                    value={heightIn}
                    onChange={(e) => handleHeightFtInChange(heightFt, Number(e.target.value))}
                    min={0}
                    max={11}
                    suffix="in"
                  />
                </div>
              )}
            </div>

            {/* Weight */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Weight
                </label>
                <div className="flex rounded-lg bg-obsidian-input p-0.5 border border-obsidian-border text-xs">
                  <button
                    type="button"
                    onClick={() => setWeightUnit('kg')}
                    className={`px-2 py-0.5 rounded-md ${
                      weightUnit === 'kg' ? 'bg-kinetic text-obsidian-bg font-bold' : 'text-slate-400'
                    }`}
                  >
                    kg
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeightUnit('lbs')}
                    className={`px-2 py-0.5 rounded-md ${
                      weightUnit === 'lbs' ? 'bg-kinetic text-obsidian-bg font-bold' : 'text-slate-400'
                    }`}
                  >
                    lbs
                  </button>
                </div>
              </div>

              {weightUnit === 'kg' ? (
                <Input
                  type="number"
                  step="0.1"
                  value={weightKg}
                  onChange={(e) => handleWeightKgChange(Number(e.target.value))}
                  min={20}
                  max={500}
                  suffix="kg"
                  required
                />
              ) : (
                <Input
                  type="number"
                  step="0.1"
                  value={weightLbs}
                  onChange={(e) => handleWeightLbsChange(Number(e.target.value))}
                  min={44}
                  max={1100}
                  suffix="lbs"
                  required
                />
              )}
            </div>
          </div>
        </Card>

        {/* 4. Activity Level & Fitness Goal */}
        <Card className="flex flex-col gap-6 p-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-streak" />
                <h2 className="text-lg font-bold text-slate-100">Activity Level</h2>
              </div>
              <span className="text-xs text-streak font-medium">
                Multiplier: {calculatedPlan.activityMultiplier}x
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
              {[
                { id: 'sedentary', name: 'Sedentary', sub: 'Desk work, little exercise', mult: '1.2x' },
                { id: 'light', name: 'Light', sub: '1-3 workouts / week', mult: '1.375x' },
                { id: 'moderate', name: 'Moderate', sub: '3-5 workouts / week', mult: '1.55x' },
                { id: 'very_active', name: 'Very Active', sub: '6-7 workouts / week', mult: '1.725x' },
                { id: 'extra_active', name: 'Extra Active', sub: '2x / day or physical labor', mult: '1.9x' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActivityLevel(item.id as ActivityLevel)}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                    activityLevel === item.id
                      ? 'bg-streak/15 border-streak text-slate-100 shadow-glow-kinetic'
                      : 'bg-obsidian-input border-obsidian-border text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="font-semibold text-xs text-slate-200">{item.name}</span>
                    <span className="text-[10px] text-streak font-bold">{item.mult}</span>
                  </div>
                  <span className="text-[11px] text-slate-400 line-clamp-2">{item.sub}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-obsidian-border/60">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-xp" />
                <h2 className="text-lg font-bold text-slate-100">Fitness Goal</h2>
              </div>
              <span className="text-xs text-xp font-medium">
                Adjustment: {calculatedPlan.goalAdjustmentCalories > 0 ? `+${calculatedPlan.goalAdjustmentCalories}` : calculatedPlan.goalAdjustmentCalories} kcal
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              {[
                { id: 'weight_loss', name: 'Lose Weight', adj: '-500 kcal', desc: 'Sustainable fat deficit (~0.45 kg / week)' },
                { id: 'maintain', name: 'Maintain Weight', adj: '0 kcal', desc: 'Balanced energy expenditure' },
                { id: 'weight_gain', name: 'Gain Muscle', adj: '+300 kcal', desc: 'Hypertrophic surplus for lean mass' },
                { id: 'general_fitness', name: 'General Fitness', adj: '0 kcal', desc: 'Isocaloric performance & recovery' },
              ].map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGoal(g.id as FitnessGoal)}
                  className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                    goal === g.id
                      ? 'bg-xp/15 border-xp text-slate-100'
                      : 'bg-obsidian-input border-obsidian-border text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="font-semibold text-xs text-slate-200">{g.name}</span>
                    <Badge variant="neutral" className="text-[10px] px-1.5 py-0.5">
                      {g.adj}
                    </Badge>
                  </div>
                  <span className="text-[11px] text-slate-400">{g.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* 5. Calorie Target Architecture Breakdown */}
        <Card className="flex flex-col gap-5 p-6 bg-obsidian-card/90">
          <div className="flex items-center justify-between pb-3 border-b border-obsidian-border/60">
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-5 w-5 text-kinetic" />
              <h2 className="text-lg font-bold text-slate-100">Calorie Engine Calculation</h2>
            </div>
            <button
              type="button"
              onClick={() => setShowFormulaDetails(!showFormulaDetails)}
              className="text-xs text-kinetic hover:underline flex items-center gap-1"
            >
              <Info className="h-3.5 w-3.5" />
              <span>{showFormulaDetails ? 'Hide Formula' : 'Formula Details'}</span>
            </button>
          </div>

          {/* Scientific Formula Information Modal / Drawer */}
          {showFormulaDetails && (
            <div className="p-4 rounded-xl bg-obsidian-input border border-obsidian-border text-xs text-slate-300 flex flex-col gap-2 animate-fadeIn">
              <div className="font-bold text-slate-100 flex items-center gap-1.5">
                <span>{calculatedPlan.formula.name}</span>
              </div>
              <p className="text-slate-400">{calculatedPlan.formula.description}</p>
              <div className="p-2 rounded-lg bg-obsidian-bg font-mono text-kinetic text-[11px]">
                {calculatedPlan.formula.bmrFormula}
              </div>
              <p className="text-slate-400">{calculatedPlan.formula.activityExplanation}</p>
              <p className="text-slate-400">{calculatedPlan.formula.goalRationale}</p>
            </div>
          )}

          {/* 5-Step Formula Progression Flow */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-center">
            <div className="p-3 rounded-xl bg-obsidian-input border border-obsidian-border flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 uppercase font-semibold">1. Basal BMR</span>
              <span className="text-lg font-extrabold text-slate-100 tabular-nums">
                {calculatedPlan.bmr}
              </span>
              <span className="text-[10px] text-slate-500">kcal at rest</span>
            </div>

            <div className="p-3 rounded-xl bg-obsidian-input border border-obsidian-border flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 uppercase font-semibold">2. Activity</span>
              <span className="text-lg font-extrabold text-streak tabular-nums">
                +{calculatedPlan.activityAdjustmentCalories}
              </span>
              <span className="text-[10px] text-slate-500">{calculatedPlan.activityMultiplier}x multiplier</span>
            </div>

            <div className="p-3 rounded-xl bg-obsidian-input border border-obsidian-border flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 uppercase font-semibold">3. TDEE Maintenance</span>
              <span className="text-lg font-extrabold text-slate-100 tabular-nums">
                {calculatedPlan.tdee}
              </span>
              <span className="text-[10px] text-slate-500">daily burn</span>
            </div>

            <div className="p-3 rounded-xl bg-obsidian-input border border-obsidian-border flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 uppercase font-semibold">4. Goal Modifier</span>
              <span className={`text-lg font-extrabold tabular-nums ${calculatedPlan.goalAdjustmentCalories < 0 ? 'text-amber-400' : calculatedPlan.goalAdjustmentCalories > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
                {calculatedPlan.goalAdjustmentCalories > 0 ? `+${calculatedPlan.goalAdjustmentCalories}` : calculatedPlan.goalAdjustmentCalories}
              </span>
              <span className="text-[10px] text-slate-500">{goal.replace('_', ' ')}</span>
            </div>

            <div className="p-3 rounded-xl bg-kinetic/10 border border-kinetic/40 flex flex-col gap-1">
              <span className="text-[11px] text-kinetic uppercase font-bold">5. Recommended</span>
              <span className="text-lg font-extrabold text-kinetic tabular-nums">
                {calculatedPlan.recommendedCalories}
              </span>
              <span className="text-[10px] text-kinetic/80">kcal / day</span>
            </div>
          </div>

          {/* Recommended Macros Breakdown */}
          <div className="pt-2 border-t border-obsidian-border/40 flex flex-col gap-2">
            <span className="text-xs font-semibold text-slate-400">
              Recommended Macronutrient Split (30% Protein / 40% Carbs / 30% Fat)
            </span>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-2.5 rounded-xl bg-obsidian-input border border-obsidian-border">
                <span className="text-[10px] uppercase font-bold text-sky-400">Protein (30%)</span>
                <div className="text-base font-bold text-slate-100 tabular-nums">
                  {calculatedPlan.recommendedMacros.proteinG}g
                </div>
                <span className="text-[10px] text-slate-500">
                  {calculatedPlan.recommendedMacros.proteinCalories} kcal
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-obsidian-input border border-obsidian-border">
                <span className="text-[10px] uppercase font-bold text-amber-400">Carbs (40%)</span>
                <div className="text-base font-bold text-slate-100 tabular-nums">
                  {calculatedPlan.recommendedMacros.carbsG}g
                </div>
                <span className="text-[10px] text-slate-500">
                  {calculatedPlan.recommendedMacros.carbsCalories} kcal
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-obsidian-input border border-obsidian-border">
                <span className="text-[10px] uppercase font-bold text-rose-400">Fats (30%)</span>
                <div className="text-base font-bold text-slate-100 tabular-nums">
                  {calculatedPlan.recommendedMacros.fatG}g
                </div>
                <span className="text-[10px] text-slate-500">
                  {calculatedPlan.recommendedMacros.fatCalories} kcal
                </span>
              </div>
            </div>
          </div>

          {/* Medical Disclaimer Banner */}
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-xs text-amber-200">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
            <span className="leading-relaxed">{NUTRITION_DISCLAIMER}</span>
          </div>
        </Card>

        {/* 6. Manual Calorie & Macro Override Section */}
        <Card className="flex flex-col gap-5 p-6">
          <div className="flex items-center justify-between pb-3 border-b border-obsidian-border/60">
            <div className="flex items-center gap-2.5">
              <Sliders className="h-5 w-5 text-kinetic" />
              <div>
                <h2 className="text-lg font-bold text-slate-100">Manual Target Override</h2>
                <p className="text-xs text-slate-400">
                  Optionally replace the algorithm recommendation with your coach's custom macros
                </p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isTargetOverridden}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setIsTargetOverridden(checked);
                  if (checked && (!customCalories || customCalories === 2000)) {
                    setCustomCalories(calculatedPlan.recommendedCalories);
                    setCustomProteinG(calculatedPlan.recommendedMacros.proteinG);
                    setCustomCarbsG(calculatedPlan.recommendedMacros.carbsG);
                    setCustomFatG(calculatedPlan.recommendedMacros.fatG);
                  }
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-obsidian-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-kinetic"></div>
            </label>
          </div>

          {isTargetOverridden ? (
            <div className="flex flex-col gap-4 animate-fadeIn">
              <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-200 text-xs">
                Manual override is active. MakeMeFit will use these custom targets on your dashboard and today's logs rather than the automated formula.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <Input
                  label="Target Calories"
                  type="number"
                  value={customCalories}
                  onChange={(e) => setCustomCalories(Number(e.target.value))}
                  min={800}
                  max={10000}
                  suffix="kcal"
                  required
                />
                <Input
                  label="Protein"
                  type="number"
                  value={customProteinG}
                  onChange={(e) => setCustomProteinG(Number(e.target.value))}
                  min={0}
                  max={1000}
                  suffix="g"
                  required
                />
                <Input
                  label="Carbs"
                  type="number"
                  value={customCarbsG}
                  onChange={(e) => setCustomCarbsG(Number(e.target.value))}
                  min={0}
                  max={1500}
                  suffix="g"
                  required
                />
                <Input
                  label="Fat"
                  type="number"
                  value={customFatG}
                  onChange={(e) => setCustomFatG(Number(e.target.value))}
                  min={0}
                  max={500}
                  suffix="g"
                  required
                />
              </div>

              <div className="text-xs text-slate-400 flex items-center justify-between pt-1">
                <span>
                  Sum from Macros: {customProteinG * 4 + customCarbsG * 4 + customFatG * 9} kcal
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const macros = NutritionCalculator.calculateDefaultMacros(customCalories);
                    setCustomProteinG(macros.proteinG);
                    setCustomCarbsG(macros.carbsG);
                    setCustomFatG(macros.fatG);
                  }}
                  className="text-xs text-kinetic hover:underline"
                >
                  Auto-Balance Macros for {customCalories} kcal
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">
              Manual override disabled. Your active dashboard target will automatically track the scientific Mifflin-St Jeor recommendation ({calculatedPlan.recommendedCalories} kcal/day).
            </p>
          )}
        </Card>

        {/* 7. Target Status & Goal Summary */}
        <Card className="flex flex-col gap-4 p-6 bg-obsidian-card">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
            Target Status & Summary
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-obsidian-input border border-obsidian-border flex flex-col gap-1">
              <span className="text-[11px] text-slate-400">System Recommendation</span>
              <span className="text-xl font-extrabold text-slate-200 tabular-nums">
                {resolvedTargets.systemRecommended.calories} kcal
              </span>
              <span className="text-[10px] text-slate-500">Mifflin-St Jeor</span>
            </div>

            <div className="p-3.5 rounded-xl bg-obsidian-input border border-obsidian-border flex flex-col gap-1">
              <span className="text-[11px] text-slate-400">User-Selected Override</span>
              <span className="text-xl font-extrabold text-slate-200 tabular-nums">
                {resolvedTargets.userSelected ? `${resolvedTargets.userSelected.calories} kcal` : 'None'}
              </span>
              <span className="text-[10px] text-slate-500">
                {resolvedTargets.userSelected ? 'Custom Values' : 'Using Recommendation'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-kinetic/15 border border-kinetic/50 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-kinetic font-semibold">Active Daily Target</span>
                <Badge variant="kinetic" className="text-[9px] px-1 py-0.2">
                  {resolvedTargets.activeTarget.isOverridden ? 'Custom' : 'System'}
                </Badge>
              </div>
              <span className="text-2xl font-black text-slate-50 tabular-nums">
                {resolvedTargets.activeTarget.calories} kcal
              </span>
              <span className="text-[10px] text-slate-300">
                {resolvedTargets.activeTarget.proteinG}g P • {resolvedTargets.activeTarget.carbsG}g C • {resolvedTargets.activeTarget.fatG}g F
              </span>
            </div>
          </div>
        </Card>

        {/* 8. Save / Submit Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onBack} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isSubmitting}
            className="px-8 shadow-glow-kinetic"
          >
            Save Profile & Targets
          </Button>
        </div>
      </form>
    </div>
  );
};
