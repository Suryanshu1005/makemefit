import React, { useState, useRef, useCallback } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import {
  Camera,
  UploadCloud,
  X,
  RefreshCw,
  Trash2,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Layers,
  FileImage,
  ArrowRight,
  ShieldCheck,
  ChevronRight,
  Flame,
  Info,
  Scale,
  ShieldAlert,
  HelpCircle,
} from 'lucide-react';
import { validateClientImage } from '../../utils/file-validator';
import { apiRequest } from '../../api/client';
import {
  FoodLogUploadResponse,
  FoodAnalysisResponse,
  MealSlot,
  NutritionReviewData,
  MealConfirmResponse,
} from '@makemefit/shared';
import { NutritionReviewEditor } from './NutritionReviewEditor';

interface FoodLoggingFlowProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess?: (analysis: FoodAnalysisResponse) => void;
  // Fallback demo actions for developer testing
  onSeedDemo?: () => Promise<void>;
  onExceedTarget?: () => Promise<void>;
  onClearMeals?: () => Promise<void>;
}

type LoggingStep = 'select' | 'preview' | 'uploading' | 'analyzing' | 'review' | 'confirmed' | 'error';

export const FoodLoggingFlow: React.FC<FoodLoggingFlowProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
  onSeedDemo,
  onExceedTarget,
  onClearMeals,
}) => {
  // Navigation & step states
  const [step, setStep] = useState<LoggingStep>('select');
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileDetails, setFileDetails] = useState<{
    name: string;
    sizeFormatted: string;
    type: string;
  } | null>(null);

  // Validation & Error states
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);
  const [isDevActionLoading, setIsDevActionLoading] = useState(false);

  // Meal context
  const [selectedMealSlot, setSelectedMealSlot] = useState<MealSlot>('lunch');
  const [mealNotes, setMealNotes] = useState('');

  // Upload & Analysis Results
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<FoodLogUploadResponse | null>(null);
  const [analysisResult, setAnalysisResult] = useState<FoodAnalysisResponse | null>(null);

  // Review & Confirmation State
  const [reviewData, setReviewData] = useState<NutritionReviewData | null>(null);
  const [confirmedMealResult, setConfirmedMealResult] = useState<MealConfirmResponse | null>(null);

  // Hidden file inputs
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Reset state on cleanup
  const resetFlow = useCallback(() => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setFileDetails(null);
    setErrorMessage(null);
    setStep('select');
    setUploadProgress(0);
    setUploadResult(null);
    setAnalysisResult(null);
    setReviewData(null);
    setConfirmedMealResult(null);
    setMealNotes('');
  }, [previewUrl]);

  const handleClose = () => {
    resetFlow();
    onClose();
  };

  // Handle file selection
  const processSelectedFile = async (file: File) => {
    setErrorMessage(null);
    const validation = await validateClientImage(file);

    if (!validation.isValid) {
      setErrorMessage(validation.error || 'Invalid image file.');
      return;
    }

    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    const sizeKb = (file.size / 1024).toFixed(0);
    const sizeFormatted = file.size > 1024 * 1024 ? `${sizeMb} MB` : `${sizeKb} KB`;

    setSelectedFile(file);
    setPreviewUrl(validation.previewUrl || null);
    setFileDetails({
      name: file.name,
      sizeFormatted,
      type: file.type || 'image/jpeg',
    });
    setStep('preview');
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      processSelectedFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const handleRemoveImage = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setFileDetails(null);
    setErrorMessage(null);
    setStep('select');
  };

  // Submit image for upload and AI analysis
  const handleSubmitUpload = async () => {
    if (!selectedFile) return;

    setStep('uploading');
    setUploadProgress(25);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile, selectedFile.name);

      // 1. Upload to backend object storage
      setUploadProgress(45);
      const upload = await apiRequest<FoodLogUploadResponse>('/food-logs/upload', {
        method: 'POST',
        body: formData,
      });

      setUploadResult(upload);
      setUploadProgress(70);
      setStep('analyzing');

      // 2. Execute AI Vision Food Analysis pipeline
      const analysis = await apiRequest<FoodAnalysisResponse>(
        `/food-logs/uploads/${upload.id}/analyze`,
        {
          method: 'POST',
          body: JSON.stringify({ userNotes: mealNotes || undefined }),
        }
      );

      setUploadProgress(85);
      setAnalysisResult(analysis);

      // 3. Load authoritative Nutrition Review data
      const review = await apiRequest<NutritionReviewData>(
        `/food-logs/uploads/${upload.id}/review`
      );

      setReviewData(review);
      setUploadProgress(100);
      setStep('review');

      if (onUploadSuccess) {
        onUploadSuccess(analysis);
      }
    } catch (err: any) {
      setErrorMessage(
        err.message || 'Failed to analyze food image. Please check your connection or choose another photo.'
      );
      setStep('error');
    }
  };

  // Retry analysis
  const handleRetryAnalysis = async () => {
    if (!uploadResult) {
      if (selectedFile) return handleSubmitUpload();
      return;
    }

    setStep('analyzing');
    setUploadProgress(40);
    setErrorMessage(null);

    try {
      const analysis = await apiRequest<FoodAnalysisResponse>(
        `/food-logs/uploads/${uploadResult.id}/retry-analysis`,
        {
          method: 'POST',
          body: JSON.stringify({ userNotes: mealNotes || undefined }),
        }
      );

      setUploadProgress(85);
      setAnalysisResult(analysis);

      const review = await apiRequest<NutritionReviewData>(
        `/food-logs/uploads/${uploadResult.id}/review`
      );

      setReviewData(review);
      setUploadProgress(100);
      setStep('review');

      if (onUploadSuccess) {
        onUploadSuccess(analysis);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Retry failed. Please try a different photo.');
      setStep('error');
    }
  };

  if (!isOpen) return null;

  const analysis = analysisResult?.analysis;
  const isNeedsReview = analysisResult?.status === 'needs_review';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-obsidian-bg/85 backdrop-blur-md animate-fadeIn">
      <div
        className={`relative w-full ${
          step === 'review' ? 'max-w-2xl' : 'max-w-xl'
        } max-h-[92vh] flex flex-col transition-all duration-200`}
      >
        <Card className="flex flex-col border border-kinetic/30 shadow-2xl bg-obsidian-card overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-5 pb-4 border-b border-obsidian-border bg-obsidian-elevated/40">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-kinetic/15 border border-kinetic/30 flex items-center justify-center text-kinetic shadow-glow-kinetic">
                {step === 'confirmed' ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : step === 'review' ? (
                  <Scale className="h-5 w-5" />
                ) : (
                  <Camera className="h-5 w-5" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                  <span>
                    {step === 'review'
                      ? 'Review & Edit Meal Nutrition'
                      : step === 'confirmed'
                      ? 'Meal Confirmed & Logged!'
                      : 'Log Food with AI Photo'}
                  </span>
                  <Badge
                    variant={
                      step === 'confirmed'
                        ? 'kinetic'
                        : step === 'review'
                        ? 'streak'
                        : 'kinetic'
                    }
                  >
                    {step === 'confirmed'
                      ? 'Logged to Today'
                      : step === 'review'
                      ? 'Review Estimates'
                      : 'V1 Vision'}
                  </Badge>
                </h3>
                <span className="text-xs text-slate-400">
                  {step === 'review'
                    ? 'Verify portions, macros, and ingredients before logging'
                    : step === 'confirmed'
                    ? 'Permanent meal record saved and today\'s nutrition totals updated'
                    : 'Instant nutrition intake estimation powered by AI Vision'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="text-slate-400 hover:text-slate-100 p-1.5 rounded-lg hover:bg-obsidian-input transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Hidden File Inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="hidden"
            onChange={handleFileChange}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Modal Body Container */}
          <div className="p-6 overflow-y-auto max-h-[calc(92vh-160px)] flex flex-col gap-5">
            {/* Error Banner */}
            {errorMessage && step !== 'error' && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs animate-fadeIn">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
                <div className="flex-1">
                  <span className="font-semibold block text-rose-200">Validation Notice</span>
                  <span>{errorMessage}</span>
                </div>
              </div>
            )}

            {/* STEP 1: SELECT / TAKE PHOTO */}
            {step === 'select' && (
              <div className="flex flex-col gap-5">
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 ${
                    isDragOver
                      ? 'border-kinetic bg-kinetic/10 scale-[0.99]'
                      : 'border-obsidian-border hover:border-kinetic/50 bg-obsidian-input/40 hover:bg-obsidian-input/80'
                  }`}
                >
                  <div className="h-16 w-16 rounded-2xl bg-kinetic/10 border border-kinetic/25 flex items-center justify-center text-kinetic mb-3 shadow-glow-kinetic">
                    <UploadCloud className="h-8 w-8 animate-pulse" />
                  </div>
                  <h4 className="text-base font-bold text-slate-100 mb-1">
                    Drop your meal photo here, or click to browse
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm mb-4">
                    Supports high-resolution JPEG, PNG, WebP, and HEIC files up to 10 MB.
                  </p>

                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      className="gap-2"
                    >
                      <FileImage className="h-4 w-4" />
                      <span>Browse Files</span>
                    </Button>

                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        cameraInputRef.current?.click();
                      }}
                      className="gap-2"
                    >
                      <Camera className="h-4 w-4 text-kinetic" />
                      <span>Take Photo</span>
                    </Button>
                  </div>
                </div>

                {/* Photo Shooting Tips */}
                <div className="p-4 rounded-xl bg-obsidian-elevated/40 border border-obsidian-border flex flex-col gap-2">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-kinetic" />
                    <span>Best Results for AI Accuracy</span>
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-[11px] text-slate-400">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-kinetic shrink-0 mt-0.5" />
                      <span>Bright lighting without harsh shadows</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-kinetic shrink-0 mt-0.5" />
                      <span>Top-down angle showing full plate</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-kinetic shrink-0 mt-0.5" />
                      <span>One dish or bowl clearly framed</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: PREVIEW & CONFIGURATION */}
            {step === 'preview' && previewUrl && fileDetails && (
              <div className="flex flex-col gap-4 animate-fadeIn">
                <div className="relative rounded-2xl overflow-hidden border border-obsidian-border bg-black/40 group max-h-[300px] flex items-center justify-center">
                  <img
                    src={previewUrl}
                    alt="Food preview"
                    className="w-full h-auto max-h-[300px] object-contain rounded-2xl"
                  />

                  <div className="absolute top-3 right-3 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="gap-1.5 bg-obsidian-bg/80 backdrop-blur-md text-xs py-1 px-2.5"
                    >
                      <RefreshCw className="h-3.5 w-3.5 text-kinetic" />
                      <span>Replace</span>
                    </Button>
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="p-1.5 rounded-lg bg-obsidian-bg/80 backdrop-blur-md text-slate-300 hover:text-rose-400 hover:bg-rose-500/20 border border-obsidian-border transition-all"
                      title="Remove image"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="absolute bottom-3 left-3 right-3 p-2.5 rounded-xl bg-obsidian-bg/85 backdrop-blur-md border border-obsidian-border/80 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <FileImage className="h-4 w-4 text-kinetic shrink-0" />
                      <span className="font-semibold text-slate-200 truncate">
                        {fileDetails.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="neutral">{fileDetails.sizeFormatted}</Badge>
                      <Badge variant="kinetic">Validated</Badge>
                    </div>
                  </div>
                </div>

                {/* Meal Slot Selection */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-300">Meal Time</label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['breakfast', 'lunch', 'dinner', 'snack'] as MealSlot[]).map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setSelectedMealSlot(slot)}
                        className={`py-2 px-3 rounded-xl text-xs font-semibold capitalize border transition-all ${
                          selectedMealSlot === slot
                            ? 'bg-kinetic/15 border-kinetic text-kinetic shadow-glow-kinetic'
                            : 'bg-obsidian-input border-obsidian-border text-slate-400 hover:text-slate-200 hover:border-slate-600'
                        }`}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Optional User Context Note */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Additional Context / Hints <span className="text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Extra olive oil, whole wheat sourdough, avocado bowl"
                    value={mealNotes}
                    onChange={(e) => setMealNotes(e.target.value)}
                    className="w-full bg-obsidian-input border border-obsidian-border rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-kinetic focus:ring-1 focus:ring-kinetic"
                  />
                </div>

                <div className="p-3 rounded-xl bg-obsidian-elevated/40 border border-obsidian-border flex items-center gap-2.5 text-xs text-slate-400">
                  <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>
                    Direct upload to isolated object storage. Image bytes verified against magic signatures.
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-obsidian-border">
                  <Button type="button" variant="ghost" size="sm" onClick={handleRemoveImage}>
                    Cancel
                  </Button>

                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={handleSubmitUpload}
                    className="gap-2 px-5 shadow-glow-kinetic"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>Analyze Food & Calories</span>
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 3 & 4: UPLOADING & ANALYZING SCANNER */}
            {(step === 'uploading' || step === 'analyzing') && previewUrl && (
              <div className="flex flex-col items-center justify-center py-6 gap-6 text-center animate-fadeIn">
                <div className="relative w-48 h-48 rounded-2xl overflow-hidden border-2 border-kinetic/50 shadow-glow-kinetic">
                  <img
                    src={previewUrl}
                    alt="Scanning food"
                    className="w-full h-full object-cover filter brightness-75"
                  />
                  <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-kinetic to-transparent shadow-[0_0_15px_#10b981] animate-bounce" />
                  <div className="absolute inset-0 bg-kinetic/10 animate-pulse pointer-events-none" />
                </div>

                <div className="flex flex-col items-center gap-2 max-w-sm">
                  <h4 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-kinetic animate-spin" />
                    <span>
                      {step === 'uploading'
                        ? 'Uploading Image to Secure Storage...'
                        : 'Analyzing Ingredients & Portions with AI Vision...'}
                    </span>
                  </h4>
                  <p className="text-xs text-slate-400">
                    {step === 'uploading'
                      ? 'Streaming image bytes to secure cloud storage and verifying file integrity.'
                      : 'Detecting distinct food items, portion weights, and estimating caloric distribution.'}
                  </p>
                </div>

                <div className="w-full max-w-md flex flex-col gap-2">
                  <div className="w-full bg-obsidian-input h-2 rounded-full overflow-hidden border border-obsidian-border">
                    <div
                      className="h-full bg-kinetic transition-all duration-300 shadow-glow-kinetic"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{step === 'uploading' ? 'Storage ingestion' : 'AI Neural inference'}</span>
                    <span className="font-semibold text-kinetic tabular-nums">{uploadProgress}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 5: NUTRITION REVIEW & MANUAL CORRECTION INTERFACE */}
            {step === 'review' && reviewData && (
              <NutritionReviewEditor
                uploadId={reviewData.uploadId}
                initialDishName={reviewData.dishName}
                initialMealSlot={reviewData.mealSlot || selectedMealSlot}
                initialItems={reviewData.items}
                originalAiTotals={reviewData.originalAiTotals}
                uncertaintyNotes={reviewData.uncertaintyNotes}
                imageUrl={previewUrl || undefined}
                onCancel={handleClose}
                onRetryAnalysis={handleRetryAnalysis}
                onSuccess={(response) => {
                  setConfirmedMealResult(response);
                  setStep('confirmed');
                  if (onUploadSuccess) {
                    onUploadSuccess(response as any);
                  }
                }}
              />
            )}

            {/* STEP 6: MEAL CONFIRMED & TODAY'S NUTRITION UPDATED */}
            {step === 'confirmed' && confirmedMealResult && (
              <div className="flex flex-col items-center justify-center py-6 gap-5 text-center animate-fadeIn">
                <div className="h-16 w-16 rounded-2xl bg-kinetic/15 border border-kinetic/30 flex items-center justify-center text-kinetic shadow-glow-kinetic">
                  <CheckCircle2 className="h-8 w-8" />
                </div>

                <div className="flex flex-col gap-1.5 max-w-md">
                  <h4 className="text-lg font-extrabold text-slate-100">
                    Meal Confirmed & Logged!
                  </h4>
                  <p className="text-xs text-slate-400">
                    Your meal has been permanently saved to today's food log and your nutrition totals are updated.
                  </p>
                </div>

                {/* Confirmed Meal Summary Card */}
                <div className="w-full max-w-md p-4 rounded-2xl bg-obsidian-elevated/60 border border-obsidian-border flex flex-col gap-3 text-left">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-100 text-sm">
                      {confirmedMealResult.meal.dishName}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="neutral" className="capitalize text-[10px]">
                        {confirmedMealResult.meal.mealSlot}
                      </Badge>
                      <Badge
                        variant={confirmedMealResult.meal.hasUserEdits ? 'streak' : 'kinetic'}
                        className="text-[10px]"
                      >
                        {confirmedMealResult.meal.hasUserEdits ? 'User Corrected' : 'AI Confirmed'}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 pt-2 border-t border-obsidian-border/70 text-center">
                    <div className="p-2 rounded-xl bg-obsidian-input flex flex-col">
                      <span className="text-[10px] text-kinetic font-semibold uppercase">Calories</span>
                      <span className="text-sm font-extrabold text-slate-100 tabular-nums">
                        {confirmedMealResult.meal.totalCalories}
                      </span>
                      <span className="text-[9px] text-slate-500">kcal</span>
                    </div>
                    <div className="p-2 rounded-xl bg-obsidian-input flex flex-col">
                      <span className="text-[10px] text-rose-400 font-semibold uppercase">Protein</span>
                      <span className="text-sm font-extrabold text-slate-100 tabular-nums">
                        {confirmedMealResult.meal.totalProteinG}g
                      </span>
                    </div>
                    <div className="p-2 rounded-xl bg-obsidian-input flex flex-col">
                      <span className="text-[10px] text-amber-400 font-semibold uppercase">Carbs</span>
                      <span className="text-sm font-extrabold text-slate-100 tabular-nums">
                        {confirmedMealResult.meal.totalCarbsG}g
                      </span>
                    </div>
                    <div className="p-2 rounded-xl bg-obsidian-input flex flex-col">
                      <span className="text-[10px] text-sky-400 font-semibold uppercase">Fat</span>
                      <span className="text-sm font-extrabold text-slate-100 tabular-nums">
                        {confirmedMealResult.meal.totalFatG}g
                      </span>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
                    <span>Items: {confirmedMealResult.meal.items.length} food item(s)</span>
                    <span className="text-kinetic font-semibold">Saved to Today</span>
                  </div>
                </div>

                {/* Live Updated Today's Nutrition Progress */}
                <div className="w-full max-w-md p-4 rounded-2xl bg-obsidian-elevated/40 border border-kinetic/30 flex flex-col gap-2.5 text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Flame className="h-3.5 w-3.5 text-kinetic" />
                      <span>Today's Live Calorie Progress</span>
                    </span>
                    <span className="text-xs font-extrabold text-kinetic tabular-nums">
                      {confirmedMealResult.todaySummary.consumedCalories} / {confirmedMealResult.todaySummary.targetCalories} kcal
                    </span>
                  </div>

                  <div className="w-full bg-obsidian-input h-2.5 rounded-full overflow-hidden border border-obsidian-border">
                    <div
                      className={`h-full transition-all duration-500 ${
                        confirmedMealResult.todaySummary.isTargetMet
                          ? 'bg-amber-400'
                          : 'bg-kinetic shadow-glow-kinetic'
                      }`}
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            (confirmedMealResult.todaySummary.consumedCalories /
                              Math.max(1, confirmedMealResult.todaySummary.targetCalories)) *
                              100
                          )
                        )}%`,
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                    <span>
                      {confirmedMealResult.todaySummary.remainingCalories > 0
                        ? `${confirmedMealResult.todaySummary.remainingCalories} kcal remaining`
                        : 'Calorie target reached!'}
                    </span>
                    <span>
                      {confirmedMealResult.todaySummary.mealsLoggedCount} meal(s) logged today
                    </span>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="flex items-center gap-3 pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={resetFlow}
                  >
                    Log Another Meal
                  </Button>

                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={handleClose}
                    className="gap-2 shadow-glow-kinetic px-6 font-bold"
                  >
                    <span>View on Dashboard</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 6: ERROR STATE */}
            {step === 'error' && (
              <div className="flex flex-col items-center justify-center py-6 gap-5 text-center animate-fadeIn">
                <div className="h-14 w-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                  <AlertCircle className="h-8 w-8" />
                </div>

                <div className="flex flex-col gap-1.5 max-w-sm">
                  <h4 className="text-base font-bold text-slate-100">Analysis Failed</h4>
                  <p className="text-xs text-rose-300 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">
                    {errorMessage || 'Unable to analyze image. Please try again or take a clearer photo.'}
                  </p>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button type="button" variant="secondary" size="sm" onClick={handleRemoveImage}>
                    Choose Different Photo
                  </Button>

                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={handleRetryAnalysis}
                    className="gap-2 shadow-glow-kinetic"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Retry Analysis</span>
                  </Button>
                </div>
              </div>
            )}

            {/* Collapsible Developer Data Simulation Drawer */}
            {(onSeedDemo || onExceedTarget || onClearMeals) && (
              <div className="mt-2 pt-3 border-t border-obsidian-border/50 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setIsDevToolsOpen((prev) => !prev)}
                  className="flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 py-1"
                >
                  <span className="flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5" />
                    <span>Developer Testing & Simulation Actions</span>
                  </span>
                  <ChevronRight
                    className={`h-3.5 w-3.5 transition-transform ${isDevToolsOpen ? 'rotate-90' : ''}`}
                  />
                </button>

                {isDevToolsOpen && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 animate-fadeIn">
                    {onSeedDemo && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={isDevActionLoading}
                        onClick={async () => {
                          setIsDevActionLoading(true);
                          await onSeedDemo();
                          setIsDevActionLoading(false);
                          handleClose();
                        }}
                        className="text-[11px] justify-start"
                      >
                        Seed Demo Meals
                      </Button>
                    )}
                    {onExceedTarget && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={isDevActionLoading}
                        onClick={async () => {
                          setIsDevActionLoading(true);
                          await onExceedTarget();
                          setIsDevActionLoading(false);
                          handleClose();
                        }}
                        className="text-[11px] justify-start text-amber-400 hover:text-amber-300"
                      >
                        Exceed Target
                      </Button>
                    )}
                    {onClearMeals && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={isDevActionLoading}
                        onClick={async () => {
                          setIsDevActionLoading(true);
                          await onClearMeals();
                          setIsDevActionLoading(false);
                          handleClose();
                        }}
                        className="text-[11px] justify-start"
                      >
                        Clear Meals
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};
