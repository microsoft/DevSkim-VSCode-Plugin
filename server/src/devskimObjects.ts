/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ 
 * 
 * This file contains the object and enumeration definitions for DevSkim Rules (the logic to 
 * find an issue), Problems (a specific part of the code in which a rule triggered on), and 
 * fixes for problems (instructions to VS Code on how to transform problematic code into safe code)
 * 
 *  ------------------------------------------------------------------------------------------ */

import { Diagnostic, DiagnosticSeverity,Command, Range 
} from 'vscode-languageserver';

import {DevSkimWorker} from "./devskimWorker";

// The settings interface describe the server relevant settings part
export interface Settings {
	devskim: DevSkimSettings;
}

// These are the example settings we defined in the client's package.json
// file
export interface DevSkimSettings {
	enableInformationalSeverityRules: boolean;
	enableDefenseInDepthSeverityRules: boolean;
	enableLowSeverityRules: boolean;
	suppressionDurationInDays: number;
}

/**
 * An Interface corresponding to the Pattern section of the JSON
 * rules files.  The pattern is used to match a problem within the source
 * 
 * @export
 * @interface Pattern
 */
export interface Pattern {
    pattern: string;
    type: string;
	modifiers?:string[];
    subtype?: string[];
    _comment ? : string;
}


/**
 * An Interface corresponding to the FixIt section of the JSON
 * rules files.  The FixIt contains the instructions to translate a flagged piece
 * of code into a prefered alternitive
 * 
 * @export
 * @interface FixIt
 */
export interface FixIt {
    type?: string;
    name: string;
    search: string;
    replace: string;
	_comment ? : string;
}


/**
 * An Interface corresponding to an individual rule within the JSON
 * rules files.  The rule definition includes how to find the problem (the patterns),
 * description of the problem, text on how to fix it, and optionally an automated fix ( Fix_it)
 * 
 * @export
 * @interface Rule
 */
export interface Rule {
    id: string;
	overrides?: string[];
    name: string;
    active: boolean;
    tags: string[];
    applies_to?: string[];
    severity: string;
    description: string;
    replacement: string;
    rule_info: string;
    patterns: Pattern[];
    fix_it?: FixIt[];
	filepath? : string; //filepath to the rules file the rule came from
	_comment ? : string;
}


/**
 * A Key/Object collection, used to associate a particular fix with a diagnostic and the file it is located in
 * 
 * @export
 * @interface Map
 * @template V
 */
export interface Map<V> {
	[key: string]: V;
}


/**
 * An object to represent a fix at a particular line of code, including which revision of a file it applies to
 * 
 * @export
 * @interface AutoFix
 */
export interface AutoFix {
	label: string;
	documentVersion: number;
	ruleId: string;
	edit: DevSkimAutoFixEdit;
}

/**
 * the specific technical details of a fix to apply 
 * 
 * @export
 * @interface DevSkimAutoFixEdit
 */
export interface DevSkimAutoFixEdit {
	range: Range;
    fixName?: string;
	text: string;
}


/**
 * The nomenclature for DevSkim severities is based on the MSRC bug bar.  There are  
 * many different severity ranking systems and nomenclatures in use, and no clear "best"
 * so since this project was started by Microsoft employees the Microsoft nomenclature was
 * chosen
 * 
 * @export
 * @enum {number}
 */
export enum DevskimRuleSeverity
{
	Critical,
	Important,
	Moderate,
	Low,
	DefenseInDepth,
	Informational
}

/**
 * A class to represent a finding at a particular line of code
 * 
 * @export
 * @class DevSkimProblem
 */
export class DevSkimProblem {
	public range: Range;
	public source: string;
	public severity: DevskimRuleSeverity;
	public ruleId: string; //the id in the rules JSON files
	public message: string;
	public issueURL : string;
	public replacement: string;
	public fixes: DevSkimAutoFixEdit[];

	public overrides : string[]; //a collection of ruleIDs that this rule supercedes

    /**
     * Creates an instance of DevSkimProblem.
     * 
     * @param {string} message guidance to display for the problem (description in the rules JSON)
     * @param {string} source the name of the rule that was triggered (name in the rules JSON)
     * @param {string} ruleId a unique identifier for that particular rule (id in the rules JSON)
     * @param {string} severity MSRC based severity for the rule - Critical, Important, Moderate, Low, Informational (severity in rules JSON)
     * @param {string} issueURL a URL to some place the dev can get more information on the problem (rules_info in the rules JSON)
     * @param {Range} range where the problem was found in the file (line start, column start, line end, column end) 
     */
    constructor ( message: string, source: string, ruleId: string, severity: DevskimRuleSeverity, replacement: string, issueURL: string, range: Range) 
    {
		this.fixes    = [];
		this.overrides = [];

        this.message     = (message     !== undefined && message.length     > 0) ? message     : "";
        this.source      = (source      !== undefined && source.length      > 0) ? source      : "";
        this.ruleId      = (ruleId      !== undefined && ruleId.length      > 0) ? ruleId      : "";
		this.issueURL    = (issueURL    !== undefined && issueURL.length    > 0) ? issueURL    : "";
		this.replacement = (replacement !== undefined && replacement.length > 0) ? replacement : "";
   		this.range    = (range    !== undefined ) ? range    : Range.create(0,0,0,0);
		this.severity = severity;     
        
	}

