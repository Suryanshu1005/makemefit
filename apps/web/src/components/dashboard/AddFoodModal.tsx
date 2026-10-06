import React from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import {
  Camera,
  Sparkles,
  X,
  Database,
  Flame,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

interface AddFoodModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSeedDemo: () => Promise<void>;
  onExceedTarget: () => Promise<void>;
  onClearMeals: () => Promise<void>;
  isLoadingAction: boolean;
}

export const AddFoodModal: React.FC<AddFoodModalProps> = ({
  isOpen,
  onClose,
  onSeedDemo,
  onExceedTarget,
  onClearMeals,
  isLoadingAction,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-obsidian-bg/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg">
        <Card className="p-6 flex flex-col gap-5 border border-kinetic/30 shadow-2xl bg-obsidian-card">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-obsidian-border">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-kinetic/15 border border-kinetic/30 flex items-center justify-center text-kinetic shadow-glow-kinetic">
                <Camera className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-100">Add Food & Meal Log</h3>
                <span className="text-xs text-slate-400">Primary Logging Action</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-obsidian-input transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* AI Vision Pipeline Teaser */}
          <div className="p-4 rounded-xl bg-kinetic/10 border border-kinetic/20 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-kinetic uppercase tracking-wider">
                <Sparkles className="h-4 w-4" />
                <span>Next Phase: AI Vision Logging</span>
              </div>
              <Badge variant="kinetic">Phase 2 In Scope</Badge>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              In Phase 2, this button will launch the high-speed camera scanner. The AI Vision model will detect items, portion sizes, and calculate calories in real time with human-in-the-loop review.
            </p>
          </div>

          {/* Real Database Simulation / Dev Actions */}
          <div className="flex flex-col gap-2.5">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-slate-400" />
              <span>Database Data Simulation (V1 Dashboard Verification)</span>
            </span>
            <p className="text-xs text-slate-400">
              Test today's dashboard states with real records written to PostgreSQL:
            </p>

            <div className="flex flex-col gap-2 pt-1">
              {/* Option 1: Seed 3 Real Meals */}
              <button
                type="button"
                disabled={isLoadingAction}
                onClick={async () => {
                  await onSeedDemo();
                  onClose();
                }}
                className="p-3 rounded-xl border border-obsidian-border bg-obsidian-input text-left flex items-center justify-between hover:border-kinetic hover:bg-kinetic/5 transition-all text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <Flame className="h-4 w-4 text-kinetic" />
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-100">Seed Today's Meals (1,380 kcal)</span>
                    <span className="text-[11px] text-slate-400">
                      Creates Avocado Toast, Chicken Bowl, and Protein Shake
                    </span>
                  </div>
                </div>
                <span className="text-kinetic font-semibold">Seed →</span>
              </button>

              {/* Option 2: Seed Target Exceeded State */}
              <button
                type="button"
                disabled={isLoadingAction}
                onClick={async () => {
                  await onExceedTarget();
                  onClose();
                }}
                className="p-3 rounded-xl border border-obsidian-border bg-obsidian-input text-left flex items-center justify-between hover:border-amber-400 hover:bg-amber-400/5 transition-all text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-100">Test Calorie Target Exceeded State</span>
                    <span className="text-[11px] text-slate-400">
                      Seeds meals that exceed today's budget (+320 kcal surplus)
                    </span>
                  </div>
                </div>
                <span className="text-amber-400 font-semibold">Exceed →</span>
              </button>

              {/* Option 3: Clear Meals (Zero State) */}
              <button
                type="button"
                disabled={isLoadingAction}
                onClick={async () => {
                  await onClearMeals();
                  onClose();
                }}
                className="p-3 rounded-xl border border-obsidian-border bg-obsidian-input text-left flex items-center justify-between hover:border-rose-400 hover:bg-rose-400/5 transition-all text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <RotateCcw className="h-4 w-4 text-rose-400" />
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-100">Clear Meals (Test Zero State)</span>
                    <span className="text-[11px] text-slate-400">
                      Resets consumed calories to 0 and empties today's meal list
                    </span>
                  </div>
                </div>
                <span className="text-rose-400 font-semibold">Reset →</span>
              </button>
            </div>
          </div>

          <div className="pt-2 flex justify-end border-t border-obsidian-border/60">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};
