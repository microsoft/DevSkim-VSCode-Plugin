import {DevSkimWorkerSettings} from "./devskimWorkerSettings";
import * as path from "path";

describe('DevSkimWorkerSettings', () => {

    describe('getRulesDirectoryFromEnvironment()', () => {
        it('process.env.DEV_SKIM_RULES_DIRECTORY is set will not be null', () => {
                process.env.DEV_SKIM_RULES_DIRECTORY = "C:/Users/v-dakit/DevSkimRules";
                const result = DevSkimWorkerSettings.getRulesDirectoryFromEnvironment();
                expect(result).toBe(process.env.DEV_SKIM_RULES_DIRECTORY);
        });

        it('process.env.DEV_SKIM_RULES_DIRECTORY is not set returns null', () => {
                process.env.DEV_SKIM_RULES_DIRECTORY = undefined;
                const result = DevSkimWorkerSettings.getRulesDirectoryFromEnvironment();
                expect(result).toBe(null);
        });

        it('process.env.DEV_SKIM_RULES_DIRECTORY is not defined returns null', () => {
                delete process.env.DEV_SKIM_RULES_DIRECTORY;
                const result = DevSkimWorkerSettings.getRulesDirectoryFromEnvironment();
                expect(result).toBe(null);
        });
    });

    describe('getRulesDirectory()', () => {
      it('will call getRulesDirectoryFromEnvironment and will return a path if defined', () => {
          process.env.DEV_SKIM_RULES_DIRECTORY = "C:/Users/v-dakit/DevSkimRules";
          const result = DevSkimWorkerSettings.getRulesDirectory();
          expect(result).toContain("DevSkimRules");
      });

      it('will call getRulesDirectoryFromEnvironment and will return the cwd/../rules if not defined', () => {
            delete process.env.DEV_SKIM_RULES_DIRECTORY;
            const altPath = path.join(__dirname, "..", "rules");
            const result = DevSkimWorkerSettings.getRulesDirectory();
            expect(path.basename(result)).toEqual("rules");
        });
    });

    describe('getRulesDirectory()', () => {
        it('will call getRulesDirectoryFromEnvironment and will return a path if defined', () => {
            process.env.DEV_SKIM_RULES_DIRECTORY = "C:/Users/v-dakit/DevSkimRules";
            const result = DevSkimWorkerSettings.getRulesDirectory();
            expect(result).toContain("DevSkimRules");
        });

        it('will call getRulesDirectoryFromEnvironment and will return the cwd/../rules if not defined', () => {
            delete process.env.DEV_SKIM_RULES_DIRECTORY;
            const altPath = path.join(__dirname, "..", "rules");
            const result = DevSkimWorkerSettings.getRulesDirectory();
            expect(path.basename(result)).toEqual("rules");
        });
    });
});