import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { Button } from './components/ui/Button';
import { Input } from './components/ui/Input';
import { Card } from './components/ui/Card';
import { Badge } from './components/ui/Badge';
import {
  Flame,
  Zap,
  ShieldCheck,
  Activity,
  LogOut,
  LayoutDashboard,
  User as UserIcon,
} from 'lucide-react';
import { apiRequest } from './api/client';
import { OnboardingFlow } from './components/onboarding/OnboardingFlow';
import { ProfilePage } from './components/profile/ProfilePage';
import { PrimaryDashboard } from './components/dashboard/PrimaryDashboard';

export function App() {
  const { user, profile, gamification, isLoading, login, register, logout } = useAuth();

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [healthStatus, setHealthStatus] = useState<string>('checking...');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'profile'>('dashboard');

  // Health check verification
  useEffect(() => {
    apiRequest<{ status: string; database: string }>('http://localhost:4000/health')
      .then((res) => {
        setHealthStatus(res.status === 'healthy' ? 'healthy' : `db: ${res.database}`);
      })
      .catch(() => {
        setHealthStatus('offline');
      });
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    // Password validation
    if (password.length < 8) {
      setAuthError('Password must be at least 8 characters long');
      return;
    }

    setIsSubmitting(true);

    try {
      if (authMode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, displayName);
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoLogin = async () => {
    setEmail('demo@makemefit.com');
    setPassword('Password123!');
    setDisplayName('Demo Athlete');
    setAuthError(null);
    setIsSubmitting(true);

    try {
      try {
        await login('demo@makemefit.com', 'Password123!');
      } catch {
        await register('demo@makemefit.com', 'Password123!', 'Demo Athlete');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Demo login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-obsidian-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 border-2 border-kinetic border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-400 font-medium">Initializing MakeMeFit...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-obsidian-bg text-slate-100 flex flex-col">
      {/* 1. Header Navigation */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-obsidian-bg/80 border-b border-obsidian-border px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div
            className="flex items-center gap-2.5 cursor-pointer"
            onClick={() => setActiveTab('dashboard')}
          >
            <div className="h-8 w-8 rounded-xl bg-kinetic flex items-center justify-center shadow-glow-kinetic">
              <Zap className="h-5 w-5 text-obsidian-bg fill-current" />
            </div>
            <span className="font-bold text-lg tracking-tight text-slate-100">MakeMeFit</span>
          </div>

          {/* Navigation Tabs (when logged in & onboarded) */}
          {user && profile?.isOnboarded && (
            <nav className="hidden sm:flex items-center gap-1 bg-obsidian-card p-1 rounded-xl border border-obsidian-border">
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'dashboard'
                    ? 'bg-kinetic text-obsidian-bg shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
                <span>Dashboard</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'profile'
                    ? 'bg-kinetic text-obsidian-bg shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <UserIcon className="h-3.5 w-3.5" />
                <span>Profile & Goals</span>
              </button>
            </nav>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Server status pill */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-obsidian-card border border-obsidian-border text-xs text-slate-400">
            <span
              className={`h-2 w-2 rounded-full ${
                healthStatus === 'healthy' ? 'bg-kinetic animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="tabular-nums">API: {healthStatus}</span>
          </div>

          {user && (
            <>
              {/* Gamification Streak Badge */}
              <Badge variant="streak" className="gap-1.5 px-3 py-1 text-xs">
                <Flame className="h-3.5 w-3.5 fill-current text-streak" />
                <span>{gamification?.currentStreak ?? 0} Days</span>
              </Badge>

              {/* Level / XP Badge */}
              <Badge variant="xp" className="gap-1.5 px-3 py-1 text-xs">
                <span>LVL {gamification?.currentLevel ?? 1}</span>
                <span className="text-purple-300/70 font-normal">
                  • {gamification?.totalXp ?? 0} XP
                </span>
              </Badge>

              {/* Profile Link (mobile) */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveTab(activeTab === 'profile' ? 'dashboard' : 'profile')}
                className="sm:hidden p-2 text-slate-300"
              >
                <UserIcon className="h-4 w-4" />
              </Button>

              {/* Logout Button */}
              <Button variant="ghost" size="sm" onClick={logout} className="p-2 text-slate-400 hover:text-rose-400">
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </header>

      {/* 2. Main Content Viewport */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        {!user ? (
          /* Authentication Screen */
          <div className="flex-1 flex flex-col items-center justify-center py-8">
            <div className="w-full max-w-md flex flex-col gap-6">
              <div className="text-center flex flex-col gap-2">
                <Badge variant="kinetic" className="self-center">
                  V1 Foundation Preview
                </Badge>
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-50">
                  {authMode === 'login' ? 'Welcome Back' : 'Create Your Account'}
                </h1>
                <p className="text-sm text-slate-400">
                  {authMode === 'login'
                    ? 'Log in to track your calories, view streaks, and check progress.'
                    : 'Start your frictionless nutrition journey with MakeMeFit.'}
                </p>
              </div>

              <Card className="flex flex-col gap-4">
                {authError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-medium">
                    {authError}
                  </div>
                )}

                <form onSubmit={handleAuthSubmit} className="flex flex-col gap-3.5">
                  {authMode === 'register' && (
                    <Input
                      label="Display Name"
                      placeholder="e.g. Felix Vance"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      required
                    />
                  )}

                  <Input
                    label="Email Address"
                    type="email"
                    placeholder="athlete@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />

                  <Input
                    label="Password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />

                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    className="w-full mt-2"
                    isLoading={isSubmitting}
                  >
                    {authMode === 'login' ? 'Sign In' : 'Create Account'}
                  </Button>
                </form>

                <div className="relative my-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-obsidian-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-obsidian-card px-2 text-slate-500 font-semibold">Or</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={handleDemoLogin}
                  isLoading={isSubmitting}
                  className="w-full"
                >
                  Quick Demo Login (Athlete Account)
                </Button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode(authMode === 'login' ? 'register' : 'login');
                      setAuthError(null);
                    }}
                    className="text-xs text-slate-400 hover:text-kinetic transition-colors"
                  >
                    {authMode === 'login'
                      ? "Don't have an account? Sign up"
                      : 'Already have an account? Sign in'}
                  </button>
                </div>
              </Card>

              {/* Architecture Trust Badges */}
              <div className="grid grid-cols-3 gap-3 text-center text-xs text-slate-500 pt-2">
                <div className="flex flex-col items-center gap-1">
                  <ShieldCheck className="h-4 w-4 text-kinetic" />
                  <span>Argon2 / JWT Auth</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <Activity className="h-4 w-4 text-streak" />
                  <span>Drizzle ORM + PG</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <Zap className="h-4 w-4 text-xp" />
                  <span>Fastify Modular API</span>
                </div>
              </div>
            </div>
          </div>
        ) : !profile?.isOnboarded ? (
          /* Multi-Step Onboarding View (First-time user) */
          <div className="flex flex-col gap-4">
            <OnboardingFlow onComplete={() => setActiveTab('dashboard')} />
          </div>
        ) : activeTab === 'profile' ? (
          /* Dedicated Profile Page */
          <ProfilePage onBack={() => setActiveTab('dashboard')} />
        ) : (
          /* Master Primary Fitness Dashboard */
          <PrimaryDashboard onNavigateProfile={() => setActiveTab('profile')} />
        )}
      </main>
    </div>
  );
}
