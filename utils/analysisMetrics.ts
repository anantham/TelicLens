/**
 * Analysis Metrics Tracker
 * Learns from historical analysis times to improve time estimates
 */

interface AnalysisMetric {
  model: string;
  totalChars: number;
  actualTimeSeconds: number;
  timestamp: number;
}

const METRICS_KEY = 'teliclens_analysis_metrics';
const MAX_METRICS = 50; // Keep last 50 analyses per model

/**
 * Save an analysis metric to localStorage
 */
export const saveAnalysisMetric = (model: string, totalChars: number, actualTimeSeconds: number) => {
  try {
    const stored = localStorage.getItem(METRICS_KEY);
    const metrics: AnalysisMetric[] = stored ? JSON.parse(stored) : [];

    // Add new metric
    metrics.push({
      model,
      totalChars,
      actualTimeSeconds,
      timestamp: Date.now()
    });

    // Keep only recent metrics (last 50 total)
    const trimmed = metrics.slice(-MAX_METRICS);

    localStorage.setItem(METRICS_KEY, JSON.stringify(trimmed));

    console.log(`📊 Saved analysis metric: ${totalChars} chars in ${actualTimeSeconds.toFixed(1)}s (${model})`);
  } catch (error) {
    console.warn('Failed to save analysis metric:', error);
  }
};

/**
 * Get estimated time based on historical data for a specific model
 * Falls back to default estimates if no historical data exists
 */
export const getEstimatedTime = (model: string, totalChars: number): number => {
  try {
    const stored = localStorage.getItem(METRICS_KEY);
    if (!stored) {
      return getDefaultEstimate(model, totalChars);
    }

    const metrics: AnalysisMetric[] = JSON.parse(stored);

    // Filter metrics for this specific model
    const modelMetrics = metrics.filter(m => m.model === model);

    if (modelMetrics.length === 0) {
      console.log(`⏱️ No historical data for ${model}, using defaults`);
      return getDefaultEstimate(model, totalChars);
    }

    // Calculate average chars per second from historical data
    const totalTime = modelMetrics.reduce((sum, m) => sum + m.actualTimeSeconds, 0);
    const totalCharsProcessed = modelMetrics.reduce((sum, m) => sum + m.totalChars, 0);
    const avgCharsPerSecond = totalCharsProcessed / totalTime;

    // Add base overhead (API latency)
    const baseOverhead = 2;
    const estimated = Math.max(3, (totalChars / avgCharsPerSecond) + baseOverhead);

    console.log(`⏱️ Estimated from ${modelMetrics.length} historical runs: ${estimated.toFixed(1)}s (${avgCharsPerSecond.toFixed(0)} chars/sec)`);

    return estimated;
  } catch (error) {
    console.warn('Failed to calculate estimated time:', error);
    return getDefaultEstimate(model, totalChars);
  }
};

/**
 * Default estimation fallback (when no historical data exists)
 */
const getDefaultEstimate = (model: string, totalChars: number): number => {
  let charsPerSecond = 2500; // Default for Pro

  if (model.includes('flash-lite')) {
    charsPerSecond = 7500; // Ultra fast
  } else if (model.includes('flash')) {
    charsPerSecond = 5000; // Fast
  } else if (model.includes('pro')) {
    charsPerSecond = 2500; // Slower but smarter
  }

  const baseOverhead = 2;
  const estimated = Math.max(3, (totalChars / charsPerSecond) + baseOverhead);

  console.log(`⏱️ Using default estimate: ${estimated.toFixed(1)}s (${charsPerSecond} chars/sec default)`);

  return estimated;
};

/**
 * Get statistics about historical performance for debugging
 */
export const getMetricsStats = () => {
  try {
    const stored = localStorage.getItem(METRICS_KEY);
    if (!stored) return null;

    const metrics: AnalysisMetric[] = JSON.parse(stored);

    // Group by model
    const byModel = metrics.reduce((acc, m) => {
      if (!acc[m.model]) {
        acc[m.model] = [];
      }
      acc[m.model].push(m);
      return acc;
    }, {} as Record<string, AnalysisMetric[]>);

    // Calculate stats per model
    const stats = Object.entries(byModel).map(([model, modelMetrics]) => {
      const totalTime = modelMetrics.reduce((sum, m) => sum + m.actualTimeSeconds, 0);
      const totalChars = modelMetrics.reduce((sum, m) => sum + m.totalChars, 0);
      const avgCharsPerSecond = totalChars / totalTime;

      return {
        model,
        runs: modelMetrics.length,
        avgCharsPerSecond: avgCharsPerSecond.toFixed(0),
        totalCharsProcessed: totalChars
      };
    });

    return stats;
  } catch (error) {
    console.warn('Failed to get metrics stats:', error);
    return null;
  }
};

/**
 * Clear all historical metrics (for debugging/reset)
 */
export const clearMetrics = () => {
  localStorage.removeItem(METRICS_KEY);
  console.log('🗑️ Cleared all analysis metrics');
};
