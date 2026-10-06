import { IFoodVisionProvider } from '../food-analysis.interface';
import { MockFoodVisionProvider } from './mock-vision.provider';
import { GeminiFoodVisionProvider } from './gemini-vision.provider';

let activeProviderOverride: IFoodVisionProvider | null = null;

export function setCustomFoodVisionProvider(provider: IFoodVisionProvider | null) {
  activeProviderOverride = provider;
}

export function getFoodVisionProvider(): IFoodVisionProvider {
  if (activeProviderOverride) {
    return activeProviderOverride;
  }

  const configuredProvider = (process.env.AI_VISION_PROVIDER || '').toLowerCase();

  // In test environment or when explicitly set to mock, always use MockFoodVisionProvider
  if (process.env.NODE_ENV === 'test' || configuredProvider === 'mock') {
    return new MockFoodVisionProvider();
  }

  if (configuredProvider === 'gemini') {
    return new GeminiFoodVisionProvider();
  }

  // If Gemini API Key is available and not explicitly set to mock, default to Gemini in development/production
  if (process.env.GEMINI_API_KEY && configuredProvider !== 'mock') {
    return new GeminiFoodVisionProvider();
  }

  return new MockFoodVisionProvider();
}
