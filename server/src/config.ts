export function getDevskimRulesDirectory(): string | null {
  const { DEVSKIM_RULES_DIRECTORY } = process.env;
  return typeof DEVSKIM_RULES_DIRECTORY !== 'undefined' ? DEVSKIM_RULES_DIRECTORY : null;
}

