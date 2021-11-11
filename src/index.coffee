Sugar = require "sugar-and-spice"
Sugar.extend()

path = require "path"
hasha = require "hasha"
fs = require "fs-extra"
chalk = require "chalk"
klawSync = require('klaw-sync')
pg = require('pg')

class PgForwardMigration

  client: {}
  config: {}

  executed_migrations: [] # from pg_migrations
  queued_migrations: [] # populated with file_migrations
  completed_migrations: [] # populated with freshly executed migrations

  constructor: (@config)->
    @client = new pg.Pool(@config.database)

  initialize_migrations_table: ()->

    that = @
    console.log chalk.gray("Check Migrations Table")
    migration_sql ="""
      CREATE TABLE IF NOT EXISTS pg_migrations
      (
        id bigserial,
        version_tag character varying(10) not null,
        description character varying(256) not null,
        script_path character varying(1024) not null,
        script_filename character varying(256) not null,
        script_md5 varchar(256) not null,
        executed_by character varying(100) not null,
        executed_at timestamp without time zone NOT NULL DEFAULT now(),
        execution_duration integer not null,
        success smallint not null,
        CONSTRAINT pg_migrations_pkey PRIMARY KEY (id)
      );
    """

    console.log chalk.gray("Ensuring that pg_migrations table exists.")
    result = await @client.query(migration_sql)
    result

  get_executed_migrations: ()->
    sql = "select * from pg_migrations order by id asc"
    result = await @client.query(sql)
    @executed_migrations = result.rows

  migration_filter: (item)->
    # this is arbitrary
    # TODO: use a regex instead to detect ####__filename.sql
    item.path.endsWith(".sql") && item.path.includes("__")

  get_migration_files: ()->
    that = @
    scannedFiles = klawSync("#{@config.migration_path}" , {nodir: true, filter: @migration_filter}).sortBy (item)->
      return item.path

    migration_paths = scannedFiles.map (item)->
      item.path

    migration_paths.forEach (item)->
      filename = path.basename(item,".sql")
      filename_chunks = filename.split("__")
      version_tag = filename.split("__")[0]
      description = filename.from(version_tag.length + 2).spacify()

      that.queued_migrations.append
        version_tag: version_tag
        description: description
        script_path: item
        script_filename: path.basename(item)
        script_md5: hasha.fromFileSync(item, {algorithm: 'md5'})
        executed_by: that.config.database.user
        executed_at: null
        execution_duration: null
        success: 0

  check_completed_migrations: ()->
    that = @
    console.log chalk.gray("Cleaning up executed migrations from queue...")
    @executed_migrations.forEach (executed_migration)->
      that.queued_migrations.remove (file_migration)->
        if (file_migration.script_filename == executed_migration.script_filename)
          console.log chalk.gray("#{executed_migration.script_filename} already executed. Skipping")
        return (file_migration.script_filename == executed_migration.script_filename)
    @queued_migrations.forEach (queued_migration)->
      console.log chalk.white("#{queued_migration.script_filename} is new and will be queued.")
    if @queued_migrations.length == 0
      console.log chalk.yellow "No migrations outstanding"
    else
      console.log "#{that.queued_migrations.length} migrations outstanding."


  run_migration: (current_migration)->

    process.stdout.write chalk.yellow("Migrating #{current_migration.script_filename}... ")
    try
      logSql = "insert into pg_migrations (version_tag,description,script_path,script_filename,script_md5, executed_by,executed_at,execution_duration, success) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) "
      migration_sql = fs.readFileSync(current_migration.script_path).toString()

      current_migration.executed_at = Date.create()
      
      result = await @client.query(migration_sql)
      process.stdout.write chalk.green("ok!\n")
      current_migration.execution_duration = current_migration.executed_at.millisecondsAgo()
      current_migration.success = 1
      @completed_migrations.push current_migration
      
      result = await @client.query logSql, Object.values(current_migration)

    catch err
      process.stdout.write chalk.red("failed!\n")
      console.log ""
      console.log chalk.red("-".repeat(80))
      console.log ""
      console.log "Migration failed: #{current_migration.script_filename}"
      console.log ""
      console.log err
      console.log ""
      console.log chalk.red("-".repeat(80))
      console.log ""
      throw "Migration terminated due to errors."
      

  execute_outstanding_migrations: ()->
    
    if @queued_migrations.length > 0
      console.log "Execute outstanding migrations"
      await @run_migration migration for migration in @queued_migrations


  migrate: ()->
    
    console.log chalk.white("PG Forward Migrations")
    that = @
    try
      await @initialize_migrations_table()
      await @get_migration_files()
      await @get_executed_migrations()
      await @check_completed_migrations()
      await @execute_outstanding_migrations()
    catch err
      console.error chalk.red(err)
    finally
      await @client.end()
      console.log chalk.white("Migration ended. #{@completed_migrations.length} #{("migration").pluralize(@completed_migrations.length)} were executed.")
      if @completed_migrations.length < @queued_migrations.length
        console.log chalk.red("Due to errors, #{@queued_migrations.length - @completed_migrations.length} of #{@queued_migrations.length} queued migrations were not run and remain outstanding.")
      

module.exports = PgForwardMigration
