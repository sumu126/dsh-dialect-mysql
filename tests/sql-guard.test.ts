/**
 * Behaviour of the read-only statement guard, driven by the MySQL dialect's
 * rules: what the guard admits, what it refuses, and how a dialect's lexical
 * rules decide what the guard even sees.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MYSQL_DIALECT } from '../src/index.ts'
import { assertReadOnlyStatement, scanStatement, type SqlLexical } from 'dsh-ds-db/dialect-api'

/** The rules the MySQL dialect judges by. */
const RULES = MYSQL_DIALECT.rules

/** Judge one statement the way a MySQL deployment does; returns the executable text. */
function guard(sql: string): string {
  return assertReadOnlyStatement(sql, RULES)
}

/** Mask one statement the way a MySQL deployment does. */
function scan(sql: string): { statement: string, code: string } {
  return scanStatement(sql, RULES.lexical)
}

/**
 * PostgreSQL's lexemes, as a second dialect would declare them: no backtick
 * quoting, no `#` comment, and no backslash escape inside a literal.
 */
const PG_LEXICAL: SqlLexical = {
  quotes: [{ quote: '\'', backslashEscapes: false }, { quote: '"', backslashEscapes: false }],
  lineComments: [{ marker: '--', requiresWhitespace: false }],
}

test('admits every row-reading statement family', () => {
  for (const sql of [
    'SELECT 1',
    'select * from users',
    'SHOW TABLES',
    'SHOW CREATE TABLE `app`.`users`',
    'DESCRIBE users',
    'DESC users',
    'EXPLAIN SELECT 1',
    'WITH recent AS (SELECT 1) SELECT * FROM recent',
    'TABLE users',
    'VALUES ROW(1, 2)',
  ]) {
    assert.equal(guard(sql).length > 0, true, sql)
  }
})

test('removes one trailing terminator, whatever comments follow it', () => {
  assert.equal(guard('SELECT 1;'), 'SELECT 1')
  // The trailing comment is part of the terminator the caller typed, so the
  // executed text carries neither.
  assert.equal(guard('SELECT 1; -- done'), 'SELECT 1')
  assert.equal(guard('  SELECT 1  '), 'SELECT 1')
})

test('judges the masked statement, not its literals', () => {
  // The semicolon and the keyword are inside a literal, so neither decides.
  assert.equal(guard("SELECT 'a;b' AS value"), "SELECT 'a;b' AS value")
  assert.equal(guard("SELECT 'into outfile' AS value"), "SELECT 'into outfile' AS value")
})

test('refuses a second statement', () => {
  assert.throws(() => guard('SELECT 1; DROP TABLE users'), /exactly one statement/)
})

test('refuses statements outside the read-only families', () => {
  for (const sql of [
    'INSERT INTO users VALUES (1)',
    'UPDATE users SET name = "x"',
    'DELETE FROM users',
    'DROP TABLE users',
    'SET SESSION TRANSACTION READ ONLY',
    'CALL do_something()',
    'LOAD DATA INFILE "/tmp/x" INTO TABLE users',
  ]) {
    assert.throws(() => guard(sql), /read-only/, sql)
  }
})

test('refuses read-only syntax that still writes or locks', () => {
  for (const sql of [
    'SELECT * FROM users INTO OUTFILE "/tmp/users"',
    'SELECT * FROM users FOR UPDATE',
    'SELECT * FROM users LOCK IN SHARE MODE',
    'SELECT * FROM users PROCEDURE ANALYSE()',
    'SELECT * FROM users FOR/**/UPDATE',
    'SELECT * FROM users -- note\nFOR UPDATE',
  ]) {
    assert.throws(() => guard(sql), /refuses/, sql)
  }
})

test('refuses an empty or comment-only statement', () => {
  assert.throws(() => guard('   '), /non-empty/)
  assert.throws(() => guard('-- nothing here'), /non-empty/)
  assert.throws(() => guard('/* nothing */'), /non-empty/)
})

test('masks literals and comments in the scanned copy', () => {
  assert.equal(scan("SELECT 'a;b', \"c\", `d` FROM t").code, "SELECT '', \"\", `` FROM t")
  // Comment text never reaches the scanned copy, so a keyword inside a comment
  // cannot decide whether a statement is refused.
  assert.equal(scan('SELECT 1 # trailing\n+ 2').code.includes('trailing'), false)
  assert.equal(scan('SELECT/* inline */1').code.includes('inline'), false)
  assert.equal(scan('SELECT 1 -- note\nFOR UPDATE').code.includes('note'), false)
})

test('a dialect that gives `#` no comment meaning still sees the code after it', () => {
  const sql = 'SELECT 1 # 2 FOR UPDATE'
  // MySQL reads `# 2 FOR UPDATE` as a comment; PostgreSQL's `#` is an operator.
  assert.equal(scanStatement(sql, RULES.lexical).code.includes('FOR UPDATE'), false)
  assert.equal(scanStatement(sql, PG_LEXICAL).code.includes('FOR UPDATE'), true)
})

test('a dialect decides whether a backslash escapes inside a literal', () => {
  const sql = 'SELECT \'a\\\'b\' FROM t'
  // MySQL keeps the quote inside the literal, so the literal masks as a whole.
  assert.equal(scanStatement(sql, RULES.lexical).code, "SELECT '' FROM t")
  // PostgreSQL, with standard-conforming strings, ends the literal at the quote.
  assert.equal(scanStatement(sql, PG_LEXICAL).code, "SELECT ''b'")
})

test('every dialect requires whitespace after `--` only when it says so', () => {
  // MySQL needs the whitespace, so this is arithmetic rather than a comment.
  assert.equal(scanStatement('SELECT 1--2', RULES.lexical).code, 'SELECT 1--2')
  assert.equal(scanStatement('SELECT 1--2', PG_LEXICAL).code, 'SELECT 1')
})
