import React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'streak';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading = false, children, disabled, ...props }, ref) => {
    const variants = {
      primary:
        'bg-kinetic hover:bg-kinetic-hover text-obsidian-bg font-semibold shadow-glow-kinetic active:scale-[0.98]',
      secondary:
        'bg-obsidian-elevated hover:bg-obsidian-hover text-slate-100 border border-obsidian-border active:scale-[0.98]',
      ghost:
        'bg-transparent hover:bg-white/5 text-slate-300 hover:text-white',
      destructive:
        'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 active:scale-[0.98]',
      streak:
        'bg-streak hover:bg-streak-hover text-white font-semibold shadow-glow-streak active:scale-[0.98]',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-xs rounded-lg',
      md: 'px-4 py-2.5 text-sm rounded-xl',
      lg: 'px-6 py-3.5 text-base rounded-2xl',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kinetic disabled:opacity-50 disabled:cursor-not-allowed',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {isLoading ? (
          <span className="inline-flex items-center gap-2">
            <svg className="animate-spin h-4 w-4 text-current" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span>Loading...</span>
          </span>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
