import audioCheck from "../../public/examples/native-audio-check.json";

export type Workflow = {
  id: string;
  audience: string;
  title: string;
  description: string;
  illustration?: { src: string; alt: string };
  diagram: {
    task: string;
    worker: string;
    action: string;
    source: string;
    finding: string;
    checkLabel: string;
    check: string;
    next: string;
  };
  evidence: {
    summary: string;
    context: string;
    fields: { label: string; value: string }[];
    limitation: string;
    href?: string;
    linkLabel?: { before: string; emphasis: string; after: string };
  };
  materials: string;
  prompt: string;
};

export const audioResult = audioCheck.workerReport.resultSummary;

export const workflows: Workflow[] = [
  {
    id: "developers", audience: "Code",
    title: "The bug survived two fixes. Now what?",
    description: "Have another agent investigate the failing test and compare the attempted fixes in a separate session. Bring its findings back to your conversation.",
    illustration: { src: "/illustrations/developers.webp", alt: "A laptop beside two illustrated windows, with one code detail highlighted." },
    diagram: {
      task: "Checkout still fails",
      worker: "Claude Code",
      action: "reviews retry",
      source: "retry.ts + test + earlier fixes",
      finding: "Retry uses an expired session",
      checkLabel: "Compare with earlier fixes",
      check: "Both reused the same session",
      next: "Test a fresh session on retry",
    },
    evidence: {
      summary: "View example run record",
      context: "Illustrative bug investigation",
      fields: [
        { label: "Task", value: "Explain why checkout still fails after two retry fixes." },
        { label: "Agent", value: "Claude Code, called from the conversation in Codex." },
        { label: "Inputs", value: "retry.ts, the failing test, and both attempted fixes." },
        { label: "Finding", value: "The retry keeps using an expired session." },
        { label: "Comparison", value: "Both earlier fixes changed the retry timing but kept the same session." },
        { label: "Next test", value: "Retry with a fresh session and rerun the failing test." },
        { label: "Saved", value: "The returned findings and task ID, alongside the attempts in your conversation." },
      ],
      limitation: "This illustrates a workflow. The proposed fix still needs a passing test.",
    },
    materials: "failing test and attempted fixes",
    prompt: "Use Ennodia MCP to investigate this bug with another available agent. Provide the failing test and our attempted fixes. Have that agent compare its explanation with those fixes and the source code in its own session. Have it identify the next test that can confirm or reject the explanation. Keep the investigation read-only. Bring a concise result and task IDs back here, including failed attempts and remaining uncertainty. We can inspect the captured details when needed.",
  },
  {
    id: "audio", audience: "Media",
    title: "When your agent cannot listen",
    description: "Give the excerpt to a model with native audio access through Ennodia. In this recorded check, Gemini returned the spoken words.",
    diagram: {
      task: "Can Gemini hear this file?",
      worker: "Antigravity",
      action: "Gemini listens",
      source: "8-second MP3",
      finding: "Returns the spoken words",
      checkLabel: "Reports listening evidence",
      check: "File, range, spoken words",
      next: "Next: compare matched samples",
    },
    evidence: {
      summary: "View recorded run",
      context: `10 September 2026 · ${(audioCheck.run.elapsedMs / 1000).toFixed(1)} seconds`,
      fields: [
        { label: "Task", value: "Check native listening before comparing audio cleanups." },
        { label: "Agent", value: "Gemini 3.8 Flash Medium through Antigravity 1.2.0, selected by the caller." },
        { label: "Input", value: `${audioCheck.input.file} · 0:00–0:08` },
        { label: "Returned", value: audioResult },
        { label: "Evidence", value: "The worker reported using view_file on the whole excerpt and returned specific spoken words." },
        { label: "Saved", value: "Answer, timing, task IDs, and events. The record was read back from local history after the session ended." },
      ],
      limitation: "This records one listening check. Native tool use is worker-reported. The cleanup comparison remains unverified.",
      href: "/examples/native-audio-check.json",
      linkLabel: { before: "Download the ", emphasis: "real Ennodia run", after: " record" },
    },
    materials: "short audio excerpt",
    prompt: "Use Ennodia MCP to check native listening on this short audio excerpt. Read the selected harness's input guidance first. Use one available harness and model, with comparison disabled. Have it report the file, range, tool, a few spoken words, and an audible observation, or the exact input error. Keep the task read-only. Do not substitute transcription or numeric metrics for native listening. Bring back the findings and task ID. Confirm access before planning a comparison of the full samples.",
  },
  {
    id: "sales", audience: "Sales",
    title: "Catch the weak claim before the call",
    description: "Review the meeting brief against the account notes. Compare the claims with their sources and turn missing information into questions for the call.",
    illustration: { src: "/illustrations/sales.webp", alt: "A checked meeting brief, account notes, and a call headset." },
    diagram: {
      task: "Brief: budget approved",
      worker: "Claude Code",
      action: "checks brief",
      source: "brief + notes",
      finding: "Notes: budget proposal",
      checkLabel: "Compare the two claims",
      check: "Approval has no source",
      next: "Confirm budget on the call",
    },
    evidence: {
      summary: "View example run record",
      context: "Illustrative meeting-brief review",
      fields: [
        { label: "Task", value: "Check the meeting brief before the call." },
        { label: "Agent", value: "Claude Code, called from the conversation in Codex." },
        { label: "Inputs", value: "The meeting brief, account notes, and product facts." },
        { label: "Comparison", value: "The brief says the budget is approved. The notes only describe a proposal." },
        { label: "Decision", value: "Mark approval as unconfirmed and add a budget question to the call." },
        { label: "Saved", value: "The review, source references, and task ID for the next conversation about this account." },
      ],
      limitation: "This illustrates a workflow. A gap in the notes does not establish the customer's actual budget.",
    },
    materials: "meeting brief and account notes",
    prompt: "Use Ennodia MCP to review this meeting brief against the supplied account notes and product facts. Have another available agent compare the claims with their sources in its own session. Have it propose corrections and questions for the call. Keep it read-only and do not contact anyone. Bring a concise review and task IDs back here. We can inspect the captured details when needed.",
  },
];
