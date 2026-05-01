import * as chrono from "chrono-node";

const esConfiguration = chrono.es.casual.clone();
esConfiguration.refiners.push({
  refine: (_context: chrono.ParsingContext, results: chrono.ParsingResult[]) => {
    results.forEach((result) => {
      if (result.start.isCertain("month") && !result.start.isCertain("hour")) {
        result.start.assign("hour", 15);
      }
    });
    return results;
  },
});

export function parseRelativeDate(text: string, referenceDate?: Date): Date | null {
  const result = esConfiguration.parseDate(text, referenceDate ?? new Date(), { forwardDate: true });
  return result ?? null;
}

export function formatIsoDate(date: Date): string {
  return date.toISOString();
}