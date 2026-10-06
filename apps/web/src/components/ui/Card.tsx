import React from 'react';
import { cn } from '../../lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'interactive';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    const variants = {
      default: 'bg-obsidian-card border border-obsidian-border shadow-card',
      elevated: 'bg-obsidian-elevated border border-obsidian-border shadow-elevated',
      interactive:
        'bg-obsidian-card border border-obsidian-border shadow-card hover:border-obsidian-hover hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer',
    };

    return (
      <div
        ref={ref}
        className={cn('rounded-2xl p-4 sm:p-6', variants[variant], className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
