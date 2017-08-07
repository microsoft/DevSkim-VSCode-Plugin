import {DevskimRuleSeverity,AutoFix, Rule,FixIt,Pattern} from "./devskimObjects";
import * as path from 'path';

/**
 * 
 */
export class RuleValidator
{
    private rulesDir: string;
    private errorDir: string;
    private fixedRules: { [fileName: string]: Rule[]; };
    private outputMessages: OutputMessages[];
    private fs = require('fs');
    private writeoutNewRules : boolean;

    /**
     * 
     * @param ruleDir 
     */
    constructor(rd: string, ed: string)
    {
        this.rulesDir = rd;
        this.errorDir = ed;        
        this.fixedRules  = {};  
        this.writeoutNewRules = false; 
    }

    /**
     * 
     * @param readRules 
     */
    public validateRules(readRules : Object[], outputValidation : boolean) : Rule[]
    {
        let rules : Rule [] = [];
        this.outputMessages = [];
        this.writeoutNewRules = false;

        for(let loadedRule of readRules)
        {
            try 
            {
                let newRule : Rule = this.makeRule(loadedRule, outputValidation);
                rules.push(newRule);
            }
            catch (err){}
        }

        //if told to outputValidation, write out fixed rules (if any) and the output log
        if(outputValidation)
        {
            if(this.outputMessages.length > 0)
            {
                let filePath : string =  path.join(this.errorDir,"..","rulesValidationLog.json");
                this.fs.writeFile(filePath, JSON.stringify(this.outputMessages, null, 4));
            }
            if(this.writeoutNewRules)
            {
                let newrulePath : string =  path.join(this.errorDir,"..","newrules");
                                
                for (var key in this.fixedRules) 
                {
                    let filePath : string = key.substr(key.indexOf("rules")+5);
                    var dirname = path.dirname(filePath);

                    var mkdirp = require('mkdirp');    
                    filePath = path.join(newrulePath,filePath);

                    try
                    {
                        mkdirp.sync(filePath);
                        this.fs.writeFile(filePath, JSON.stringify(this.fixedRules[key], null, 4), () => {});
                    }
                    catch(err){}
                }                       
            }          
        }
        return rules;
    }

 


    /**
     * 
     * @param loadedObject 
     */
    private makeRule(loadedRule, outputValidation:boolean) : Rule
    {
        let newRule : Rule = Object.create(null);

        newRule.name = this.validateName(loadedRule);
        newRule.id = this.validateID(loadedRule);
        newRule.description = this.validateDescription(loadedRule);
        newRule.recommendation = this.validateRecommendation(loadedRule);

        
        newRule.applies_to = loadedRule.applies_to;
        newRule.conditions = loadedRule.conditions;
        
        newRule.fix_it = loadedRule.fix_it;
        
        let overrides : string[] = this.validateOverrides(loadedRule);
        if(overrides.length > 0)
            newRule.overrides = overrides; 
        
        newRule.patterns = loadedRule.patterns;
        
        newRule.rule_info = loadedRule.rule_info;
        newRule.severity = loadedRule.severity;
        newRule.tags = loadedRule.tags;

        newRule._comment = (this.isSet(loadedRule._comment, "string")) ? loadedRule._comment : "";

        if(outputValidation)
        {
            if(!this.isSet(this.fixedRules[loadedRule.filepath],"array"))
            {
                this.fixedRules[loadedRule.filepath] = [];
            }
            this.fixedRules[loadedRule.filepath].push(newRule);
        }

        return newRule;
    }

    /**
     * check if name is present (it's required, an exception will be thrown if missing), and if
     * its longer than 64 chars record a warning
     */
    private validateName(loadedRule) : string
    {
        this.checkValue(loadedRule.name,loadedRule,"string","name value is missing from object",OutputAlert.Error);
        if(loadedRule.name.length > 128)
        {
            let outcome : OutputMessages = Object.create(null);
            outcome.alert = OutputAlert.Warning;
            outcome.message = "name is more than 128 characters, which is longer than desired";
            outcome.ruleid = loadedRule.id;
            outcome.file = loadedRule.filepath;

            this.outputMessages.push(outcome);               
        }     

        return loadedRule.name;
    }

