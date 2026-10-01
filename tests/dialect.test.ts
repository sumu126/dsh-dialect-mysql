/**
 * Behaviour of the MySQL dialect: the syntax it bounds and quotes with, the
 * statements it runs with its own placeholder style, and the row shape it
 * promises the tools above it.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MYSQL_DIALECT } from '../src/index.ts'
import { assertReadOnlyStatement, familiesPhrase } from 'dsh-ds-db/dialect-api'

test('publishes the facts the model-facing text is written from', () => {
  assert.equal(MYSQL_DIALECT.name, 'mysql')
  assert.equal(MYSQL_DIALECT.label, 'MySQL')
  // The type describes itself and names its own port and account: the plugin
  // carries neither, so a deployment that installs no dialect gets no guess.
  assert.equal(typeof MYSQL_DIALECT.description, 'string')
  assert.deepEqual(MYSQL_DIALECT.connectionDefaults, {
    host: '127.0.0.1', port: 3306, user: 'root', passwordEnv: 'DSH_MYSQL_PASSWORD',
  })
  assert.equal(MYSQL_DIALECT.rowBoundHint, 'LIMIT')
  assert.deepEqual(
    [...MYSQL_DIALECT.systemDatabases],
    ['information_schema', 'mysql', 'performance_schema', 'sys'],
  )
  // The tool texts are composed from these, so both spellings have to match:
  // the refusal says what is admitted, the description enumerates the same set.
  assert.equal(familiesPhrase(MYSQL_DIALECT.rules.families), 'SELECT, SHOW, DESCRIBE, EXPLAIN, TABLE, or VALUES')
  assert.equal(familiesPhrase(MYSQL_DIALECT.rules.families, 'and'), 'SELECT, SHOW, DESCRIBE, EXPLAIN, TABLE, and VALUES')
})

test('bounds a row-producing statement that carries no LIMIT of its own', () => {
  const bound = (sql: string, maxRows = 10): string => MYSQL_DIALECT.applyRowLimit(sql, maxRows)
  assert.equal(bound('SELECT * FROM users'), 'SELECT * FROM users\nLIMIT 11')
  assert.equal(bound('SELECT * FROM users LIMIT 3'), 'SELECT * FROM users LIMIT 3')
  assert.equal(bound('SELECT * FROM (SELECT 1 LIMIT 1) AS inner_table'), 'SELECT * FROM (SELECT 1 LIMIT 1) AS inner_table')
  assert.equal(bound('SHOW TABLES'), 'SHOW TABLES')
  assert.equal(bound('WITH t AS (SELECT 1) SELECT * FROM t', 5), 'WITH t AS (SELECT 1) SELECT * FROM t\nLIMIT 6')
})

test('quotes identifiers so a backtick cannot leave its own statement', () => {
  assert.equal(MYSQL_DIALECT.quoteIdentifier('users'), '`users`')
  assert.equal(MYSQL_DIALECT.quoteIdentifier('a`b'), '`a``b`')
  assert.equal(
    MYSQL_DIALECT.createStatement('a`b', 'users').statement.sql,
    'SHOW CREATE TABLE `a``b`.`users`',
  )
})

test('reports its own forbidden construct before the shared lock-taking pair', () => {
  // The order is what makes one statement's refusal message stable, so a
  // statement carrying both is reported against the earlier entry.
  assert.throws(
    () => assertReadOnlyStatement('SELECT * FROM t INTO OUTFILE "/tmp/x" FOR UPDATE', MYSQL_DIALECT.rules),
    /writes a server-side file/,
  )
  const order = MYSQL_DIALECT.rules.forbidden.map(entry => entry.reason)
  assert.deepEqual(order, ['writes a server-side file', 'takes row locks', 'takes row locks', 'rewrites index statistics'])
})

test('writes its metadata statements in its own placeholder style', () => {
  const tables = MYSQL_DIALECT.tables('app')
  assert.equal(tables.statement.sql.includes('TABLE_SCHEMA = ?'), true)
  assert.deepEqual([...tables.statement.values], ['app'])

  const columns = MYSQL_DIALECT.columns('app', 'users')
  assert.equal(columns.statement.sql.includes('TABLE_SCHEMA = ? AND TABLE_NAME = ?'), true)
  assert.deepEqual([...columns.statement.values], ['app', 'users'])

  assert.equal(MYSQL_DIALECT.databases().statement.sql.includes('information_schema.SCHEMATA'), true)
  assert.equal(MYSQL_DIALECT.version().statement.sql, 'SELECT VERSION() AS version')
})

test('projects its own rows onto the shape the tools report', () => {
  const databases = MYSQL_DIALECT.databases().project({
    name: 'app', charset: 'utf8mb4', collation: 'utf8mb4_0900_ai_ci',
  })
  assert.deepEqual(databases, { name: 'app', charset: 'utf8mb4', collation: 'utf8mb4_0900_ai_ci' })

  const table = MYSQL_DIALECT.tables('app').project({
    name: 'users', type: 'BASE TABLE', engine: 'InnoDB', estimatedRows: '42', comment: null,
  })
  assert.deepEqual(table, { name: 'users', type: 'BASE TABLE', engine: 'InnoDB', estimatedRows: 42, comment: '' })

  // MySQL spells nullability as `IS_NULLABLE = 'YES'` and a default as a rendered string.
  const column = MYSQL_DIALECT.columns('app', 'users').project({
    name: 'id', type: 'bigint', nullable: 'NO', defaultValue: null, columnKey: 'PRI', extra: 'auto_increment', comment: null,
  })
  assert.deepEqual(column, {
    name: 'id', type: 'bigint', nullable: false, default: null, key: 'PRI', extra: 'auto_increment', comment: '',
  })
  assert.equal(MYSQL_DIALECT.columns('app', 'users').project({ nullable: 'YES' }).nullable, true)

  // ...and uniqueness as the inverted number `NON_UNIQUE = 0`.
  const unique = MYSQL_DIALECT.indexes('app', 'users').project({
    name: 'PRIMARY', nonUnique: 0, type: 'BTREE', columnName: 'id',
  })
  assert.deepEqual(unique, { name: 'PRIMARY', unique: true, type: 'BTREE', columnName: 'id' })
  assert.equal(MYSQL_DIALECT.indexes('app', 'users').project({ nonUnique: 1 }).unique, false)
})

test('reads the definition out of the second SHOW CREATE TABLE column', () => {
  const query = MYSQL_DIALECT.createStatement('app', 'users')
  assert.equal(query.project({ Table: 'users', 'Create Table': 'CREATE TABLE `users` (...)' }), 'CREATE TABLE `users` (...)')
  // A server that answered no row, or a row with no columns, carries no statement.
  assert.equal(query.project({}), '')
})
