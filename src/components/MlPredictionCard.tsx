import React, { useEffect, useState } from 'react';
import { checkMlHealth, predictRelevance } from '../ml/mlClient';
import { buildMlFeatures } from '../ml/mlFeatures';
import type { Case } from '../types/case';
import type { Evidence } from '../types/evidence';
import type { MlPredictionResponse } from '../ml/mlClient';

interface MlPredictionCardProps {
  evidence: Evidence;
  caseData: Case;
  allEvidence: Evidence[];
}

const PREDICTED_LABEL_TEXT: Record<MlPredictionResponse['predicted_label'], string> = {
  High: 'High Relevance',
  Medium: 'Medium Relevance',
  Low: 'Low Relevance',
};

const PREDICTED_LABEL_DESCRIPTION: Record<MlPredictionResponse['predicted_label'], string> = {
  High: 'This evidence may be useful for further investigation. Please review the original record before making a decision.',
  Medium: 'This evidence may be relevant. Review it alongside other records.',
  Low: 'The model sees limited signs of relevance. This does not mean the evidence is unimportant.',
};

/**
 * Shows the optional ML result for one evidence item.
 * The card stays invisible when ML is not configured or the service is unavailable.
 */
export const MlPredictionCard: React.FC<MlPredictionCardProps> = ({
  evidence,
  caseData,
  allEvidence,
}) => {
  const [healthChecked, setHealthChecked] = useState(false);
  const [serviceAvailable, setServiceAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<MlPredictionResponse | null>(null);
  const [featureResult, setFeatureResult] = useState<ReturnType<typeof buildMlFeatures> | null>(null);

  // A different evidence item gets a fresh card state, so old results are not reused.
  useEffect(() => {
    let isMounted = true;
    setHealthChecked(false);
    setServiceAvailable(false);
    setLoading(false);
    setErrorReason(null);
    setPrediction(null);
    setFeatureResult(null);

    const checkHealth = async () => {
      const result = await checkMlHealth();
      if (!isMounted) return;
      setHealthChecked(true);
      setServiceAvailable(
        result.ok && result.data.model_loaded === true
      );
    };

    void checkHealth();
    return () => {
      isMounted = false;
    };
  }, [evidence.id]);

  const handleRunAnalysis = async () => {
    setLoading(true);
    setErrorReason(null);
    setPrediction(null);

    // Build the plain 12-field request locally; no evidence content is logged.
    const nextFeatureResult = buildMlFeatures(evidence, caseData, allEvidence);
    setFeatureResult(nextFeatureResult);

    const result = await predictRelevance(nextFeatureResult.features);
    setLoading(false);

    if (!result.ok) {
      setErrorReason(result.reason);
      return;
    }

    setPrediction(result.data);
  };

  if (!healthChecked || !serviceAvailable) return null;

  const badgeClass =
    prediction?.predicted_label === 'High'
      ? 'border-rose-800/70 bg-rose-950/70 text-rose-300'
      : prediction?.predicted_label === 'Medium'
        ? 'border-amber-800/70 bg-amber-950/70 text-amber-300'
        : 'border-emerald-800/70 bg-emerald-950/70 text-emerald-300';

  return (
    <section
      className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-4"
      aria-label="ML prediction"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-xs font-semibold text-slate-200">
          ML Prediction (experimental)
        </h4>
        <button
          type="button"
          onClick={handleRunAnalysis}
          disabled={loading}
          className="rounded-lg border border-cyan-800 bg-cyan-950/60 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition hover:border-cyan-600 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Running ML analysis...' : 'Run ML analysis'}
        </button>
      </div>

      {errorReason && (
        <p role="status" className="mt-3 text-xs text-slate-400">
          ML analysis unavailable: {errorReason}
        </p>
      )}

      {prediction && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeClass}`}>
              {PREDICTED_LABEL_TEXT[prediction.predicted_label]}
            </span>
            <span className="text-xs text-slate-300">
              Model confidence: {Math.round(prediction.confidence * 100)}%
            </span>
          </div>

          <p className="text-xs leading-relaxed text-slate-400">
            Model confidence is the model's own estimate. It is not proof of wrongdoing.
          </p>
          <p className="text-xs leading-relaxed text-slate-300">
            {PREDICTED_LABEL_DESCRIPTION[prediction.predicted_label]}
          </p>
          <p className="text-[11px] leading-relaxed text-slate-500">
            {prediction.disclaimer}
          </p>
        </div>
      )}

      {featureResult && (
        <div className="mt-4 border-t border-slate-800 pt-3">
          <h5 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Signals sent to the model
          </h5>
          <ul className="mt-2 space-y-1 text-xs text-slate-400">
            <li>Hours from the report date: {Math.round(featureResult.features.hours_from_incident * 10) / 10}</li>
            <li>Hour of day: {featureResult.features.hour_of_day}</li>
            <li>Shared IP count: {featureResult.features.shared_ip_count}</li>
            <li>Shared device count: {featureResult.features.shared_device_count}</li>
            <li>Tag count: {featureResult.features.tag_count}</li>
            <li>File attached: {featureResult.features.has_file_attachment === 1 ? 'Yes' : 'No'}</li>
            <li>
              Suspicious-IP rule matched: {featureResult.features.ip_is_suspicious === 1 ? 'Yes' : 'No'}
            </li>
          </ul>

          {featureResult.warnings.length > 0 && (
            <ul className="mt-2 space-y-1 text-[11px] text-amber-300">
              {featureResult.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="mt-4 text-[10px] text-slate-500">
        Prototype model trained on synthetic data.
      </p>
    </section>
  );
};