    /**
     * check if name is present (it's required, an exception will be thrown if missing), and if
     * its longer than 64 chars record a warning
     */
    private validateRecommendation(loadedRule) : string
    {
        let valid : boolean = this.checkValue(loadedRule.recommendation,loadedRule,"string","recommendation value is missing from object",OutputAlert.Warning);
        if(valid)
        {
            if(loadedRule.recommendation.length > 512)
            {
                let outcome : OutputMessages = Object.create(null);
                outcome.alert = OutputAlert.Warning;
                outcome.message = "recommendation is more than 512 characters, which is longer than desired";
                outcome.ruleid = loadedRule.id;
                outcome.file = loadedRule.filepath;

                this.outputMessages.push(outcome);               
            }  
            return loadedRule.recommendation;           
        }

        //ok, it wasn't the new schema key, maybe it was the old one?
        valid = this.checkValue(loadedRule.replacement,loadedRule,"string","recommendation value is missing from object",OutputAlert.Warning);
        
        if(valid)
        {
            this.writeoutNewRules = true;
            if( loadedRule.replacement.length > 512)
            {
                let outcome : OutputMessages = Object.create(null);
                outcome.alert = OutputAlert.Warning;
                outcome.message = "recommendation is more than 512 characters, which is longer than desired";
                outcome.ruleid = loadedRule.id;
                outcome.file = loadedRule.filepath;

                this.outputMessages.push(outcome);               
            }  
        }   

        return (valid) ? loadedRule.replacement : "";
    }    

    /**
     * check if description is present (it's required, an exception will be thrown if missing), and if
     * its longer than 512 chars record a warning
     */
    private validateDescription(loadedRule) : string
    {
        this.checkValue(loadedRule.description,loadedRule,"string","description value is missing from object",OutputAlert.Error);
        if(loadedRule.description.length > 512)
        {
            let outcome : OutputMessages = Object.create(null);
            outcome.alert = OutputAlert.Warning;
            outcome.message = "description is more than 512 characters, which is longer than desired";
            outcome.ruleid = loadedRule.id;
            outcome.file = loadedRule.filepath;

            this.outputMessages.push(outcome);               
        }     

        return loadedRule.description;
    }    

    /**
     * check that id is present (its required, an exception will be thrown if missing), and in the form DS######
     */
    private validateID(loadedRule) : string
    {
        this.checkValue(loadedRule.id,loadedRule,"string","id is missing from rule",OutputAlert.Error);
        //if the ID isn't in the expected form, we can still function, but we should write out a warning     
        let idRegex : RegExp = /\b(DS\d\d\d\d\d\d)\b/;
        if(!idRegex.test(loadedRule.id))
        {
            let outcome : OutputMessages = Object.create(null);
            outcome.alert = OutputAlert.Warning;
            outcome.message = "id is not in the expected format of DS######";
            outcome.ruleid = loadedRule.id;
            outcome.file = loadedRule.filepath;

            this.outputMessages.push(outcome);            
        }
        return loadedRule.id;
    } 
    
    private validateOverrides(loadedRule) : string[]
    {
        let overrides : string[] = [];

        //check if the value is present.  It isn't required, so it is fine if absent
        //if absent, just return an empty array
        if(this.isSet(loadedRule.overrides,"array"))
        {
            if(this.verifyType(loadedRule.overrides, "array", loadedRule,OutputAlert.Warning,"overrides is not an array"))
            {
                if(loadedRule.overrides.length < 1)
                {
                    let outcome : OutputMessages = Object.create(null);
                    outcome.alert = OutputAlert.Info;
                    outcome.message = "overrides is an empty array and can be left out";
                    outcome.ruleid = loadedRule.id;
                    outcome.file = loadedRule.filepath;

                    this.outputMessages.push(outcome);                      
                }
                else
                {
                    for(let overridden of loadedRule.overrides)
                    {
                        if (this.checkValue(overridden,loadedRule,"string","a value of type other than string present in overrides",OutputAlert.Warning))
                        {
                            let idRegex : RegExp = /\b(DS\d\d\d\d\d\d)\b/;
                            if(!idRegex.test(overridden))
                            {
                                let outcome : OutputMessages = Object.create(null);
                                outcome.alert = OutputAlert.Warning;
                                outcome.message = "override is not in the expected format of DS######";
                                outcome.ruleid = loadedRule.id;
                                outcome.file = loadedRule.filepath;

                                this.outputMessages.push(outcome);            
                            }
                            overrides.push(overridden);
                        }
                    } 
                }
                
            }
        }

        return overrides;
    }

