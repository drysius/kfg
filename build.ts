import { build, type Options } from 'tsup'
import { writeFile } from 'fs/promises'
import { generateDtsBundle } from 'dts-bundle-generator'
import { join } from 'path'
import { rm } from 'fs/promises'

// Limpa o diretório de distribuição anterior
await rm('dist', { recursive: true, force: true })

const config: Options = {
  platform: 'node',
  entry: ['src/index.ts'],
  bundle: true,
  skipNodeModulesBundle: true,
  clean: true,
  dts: false,
  format: ['cjs', 'esm'],
  outDir: 'dist',
  splitting: false,
  shims: true,
  tsconfig: './tsconfig.json'
}

await build(config)

const dtsPath = join(process.cwd(), 'dist/index.d.ts')
const dtsCode = generateDtsBundle([{
  filePath: join(process.cwd(), 'src/index.ts'),
  output: {
    sortNodes: true,
    exportReferencedTypes: true,
    inlineDeclareExternals: true,
    inlineDeclareGlobals: true
  }
}])

await writeFile(dtsPath, dtsCode[0], { encoding: 'utf-8' })
