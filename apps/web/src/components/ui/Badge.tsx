import React from 'react';
import { cn } from '../../lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'kinetic' | 'streak' | 'xp' | 'protein' | 'carbs' | 'fat' | 'neutral';
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = 'neutral',
  children,
  ...props
}) => {
  const variants = {
    kinetic: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    streak: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    xp: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    protein: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    carbs: 'bg-amber-400/10 text-amber-300 border-amber-400/20',
    fat: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    neutral: 'bg-slate-800 text-slate-300 border-slate-700',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap shrink-0',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
};
