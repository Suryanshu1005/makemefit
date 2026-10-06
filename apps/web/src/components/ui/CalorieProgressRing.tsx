import React from 'react';
import { cn } from '../../lib/utils';

export interface CalorieProgressRingProps {
  consumed: number;
  target: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export const CalorieProgressRing: React.FC<CalorieProgressRingProps> = ({
  consumed,
  target,
  size = 200,
  strokeWidth = 14,
  className,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const validTarget = Math.max(1, target);
  const ratio = Math.min(1, Math.max(0, consumed / validTarget));
  const strokeDashoffset = circumference - ratio * circumference;

  const remaining = Math.max(0, target - consumed);
  const isOver = consumed > target;
  const overAmount = consumed - target;

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255, 255, 255, 0.07)"
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* Dynamic progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={isOver ? '#F59E0B' : '#10B981'}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          className="transition-all duration-1000 ease-out"
        />
      </svg>

      {/* Center Readout */}
      <div className="absolute flex flex-col items-center justify-center text-center px-4">
        <span className="text-xs font-semibold tracking-wider uppercase text-slate-400">
          {isOver ? 'Over Target' : 'Remaining'}
        </span>
        <span
          className={cn(
            'text-4xl font-extrabold tracking-tight tabular-nums transition-colors',
            isOver ? 'text-amber-400' : 'text-slate-50'
          )}
        >
          {isOver ? `+${overAmount}` : remaining}
        </span>
        <span className="text-xs text-slate-500 font-medium mt-0.5 tabular-nums">
          {consumed} / {target} kcal
        </span>
      </div>
    </div>
  );
};
