/**
 * Prove this package's dialect satisfies the plugin's contract, with no MySQL
 * server involved: the audit judges declarations and pure functions.
 *
 *   npm run verify
 */
import assert from 'node:assert/strict'
import { auditDialect } from 'dsh-ds-db/dialect-api'
import { MYSQL_DIALECT } from '../src/index.ts'

const problems = auditDialect(MYSQL_DIALECT)
for (const problem of problems) console.error(`  - ${problem}`)
assert.deepEqual(problems, [], 'the MySQL dialect passes the contract audit')
console.log('dialect audit: mysql passes')

// It declares every ability the tools can ask for, so nothing above it degrades.
assert.equal([...MYSQL_DIALECT.capabilities].includes('sample'), true)
assert.equal([...MYSQL_DIALECT.capabilities].includes('explain'), true)
assert.match(MYSQL_DIALECT.applyRowLimit('SELECT 1', 5), /LIMIT 6$/)
console.log(`capabilities: ${[...MYSQL_DIALECT.capabilities].join(', ')}`)

// The package registers through the plugin's registry, like any other dialect.
assert.equal(typeof MYSQL_DIALECT.open, 'function')
assert.equal(MYSQL_DIALECT.name, 'mysql')
console.log('mysql dialect check passed')
