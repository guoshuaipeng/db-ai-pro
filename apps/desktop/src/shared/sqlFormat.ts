/** Lightweight SQL pretty-printer — no external formatter dependency. */

const MAJOR =
  /^(SELECT|FROM|WHERE|GROUP|ORDER|HAVING|LIMIT|OFFSET|UNION|EXCEPT|INTERSECT|INSERT|UPDATE|DELETE|WITH|SET|VALUES|RETURNING|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|AND|OR|WHEN|ELSE|END|INTO|CREATE|ALTER|DROP|BEGIN|COMMIT|ROLLBACK)$/i

const NEWLINE_BEFORE = new Set(
  [
    'select',
    'from',
    'where',
    'group',
    'order',
    'having',
    'limit',
    'offset',
    'union',
    'except',
    'intersect',
    'insert',
    'update',
    'delete',
    'with',
    'set',
    'values',
    'returning',
    'join',
    'left',
    'right',
    'inner',
    'outer',
    'full',
    'cross',
    'on',
    'and',
    'or',
    'when',
    'else',
    'end',
    'into',
    'create',
    'alter',
    'drop',
    'begin',
    'commit',
    'rollback',
  ].map((s) => s),
)

type Tok =
  | { kind: 'word'; value: string }
  | { kind: 'space'; value: string }
  | { kind: 'punct'; value: string }
  | { kind: 'string'; value: string }
  | { kind: 'comment'; value: string }

function tokenize(input: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < input.length) {
    const ch = input[i]!
    const next = input[i + 1]

    if (ch === '-' && next === '-') {
      const end = input.indexOf('\n', i)
      const chunk = end === -1 ? input.slice(i) : input.slice(i, end)
      out.push({ kind: 'comment', value: chunk })
      i += chunk.length
      continue
    }
    if (ch === '/' && next === '*') {
      const end = input.indexOf('*/', i + 2)
      const chunk = end === -1 ? input.slice(i) : input.slice(i, end + 2)
      out.push({ kind: 'comment', value: chunk })
      i += chunk.length
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      let j = i + 1
      let buf = ch
      while (j < input.length) {
        const c = input[j]!
        buf += c
        if (c === quote) {
          if (input[j + 1] === quote) {
            buf += input[j + 1]!
            j += 2
            continue
          }
          j += 1
          break
        }
        j += 1
      }
      out.push({ kind: 'string', value: buf })
      i = j
      continue
    }
    if (/\s/.test(ch)) {
      let j = i + 1
      while (j < input.length && /\s/.test(input[j]!)) j += 1
      out.push({ kind: 'space', value: input.slice(i, j) })
      i = j
      continue
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1
      while (j < input.length && /[A-Za-z0-9_$]/.test(input[j]!)) j += 1
      out.push({ kind: 'word', value: input.slice(i, j) })
      i = j
      continue
    }
    out.push({ kind: 'punct', value: ch })
    i += 1
  }
  return out
}

function upperKeyword(word: string): string {
  return MAJOR.test(word) ? word.toUpperCase() : word
}

/**
 * Pretty-print SQL. Preserves string/comment contents.
 * Empty / whitespace-only input returns unchanged.
 */
export function formatSql(input: string, indentSize = 2): string {
  if (!input.trim()) return input

  const indentUnit = ' '.repeat(Math.max(1, indentSize))
  const tokens = tokenize(input)
  const parts: string[] = []
  let depth = 0
  let atLineStart = true
  let prevWasNewline = true

  const nl = () => {
    parts.push('\n' + indentUnit.repeat(depth))
    atLineStart = true
    prevWasNewline = true
  }

  const space = () => {
    if (!atLineStart && !prevWasNewline) {
      const last = parts[parts.length - 1]
      if (last && !last.endsWith(' ') && !last.endsWith('\n') && !last.endsWith('(')) {
        parts.push(' ')
      }
    }
    prevWasNewline = false
  }

  for (let ti = 0; ti < tokens.length; ti++) {
    const tok = tokens[ti]!

    if (tok.kind === 'space') {
      // collapse — formatting decides whitespace
      continue
    }

    if (tok.kind === 'comment') {
      if (!atLineStart) nl()
      parts.push(tok.value.trimEnd())
      nl()
      continue
    }

    if (tok.kind === 'string') {
      space()
      parts.push(tok.value)
      atLineStart = false
      prevWasNewline = false
      continue
    }

    if (tok.kind === 'punct') {
      if (tok.value === ',') {
        parts.push(',')
        nl()
        continue
      }
      if (tok.value === '(') {
        parts.push('(')
        depth += 1
        // peek: if next significant is SELECT / WITH, break line
        let peek = ti + 1
        while (peek < tokens.length && tokens[peek]!.kind === 'space') peek += 1
        const next = tokens[peek]
        if (next?.kind === 'word' && /^(SELECT|WITH|VALUES)$/i.test(next.value)) {
          nl()
        } else {
          atLineStart = false
          prevWasNewline = false
        }
        continue
      }
      if (tok.value === ')') {
        depth = Math.max(0, depth - 1)
        nl()
        parts.push(')')
        atLineStart = false
        prevWasNewline = false
        continue
      }
      if (tok.value === ';') {
        parts.push(';')
        depth = 0
        nl()
        continue
      }
      space()
      parts.push(tok.value)
      atLineStart = false
      prevWasNewline = false
      continue
    }

    // word
    const raw = tok.value
    const lower = raw.toLowerCase()
    const display = upperKeyword(raw)

    // GROUP BY / ORDER BY / LEFT JOIN etc. — keep BY/JOIN on same line as lead keyword
    const isBy = lower === 'by'
    const isJoinTail = lower === 'join' && parts.length > 0

    if (NEWLINE_BEFORE.has(lower) && !isBy) {
      // LEFT/RIGHT/INNER/OUTER/FULL/CROSS before JOIN stay with JOIN
      if (/^(left|right|inner|outer|full|cross)$/i.test(lower)) {
        if (!atLineStart) nl()
        parts.push(display)
        atLineStart = false
        prevWasNewline = false
        continue
      }
      if (lower === 'join') {
        // if previous token on this line was LEFT/RIGHT/... keep space
        const last = parts[parts.length - 1]?.trim()
        if (last && /^(LEFT|RIGHT|INNER|OUTER|FULL|CROSS)$/i.test(last)) {
          space()
          parts.push(display)
        } else {
          if (!atLineStart) nl()
          parts.push(display)
        }
        atLineStart = false
        prevWasNewline = false
        continue
      }
      if (lower === 'and' || lower === 'or' || lower === 'on' || lower === 'when' || lower === 'else') {
        if (!atLineStart) nl()
        parts.push(display)
        atLineStart = false
        prevWasNewline = false
        continue
      }
      if (!atLineStart) nl()
      parts.push(display)
      atLineStart = false
      prevWasNewline = false
      continue
    }

    if (isBy) {
      space()
      parts.push(display)
      atLineStart = false
      prevWasNewline = false
      continue
    }

    void isJoinTail
    space()
    parts.push(display)
    atLineStart = false
    prevWasNewline = false
  }

  let result = parts.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  // preserve trailing newline if original had one after trim content? keep single trailing newline only if multi-statement ended with ;
  if (input.endsWith('\n') && !result.endsWith('\n')) result += '\n'
  return result
}
