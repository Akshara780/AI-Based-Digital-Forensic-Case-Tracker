import type { MlFeatures } from './mlFeatures';

export type MlRequestFeatures = MlFeatures;

export type RelevanceLabel = 'High' | 'Medium' | 'Low';

export interface MlPredictionResponse {
  predicted_label: RelevanceLabel;
  confidence: number;
  probabilities: {
    High: number;
    Medium: number;
    Low: number;
  };
  model_name: string;
  disclaimer: string;
}

export interface MlHealthResponse {
  status: string;
  model_loaded: boolean;
  model_name: string | null;
  'scikit-learn_version': string;
}

export interface MlSuccess<T> {
  ok: true;
  data: T;
}

export interface MlFailure {
  ok: false;
  reason: string;
}

export type MlResult<T> = MlSuccess<T> | MlFailure;

function getBaseUrl(): string {
  // Vite replaces this expression with the environment value at build time.
  const configuredUrl = import.meta.env.VITE_ML_API_URL;
  return typeof configuredUrl === 'string' ? configuredUrl.trim().replace(/\/+$/, '') : '';
}

function isProbability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isPredictionResponse(value: unknown): value is MlPredictionResponse {
  if (!value || typeof value !== 'object') return false;

  const response = value as Partial<MlPredictionResponse>;
  if (
    response.predicted_label !== 'High' &&
    response.predicted_label !== 'Medium' &&
    response.predicted_label !== 'Low'
  ) {
    return false;
  }

  if (!isProbability(response.confidence)) return false;

  const probabilities = response.probabilities;
  if (!probabilities || typeof probabilities !== 'object') return false;
  if (
    !isProbability(probabilities.High) ||
    !isProbability(probabilities.Medium) ||
    !isProbability(probabilities.Low)
  ) {
    return false;
  }

  return (
    typeof response.model_name === 'string' &&
    typeof response.disclaimer === 'string'
  );
}

function reasonForStatus(status: number): string {
  if (status === 422) return 'ML service rejected the input (422)';
  if (status === 503) return 'ML service is not ready (503)';
  if (status === 404) return 'ML service endpoint was not found (404)';
  if (status === 400) return 'ML service rejected the request (400)';
  return `ML service returned an HTTP error (${status})`;
}

/**
 * Ask the ML service for its status. Every error is converted to a safe result.
 */
export async function checkMlHealth(): Promise<MlResult<MlHealthResponse>> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return { ok: false, reason: 'ML service is not configured' };
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, reason: reasonForStatus(response.status) };
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return { ok: false, reason: 'ML service returned an invalid response' };
    }

    if (!data || typeof data !== 'object') {
      return { ok: false, reason: 'ML service returned an invalid response' };
    }

    return { ok: true, data: data as MlHealthResponse };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, reason: 'ML service took too long' };
    }
    return { ok: false, reason: 'ML service is not reachable' };
  } finally {
    window.clearTimeout(timeout);
  }
}

/**
 * Send one evidence feature object for relevance prediction.
 * Request text is sent only in the HTTP body and is never logged.
 */
export async function predictRelevance(
  features: MlRequestFeatures
): Promise<MlResult<MlPredictionResponse>> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return { ok: false, reason: 'ML service is not configured' };
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${baseUrl}/predict`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(features),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, reason: reasonForStatus(response.status) };
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return { ok: false, reason: 'ML service returned an invalid response' };
    }

    if (!isPredictionResponse(data)) {
      return { ok: false, reason: 'ML service returned an invalid prediction' };
    }

    return { ok: true, data };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, reason: 'ML service took too long' };
    }
    return { ok: false, reason: 'ML service is not reachable' };
  } finally {
    window.clearTimeout(timeout);
  }
}
