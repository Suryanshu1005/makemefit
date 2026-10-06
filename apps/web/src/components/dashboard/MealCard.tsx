import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { MealResponse, MealSlot } from '@makemefit/shared';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Sparkles,
  Flame,
  Utensils,
  Coffee,
  Sun,
  Moon,
  Apple,
} from 'lucide-react';

interface MealCardProps {
  meal: MealResponse;
}

const SLOT_CONFIG: Record<
  MealSlot,
  { label: string; icon: React.ReactNode; color: string; badgeVariant: 'kinetic' | 'xp' | 'streak' | 'neutral' }
> = {
  breakfast: {
    label: 'Breakfast',
    icon: <Coffee className="h-3.5 w-3.5 text-amber-400" />,
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    badgeVariant: 'streak',
  },
  lunch: {
    label: 'Lunch',
    icon: <Sun className="h-3.5 w-3.5 text-emerald-400" />,
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    badgeVariant: 'kinetic',
  },
  dinner: {
    label: 'Dinner',
    icon: <Moon className="h-3.5 w-3.5 text-indigo-400" />,
    color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    badgeVariant: 'xp',
  },
  snack: {
    label: 'Snack',
    icon: <Apple className="h-3.5 w-3.5 text-rose-400" />,
    color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    badgeVariant: 'neutral',
  },
};

export const MealCard: React.FC<MealCardProps> = ({ meal }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const slot = SLOT_CONFIG[meal.mealSlot] ?? {
    label: meal.mealSlot,
    icon: <Utensils className="h-3.5 w-3.5 text-slate-400" />,
    color: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
    badgeVariant: 'neutral',
  };

  const formattedTime = new Date(meal.loggedAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <Card className="p-4 sm:p-5 flex flex-col gap-3.5 hover:border-obsidian-hover transition-all">
      {/* 1. Header Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Food Thumbnail / Category Avatar */}
          <div className={`h-11 w-11 rounded-xl flex items-center justify-center border shrink-0 ${slot.color}`}>
            {slot.icon}
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm sm:text-base text-slate-100 line-clamp-1">
                {meal.dishName}
              </span>
              {meal.isAiGenerated && (
                <Badge variant="kinetic" className="text-[10px] px-1.5 py-0.2 gap-1 hidden sm:inline-flex">
                  <Sparkles className="h-2.5 w-2.5" />
                  <span>AI Analyzed</span>
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
              <span className="capitalize font-medium">{slot.label}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-slate-500" />
                <span>{formattedTime}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Calories Pill */}
        <div className="flex flex-col items-end shrink-0">
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-obsidian-input border border-obsidian-border text-slate-100 font-extrabold text-sm tabular-nums">
            <Flame className="h-3.5 w-3.5 text-kinetic fill-current" />
            <span>{meal.totalCalories}</span>
            <span className="text-[10px] font-normal text-slate-400">kcal</span>
          </div>
        </div>
      </div>

      {/* 2. Macronutrients Chips */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-300 font-medium tabular-nums">
            {meal.totalProteinG}g P
          </span>
          <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 font-medium tabular-nums">
            {meal.totalCarbsG}g C
          </span>
          <span className="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-300 font-medium tabular-nums">
            {meal.totalFatG}g F
          </span>
        </div>

        {meal.items && meal.items.length > 0 && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-slate-400 hover:text-kinetic flex items-center gap-1 transition-colors"
          >
            <span>{meal.items.length} {meal.items.length === 1 ? 'item' : 'items'}</span>
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {/* 3. Expandable Items Breakdown */}
      {isExpanded && meal.items && meal.items.length > 0 && (
        <div className="mt-1 pt-3 border-t border-obsidian-border/60 flex flex-col gap-2 animate-fadeIn text-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Detected Ingredients & Portions
          </span>
          <div className="flex flex-col gap-1.5">
            {meal.items.map((item, idx) => (
              <div
                key={item.id || idx}
                className="p-2 rounded-lg bg-obsidian-input/80 border border-obsidian-border/40 flex items-center justify-between"
              >
                <div className="flex flex-col">
                  <span className="font-medium text-slate-200">{item.name}</span>
                  {item.portionDescription && (
                    <span className="text-[10px] text-slate-500">{item.portionDescription}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 tabular-nums text-[11px]">
                  <span className="text-slate-400">{item.estimatedWeightG}g</span>
                  <span className="font-bold text-slate-200">{item.calories} kcal</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};
