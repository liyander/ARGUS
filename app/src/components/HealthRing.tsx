import { motion, useReducedMotion } from 'framer-motion';
import type { HealthScore } from '../core/model';
import { CountUp } from './ui';

export function scoreColor(score: number) {
  if (score >= 90) return 'var(--ok)';
  if (score >= 75) return 'var(--lime)';
  if (score >= 60) return 'var(--warn)';
  return 'var(--danger)';
}

/** Lighthouse-style animated score ring with grade letter. */
export function HealthRing({ health, size = 168, stroke = 10 }: { health: HealthScore; size?: number; stroke?: number }) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = scoreColor(health.score);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - health.score / 100) }}
          transition={{ duration: reduce ? 0 : 1.4, ease: [0.16, 1, 0.3, 1] }}
          style={{ filter: `drop-shadow(0 0 10px ${color})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-semibold tabular-nums leading-none" style={{ fontSize: size * 0.3, color }}>
          <CountUp value={health.score} duration={1.4} />
        </div>
        {size >= 80 && (
          <div className="mono mt-1 text-xs text-muted" style={{ fontSize: Math.max(10, size * 0.075) }}>
            grade <span className="font-semibold text-text">{health.grade}</span>
          </div>
        )}
      </div>
    </div>
  );
}
