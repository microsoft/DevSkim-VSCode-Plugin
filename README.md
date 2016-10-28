#README 

This is the VS Code plugin project for DevSkim.  It is implemented in two parts - a Client that handles the integration and interaction with VS Code, and an out of proc server that handles the analysis.  This allows for more process intensive analysis without interfering in the responsiveness of the IDE.  

A primer for VS Code Lanuage Servers can be found at <https://code.visualstudio.com/docs/extensions/example-language-server> and a primer on the protocol between the language server and client can be found at <https://github.com/Microsoft/language-server-protocol/blob/master/protocol.md>.

As with most VS Code extensions, this project is implemented in TypeScript running on Node.js.

# Running DevSkim in VS Code
For people simply interested in using DevSkim in VS Code, it can be installed and run from the VS Code Extension Marketplace.  In VS Code launch the VS Code Quick Open (Ctrl + P), paste the folloiwng command, and press enter:

    ext install vscode-devskim

This will install the DevSkim Plugin in 
- **Windows:** %USERPROFILE%\.vscode\extensions\vscode-devskim
- **Mac/Linux:** $HOME/.vscode/extensions/vscode-devskim

The rules directory within the install location contains the JSON based rules definitions used by DevSkim to find and fix problems.  DevSkim will by default run any rules located in the rules/default (the rules that ship with DevSkim) and rules/custom (location for organizations to add their own rules) folders.  Rules in the rules/optional folder are not run by default.  They are rules that either report issues with less confidence, or find issues that are less consistently problematic.  They can be enabled via the DevSkim Settings in VS Code.  Similarly, the VS Code Settings allow the user to configure VS Code to report Moderate and Low issues as warnings rather than errors as they are reported by default.



# Getting started with Development

Install the TypeScript compiler if you have not already done so.  Then clone this repo and:

    > cd client
    > npm install
    > code .

    > cd ../server
    > npm install
    > code .

This will install all of the dependencies and launch a VS Code instance for each component.  Once up and running hit "ctrl+shift+b" (command+shift+b on the Mac) in the server project to build the server.  The build script automatically copies the compiled server components into ../client/server, as the client needs a copy of server in order to function.  Switch to the client VS Code instance, build it as well, and launch it (F5).  This will run the DevSkim plugin in a new instance of VS Code set up to debug extensions

The README.md in both the client and server folders have more details on their specific component files.

## Contributing
The README.md for the root DevSkim repo has the general details for contributing to the DevSkim project.  This section is specific for the VS Code Plugin.  As a TypeScript/Nodejs based project, use of NPM modules is par for the course.  Since this project is distributed by Microsoft in the VS Code Marketplace and Microsoft has a policy requiring review of licenses of all third party components it distributes, every NPM Module added to VS Code needs to be reviewed internally by Microsoft before distribution in the Marketplace.  This will delay contributions that add a new NPM Module from appearing in the official distribution of this plugin, however a couple of things can speed up the process.  NPM with no dependencies or a small dependency tree are quicker to review (the whole dependency tree needs license review), and MIT (or similar licenses) require much less review than more restrictive licenses, or custom licenses.   
