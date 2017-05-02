# Changelog

## Version 0.1.2
* No longer reports findings that are commented out in source code
* A couple new rules for banned C API, SQL, PHP
* Improved multi-line findings detection/suppressions
* Reduced the number of "Severities" - "Low", "Informational", and "Defense in Depth" are now all "Best Practice"
* "Best Practice" is not enabled by default, but can be turned on with a setting

## Version 0.1.1
* Fixed bugs relating to scenarios where multiple security issues reside on a single line
* Added manual code review rules for eval usage in dynamic languages.  These will only be enabled if the manual review rules are turned on in the settings
* Improved rule detection for scenarios where a space occurs between a banned API and ()  (e.g. gets (str) instead of gets(str))
* Some spelling fixes