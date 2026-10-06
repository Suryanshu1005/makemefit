import React from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  suffix?: string;
  prefix?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, suffix, prefix, type = 'text', id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-xs font-medium text-slate-300">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {prefix && (
            <span className="absolute left-3.5 text-xs text-slate-500 font-medium pointer-events-none">
              {prefix}
            </span>
          )}
          <input
            id={inputId}
            ref={ref}
            type={type}
            className={cn(
              'w-full bg-obsidian-input border border-obsidian-border rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-kinetic focus:ring-1 focus:ring-kinetic transition-colors',
              prefix && 'pl-8',
              suffix && 'pr-12',
              error && 'border-rose-500 focus:border-rose-500 focus:ring-rose-500',
              className
            )}
            {...props}
          />
          {suffix && (
            <span className="absolute right-3.5 text-xs text-slate-500 font-medium pointer-events-none">
              {suffix}
            </span>
          )}
        </div>
        {error && <span className="text-xs text-rose-400 font-medium">{error}</span>}
        {!error && helperText && <span className="text-xs text-slate-500">{helperText}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
