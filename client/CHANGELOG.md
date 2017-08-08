# Changelog

## Version 0.1.5
* Added ability to apply rules to specific files (e.g. package.json or project.json, instead of all .json files)
* New manual review rules for deserialization in different languages (e.g. pickle.load in Python, or ReadObject in Java).  Manual review rules are not enabled by default and must be turned on via settings.  These are *potentially* severe security issues, but as DevSkim does not have strong data flow capabilities these rules will also flag safe uses
* Updated to support the new rules schema (documentation at https://github.com/Microsoft/DevSkim/wiki).  This includes:
    * Ability to scope rules to specific parts of a source file (e.g. just executable source, just code comments, just HTML blocks, or a combinations of those)


## Version 0.1.4
* Fixed analysis exception that would trigger on certain workspace changes

## Version 0.1.3
* Added setting devskim.ignoreFilesList to exclude specific files and directories from analysis.  The defaults are to ignore "out/\*","bin/\*", "node_modules/\*", ".vscode/\*","yarn.lock", "logs/\*", "\*.log" however the defaults can be overridden in the usersettings.  If there are other files that you think should be in the defaults please either open an issue on our github repo or edit [package.json](https://github.com/Microsoft/DevSkim-VSCode-Plugin/blob/master/client/package.json) and submit a PR  
* Added setting devskim.ignoreRulesList to allow the user to disable the processing of certain rules.  If a rule is being disabled because it is incorrectly flagging problems, please also open an issue on our Github repo so we can try and tune the rule better.  If you ran into problems other people are likely also hitting issues
* new rule to detect plaintext HTTP usage and prompt for HTTPS

## Version 0.1.2
* No longer reports findings that are commented out in source code
* A couple new rules for banned C API, SQL, PHP
* Improved multi-line findings detection/suppressions
* Reduced the number of "Severities" - "Low", "Informational", and "Defense in Depth" are now all "Best Practice"
* "Best Practice" is not enabled by default, but can be turned on with in the DevSkim settings.  

## Version 0.1.1
* Fixed bugs relating to scenarios where multiple security issues reside on a single line
* Added manual code review rules for eval usage in dynamic languages.  These will only be enabled if the manual review rules are turned on in the settings
* Improved rule detection for scenarios where a space occurs between a banned API and ()  (e.g. gets (str) instead of gets(str))
* Some spelling fixes