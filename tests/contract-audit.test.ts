/**
 * The dialect contract audit, run over this package's dialect and over dialects
 * that break it on purpose. The audit is what a dialect package runs before
 * publishing, so these cases are also the documentation of what it refuses.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { auditDialect, type DatabaseDialect } from 'dsh-ds-db/dialect-api'
import { MYSQL_DIALECT } from '../src/index.ts'

/** The dialect this package ships passes the contract audit. */
test('the MySQL dialect passes the contract audit', () => {
  assert.deepEqual(auditDialect(MYSQL_DIALECT), [])
})

/** A declared ability with no implementation behind it is a problem. */
test('an ability with no implementation is reported', () => {
  // The ability is declared while the method that would answer it is gone.
  const { sample: _withoutSample, ...mysql } = MYSQL_DIALECT
  const broken: DatabaseDialect = { ...mysql, capabilities: new Set(['sample']) }
  assert.match(auditDialect(broken).join('\n'), /declares "sample" but implements no sample\(\)/)
})

/** Rules that admit a write are the one failure that cannot be tolerated. */
test('rules that admit a write are reported', () => {
  const permissive: DatabaseDialect = {
    ...MYSQL_DIALECT,
    rules: {
      ...MYSQL_DIALECT.rules,
      forbidden: [],
      lead: /^.*$/i,
    },
  }
  const problems = auditDialect(permissive)
  assert.ok(problems.some(problem => problem.includes('DROP TABLE users')), 'a write is named')
})

/** A row bound the dialect forgot to apply leaves the model unbounded. */
test('a missing row bound is reported', () => {
  const unbounded: DatabaseDialect = { ...MYSQL_DIALECT, applyRowLimit: sql => sql }
  assert.ok(auditDialect(unbounded).some(problem => problem.includes('applyRowLimit')))
})

/** An identifier that can leave its own statement is an injection waiting. */
test('an unquoted identifier is reported', () => {
  const unquoted: DatabaseDialect = { ...MYSQL_DIALECT, quoteIdentifier: name => name }
  assert.ok(auditDialect(unquoted).some(problem => problem.includes('quoteIdentifier')))
})

/** A field default that disagrees with its own kind is reported. */
test('a config field whose default disagrees with its kind is reported', () => {
  const mistyped: DatabaseDialect = {
    ...MYSQL_DIALECT,
    configFields: [{ key: 'serviceName', kind: 'number', default: 'ORCL', required: true }],
  }
  assert.ok(auditDialect(mistyped).some(problem => problem.includes('numeric')))
})