	/**
	 * Shorten the severity name for output
	 * 
	 * @param {DevskimRuleSeverity} severity
	 * @returns {string} short name of the severity rating
	 * 
	 * @memberOf DevSkimProblem
	 */
	public getShortSeverityName(severity : DevskimRuleSeverity) : string
	{
		switch (severity)
		{
			case DevskimRuleSeverity.Critical: return "[Crit]";
			case DevskimRuleSeverity.Important: return "[Imp]";
			case DevskimRuleSeverity.Moderate: return "[Mod]";
			case DevskimRuleSeverity.Low: return "[Low]";
			case DevskimRuleSeverity.DefenseInDepth: return "[DiD]";
			default: return "[Info]";
		}
	}
    
    /**
     * Converts the MSRC based rating (Critical, Important, Moderate, Low, Informational) into a VS Code Warning level
     * Critical/Important get translated as Errors, and everything else as a Warning
     * 
     * @returns {DiagnosticSeverity}
     */
    public getWarningLevel() : DiagnosticSeverity
    {
		//mark any optional rule, or rule that is simply imformational as a warning (i.e. green squiggle)
		if(this.severity == DevskimRuleSeverity.Informational)
		{
			return DiagnosticSeverity.Information;
		}
		else if (this.severity == DevskimRuleSeverity.Low || this.severity == DevskimRuleSeverity.DefenseInDepth)
		{
			return DiagnosticSeverity.Warning;
		}
		else
		{
			return DiagnosticSeverity.Error;
		}
    }

    /**
     * Make a VS Code Diagnostic object from the information in this DevSkim problem
     * 
     * @returns {Diagnostic}
     */
    public makeDiagnostic(): Diagnostic 
	{
		var diagnostic : Diagnostic = Object.create(null);
		//truncate the severity so that the message looks a bit more succinct in the output window
		let fullMessage : string = "\nSeverity: " + this.getShortSeverityName(this.severity) + "\n\n" + this.message;

		fullMessage = (this.replacement.length > 0 ) ? 
			fullMessage + "\n\nFix Guidance: " + this.replacement : 
			fullMessage;

		fullMessage = (this.issueURL.length > 0 ) ? 
			fullMessage + "\n\nMore Information: " + this.issueURL : 
			fullMessage;

		diagnostic.message = fullMessage;
		diagnostic.code = this.ruleId;
		diagnostic.source = "Devskim:" + this.source;
		diagnostic.range = this.range;
		diagnostic.severity = this.getWarningLevel();
	
        return diagnostic;
    }    
}

/**
 * this creates a unique key for a diagnostic & code fix combo (i.e. two different code fixes for the same diagnostic get different keys)
 * used to correlate a code fix with the line of code it is supposed to fix, and the problem it should fix
 * 
 * @export
 * @param {Range} range the location of an issue within a document
 * @param {number} diagnosticCode the code value in a Diagnostic, or similar numeric ID
 * @returns {string} a unique key identifying a diagnostics+fix combination
 */
export function computeKey(range: Range, diagnosticCode: string | number): string {
	return `[${range.start.line},${range.start.character},${range.end.line},${range.end.character}]-${diagnosticCode}`;
}


/**
 * Class of Code Fixes corresponding to a line of code
 * 
 * @export
 * @class Fixes
 */
export class Fixes {
	private keys: string[];

	constructor (private edits: Map<AutoFix>) {
		this.keys = Object.keys(edits);
	}

	public static overlaps(lastEdit: AutoFix, newEdit: AutoFix): boolean {
		return !!lastEdit && lastEdit.edit.range[1] > newEdit.edit.range[0];
	}

	public isEmpty(): boolean {
		return this.keys.length === 0;
	}

	public getDocumentVersion(): number {
		return this.edits[this.keys[0]].documentVersion;
	}

	public getScoped(diagnostics: Diagnostic[]): AutoFix[] {
		let result: AutoFix[] = [];
		for(let diagnostic of diagnostics) {
			let key = computeKey(diagnostic.range, diagnostic.code);
			let x : number = 0;
			let editInfo : AutoFix;
			while( editInfo = this.edits[key+x.toString(10)])
			{
				result.push(editInfo);
				x++;
			}
		}
		return result;
	}

	public getAllSorted(): AutoFix[] {
		let result = this.keys.map(key => this.edits[key]);
		return result.sort((a, b) => {
			let d = a.edit.range[0] - b.edit.range[0];
			if (d !== 0) {
				return d;
			}
			if (a.edit.range[1] === 0) {
				return -1;
			}
			if (b.edit.range[1] === 0) {
				return 1;
			}
			return a.edit.range[1] - b.edit.range[1];
		});
	}

	public getOverlapFree(): AutoFix[] {
		let sorted = this.getAllSorted();
		if (sorted.length <= 1) {
			return sorted;
		}
		let result: AutoFix[] = [];
		let last: AutoFix = sorted[0];
		result.push(last);
		for (let i = 1; i < sorted.length; i++) {
			let current = sorted[i];
			if (!Fixes.overlaps(last, current)) {
				result.push(current);
				last = current;
			}
		}
		return result;
	}
}






