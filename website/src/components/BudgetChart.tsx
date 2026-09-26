import { useId, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps, TooltipValueType } from "recharts";
import { estimateStages } from "../data/budget-model";

// Estimated input tokens for one run, from the same formula as the MCP
// budget tool. Every worker count is drawn at once, so growth is visible
// without clicking through states. Compare is the one setting to switch.

const PROMPT_CHARS = 4_000;
const STAGES = [
  { key: "workers", label: "Workers", color: "var(--stage-1)" },
  { key: "judge", label: "Judge", color: "var(--stage-2)" },
  { key: "advisor", label: "Result Advisor", color: "var(--stage-3)" },
] as const;

// Ticks show only the count, which fits a phone. The title names the unit.
type Row = { name: string; label: string; workers: number; judge: number; advisor: number; total: number };

const format = (value: number) => value.toLocaleString("en-US");
const axisTick = { fill: "var(--subtle)", fontFamily: "var(--mono)", fontSize: 11 };

function rows(compare: boolean): Row[] {
  return [1, 2, 3, 4].map((workers) => {
    const stages = estimateStages({ promptChars: PROMPT_CHARS, workers, compare });
    return {
      name: String(workers),
      label: `${workers} ${workers === 1 ? "worker" : "workers"}`,
      workers: stages.workers,
      judge: stages.judge,
      advisor: stages.advisor,
      total: stages.total,
    };
  });
}

// Values lead and labels follow: the reader already knows the series.
function ChartTooltip({ active, payload }: TooltipContentProps<TooltipValueType, string | number>) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as Row;
  return (
    <div className="chart-tooltip">
      <p className="label">{row.label}</p>
      {STAGES.filter((stage) => row[stage.key] > 0).map((stage) => (
        <p key={stage.key}>
          <span className="chart-key" style={{ background: stage.color }} aria-hidden="true" />
          <b>{format(row[stage.key])}</b> {stage.label}
        </p>
      ))}
      <p className="chart-tooltip-total"><b>{format(row.total)}</b> total</p>
    </div>
  );
}

export default function BudgetChart() {
  const [compare, setCompare] = useState(true);
  const data = useMemo(() => rows(compare), [compare]);
  const titleId = useId();
  const three = data[2]!;
  const share = Math.round(((three.judge + three.advisor) / three.total) * 100);
  const visible = STAGES.filter((stage) => compare || stage.key === "workers");
  const top = visible[visible.length - 1]!.key;

  return (
    <figure className="budget" aria-labelledby={titleId}>
      <div className="budget-head">
        <p className="figure-title" id={titleId}>Estimated input tokens by worker count</p>
        <div className="segmented" role="group" aria-label="Compare">
          <button type="button" aria-pressed={!compare} onClick={() => setCompare(false)}>No Compare</button>
          <button type="button" aria-pressed={compare} onClick={() => setCompare(true)}>Compare</button>
        </div>
      </div>
      <ul className="chart-legend" role="list">
        {visible.map((stage) => (
          <li key={stage.key}><span className="chart-key" style={{ background: stage.color }} aria-hidden="true" />{stage.label}</li>
        ))}
      </ul>
      <div className="budget-plot" aria-hidden="true">
        <ResponsiveContainer width="100%" height={248}>
          <BarChart data={data} margin={{ top: 22, right: 0, bottom: 0, left: 0 }} barCategoryGap="40%">
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--line)" }} tickMargin={10} />
            <YAxis
              domain={[0, 60_000]}
              ticks={[0, 20_000, 40_000, 60_000]}
              tickFormatter={(value: number) => (value === 0 ? "0" : `${value / 1000}k`)}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip content={ChartTooltip} cursor={{ fill: "var(--hover)" }} isAnimationActive={false} />
            {visible.map((stage) => (
              <Bar
                key={stage.key}
                dataKey={stage.key}
                stackId="run"
                fill={stage.color}
                stroke="var(--paper)"
                strokeWidth={2}
                barSize={24}
                radius={stage.key === top ? [4, 4, 0, 0] : 0}
                isAnimationActive={false}
              >
                {stage.key === top && (
                  <LabelList dataKey="total" position="top" offset={8} formatter={(value) => format(Number(value))} className="chart-total" />
                )}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* A table ignores width: 1px, so it sits inside a clipped box. */}
      <div className="sr-only">
      <table>
        <caption>Estimated input tokens by worker count{compare ? ", with Compare" : ", without Compare"}</caption>
        <thead>
          <tr><th scope="col">Workers</th>{visible.map((stage) => <th scope="col" key={stage.key}>{stage.label}</th>)}<th scope="col">Total</th></tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.name}><th scope="row">{row.label}</th>{visible.map((stage) => <td key={stage.key}>{format(row[stage.key])}</td>)}<td>{format(row.total)}</td></tr>
          ))}
        </tbody>
      </table>
      </div>
      <figcaption className="budget-caption">
        {compare
          ? `For a 4,000-character prompt. Compare reads every answer, each counted at its 24,000-character cap. With three workers, Compare makes up ${share}% of the estimate.`
          : "For a 4,000-character prompt. Without Compare, each worker gets your prompt and a short execution notice. You compare the answers yourself."}
        {" "}The estimate uses Ennodia’s own formula and is not a bill.
      </figcaption>
    </figure>
  );
}
