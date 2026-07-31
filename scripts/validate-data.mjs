#!/usr/bin/env node
// Validates every /data/*.json file against its /schemas/*.schema.json
// counterpart, then checks cross-file invariants (§1 Phase 1 gate).

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dataDir = path.join(rootDir, 'data')
const schemasDir = path.join(rootDir, 'schemas')

const ajv = new Ajv2020({ allErrors: true, strict: true })
addFormats(ajv)

let hasErrors = false
const staleThresholdDays = 180
const now = new Date()

function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'))
}

function daysSince(isoDate) {
  return Math.floor((now.getTime() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24))
}

// Recursively find every asOf/confidence pair in a parsed data file, to
// report staleness regardless of where in the structure it sits.
function collectRecords(node, records = []) {
  if (Array.isArray(node)) {
    for (const item of node) collectRecords(item, records)
  } else if (node && typeof node === 'object') {
    if ('asOf' in node && 'confidence' in node) {
      records.push(node)
    }
    for (const value of Object.values(node)) collectRecords(value, records)
  }
  return records
}

const dataFiles = readdirSync(dataDir).filter((f) => f.endsWith('.json'))
const staleRecords = []
const lowConfidenceRecords = []

for (const fileName of dataFiles) {
  const baseName = fileName.replace(/\.json$/, '')
  const schemaPath = path.join(schemasDir, `${baseName}.schema.json`)
  const dataPath = path.join(dataDir, fileName)

  let schema
  try {
    schema = loadJson(schemaPath)
  } catch {
    console.error(`✗ ${fileName}: no matching schema at schemas/${baseName}.schema.json`)
    hasErrors = true
    continue
  }

  const data = loadJson(dataPath)
  const validate = ajv.compile(schema)
  const valid = validate(data)

  if (!valid) {
    hasErrors = true
    console.error(`✗ ${fileName} failed schema validation:`)
    for (const err of validate.errors ?? []) {
      console.error(`  ${err.instancePath || '(root)'} ${err.message}`)
    }
  } else {
    console.log(`✓ ${fileName}`)
  }

  for (const record of collectRecords(data)) {
    if (daysSince(record.asOf) > staleThresholdDays) {
      staleRecords.push({ file: fileName, id: record.id ?? '(no id)', asOf: record.asOf })
    }
    if (record.confidence === 'low') {
      lowConfidenceRecords.push({ file: fileName, id: record.id ?? '(no id)', source: record.source })
    }
  }
}

if (staleRecords.length > 0) {
  console.log(`\n⚠ ${staleRecords.length} record(s) older than ${staleThresholdDays} days (build-time staleness report, §8):`)
  for (const r of staleRecords) console.log(`  ${r.file} / ${r.id} (asOf ${r.asOf})`)
}

if (lowConfidenceRecords.length > 0) {
  console.log(`\n⚠ ${lowConfidenceRecords.length} record(s) marked confidence: 'low' — must be verified before Phase 2 completes (§8):`)
  for (const r of lowConfidenceRecords) console.log(`  ${r.file} / ${r.id}`)
}

if (hasErrors) {
  console.error('\nData validation FAILED.')
  process.exit(1)
} else {
  console.log('\nAll data files passed schema validation.')
}
