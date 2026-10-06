import React from 'react';
import { cn } from '../../lib/utils';

export interface ProgressBarProps {
  label: string;
  current: number;
  target: number;
  unit?: string;
  variant?: 'protein' | 'carbs' | 'fat' | 'xp' | 'kinetic';
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  label,
  current,
  target,
  unit = 'g',
  variant = 'kinetic',
  className,
}) => {
  const percentage = Math.min(100, Math.round((current / Math.max(1, target)) * 100));

  const variants = {
    protein: 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.4)]',
    carbs: 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.4)]',
    fat: 'bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.4)]',
    xp: 'bg-purple-500 shadow-[0_0_12px_rgba(139,92,246,0.4)]',
    kinetic: 'bg-kinetic shadow-glow-kinetic',
  };

  return (
    <div className={cn('w-full flex flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between text-xs font-medium">
        <span className="text-slate-300 font-semibold">{label}</span>
        <span className="text-slate-400 tabular-nums">
          <strong className="text-slate-100">{current}</strong> / {target} {unit}{' '}
          <span className="text-slate-500 text-[10px]">({percentage}%)</span>
        </span>
      </div>
      <div className="w-full h-2 bg-obsidian-border/50 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700 ease-out', variants[variant])}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