    /**
     * Check that a required value is present, and if a string, longer than 0 chars. 
     * If it isn't, record an error message (which eventually gets written to file),
     * and throw an exception
     * @param variable value we are testing
     * @param loadedRule the loaded rule object the value came from (used to write error message)
     * @param varType types to check for: string, array, boolean, or number 
     * @param errorMessage message to write out if object is missing
     * @param alertLevel warning level from OutputAlert.  If set to OutputAlert.Error and value doesn't match, throws exception
     */
    private checkValue(variable, loadedRule, varType : string, errorMessage : string, alertLevel : string)
    {
        if(!this.isSet(variable,varType) && errorMessage.length > 0)
        {
            let outcome : OutputMessages = Object.create(null);
            outcome.alert = alertLevel;
            outcome.message = errorMessage;
            //use the ID so we know which rule is broken, or another error message if ID is missing
            outcome.ruleid = this.isSet(loadedRule.id, "string") ? loadedRule.id : "ID NOT FOUND";
            //this is generated when the object is read in, so should reliably be present
            outcome.file = loadedRule.filepath;

            this.outputMessages.push(outcome);

            if(alertLevel == OutputAlert.Error)
                throw errorMessage;  
        }
        return this.verifyType(variable, varType, loadedRule,alertLevel,errorMessage);
    }

    /**
     * returns true if the variable has a value, false if it is undefined/null/zero length
     * @param variable value to check 
     * @param varType types to check for: string, array, boolean, or number 
     */
    private isSet(variable, varType : string) : boolean
    {
        if(variable == undefined || variable == null || ((varType == "string" || varType == "array") && variable.length < 1))
        {
            return false;
        }
        return true;
    }

    /**
     * 
     * @param variable value being tested
     * @param varType types to check for: string, array, boolean, or number 
     * @param loadedRule rule object we are checking value from, used to construct error message if check fails
     * @param alertLevel warning level from OutputAlert.  If set to OutputAlert.Error and value doesn't match, throws exception
     * @param warningMessage message to write in the error message, and exception (if alertLevel is "Error")
     */
    private verifyType(variable, varType : string, loadedRule, alertLevel: string, warningMessage: string) : boolean
    {
        let verifiedType : boolean = true;
        switch(varType)
        {
            case "string":
                if (!(typeof variable === 'string' || variable instanceof String))
                {
                    verifiedType = false;
                }
                break;
            case "number":
                if (typeof variable !== 'number')
                {
                    verifiedType = false;
                }
                break;
            case "boolean":
                if (typeof variable !== 'boolean')
                {
                    verifiedType = false;
                }
                break;  
            case "array":
                if (!(Array.isArray(variable) || variable instanceof Array))
                {
                    verifiedType = false;
                }
                break;       
        }

        if(!verifiedType && warningMessage.length > 0)
        {
                let outcome : OutputMessages = Object.create(null);
                outcome.alert = alertLevel;
                outcome.message = warningMessage;
                outcome.ruleid = loadedRule.id;
                outcome.file = loadedRule.filepath;

                this.outputMessages.push(outcome); 
                if(alertLevel == OutputAlert.Error)
                {
                    throw warningMessage
                }               
        }

        return verifiedType;
    }
}

export interface OutputMessages
{
    file : string;
    ruleid : string;
    alert : string;
    message : string;
}

/**
 * An enum would normally be better for this sort of thing BUT I want to 
 * ultimately write a string rather than in integer out in the JSON these
 * values are destined for
 */
export class OutputAlert
{
    public static Error : string = "Error";
    public static Warning : string = "Warning";
    public static Info : string = "Info";
    public static Success : string = "Success";
}