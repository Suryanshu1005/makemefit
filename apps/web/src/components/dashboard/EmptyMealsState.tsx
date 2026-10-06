import React from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Utensils, Sparkles, Plus, Database } from 'lucide-react';

interface EmptyMealsStateProps {
  targetCalories: number;
  onAddFood: () => void;
  onSeedDemo?: () => void;
  isSeeding?: boolean;
}

export const EmptyMealsState: React.FC<EmptyMealsStateProps> = ({
  targetCalories,
  onAddFood,
  onSeedDemo,
  isSeeding = false,
}) => {
  return (
    <Card className="p-8 sm:p-12 flex flex-col items-center justify-center text-center gap-4 border-dashed border-obsidian-border bg-obsidian-card/40">
      {/* Decorative Icon */}
      <div className="relative">
        <div className="h-16 w-16 rounded-2xl bg-kinetic/10 border border-kinetic/20 flex items-center justify-center text-kinetic shadow-glow-kinetic">
          <Utensils className="h-8 w-8" />
        </div>
        <div className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-streak/20 border border-streak/40 flex items-center justify-center text-streak animate-pulse">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5 max-w-md">
        <h3 className="text-lg font-bold text-slate-100">No Meals Logged Today</h3>
        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
          Your daily budget of <strong className="text-kinetic">{targetCalories} kcal</strong> is completely untouched. Log your first meal of the day to begin tracking your streak and progress!
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <Button
          variant="primary"
          size="md"
          onClick={onAddFood}
          className="gap-2 px-6 shadow-glow-kinetic"
        >
          <Plus className="h-4 w-4" />
          <span>Add Food</span>
        </Button>

        {onSeedDemo && (
          <Button
            variant="secondary"
            size="md"
            onClick={onSeedDemo}
            isLoading={isSeeding}
            className="gap-2 text-xs border-dashed"
          >
            <Database className="h-3.5 w-3.5 text-kinetic" />
            <span>Seed Sample Meals (Dev)</span>
          </Button>
        )}
      </div>
    </Card>
  );
};
