/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ 
 *
 * Class for executing lambdas from conditionals, as well as all of the support functions
 * and values that can be used within the lambda
 * 
 * since the lambda expects an arrow function, () => {}, all of the code within the arrow function
 * has access to "this", which means it can call any of the functions or access any of the properties
 * of this class
 * 
 * @export
 * @class LambdaEngine
 */

import { Range } from 'vscode-languageserver';
import { Condition } from "./devskimObjects";

export class DevskimLambdaEngine
{
    private lambdaCode : string;
    private condition : Condition;
    private documentContents : string;
    private findingRange : Range;
    private langID : string;

    constructor(currentCondition: Condition, currentDocumentContents: string, currentFindingRange: Range, currentLangID: string)
    {
        this.lambdaCode = currentCondition.lambda.lambda_code;
        this.condition = currentCondition;
        this.documentContents = currentDocumentContents;
        this.findingRange = currentFindingRange;
        this.langID = currentLangID;        
    }

    public ExecuteLambda() : boolean
    {
        let lambdaFunction = eval(this.lambdaCode);
        return lambdaFunction();
    }

}