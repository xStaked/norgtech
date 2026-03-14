import ts from 'typescript'

const files = [
  'app/(portal)/portal/_lib/server-portal.ts',
  'components/portal/farm-overview.tsx',
  'lib/api/portal-farms.ts',
]

const compilerOptions = {
  noEmit: true,
  allowJs: false,
  skipLibCheck: true,
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.Preserve,
  baseUrl: '.',
  paths: {
    '@/*': ['./*'],
  },
}

const host = ts.createCompilerHost(compilerOptions)
const program = ts.createProgram(files, compilerOptions, host)
const diagnostics = ts.getPreEmitDiagnostics(program)

if (diagnostics.length > 0) {
  diagnostics.forEach((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
    const fileName = diagnostic.file?.fileName
    const position =
      diagnostic.file && diagnostic.start !== undefined
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
        : null

    if (fileName && position) {
      console.error(
        `${fileName}:${position.line + 1}:${position.character + 1} ${message}`,
      )
      return
    }

    console.error(message)
  })

  process.exit(1)
}

console.log('Portal contract lint passed.')
