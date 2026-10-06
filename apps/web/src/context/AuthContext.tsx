import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiRequest } from '../api/client';

export interface User {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
}

export interface UserProfile {
  gender: string;
  birthDate: string;
  age?: number;
  heightCm: number;
  weightKg: number;
  activityLevel: string;
  goal: string;
  recommendedCalories?: number | null;
  customCalories?: number | null;
  targetCalories: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatG: number;
  isTargetOverridden: boolean;
  isOnboarded: boolean;
}

export interface UserGamification {
  currentStreak: number;
  longestStreak: number;
  lastLoggedDate: string | null;
  totalXp: number;
  currentLevel: number;
}

export interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  gamification: UserGamification | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string, timezone?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  completeOnboarding: (data: any) => Promise<void>;
  updateProfile: (data: any) => Promise<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [gamification, setGamification] = useState<UserGamification | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshMe = async () => {
    try {
      const data = await apiRequest<{
        user: User;
        profile: UserProfile | null;
        gamification: UserGamification | null;
      }>('/auth/me');

      setUser(data.user);
      setProfile(data.profile);
      setGamification(data.gamification);
    } catch {
      localStorage.removeItem('access_token');
      setUser(null);
      setProfile(null);
      setGamification(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      refreshMe();
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const data = await apiRequest<{
      accessToken: string;
      user: User;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    localStorage.setItem('access_token', data.accessToken);
    await refreshMe();
  };

  const register = async (email: string, password: string, displayName: string, timezone?: string) => {
    const detectedTimezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const data = await apiRequest<{
      accessToken: string;
      user: User;
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName, timezone: detectedTimezone }),
    });

    localStorage.setItem('access_token', data.accessToken);
    await refreshMe();
  };

  const logout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore logout errors
    } finally {
      localStorage.removeItem('access_token');
      setUser(null);
      setProfile(null);
      setGamification(null);
    }
  };

  const completeOnboarding = async (data: any) => {
    const res = await apiRequest<{
      profile: UserProfile;
      user: User;
    }>('/users/onboarding', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    setProfile(res.profile);
    setUser(res.user);
  };

  const updateProfile = async (data: any) => {
    const res = await apiRequest<{
      profile: UserProfile;
      user: User;
      targets?: any;
    }>('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });

    setProfile(res.profile);
    setUser(res.user);
    return res;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        gamification,
        isLoading,
        login,
        register,
        logout,
        refreshMe,
        completeOnboarding,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
