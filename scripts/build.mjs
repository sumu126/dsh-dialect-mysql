/**
 * Build this dialect package into one ESM artifact, the shape a deployed `dsh`
 * imports it from.
 *
 * Self-contained on purpose. This package is also published as a repository of
 * its own, and `prepare` runs on the copy a package manager fetched from it —
 * where the parent plugin checkout does not exist. So this file imports nothing
 * from `../../../scripts`, reads only its own manifest, and names the plugin it
 * injects by its package name rather than by a relative path.
 *
 *   npm run build
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))

/** The plugin this dialect injects, and the built API it reads types and helpers from. */
const PLUGIN = 'dsh-ds-db'
const PLUGIN_DIALECT_API = `${PLUGIN}/dialect-api`

/**
 * Refuse a dialect that reaches into the plugin's TypeScript source.
 *
 * Resolution runs before `external` is applied, so this also catches a
 * specifier that would otherwise be inlined: bundling the plugin's read-only
 * guard into a dialect would ship a second implementation of a
 * security-relevant check.
 */
const refusePluginSourceImports = {
  name: 'refuse-plugin-source-imports',
  setup(build) {
    build.onResolve({ filter: /^dsh-ds-db\/src\// }, ({ importer, path }) => {
      throw new Error(
        `${importer} imports "${path}" — import "${PLUGIN_DIALECT_API}" instead: `
        + 'it is the built API, and a deployment that loads this dialect has no TypeScript loader',
      )
    })
  },
}

/**
 * Refuse an emitted artifact that still imports a `.ts` module.
 *
 * The built dialect runs under the deployed `dsh`, which loads built JavaScript
 * with no TypeScript loader: Node refuses to strip types under `node_modules`,
 * so such an import fails at boot with the dialect row not activating. Failing
 * the build here catches the specifiers resolution left alone, such as another
 * package's TypeScript source named through an external pattern.
 * @param file - the emitted artifact to check, absolute.
 * @throws {Error} when it imports a TypeScript module.
 */
function assertNoTypeScriptImports(file) {
  const source = readFileSync(file, 'utf8')
  const match = /(?:from|import\s*\()\s*["']([^"']+\.ts)["']/.exec(source)
  if (match === null) return
  throw new Error(
    `${file} imports TypeScript source "${match[1]}", which cannot load under the deployed dsh; `
    + `import "${PLUGIN_DIALECT_API}" (the built dialect API) instead`,
  )
}

const outfile = 'lib/index.js'

// A dialect's driver is its own dependency, so it is external here; the plugin
// is provided by the deployment that loads the dialect, as the built
// `dsh-ds-db/dialect-api` entry rather than its TypeScript source.
await build({
  absWorkingDir: dir,
  entryPoints: ['src/index.ts'],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  external: [
    PLUGIN,
    PLUGIN_DIALECT_API,
    '@deepseek-ai/*',
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}).filter(name => name !== PLUGIN),
  ],
  plugins: [refusePluginSourceImports],
  sourcemap: true,
  logLevel: 'info',
})

assertNoTypeScriptImports(join(dir, outfile))