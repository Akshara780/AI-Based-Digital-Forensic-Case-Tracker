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
  High: 'Likely important',
  Medium: 'Possibly important',
  Low: 'Likely less important',
};

const PREDICTED_LABEL_DESCRIPTION: Record<MlPredictionResponse['predicted_label'], string> = {
  High: 'This item may be worth a close look. Check the original record before deciding what it means.',
  Medium: 'This item may be worth reviewing alongside other records.',
  Low: 'The estimate found few signs that this item matters to the case. That does not mean it is unimportant, so review it if you have a reason to.',
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
  const [predictionVersion, setPredictionVersion] = useState(0);
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
    setPredictionVersion((v) => v + 1);
  };

  if (!healthChecked || !serviceAvailable) return null;

  const badgeClass =
    prediction?.predicted_label === 'High'
      ? 'border-rose-800/70 bg-rose-950/70 text-rose-300'
      : prediction?.predicted_label === 'Medium'
        ? 'border-amber-800/70 bg-amber-950/70 text-amber-300'
        : 'border-emerald-800/70 bg-emerald-950/70 text-emerald-300';

  const hoursFromIncident = featureResult?.features.hours_from_incident;
  const roundedHours = Math.round(hoursFromIncident ?? 0);
  const timeSinceReportText =
    hoursFromIncident === 168
      ? '7 days or more'
      : roundedHours === 1
        ? 'about 1 hour'
        : roundedHours === 0
          ? 'less than 1 hour'
          : `about ${roundedHours} hours`;

  return (
    <section
      className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-4"
      aria-label="Automated relevance estimate"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-xs font-semibold text-slate-200">
          Automated relevance estimate (experimental)
        </h4>
        <button
          type="button"
          onClick={handleRunAnalysis}
          disabled={loading}
          className="rounded-lg border border-cyan-800 bg-cyan-950/60 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition hover:border-cyan-600 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Getting estimate...' : 'Get automated estimate'}
        </button>
      </div>

      {errorReason && (
        <div role="status" className="mt-3 space-y-2">
          <p className="text-xs text-slate-400">
            Automated estimate unavailable. The rest of this case page is not affected.
          </p>
          <details className="text-[11px] text-slate-500">
            <summary className="cursor-pointer text-slate-400">Technical details</summary>
            <p className="mt-1 text-[11px] text-slate-500">{errorReason}</p>
          </details>
        </div>
      )}

      {prediction && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeClass}`}>
              {PREDICTED_LABEL_TEXT[prediction.predicted_label]}
            </span>
            <span className="text-xs text-slate-300">
              How sure the system is: {Math.round(prediction.confidence * 100)}%
            </span>
          </div>

          <p className="text-xs leading-relaxed text-slate-300">
            {PREDICTED_LABEL_DESCRIPTION[prediction.predicted_label]}
          </p>
          <p className="text-xs leading-relaxed text-slate-300">
            {prediction.disclaimer}
          </p>
        </div>
      )}

      {featureResult && (
        <div className="mt-4 border-t border-slate-800 pt-3">
          <h5 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            What this estimate was based on
          </h5>
          <ul className="mt-2 space-y-1 text-xs text-slate-400">
            <li>Time between the case report date and this evidence: {timeSinceReportText}</li>
            <li>Time of day recorded: {String(featureResult.features.hour_of_day).padStart(2, '0')}:00 (24-hour clock)</li>
            <li>Other items in this case with the same IP address: {featureResult.features.shared_ip_count}</li>
            <li>Other items in this case from the same device: {featureResult.features.shared_device_count}</li>
            <li>Labels (tags) on this item: {featureResult.features.tag_count}</li>
            <li>File attached: {featureResult.features.has_file_attachment === 1 ? 'Yes' : 'No'}</li>
            <li>
              This log/IP record shares its IP address with another log/IP record: {featureResult.features.ip_is_suspicious === 1 ? 'Yes' : 'No'}
            </li>
          </ul>

          {featureResult.warnings.length > 0 && (
            <div className="mt-3">
              <h6 className="text-[11px] font-semibold text-slate-400">Notes about the data</h6>
              <ul className="mt-1 space-y-1 text-[11px] text-amber-300">
                {featureResult.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {prediction && (
        <details key={predictionVersion} className="mt-4 rounded-md border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-300">
          <summary className="cursor-pointer font-medium text-slate-200">How was this calculated?</summary>
          <p className="mt-2 leading-relaxed text-slate-400">
            A statistical model ({prediction.model_name}) turns the details listed above into an estimate of how important this item may be. It learned from a small set of made-up example records, not from real cases, and its accuracy on real cases is unknown. The estimate is a guide for choosing what to review first. It never replaces the investigator&apos;s own judgement.
          </p>
        </details>
      )}

      <p className="mt-4 text-[10px] text-slate-500">
        Early test version. It learned from made-up example data, not from real cases, so treat it as a guide only.
      </p>
    </section>
  );
};
