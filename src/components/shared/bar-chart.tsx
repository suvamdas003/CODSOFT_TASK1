"use client";

import { Bar, BarChart as ReBarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type BarDatum = { label: string; value: number | null; detail?: string };

/**
 * Single-series column chart: one validated hue (--chart-1), columns capped at 24px
 * with 4px rounded tops, hairline solid gridlines, a hover tooltip, and a data table
 * fallback so the values never depend on the graphic alone. Text uses text tokens.
 */
export function BarChart({
  data,
  valueLabel,
  unit = "",
  domainMax,
  height = 240,
  emptyMessage = "No data yet.",
}: {
  data: BarDatum[];
  valueLabel: string;
  unit?: string;
  domainMax?: number;
  height?: number;
  emptyMessage?: string;
}) {
  const hasData = data.some((d) => d.value !== null);
  const format = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)}${unit}`;

  return (
    <figure className="space-y-2">
      {hasData ? (
        <div style={{ height }} aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <ReBarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: "var(--chart-grid)" }}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                interval="preserveStartEnd"
                minTickGap={8}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                domain={[0, domainMax ?? "auto"]}
                tickFormatter={(v: number) => `${v}${unit}`}
                width={48}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.6 }}
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--foreground)",
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
                itemStyle={{ color: "var(--foreground)" }}
                formatter={(value) => [typeof value === "number" ? format(value) : "—", valueLabel]}
              />
              <Bar
                dataKey="value"
                fill="var(--chart-1)"
                radius={[4, 4, 0, 0]}
                maxBarSize={24}
                isAnimationActive={false}
              />
            </ReBarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p
          className="text-muted-foreground grid place-items-center rounded-lg border border-dashed text-sm"
          style={{ height }}
        >
          {emptyMessage}
        </p>
      )}
      <details className="text-sm">
        <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
          Show data table
        </summary>
        <table className="mt-2 w-full text-left text-xs">
          <thead>
            <tr className="text-muted-foreground border-b">
              <th className="py-1 font-medium">Label</th>
              <th className="py-1 text-right font-medium">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-b last:border-0">
                <td className="py-1">{d.label}</td>
                <td className="py-1 text-right tabular-nums">
                  {d.value === null ? "—" : format(d.value)}
                  {d.detail ? <span className="text-muted-foreground"> · {d.detail}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
