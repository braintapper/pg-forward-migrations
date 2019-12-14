

Sugar = require "sugar"
Sugar.extend()
path = require "path"
hasha = require "hasha"
fs = require "fs-extra"
chalk = require "chalk"


class PgForwardMigration

  client: {}
  config: {}

  executed_migrations: [] # from pg_migrations
  queued_migrations: [] # populated with file_migrations
  completed_migrations: [] # populated with freshly executed migrations

  constructor: (config)->
    pg = require('pg')
    @client = pg.Client
    @config = config

  # build the queue
  enqueue: ()->
    that = @


    # populate file_migrations array

    klawSync = require('klaw-sync')

    migrationFilter = (item)->
      item.path.endsWith(".sql") && item.path.includes("__")

    scannedFiles = klawSync("#{@config.migrationPath}" , {nodir: true, filter: migrationFilter}).sortBy (item)->
      return item.path

    migrationPaths = scannedFiles.map (item)->
      item.path

    migrationPaths.forEach (item)->
      filename = path.basename(item,".sql")
      filename_chunks = filename.split("__")
      version_tag = filename.split("__")[0]
      description = filename.from(version_tag.length + 2).spacify()

      that.queued_migrations.push
        version_tag: version_tag
        description: description
        script_path: item
        script_filename: path.basename(item)
        script_md5: hasha.fromFileSync(item, {algorithm: 'md5'})
        executed_by: that.config.database.user
        executed_at: null
        execution_duration: null
        success: 0

    # populate executed_migrations array from db

    console.log chalk.gray("Checking for completed migrations")

    that = @
    client = new @client(@config.database)
    client.connect()
    sql = "select * from pg_migrations order by id asc"
    client.query(sql)
    .then (result) ->
      that.executed_migrations = result.rows
      client.end()
      console.log chalk.gray("Cleaning up executed migrations from queue...")
      that.executed_migrations.forEach (executed_migration)->
        that.queued_migrations.remove (file_migration)->
          if (file_migration.script_filename == executed_migration.script_filename)
            console.log chalk.gray("#{executed_migration.script_filename} already executed. Skipping")
          return (file_migration.script_filename == executed_migration.script_filename)

      that.queued_migrations.forEach (queued_migration)->
        console.log chalk.white("#{queued_migration.script_filename} is new and will be queued.")



      console.log "#{that.queued_migrations.length} migrations outstanding."


      that.nextInQueue()
    .catch (err)->
      console.log chalk.red("Error while retrieving executed migrations")
      console.log err
      client.end()
      that.finish()




  nextInQueue: (rootScope)->

    that = @

    logSql = "insert into pg_migrations (version_tag,description,script_path,script_filename,script_md5, executed_by,executed_at,execution_duration, success) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) "

    if @queued_migrations.length > 0

      currentMigration = @queued_migrations.shift()

      migrationSql = fs.readFileSync(currentMigration.script_path).toString()






      client = new @client(@config.database)
      client.connect()
      #console.log sql

      currentMigration.executed_at = Date.create()
      client.query(migrationSql)
      .then (result) ->
        # migration completed
        currentMigration.execution_duration = currentMigration.executed_at.millisecondsAgo()
        currentMigration.success = 1
        that.completed_migrations.push currentMigration
        console.info chalk.green("Migrating: #{currentMigration.script_filename}")
        client.end()


        # log migration

        client = new that.client(that.config.database)
        client.connect()
        client.query logSql, Object.values(currentMigration)
        .then (result) ->
          #console.info "Logged migration #{currentMigration.version_tag}"
          client.end()
          that.nextInQueue()
        .catch (err)->
          if err?
            console.error chalk.red("Error trying to record migration into pg_migrations")
            console.error err
            client.end()
            that.finish()


      .catch (err)->
        console.error chalk.red("Error trying to migrate #{currentMigration.script_filename}")
        console.error err
        client.end()
        that.finish()




    else
      that.finish()




  # Check the migrations table, create if it doesn't exist, then enqueue migrations
  start: ()->
    that = @
    client = new @client(@config.database)
    client.connect()
    console.log chalk.gray("Check Migrations Table")
    migrationSql = fs.readFileSync("./sql/migrations.sql").toString()
    console.log chalk.gray("Ensuring that pg_migrations table exists.")
    client.query(migrationSql)
    .then (result) ->
      client.end()
      that.enqueue()
    .catch (err)->
      console.log chalk.red("Error trying to check the pg_migrations table exists")
      console.log err
      client.end()
      that.finish()

  migrate: ()->
    console.log chalk.white("PG Forward Migrations")
    @start()

  finish: ()->
    console.log chalk.white("Task finished. #{@completed_migrations.length} migrations were executed.")



module.exports = PgForwardMigration
