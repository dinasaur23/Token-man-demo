#!/usr/bin/env node
/**
 * Report-only migration helper for unsupported / invalid DTCG `$type` values.
 *
 * Usage:
 *   node server/scripts/report-unsupported-token-types.js
 *   node server/scripts/report-unsupported-token-types.js --file path/to/tokens.json
 *
 * Output rows: { workspaceId, fileName?, path, $type, classification, message }
 *
 * Does NOT delete or mutate any data. `--purge` is rejected.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  collectUnsupportedTokenTypesFromDocument,
  collectUnsupportedTokenTypesFromWorkspace,
} from '../src/utils/dtcg/reportUnsupportedTokenTypes.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const serverRoot = resolve(__dirname, '..')

function printUsage() {
  console.log(`Report unsupported / invalid DTCG token $type values (read-only).

Usage:
  node server/scripts/report-unsupported-token-types.js
  node server/scripts/report-unsupported-token-types.js --file <tokens.json>

Environment (DB mode):
  MONGO_URI   Mongo connection string
  MONGO_DB    Optional database name

This script never deletes or mutates workspace data. --purge is not supported.
`)
}

function parseArgs(argv) {
  const args = { file: null, help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') args.help = true
    else if (a === '--file') {
      args.file = argv[++i]
      if (!args.file) throw new Error('--file requires a path')
    } else if (a === '--purge') {
      throw new Error(
        '--purge is not supported. This script is report-only; remove unsupported tokens manually after review.',
      )
    } else if (a.startsWith('-')) {
      throw new Error(`Unknown option: ${a}`)
    }
  }
  return args
}

async function reportFromFile(filePath) {
  const abs = resolve(filePath)
  const raw = readFileSync(abs, 'utf8')
  const doc = JSON.parse(raw)
  const findings = collectUnsupportedTokenTypesFromDocument(doc)
  return findings.map((f) => ({
    workspaceId: '(file)',
    fileName: abs,
    path: f.path,
    $type: f.$type,
    classification: f.classification,
    message: f.message,
  }))
}

async function reportFromDatabase() {
  const uri = process.env.MONGO_URI
  if (!uri) {
    throw new Error(
      'MONGO_URI is missing. Set MONGO_URI for database mode, or pass --file <tokens.json>.',
    )
  }

  // Resolve mongoose from the server package so this works when invoked as
  // `node server/scripts/...` from the repo root.
  const { createRequire } = await import('node:module')
  const require = createRequire(resolve(serverRoot, 'package.json'))
  const mongoose = require('mongoose')

  await mongoose.connect(uri, {
    dbName: process.env.MONGO_DB,
  })

  try {
    const { default: TokenWorkspace } = await import('../src/models/TokenWorkspace.js')
    const workspaces = await TokenWorkspace.find({}).lean().exec()
    const rows = []
    for (const ws of workspaces) {
      rows.push(
        ...collectUnsupportedTokenTypesFromWorkspace({
          workspaceId: String(ws._id),
          files: ws.files ?? [],
        }),
      )
    }
    return rows
  } finally {
    await mongoose.disconnect().catch(() => {})
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printUsage()
    process.exit(0)
  }

  const rows = args.file ? await reportFromFile(args.file) : await reportFromDatabase()

  console.log(JSON.stringify(rows, null, 2))
  console.error(`# ${rows.length} finding(s)`)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
