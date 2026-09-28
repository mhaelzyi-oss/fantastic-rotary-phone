export async function recordDiagnostic(
  state,
  {
    category = 'scan',
    severity = 'info',
    code,
    title,
    userMessage,
    technicalDetail = null,
    sourceHost = null,
    jobId = null,
  },
) {
  const clean = (value) =>
    value == null
      ? null
      : String(value)
          .replace(/https?:\/\/[^\s]+/g, '[URL]')
          .slice(0, 500);
  state.diagnostics.push({
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    category,
    severity,
    code,
    title,
    userMessage,
    technicalDetail: clean(technicalDetail),
    sourceHost,
    jobId,
    resolved: false,
  });
  state.diagnostics = state.diagnostics.slice(-200);
  return state;
}
