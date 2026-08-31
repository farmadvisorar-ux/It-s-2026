import type { ActivityDay } from "../lib/api";

/**
 * Stacked daily auth events. Hand-drawn SVG rather than a chart library:
 * two series, fourteen points, nothing a dependency would do better.
 */
export function ActivityChart({ data }: { data: ActivityDay[] }) {
  const W = 640;
  const H = 190;
  const padL = 34;
  const padR = 8;
  const padT = 12;
  const padB = 26;

  // Round the ceiling up to a 1/2/5-times-power-of-ten step so the gridline
  // labels land on whole, readable numbers instead of 7 / 15 / 22.
  const peak = Math.max(1, ...data.map((d) => d.successes + d.failures));
  const rawStep = peak / 3;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  // Never below 1: event counts are whole numbers, so a 0.5 gridline is nonsense.
  const step = Math.max(
    1,
    (rawStep / mag <= 1 ? 1 : rawStep / mag <= 2 ? 2 : rawStep / mag <= 5 ? 5 : 10) * mag
  );
  const max = step * 3;

  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const slot = innerW / Math.max(1, data.length);
  const barW = Math.min(26, slot * 0.62);

  const y = (v: number) => padT + innerH - (v / max) * innerH;

  // Four gridlines including the baseline, at the rounded step.
  const ticks = Array.from({ length: 4 }, (_, i) => step * i);

  return (
    <>
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Authentication events per day over the last 14 days"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--line)"
              strokeWidth="1"
            />
            <text
              x={padL - 7}
              y={y(t) + 3.5}
              textAnchor="end"
              fontSize="10"
              fill="var(--muted)"
              fontFamily="var(--mono)"
            >
              {t}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const x = padL + i * slot + (slot - barW) / 2;
          const total = d.successes + d.failures;
          const hOk = (d.successes / max) * innerH;
          const hBad = (d.failures / max) * innerH;
          return (
            <g key={d.day}>
              <title>{`${d.day}: ${d.successes} succeeded, ${d.failures} failed`}</title>
              {d.failures > 0 && (
                <rect x={x} y={y(total)} width={barW} height={hBad} fill="var(--crit)" rx="1.5" />
              )}
              {d.successes > 0 && (
                <rect
                  x={x}
                  y={y(d.successes)}
                  width={barW}
                  height={hOk}
                  fill="var(--accent)"
                  rx="1.5"
                />
              )}
              {i % 2 === 0 && (
                <text
                  x={x + barW / 2}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--muted)"
                  fontFamily="var(--mono)"
                >
                  {d.day.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="chart-legend">
        <span>
          <i style={{ background: "var(--accent)" }} />
          Succeeded
        </span>
        <span>
          <i style={{ background: "var(--crit)" }} />
          Failed
        </span>
      </div>
    </>
  );
}
