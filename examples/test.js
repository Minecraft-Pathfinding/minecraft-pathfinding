const ts = require("typescript");

const program = ts.createProgram(['examples/test.js'], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.CommonJS,
    noEmit: true // Avoid emitting any output files
});

function processScript(data) {
    // Create the source file from the provided script data
    const sourceFile = ts.createSourceFile('', data, ts.ScriptTarget.ESNext, true);
    
    // Check for syntax errors
    console.log(sourceFile.parseDiagnostics);
    if (sourceFile.parseDiagnostics.length > 0) throw new Error('Syntax error(s) found');

    // Check for semantic errors
    // const semanticDiagnostics = program.getSemanticDiagnostics(sourceFile);
    // console.log(semanticDiagnostics);
    // if (semanticDiagnostics.length > 0) throw new Error('Semantic error(s) found');

    // Check for declaration errors
    const declarationDiagnostics = program.getDeclarationDiagnostics(sourceFile);
    console.log(declarationDiagnostics);
    if (declarationDiagnostics.length > 0) throw new Error('Declaration error(s) found');
}

processScript(`const a = 1`);
