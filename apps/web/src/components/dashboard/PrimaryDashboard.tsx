import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { CalorieProgressRing } from '../ui/CalorieProgressRing';
import { ProgressBar } from '../ui/ProgressBar';
import { MealCard } from './MealCard';
import { EmptyMealsState } from './EmptyMealsState';
import { DashboardSkeleton } from './DashboardSkeleton';
import { FoodLoggingFlow } from '../food-log/FoodLoggingFlow';
import { DashboardData, MealSlot } from '@makemefit/shared';
import { apiRequest } from '../../api/client';
import {
  Flame,
  Zap,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Calendar,
  Utensils,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

interface PrimaryDashboardProps {
  onNavigateProfile: () => void;
}

export const PrimaryDashboard: React.FC<PrimaryDashboardProps> = ({ onNavigateProfile }) => {
  const { user, profile } = useAuth();

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter meals by slot
  const [selectedSlot, setSelectedSlot] = useState<MealSlot | 'all'>('all');

  // Add Food Modal state
  const [isAddFoodOpen, setIsAddFoodOpen] = useState(false);
  const [isLoadingAction, setIsLoadingAction] = useState(false);

  // Fetch dashboard data from API
  const fetchDashboardData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);

    try {
      const data = await apiRequest<DashboardData>('/users/dashboard');
      setDashboardData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Dev simulation handlers
  const handleSeedDemo = async () => {
    setIsLoadingAction(true);
    try {
      const data = await apiRequest<DashboardData>('/users/demo/seed-meals', { method: 'POST' });
      setDashboardData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to seed sample meals.');
    } finally {
      setIsLoadingAction(false);
    }
  };

  const handleExceedTarget = async () => {
    setIsLoadingAction(true);
    try {
      const data = await apiRequest<DashboardData>('/users/demo/exceed-target', { method: 'POST' });
      setDashboardData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to exceed target.');
    } finally {
      setIsLoadingAction(false);
    }
  };

  const handleClearMeals = async () => {
    setIsLoadingAction(true);
    try {
      const data = await apiRequest<DashboardData>('/users/demo/meals', { method: 'DELETE' });
      setDashboardData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to clear meals.');
    } finally {
      setIsLoadingAction(false);
    }
  };

  if (isLoading && !dashboardData) {
    return <DashboardSkeleton />;
  }

  if (error && !dashboardData) {
    return (
      <Card className="p-8 sm:p-12 text-center flex flex-col items-center gap-4 bg-rose-500/5 border-rose-500/20">
        <ShieldAlert className="h-10 w-10 text-rose-400" />
        <div className="flex flex-col gap-1 max-w-md">
          <h3 className="text-lg font-bold text-slate-100">Unable to Load Dashboard</h3>
          <p className="text-xs sm:text-sm text-slate-400">{error}</p>
        </div>
        <Button variant="primary" size="md" onClick={() => fetchDashboardData()} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          <span>Retry Connection</span>
        </Button>
      </Card>
    );
  }

  // Active metrics
  const targetCalories = dashboardData?.todaySummary.targetCalories ?? profile?.targetCalories ?? 2000;
  const consumedCalories = dashboardData?.todaySummary.consumedCalories ?? 0;
  const remainingCalories = Math.max(0, targetCalories - consumedCalories);
  const isOverTarget = consumedCalories > targetCalories;
  const overCalories = Math.max(0, consumedCalories - targetCalories);
  const isTargetReached = !isOverTarget && consumedCalories >= targetCalories * 0.95 && consumedCalories > 0;
  const isZeroState = consumedCalories === 0;

  const targetProteinG = dashboardData?.todaySummary.targetProteinG ?? profile?.targetProteinG ?? 150;
  const targetCarbsG = dashboardData?.todaySummary.targetCarbsG ?? profile?.targetCarbsG ?? 200;
  const targetFatG = dashboardData?.todaySummary.targetFatG ?? profile?.targetFatG ?? 65;

  const consumedProteinG = dashboardData?.todaySummary.consumedProteinG ?? 0;
  const consumedCarbsG = dashboardData?.todaySummary.consumedCarbsG ?? 0;
  const consumedFatG = dashboardData?.todaySummary.consumedFatG ?? 0;

  const isOverrideActive = dashboardData?.targetContext.isTargetOverridden ?? false;
  const fitnessGoal = dashboardData?.targetContext.goal ?? profile?.goal ?? 'maintain';

  // Gamification progress
  const streak = dashboardData?.gamification.currentStreak ?? 0;
  const level = dashboardData?.gamification.currentLevel ?? 1;
  const totalXp = dashboardData?.gamification.totalXp ?? 0;
  const progressPercent = dashboardData?.gamification.progressPercent ?? 0;
  const xpInCurrentLevel = dashboardData?.gamification.xpInCurrentLevel ?? 0;
  const xpSpanForLevel = dashboardData?.gamification.xpSpanForLevel ?? 100;

  // Filtered meals
  const allMeals = dashboardData?.meals ?? [];
  const filteredMeals =
    selectedSlot === 'all'
      ? allMeals
      : allMeals.filter((m) => m.mealSlot === selectedSlot);

  // Formatted date in user's timezone
  const todayFormatted = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="flex flex-col gap-6 w-full pb-20 sm:pb-8">
      {/* 1. Header Greeting & Date */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-50">
              Today's Nutrition
            </h1>
            <button
              type="button"
              onClick={() => fetchDashboardData(true)}
              disabled={isRefreshing}
              className="text-slate-400 hover:text-kinetic transition-colors p-1"
              title="Refresh dashboard"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-kinetic' : ''}`} />
            </button>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 flex items-center gap-1.5 mt-0.5">
            <Calendar className="h-3.5 w-3.5 text-slate-500" />
            <span>{todayFormatted}</span>
            <span>•</span>
            <span>{dashboardData?.user.timezone ?? 'UTC'}</span>
          </p>
        </div>

        {/* Action Buttons Header */}
        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={onNavigateProfile}
            className="gap-1.5 text-xs"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Configure Goals</span>
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsAddFoodOpen(true)}
            className="gap-1.5 text-xs px-4 shadow-glow-kinetic"
          >
            <Plus className="h-4 w-4" />
            <span>Add Food</span>
          </Button>
        </div>
      </div>

      {/* 2. Top Hero Grid: Calorie Progress & Macronutrients */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left Column: Circular Calorie Progress Card */}
        <Card className="md:col-span-5 p-6 sm:p-8 flex flex-col items-center justify-between gap-4 bg-obsidian-card relative overflow-hidden">
          {/* Top Status Pill */}
          <div className="w-full flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-400 uppercase tracking-wider text-[11px]">
              Daily Calorie Budget
            </span>
            <Badge
              variant={isOverrideActive ? 'neutral' : 'kinetic'}
              className="text-[10px] px-2 py-0.5 gap-1"
            >
              <Sparkles className="h-2.5 w-2.5" />
              <span>{isOverrideActive ? 'Custom Override' : 'Mifflin-St Jeor'}</span>
            </Badge>
          </div>

          {/* Central Radial Progress Ring */}
          <div className="py-2">
            <CalorieProgressRing
              consumed={consumedCalories}
              target={targetCalories}
              size={220}
              strokeWidth={14}
            />
          </div>

          {/* Status Message / Alerts */}
          <div className="w-full">
            {isZeroState ? (
              <div className="p-2.5 rounded-xl bg-obsidian-input border border-obsidian-border text-center text-xs text-slate-400">
                <span>Morning state • 0 kcal consumed so far</span>
              </div>
            ) : isOverTarget ? (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center gap-2 text-xs text-amber-300 font-semibold animate-fadeIn">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Target exceeded by +{overCalories} kcal</span>
              </div>
            ) : isTargetReached ? (
              <div className="p-2.5 rounded-xl bg-kinetic/15 border border-kinetic/30 flex items-center justify-center gap-2 text-xs text-kinetic font-semibold animate-fadeIn">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Daily target reached! Great discipline!</span>
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-obsidian-input border border-obsidian-border flex items-center justify-between text-xs text-slate-400">
                <span>Remaining: <strong className="text-slate-100">{remainingCalories} kcal</strong></span>
                <span className="text-[11px] text-slate-500 font-mono">
                  {Math.round((consumedCalories / targetCalories) * 100)}% Consumed
                </span>
              </div>
            )}
          </div>
        </Card>

        {/* Right Column: Macronutrient Targets & Gamification Bar */}
        <div className="md:col-span-7 flex flex-col gap-6">
          {/* Macronutrients Card */}
          <Card className="p-6 flex flex-col justify-between gap-5 flex-1 bg-obsidian-card">
            <div className="flex items-center justify-between pb-2 border-b border-obsidian-border/60">
              <div>
                <h3 className="text-base font-bold text-slate-100">Macronutrient Targets</h3>
                <p className="text-xs text-slate-400">
                  Goal: <span className="capitalize text-slate-300 font-medium">{fitnessGoal.replace('_', ' ')}</span>
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-400 tabular-nums">
                {consumedCalories} / {targetCalories} kcal
              </span>
            </div>

            {/* 3 Macro Progress Bars */}
            <div className="flex flex-col gap-4">
              <ProgressBar
                label="Protein (Muscle Synthesis)"
                current={consumedProteinG}
                target={targetProteinG}
                unit="g"
                variant="protein"
              />
              <ProgressBar
                label="Carbohydrates (Performance)"
                current={consumedCarbsG}
                target={targetCarbsG}
                unit="g"
                variant="carbs"
              />
              <ProgressBar
                label="Dietary Fats (Hormone Health)"
                current={consumedFatG}
                target={targetFatG}
                unit="g"
                variant="fat"
              />
            </div>

            {/* Quick Macro Calorie Ratio Breakdown */}
            <div className="pt-2 border-t border-obsidian-border/40 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2 rounded-lg bg-obsidian-input text-slate-400">
                <span className="block text-[10px] uppercase font-bold text-rose-400">Protein</span>
                <span className="text-slate-200 font-bold tabular-nums">
                  {Math.round(consumedProteinG * 4)} kcal
                </span>
              </div>
              <div className="p-2 rounded-lg bg-obsidian-input text-slate-400">
                <span className="block text-[10px] uppercase font-bold text-amber-400">Carbs</span>
                <span className="text-slate-200 font-bold tabular-nums">
                  {Math.round(consumedCarbsG * 4)} kcal
                </span>
              </div>
              <div className="p-2 rounded-lg bg-obsidian-input text-slate-400">
                <span className="block text-[10px] uppercase font-bold text-sky-400">Fats</span>
                <span className="text-slate-200 font-bold tabular-nums">
                  {Math.round(consumedFatG * 9)} kcal
                </span>
              </div>
            </div>
          </Card>

          {/* Gamification Progress Widget */}
          <Card className="p-4 sm:p-5 flex flex-col gap-3 bg-obsidian-card">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-bold text-slate-200">
                <Badge variant="xp" className="px-2 py-0.5">
                  LVL {level}
                </Badge>
                <span>Level {level} Progress</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="streak" className="gap-1 px-2.5 py-0.5">
                  <Flame className="h-3 w-3 fill-current text-streak" />
                  <span>{streak} Day Streak</span>
                </Badge>
                <span className="text-xs text-slate-400 tabular-nums">
                  {totalXp} Total XP
                </span>
              </div>
            </div>

            <ProgressBar
              label="Next Level Progress"
              current={xpInCurrentLevel}
              target={xpSpanForLevel}
              unit="XP"
              variant="xp"
            />
          </Card>
        </div>
      </div>

      {/* 3. Today's Logged Meals Section */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Utensils className="h-5 w-5 text-kinetic" />
            <h2 className="text-lg font-bold text-slate-100">
              Today's Logged Meals ({allMeals.length})
            </h2>
          </div>

          {/* Slot Filter Pills */}
          {allMeals.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs">
              {(['all', 'breakfast', 'lunch', 'dinner', 'snack'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSelectedSlot(s)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all capitalize shrink-0 ${
                    selectedSlot === s
                      ? 'bg-kinetic text-obsidian-bg font-bold shadow-sm'
                      : 'bg-obsidian-input text-slate-400 hover:text-slate-200 border border-obsidian-border'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Meal Cards List or Empty State */}
        {allMeals.length === 0 ? (
          <EmptyMealsState
            targetCalories={targetCalories}
            onAddFood={() => setIsAddFoodOpen(true)}
            onSeedDemo={handleSeedDemo}
            isSeeding={isLoadingAction}
          />
        ) : filteredMeals.length === 0 ? (
          <Card className="p-8 text-center text-xs text-slate-400">
            No meals logged under "{selectedSlot}". Switch filter to "all" to view logged items.
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredMeals.map((meal) => (
              <MealCard key={meal.id} meal={meal} />
            ))}
          </div>
        )}
      </div>

      {/* 4. Development Data Testing Bar (Separated for Dev Verification) */}
      <Card className="p-4 bg-obsidian-card/60 border border-obsidian-border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-400">
          <Sparkles className="h-4 w-4 text-kinetic shrink-0" />
          <span>
            <strong>Dev Verification Controls:</strong> Test database states (seed sample meals, test target exceeded alert, or clear meals).
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSeedDemo}
            isLoading={isLoadingAction}
            className="text-xs"
          >
            Seed 3 Real Meals
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExceedTarget}
            isLoading={isLoadingAction}
            className="text-xs text-amber-300"
          >
            Test Exceeded State
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearMeals}
            isLoading={isLoadingAction}
            className="text-xs text-rose-400 hover:text-rose-300"
          >
            Clear (Zero State)
          </Button>
        </div>
      </Card>

      {/* 5. Mobile Sticky Bottom Action Bar */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-obsidian-bg/95 backdrop-blur-md border-t border-obsidian-border p-3 px-4 flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Today's Remaining</span>
          <span className="text-base font-extrabold text-slate-100 tabular-nums">
            {isOverTarget ? `+${overCalories} over` : `${remainingCalories} kcal`}
          </span>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={() => setIsAddFoodOpen(true)}
          className="gap-2 px-6 shadow-glow-kinetic flex-1 max-w-[200px]"
        >
          <Plus className="h-4 w-4" />
          <span>Add Food</span>
        </Button>
      </div>

      {/* Food Logging Modal Flow */}
      <FoodLoggingFlow
        isOpen={isAddFoodOpen}
        onClose={() => setIsAddFoodOpen(false)}
        onUploadSuccess={() => {
          fetchDashboardData(true);
        }}
        onSeedDemo={handleSeedDemo}
        onExceedTarget={handleExceedTarget}
        onClearMeals={handleClearMeals}
      />
    </div>
  );
};
