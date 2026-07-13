type SafeJsonOptions<T> = {
  fallback: T;
  label: string;
};

export function safeJsonParse<T>(raw: string | null | undefined, options: SafeJsonOptions<T>): T {
  if (typeof raw !== "string" || raw.trim() === "") {
    return options.fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error(`[safeJsonParse] ${options.label}`, {
      message: error instanceof Error ? error.message : String(error),
      rawLength: raw.length,
      preview: raw.slice(0, 120)
    });
    return options.fallback;
  }
}

export function hasJsonContent(raw: string | null | undefined) {
  return typeof raw === "string" && raw.trim() !== "";
}
