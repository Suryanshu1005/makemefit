import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../../database';
import { users, userProfiles, userGamification } from '../../database/schema';
import { env } from '../../config/env';
import { ConflictError, NotFoundError, UnauthorizedError } from '../../core/errors/app-error';
import { RegisterRequest, LoginRequest } from '@makemefit/shared';

export class AuthService {
  static async register(input: RegisterRequest) {
    // 1. Check if user already exists
    const existing = await db.query.users.findFirst({
      where: eq(users.email, input.email.toLowerCase()),
    });

    if (existing) {
      throw new ConflictError('An account with this email already exists');
    }

    // 2. Hash password
    const passwordHash = await bcrypt.hash(input.password, 10);

    // 3. Create user, default initial profile placeholder, and gamification state in transaction
    const newUser = await db.transaction(async (tx) => {
      const [insertedUser] = await tx
        .insert(users)
        .values({
          email: input.email.toLowerCase(),
          passwordHash,
          displayName: input.displayName,
          timezone: input.timezone || 'UTC',
        })
        .returning();

      // Initialize default onboarding profile (2000 kcal placeholder until user completes wizard)
      await tx.insert(userProfiles).values({
        userId: insertedUser.id,
        gender: 'male',
        birthDate: '1995-01-01',
        heightCm: '175.00',
        weightKg: '70.00',
        activityLevel: 'moderate',
        goal: 'maintain',
        targetCalories: 2000,
        targetProteinG: '150.0',
        targetCarbsG: '200.0',
        targetFatG: '67.0',
        isTargetOverridden: false,
        isOnboarded: false,
      });

      // Initialize gamification state
      await tx.insert(userGamification).values({
        userId: insertedUser.id,
        currentStreak: 0,
        longestStreak: 0,
        totalXp: 0,
        currentLevel: 1,
      });

      return insertedUser;
    });

    // 4. Generate JWT
    const accessToken = jwt.sign(
      { userId: newUser.id, email: newUser.email },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { userId: newUser.id, email: newUser.email },
      env.JWT_REFRESH_SECRET,
      { expiresIn: env.JWT_REFRESH_EXPIRES_IN }
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: newUser.id,
        email: newUser.email,
        displayName: newUser.displayName,
        timezone: newUser.timezone,
      },
    };
  }

  static async login(input: LoginRequest) {
    const user = await db.query.users.findFirst({
      where: eq(users.email, input.email.toLowerCase()),
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const accessToken = jwt.sign(
      { userId: user.id, email: user.email },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { userId: user.id, email: user.email },
      env.JWT_REFRESH_SECRET,
      { expiresIn: env.JWT_REFRESH_EXPIRES_IN }
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        timezone: user.timezone,
      },
    };
  }

  static async getMe(userId: string) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const profile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, userId),
    });

    const gamification = await db.query.userGamification.findFirst({
      where: eq(userGamification.userId, userId),
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        timezone: user.timezone,
        createdAt: user.createdAt,
      },
      profile: profile
        ? {
            gender: profile.gender,
            birthDate: profile.birthDate,
            heightCm: Number(profile.heightCm),
            weightKg: Number(profile.weightKg),
            activityLevel: profile.activityLevel,
            goal: profile.goal,
            targetCalories: profile.targetCalories,
            targetProteinG: Number(profile.targetProteinG),
            targetCarbsG: Number(profile.targetCarbsG),
            targetFatG: Number(profile.targetFatG),
            isTargetOverridden: profile.isTargetOverridden,
            isOnboarded: profile.isOnboarded,
          }
        : null,
      gamification: gamification
        ? {
            currentStreak: gamification.currentStreak,
            longestStreak: gamification.longestStreak,
            lastLoggedDate: gamification.lastLoggedDate,
            totalXp: gamification.totalXp,
            currentLevel: gamification.currentLevel,
          }
        : {
            currentStreak: 0,
            longestStreak: 0,
            lastLoggedDate: null,
            totalXp: 0,
            currentLevel: 1,
          },
    };
  }
}
