import React from 'react';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';

export const DashboardSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col gap-6 w-full animate-fadeIn">
      {/* 1. Header Greeting Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28 rounded-xl" />
          <Skeleton className="h-9 w-28 rounded-xl" />
        </div>
      </div>

      {/* 2. Hero Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Ring Skeleton */}
        <Card className="md:col-span-5 flex flex-col items-center justify-center p-8 min-h-[300px]">
          <Skeleton className="h-52 w-52 rounded-full" />
        </Card>

        {/* Macro Bars Skeleton */}
        <Card className="md:col-span-7 flex flex-col justify-between p-6 gap-6 min-h-[300px]">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-36" />
          </div>

          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>

          <Skeleton className="h-5 w-48" />
        </Card>
      </div>

      {/* 3. Meals List Skeleton */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>

        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
};
