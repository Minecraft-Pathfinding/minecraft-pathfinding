import ts, { ScriptTarget, SourceFile, Program } from "typescript"

type ParseDiagnostics = ts.DiagnosticWithLocation & { code: number }

const program = ts.createProgram(['examples/test.ts'], { 

}

)
function processScript (data: string) {
    const sourceFile = ts.createSourceFile('', data, ScriptTarget.ESNext, true) as SourceFile & { parseDiagnostics: ParseDiagnostics[] }
    console.log(sourceFile.parseDiagnostics)
    if (sourceFile.parseDiagnostics.length > 0) throw new Error('Sytax error(s) found')
    const semanticDiagnostics = program.getSemanticDiagnostics(sourceFile)
    console.log(semanticDiagnostics)
    if (semanticDiagnostics.length > 0) throw new Error('Semantic error(s) found')
    const declarationDiagnostics = program.getDeclarationDiagnostics(sourceFile)
    console.log(declarationDiagnostics)
    if (declarationDiagnostics.length > 0) throw new Error('Declaration error(s) found')
}

processScript(`const a = 1`)