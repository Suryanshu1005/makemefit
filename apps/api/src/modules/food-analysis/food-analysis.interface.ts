export interface AnalyzeFoodImageInput {
  imageBuffer: Buffer;
  mimeType: string;
  fileName?: string;
  userNotes?: string;
  timeoutMs?: number;
}

export interface RawFoodVisionResult {
  rawPayload: unknown;
  latencyMs: number;
  modelProvider: string;
}

export interface IFoodVisionProvider {
  readonly providerName: string;
  analyzeImage(input: AnalyzeFoodImageInput): Promise<RawFoodVisionResult>;
}
