const assert = require('assert')
const plans = require('./plans')

module.exports = {
  rollback,
  next,
  migrate,
  getAll
}

function flatten (schema, commands, version) {
  commands.unshift(plans.assertMigration(schema, version))
  commands.push(plans.setVersion(schema, version))

  return plans.locked(schema, commands)
}

function rollback (schema, version, migrations) {
  migrations = migrations || getAll(schema)

  const result = migrations.find(i => i.version === version)

  assert(result, `Version ${version} not found.`)

  return flatten(schema, result.uninstall || [], result.previous)
}

function next (schema, version, migrations) {
  migrations = migrations || getAll(schema)

  const result = migrations.find(i => i.previous === version)

  assert(result, `Version ${version} not found.`)

  return flatten(schema, result.install, result.version)
}

function migrate (value, version, migrations) {
  let schema, config

  if (typeof value === 'string') {
    config = null
    schema = value
  } else {
    config = value
    schema = config.schema
  }

  migrations = migrations || getAll(schema, config)

  const result = migrations
    .filter(i => i.previous >= version)
    .sort((a, b) => a.version - b.version)
    .reduce((acc, i) => {
      acc.install = acc.install.concat(i.install)
      acc.version = i.version
      return acc
    }, { install: [], version })

  assert(result.install.length > 0, `Version ${version} not found.`)

  return flatten(schema, result.install, result.version)
}

function getAll (schema) {
  return [
    {
      release: '10.0.0',
      version: 21,
      previous: 20,
      install: [
        `ALTER TABLE ${schema}.job ALTER COLUMN state TYPE text`,
        `ALTER TABLE ${schema}.archive ALTER COLUMN state TYPE text`,
        `DROP TYPE ${schema}.job_state`,
        `CREATE TYPE ${schema}.job_state AS ENUM ('created','retry','active','completed','cancelled','failed')`,
        `ALTER TABLE ${schema}.job ALTER COLUMN state TYPE job_state`,
        `ALTER TABLE ${schema}.archive RENAME to archive_backup`,
        `CREATE TABLE ${schema}.archive (LIKE ${schema}.job)`,
        `ALTER TABLE ${schema}.archive ADD CONSTRAINT archive_pkey PRIMARY KEY (id)`,
        `ALTER TABLE ${schema}.archive ADD archivedOn timestamptz NOT NULL DEFAULT now()`,
        `CREATE INDEX archive_archivedon_idx ON ${schema}.archive(archivedon)`,
        `CREATE INDEX archive_name_idx ON ${schema}.archive(name)`,
        `DROP INDEX ${schema}.job_singletonKey`,
        `DROP INDEX ${schema}.job_singleton_queue`,
        `DROP INDEX ${schema}.job_singletonOn`,
        `DROP INDEX ${schema}.job_singletonKeyOn`,
        `CREATE UNIQUE INDEX job_singleton ON ${schema}.job (name, state) WHERE state <= 'active' AND singletonKey = '__pgboss__singleton_queue'`,
        `CREATE UNIQUE INDEX job_throttle_on ON ${schema}.job (name, singletonOn) WHERE state <= 'completed' AND singletonOn IS NOT NULL AND singletonKey = '__pgboss__singleton_queue'`,
        `CREATE UNIQUE INDEX job_throttle_key_on ON ${schema}.job (name, singletonOn, singletonKey) WHERE state <= 'completed' AND singletonOn IS NOT NULL AND singletonKey IS NOT NULL`
      ],
      uninstall: [
        `ALTER TYPE ${schema}.job_state ADD VALUE 'expired' AFTER 'completed'`,
        `ALTER TABLE ${schema}.archive DROP CONSTRAINT archive_pkey`,
        `DROP TABLE IF EXISTS ${schema}.archive_backup`,
        `DROP INDEX ${schema}.job_singleton`,
        `DROP INDEX ${schema}.job_throttle_on`,
        `DROP INDEX ${schema}.job_throttle_key_on`,
        `CREATE UNIQUE INDEX job_singletonOn ON ${schema}.job (name, singletonOn) WHERE state < 'expired' AND singletonKey IS NULL`,
        `CREATE UNIQUE INDEX job_singletonKeyOn ON ${schema}.job (name, singletonOn, singletonKey) WHERE state < 'expired'`,
        `CREATE UNIQUE INDEX job_singletonKey ON ${schema}.job (name, singletonKey) WHERE state < 'completed' AND singletonOn IS NULL AND NOT singletonKey LIKE '\\_\\_pgboss\\_\\_singleton\\_queue%'`,
        `CREATE UNIQUE INDEX job_singleton_queue ON ${schema}.job (name, singletonKey) WHERE state < 'active' AND singletonOn IS NULL AND singletonKey LIKE '\\_\\_pgboss\\_\\_singleton\\_queue%'`
      ]
    },
    {
      release: '7.4.0',
      version: 20,
      previous: 19,
      install: [
        `DROP INDEX ${schema}.job_singletonKey`,
        `DROP INDEX ${schema}.job_singleton_queue`,
        `CREATE UNIQUE INDEX job_singletonKey ON ${schema}.job (name, singletonKey) WHERE state < 'completed' AND singletonOn IS NULL AND NOT singletonKey LIKE '\\_\\_pgboss\\_\\_singleton\\_queue%'`,
        `CREATE UNIQUE INDEX job_singleton_queue ON ${schema}.job (name, singletonKey) WHERE state < 'active' AND singletonOn IS NULL AND singletonKey LIKE '\\_\\_pgboss\\_\\_singleton\\_queue%'`
      ],
      uninstall: [
        `DROP INDEX ${schema}.job_singletonKey`,
        `DROP INDEX ${schema}.job_singleton_queue`,
        `CREATE UNIQUE INDEX job_singletonKey ON ${schema}.job (name, singletonKey) WHERE state < 'completed' AND singletonOn IS NULL AND NOT singletonKey = '__pgboss__singleton_queue'`,
        `CREATE UNIQUE INDEX job_singleton_queue ON ${schema}.job (name, singletonKey) WHERE state < 'active' AND singletonOn IS NULL AND singletonKey = '__pgboss__singleton_queue'`
      ]
    },
    {
      release: '7.0.0',
      version: 19,
      previous: 18,
      install: [
        `CREATE TABLE ${schema}.subscription (
          event text not null,
          name text not null,
          created_on timestamp with time zone not null default now(),
          updated_on timestamp with time zone not null default now(),
          PRIMARY KEY(event, name)
        )`
      ],
      uninstall: [
        `DROP TABLE ${schema}.subscription`
      ]
    }
  ]
}
