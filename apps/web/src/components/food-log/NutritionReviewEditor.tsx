import React, { useState, useMemo } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import {
  Flame,
  Scale,
  Plus,
  Trash2,
  Copy,
  RotateCcw,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  ArrowRight,
  Save,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  EditableFoodItem,
  FoodCorrectionsResponse,
  FoodNutritionTotals,
  MealSlot,
  MealConfirmResponse,
} from '@makemefit/shared';
import { apiRequest } from '../../api/client';

interface NutritionReviewEditorProps {
  uploadId: string;
  initialDishName: string;
  initialMealSlot: MealSlot;
  initialItems: EditableFoodItem[];
  originalAiTotals: FoodNutritionTotals;
  uncertaintyNotes?: string[];
  imageUrl?: string;
  onCancel: () => void;
  onSuccess: (response: MealConfirmResponse) => void;
  onRetryAnalysis?: (updatedNotes?: string) => void;
  initialUserNotes?: string;
}

export const NutritionReviewEditor: React.FC<NutritionReviewEditorProps> = ({
  uploadId,
  initialDishName,
  initialMealSlot,
  initialItems,
  originalAiTotals,
  uncertaintyNotes = [],
  imageUrl,
  onCancel,
  onSuccess,
  onRetryAnalysis,
  initialUserNotes = '',
}) => {
  // Form State
  const [dishName, setDishName] = useState(initialDishName);
  const [mealSlot, setMealSlot] = useState<MealSlot>(initialMealSlot);
  const [items, setItems] = useState<EditableFoodItem[]>(initialItems);
  const [userNotes, setUserNotes] = useState(initialUserNotes);

  // UI state
  const [expandedItemId, setExpandedItemId] = useState<string | null>(items[0]?.id || null);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasSavedDraft, setHasSavedDraft] = useState(false);

  // Real-time authoritative local total calculation
  const currentTotals = useMemo(() => {
    let calories = 0;
    let protein = 0;
    let carbs = 0;
    let fat = 0;

    for (const item of items) {
      calories += Math.round(Number(item.calories) || 0);
      protein += Number(item.proteinG) || 0;
      carbs += Number(item.carbsG) || 0;
      fat += Number(item.fatG) || 0;
    }

    return {
      totalCalories: Math.max(0, calories),
      totalProteinG: Math.max(0, Math.round(protein * 10) / 10),
      totalCarbsG: Math.max(0, Math.round(carbs * 10) / 10),
      totalFatG: Math.max(0, Math.round(fat * 10) / 10),
    };
  }, [items]);

  // Check if anything has been modified from the original AI baseline
  const hasModifications = useMemo(() => {
    if (dishName.trim() !== initialDishName.trim()) return true;
    if (items.length !== initialItems.length) return true;
    return items.some((item) => {
      if (item.isUserAdded || !item.originalAiItemData) return true;
      const ai = item.originalAiItemData;
      return (
        item.name.trim().toLowerCase() !== ai.name.trim().toLowerCase() ||
        item.quantity !== ai.quantity ||
        item.unit.trim().toLowerCase() !== ai.unit.trim().toLowerCase() ||
        item.calories !== ai.calories ||
        item.proteinG !== ai.proteinG ||
        item.carbsG !== ai.carbsG ||
        item.fatG !== ai.fatG
      );
    });
  }, [dishName, initialDishName, items, initialItems]);

  // Update specific field on an item (auto-recalculates Atwater calories when macros change)
  const updateItemField = (id: string, field: keyof EditableFoodItem, value: any) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated: EditableFoodItem = { ...item, [field]: value };

        // If user edited proteinG, carbsG, or fatG, automatically sync calories using Atwater (4P + 4C + 9F)
        if (field === 'proteinG' || field === 'carbsG' || field === 'fatG') {
          updated.calories = Math.max(
            0,
            Math.round(updated.proteinG * 4 + updated.carbsG * 4 + updated.fatG * 9)
          );
        }

        // Check if modified against original AI snapshot
        if (item.originalAiItemData) {
          const ai = item.originalAiItemData;
          const isDiff =
            updated.name.trim().toLowerCase() !== ai.name.trim().toLowerCase() ||
            updated.quantity !== ai.quantity ||
            updated.unit.trim().toLowerCase() !== ai.unit.trim().toLowerCase() ||
            updated.calories !== ai.calories ||
            updated.proteinG !== ai.proteinG ||
            updated.carbsG !== ai.carbsG ||
            updated.fatG !== ai.fatG;
          updated.isUserModified = isDiff;
        } else {
          updated.isUserModified = true;
        }

        return updated;
      })
    );
  };

  // Adjust quantity proportionally
  const handleQuantityAdjust = (id: string, newQty: number) => {
    if (newQty <= 0) return;
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const oldQty = item.quantity || 1;
        const ratio = newQty / oldQty;

        const updated: EditableFoodItem = {
          ...item,
          quantity: Math.round(newQty * 100) / 100,
          estimatedWeightG: Math.max(1, Math.round(item.estimatedWeightG * ratio)),
          calories: Math.max(0, Math.round(item.calories * ratio)),
          proteinG: Math.max(0, Math.round(item.proteinG * ratio * 10) / 10),
          carbsG: Math.max(0, Math.round(item.carbsG * ratio * 10) / 10),
          fatG: Math.max(0, Math.round(item.fatG * ratio * 10) / 10),
        };

        if (item.originalAiItemData) {
          const ai = item.originalAiItemData;
          updated.isUserModified =
            updated.quantity !== ai.quantity ||
            updated.calories !== ai.calories ||
            updated.proteinG !== ai.proteinG;
        }

        return updated;
      })
    );
  };

  // Add a new food item
  const handleAddItem = () => {
    const newItemId = `user-item-${Date.now()}`;
    const newItem: EditableFoodItem = {
      id: newItemId,
      name: 'New Food Item',
      quantity: 1,
      unit: 'serving',
      estimatedWeightG: 100,
      calories: 100,
      proteinG: 5,
      carbsG: 15,
      fatG: 2,
      isUserModified: true,
      isUserAdded: true,
      originalAiItemData: null,
      notes: 'Manually added by user',
    };
    setItems((prev) => [...prev, newItem]);
    setExpandedItemId(newItemId);
  };

  // Duplicate an existing item
  const handleDuplicateItem = (itemToCopy: EditableFoodItem) => {
    const duplicateId = `user-item-${Date.now()}`;
    const copy: EditableFoodItem = {
      ...itemToCopy,
      id: duplicateId,
      name: `${itemToCopy.name} (Copy)`,
      isUserModified: true,
      isUserAdded: true,
      notes: 'Duplicated item',
    };
    setItems((prev) => [...prev, copy]);
    setExpandedItemId(duplicateId);
  };

  // Remove an item
  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) {
      setErrorMessage('A meal must contain at least one food item.');
      return;
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Reset an item back to its original AI estimate
  const handleResetItem = (id: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id || !item.originalAiItemData) return item;
        const ai = item.originalAiItemData;
        return {
          ...item,
          name: ai.name,
          quantity: ai.quantity,
          unit: ai.unit,
          estimatedWeightG: ai.estimatedWeightG,
          calories: ai.calories,
          proteinG: ai.proteinG,
          carbsG: ai.carbsG,
          fatG: ai.fatG,
          isUserModified: false,
        };
      })
    );
  };

  // Client-side validation before sending to server
  const validateForm = (): boolean => {
    setErrorMessage(null);
    if (!dishName.trim()) {
      setErrorMessage('Please enter a meal or dish name.');
      return false;
    }
    if (items.length === 0) {
      setErrorMessage('Meal must have at least one food item.');
      return false;
    }
    for (const item of items) {
      if (!item.name.trim()) {
        setErrorMessage('All food items must have a valid name.');
        return false;
      }
      if (item.quantity <= 0) {
        setErrorMessage(`Quantity for "${item.name}" must be greater than 0.`);
        return false;
      }
      if (item.calories < 0 || item.proteinG < 0 || item.carbsG < 0 || item.fatG < 0) {
        setErrorMessage(`Nutritional values for "${item.name}" cannot be negative.`);
        return false;
      }
    }
    return true;
  };

  // Save manual corrections as a draft
  const handleSaveDraft = async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    setErrorMessage(null);

    try {
      await apiRequest<FoodCorrectionsResponse>(
        `/food-logs/uploads/${uploadId}/corrections`,
        {
          method: 'PUT',
          body: JSON.stringify({
            dishName: dishName.trim(),
            mealSlot,
            items,
            userNotes: userNotes.trim() || undefined,
          }),
        }
      );

      setHasSavedDraft(true);
    } catch (err: any) {
      setErrorMessage(
        err.message || 'Failed to save nutrition draft. Please check your inputs.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Confirm meal and commit to today's nutrition
  const handleConfirmMeal = async () => {
    if (!validateForm()) return;

    setIsConfirming(true);
    setErrorMessage(null);

    try {
      const response = await apiRequest<MealConfirmResponse>(
        `/food-logs/uploads/${uploadId}/confirm`,
        {
          method: 'POST',
          body: JSON.stringify({
            dishName: dishName.trim(),
            mealSlot,
            items,
            notes: userNotes.trim() || undefined,
          }),
        }
      );

      onSuccess(response);
    } catch (err: any) {
      setErrorMessage(
        err.message || 'Failed to confirm meal. Please check your inputs.'
      );
    } finally {
      setIsConfirming(false);
    }
  };

  const calDiff = currentTotals.totalCalories - originalAiTotals.totalCalories;

  return (
    <div className="flex flex-col gap-5 text-slate-100 animate-fadeIn">
      {/* 1. Review & Guidance Alert */}
      <div className="p-3.5 rounded-2xl bg-kinetic/10 border border-kinetic/25 flex items-start gap-3 text-xs">
        <Sparkles className="h-4 w-4 text-kinetic shrink-0 mt-0.5" />
        <div className="flex-1">
          <span className="font-bold text-slate-100 block">
            Review Estimated Nutrition Before Logging
          </span>
          <span className="text-slate-300 text-[11px] leading-relaxed">
            AI values are visual estimations. Adjust portion quantities or ingredients to match what you actually consumed. Your daily calories will not be updated until you confirm.
          </span>
        </div>
        <Badge variant={hasModifications ? 'streak' : 'kinetic'} className="shrink-0 text-[10px]">
          {hasModifications ? 'Edited by You' : 'AI Estimate'}
        </Badge>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs animate-fadeIn">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
          <div className="flex-1">
            <span className="font-semibold block text-rose-200">Correction Error</span>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      {/* 2. Dish Name & Meal Slot */}
      <div className="p-4 rounded-2xl bg-obsidian-elevated/50 border border-obsidian-border flex flex-col gap-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Dish / Meal Name
            </label>
            <input
              type="text"
              value={dishName}
              onChange={(e) => setDishName(e.target.value)}
              className="w-full bg-obsidian-input border border-obsidian-border rounded-xl px-3 py-2 text-sm font-bold text-slate-100 focus:outline-none focus:border-kinetic focus:ring-1 focus:ring-kinetic"
              placeholder="e.g. Grilled Chicken Bowl"
            />
          </div>

          <div className="flex flex-col gap-1 sm:w-auto">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Meal Slot
            </label>
            <div className="flex items-center gap-1.5 bg-obsidian-input p-1 rounded-xl border border-obsidian-border">
              {(['breakfast', 'lunch', 'dinner', 'snack'] as MealSlot[]).map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setMealSlot(slot)}
                  className={`py-1 px-2.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                    mealSlot === slot
                      ? 'bg-kinetic text-obsidian-bg shadow-glow-kinetic'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {slot}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Real-time Recalculated Nutrition Totals Bar */}
        <div className="grid grid-cols-4 gap-2 pt-2 border-t border-obsidian-border/70">
          <div className="p-2.5 rounded-xl bg-obsidian-input flex flex-col items-center justify-center text-center">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-kinetic uppercase">
              <Flame className="h-3.5 w-3.5 text-kinetic" />
              <span>Calories</span>
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-base font-extrabold text-slate-100 tabular-nums">
                {currentTotals.totalCalories}
              </span>
              <span className="text-[10px] text-slate-500">kcal</span>
            </div>
            {calDiff !== 0 && (
              <span
                className={`text-[10px] font-semibold tabular-nums ${
                  calDiff > 0 ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {calDiff > 0 ? `+${calDiff}` : `${calDiff}`} vs AI
              </span>
            )}
          </div>

          <div className="p-2.5 rounded-xl bg-obsidian-input flex flex-col items-center justify-center text-center">
            <span className="text-[11px] font-semibold text-rose-400 uppercase">Protein</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-base font-extrabold text-slate-100 tabular-nums">
                {currentTotals.totalProteinG}
              </span>
              <span className="text-[10px] text-slate-500">g</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-obsidian-input flex flex-col items-center justify-center text-center">
            <span className="text-[11px] font-semibold text-amber-400 uppercase">Carbs</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-base font-extrabold text-slate-100 tabular-nums">
                {currentTotals.totalCarbsG}
              </span>
              <span className="text-[10px] text-slate-500">g</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-obsidian-input flex flex-col items-center justify-center text-center">
            <span className="text-[11px] font-semibold text-sky-400 uppercase">Fat</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-base font-extrabold text-slate-100 tabular-nums">
                {currentTotals.totalFatG}
              </span>
              <span className="text-[10px] text-slate-500">g</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Detected Food Items List */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Scale className="h-3.5 w-3.5 text-kinetic" />
            <span>Food Items ({items.length})</span>
          </span>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAddItem}
            className="gap-1.5 text-xs py-1 px-3 border border-kinetic/30 text-kinetic hover:bg-kinetic/10"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Item</span>
          </Button>
        </div>

        {/* Item Cards */}
        <div className="flex flex-col gap-2.5">
          {items.map((item, index) => {
            const isExpanded = expandedItemId === item.id;
            const hasOrig = Boolean(item.originalAiItemData);
            const orig = item.originalAiItemData;

            return (
              <div
                key={item.id}
                className={`rounded-2xl border transition-all ${
                  item.isUserModified || item.isUserAdded
                    ? 'border-amber-500/30 bg-obsidian-elevated/70'
                    : 'border-obsidian-border bg-obsidian-elevated/40'
                }`}
              >
                {/* Header row / Compact summary */}
                <div
                  onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                  className="p-3 flex items-center justify-between gap-3 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="h-6 w-6 rounded-lg bg-obsidian-input flex items-center justify-center text-xs text-slate-400 shrink-0 font-bold">
                      {index + 1}
                    </span>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-100 truncate">
                          {item.name}
                        </span>
                        {item.isUserAdded ? (
                          <Badge variant="xp" className="text-[10px] py-0 px-1.5">
                            User Added
                          </Badge>
                        ) : item.isUserModified ? (
                          <Badge variant="streak" className="text-[10px] py-0 px-1.5">
                            Edited
                          </Badge>
                        ) : (
                          <Badge variant="kinetic" className="text-[10px] py-0 px-1.5">
                            AI Estimate
                          </Badge>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 truncate">
                        {item.quantity} {item.unit} · ~{item.estimatedWeightG}g
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="font-extrabold text-sm text-slate-200 tabular-nums block">
                        {item.calories} kcal
                      </span>
                      <span className="text-[10px] text-slate-400 tabular-nums">
                        {item.proteinG}g P · {item.carbsG}g C · {item.fatG}g F
                      </span>
                    </div>

                    <div className="text-slate-400 hover:text-slate-200 p-1">
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Item Form */}
                {isExpanded && (
                  <div className="p-3.5 pt-0 border-t border-obsidian-border/50 flex flex-col gap-3 mt-1 animate-fadeIn">
                    {/* Original AI baseline pill if edited */}
                    {hasOrig && orig && item.isUserModified && (
                      <div className="p-2 rounded-xl bg-obsidian-input border border-obsidian-border/60 flex items-center justify-between text-[11px] text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <HelpCircle className="h-3.5 w-3.5 text-kinetic shrink-0" />
                          <span>
                            Original AI Estimate: <strong>{orig.quantity} {orig.unit}</strong> (~{orig.estimatedWeightG}g) · <strong>{orig.calories} kcal</strong> ({orig.proteinG}g P · {orig.carbsG}g C · {orig.fatG}g F)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleResetItem(item.id)}
                          className="flex items-center gap-1 text-kinetic hover:underline text-[10px] font-semibold shrink-0 ml-2"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Reset</span>
                        </button>
                      </div>
                    )}

                    {/* Inputs Row 1: Item Name & Stepper */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase font-semibold text-slate-400">
                          Food Item Name
                        </label>
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateItemField(item.id, 'name', e.target.value)}
                          className="bg-obsidian-input border border-obsidian-border rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-kinetic"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] uppercase font-semibold text-slate-400">
                            Quantity
                          </label>
                          <div className="flex items-center gap-1 bg-obsidian-input border border-obsidian-border rounded-xl px-2 py-1">
                            <button
                              type="button"
                              onClick={() =>
                                handleQuantityAdjust(
                                  item.id,
                                  Math.max(0.25, item.quantity - 0.5)
                                )
                              }
                              className="px-1.5 py-0.5 rounded text-slate-400 hover:text-slate-100 font-bold"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              step="0.25"
                              min="0.1"
                              value={item.quantity}
                              onChange={(e) =>
                                handleQuantityAdjust(item.id, parseFloat(e.target.value) || 1)
                              }
                              className="w-full bg-transparent text-center text-xs font-bold text-slate-100 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => handleQuantityAdjust(item.id, item.quantity + 0.5)}
                              className="px-1.5 py-0.5 rounded text-slate-400 hover:text-slate-100 font-bold"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] uppercase font-semibold text-slate-400">
                            Portion Unit
                          </label>
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) => updateItemField(item.id, 'unit', e.target.value)}
                            className="bg-obsidian-input border border-obsidian-border rounded-xl px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-kinetic"
                            placeholder="serving"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Inputs Row 2: Weight & Macros */}
                    <div className="grid grid-cols-4 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase font-semibold text-slate-400">
                          Weight (g)
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={item.estimatedWeightG}
                          onChange={(e) =>
                            updateItemField(
                              item.id,
                              'estimatedWeightG',
                              Math.max(1, parseFloat(e.target.value) || 0)
                            )
                          }
                          className="bg-obsidian-input border border-obsidian-border rounded-xl px-2 py-1 text-xs text-slate-100 text-center font-bold focus:outline-none focus:border-kinetic"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase font-semibold text-kinetic">
                          Calories
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={item.calories}
                          onChange={(e) =>
                            updateItemField(
                              item.id,
                              'calories',
                              Math.max(0, parseInt(e.target.value, 10) || 0)
                            )
                          }
                          className="bg-obsidian-input border border-obsidian-border rounded-xl px-2 py-1 text-xs text-slate-100 text-center font-bold focus:outline-none focus:border-kinetic"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase font-semibold text-rose-400">
                          Protein (g)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={item.proteinG}
                          onChange={(e) =>
                            updateItemField(
                              item.id,
                              'proteinG',
                              Math.max(0, parseFloat(e.target.value) || 0)
                            )
                          }
                          className="bg-obsidian-input border border-obsidian-border rounded-xl px-2 py-1 text-xs text-slate-100 text-center font-bold focus:outline-none focus:border-kinetic"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase font-semibold text-amber-400">
                          Carbs / Fat (g)
                        </label>
                        <div className="grid grid-cols-2 gap-1">
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={item.carbsG}
                            title="Carbs (g)"
                            onChange={(e) =>
                              updateItemField(
                                item.id,
                                'carbsG',
                                Math.max(0, parseFloat(e.target.value) || 0)
                              )
                            }
                            className="bg-obsidian-input border border-obsidian-border rounded-xl px-1 py-1 text-xs text-amber-300 text-center font-bold focus:outline-none focus:border-kinetic"
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={item.fatG}
                            title="Fat (g)"
                            onChange={(e) =>
                              updateItemField(
                                item.id,
                                'fatG',
                                Math.max(0, parseFloat(e.target.value) || 0)
                              )
                            }
                            className="bg-obsidian-input border border-obsidian-border rounded-xl px-1 py-1 text-xs text-sky-300 text-center font-bold focus:outline-none focus:border-kinetic"
                          />
                        </div>
                      </div>
                    </div>

                    {/* AI Preparation / Oil & Sweetness Note */}
                    {item.notes && (
                      <div className="px-2.5 py-1.5 rounded-lg bg-obsidian-elevated/60 border border-obsidian-border/60 text-[11px] text-slate-300 flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3 text-kinetic shrink-0" />
                        <span>{item.notes}</span>
                      </div>
                    )}

                    {/* Item Action Row */}
                    <div className="flex items-center justify-between pt-1 border-t border-obsidian-border/40 text-xs">
                      <span className="text-[10px] text-slate-500">
                        {item.confidence && `AI Confidence: ${item.confidence}`}
                      </span>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDuplicateItem(item)}
                          className="flex items-center gap-1 text-slate-400 hover:text-slate-200 px-2 py-1 rounded-lg hover:bg-obsidian-input text-[11px]"
                        >
                          <Copy className="h-3 w-3" />
                          <span>Duplicate</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="flex items-center gap-1 text-rose-400 hover:text-rose-300 px-2 py-1 rounded-lg hover:bg-rose-500/10 text-[11px]"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Optional User Notes & Quick Oil/Sweetness Context Chips */}
      <div className="flex flex-col gap-2">
        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Cooking Oil, Sweetness & Preparation Notes <span className="text-slate-500 font-normal">(Used for Re-analysis)</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {[
            'Home-cooked (low oil ~1 tsp)',
            'Restaurant style (rich oil/butter)',
            'Steamed / Air-fried (0g added oil)',
            '+1 tbsp Desi Ghee / Butter',
            'Unsweetened / No added sugar',
            'Extra sweet / sugar syrup',
          ].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() =>
                setUserNotes((prev) =>
                  prev.includes(preset) ? prev : prev ? `${prev}, ${preset}` : preset
                )
              }
              className="px-2.5 py-1 rounded-lg bg-obsidian-elevated border border-obsidian-border hover:border-kinetic/50 text-[11px] text-slate-300 hover:text-kinetic transition-all"
            >
              + {preset}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={userNotes}
          onChange={(e) => setUserNotes(e.target.value)}
          placeholder="e.g. Cooked in 1 tsp olive oil, no sugar in tea, or restaurant gravy with butter"
          className="bg-obsidian-input border border-obsidian-border rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-kinetic"
        />
      </div>

      {/* 4. Uncertainty & Disclaimer Banner */}
      {uncertaintyNotes.length > 0 && (
        <div className="p-3 rounded-xl bg-obsidian-elevated/40 border border-obsidian-border flex flex-col gap-1.5 text-xs">
          <span className="font-semibold text-amber-300 flex items-center gap-1.5 text-[11px]">
            <HelpCircle className="h-3.5 w-3.5 text-amber-400" />
            <span>AI Recognition Notes</span>
          </span>
          <ul className="list-disc list-inside text-[11px] text-slate-400 space-y-0.5">
            {uncertaintyNotes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 5. Bottom Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-obsidian-border">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="w-full sm:w-auto">
            Cancel
          </Button>
          {onRetryAnalysis && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRetryAnalysis(userNotes)}
              className="gap-1.5 text-xs text-slate-400 hover:text-slate-100"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Re-analyze</span>
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          {hasSavedDraft && (
            <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Draft Saved</span>
            </span>
          )}
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={isSaving || isConfirming}
            isLoading={isSaving}
            onClick={handleSaveDraft}
            className="gap-1.5 text-xs flex-1 sm:flex-initial"
          >
            <Save className="h-3.5 w-3.5" />
            <span>Save Draft</span>
          </Button>

          <Button
            type="button"
            variant="primary"
            size="md"
            disabled={isSaving || isConfirming}
            isLoading={isConfirming}
            onClick={handleConfirmMeal}
            className="gap-2 shadow-glow-kinetic px-5 flex-1 sm:flex-initial font-bold"
          >
            <span>Confirm & Add to Today's Food</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
