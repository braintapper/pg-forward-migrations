

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

    extensionFilter = (item)->
      item.path.endsWith(".sql")

    scannedFiles = klawSync("#{@config.migrationPath}" , {nodir: true, filter: extensionFilter}).sortBy (item)->
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

    console.log "Checking for existing migrations"

    that = @
    client = new @client(@config.database)
    client.connect()
    sql = "select * from pg_migrations order by id asc"
    client.query(sql)
    .then (result) ->
      that.executed_migrations = result.rows
      client.end()
      console.log "Cleaning up executed migrations from queue..."
      that.executed_migrations.forEach (executed_migration)->
        that.queued_migrations.remove (file_migration)->
          if (file_migration.version_tag == executed_migration.version_tag)
            console.log "Removing executed migration from queue: #{executed_migration.version_tag}"

          return (file_migration.version_tag == executed_migration.version_tag)
      that.nextInQueue()
    .catch (err)->
      console.log "error"
      console.log err
      client.end()




  nextInQueue: (rootScope)->

    that = @


    logSql = "insert into pg_migrations (version_tag,description,script_path,script_filename,script_md5, executed_by,executed_at,execution_duration, success) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) "

    if @queued_migrations.length > 1

      currentMigration = @queued_migrations.shift()

      migrationSql = fs.readFileSync(currentMigration.script_path).toString()


      console.info "Migrating: #{currentMigration.script_filename}"



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
        client.end()


        # log migration

        client = new that.client(that.config.database)
        client.connect()
        client.query logSql, Object.values(currentMigration)
        .then (result) ->
          console.info "Logged migration #{currentMigration.version_tag}"

          client.end()
          that.nextInQueue()
        .catch (err)->
          if err?
            console.error "Error trying to record migration into pg_migrations"
            console.error err
            client.end()
            that.finish()


      .catch (err)->
        console.error "Error trying to migrate #{currentMigration.script_filename}"
        console.error err
        client.end()
        that.finish()




    else
      that.finish()





  start: ()->
    that = @
    client = new @client(@config.database)
    client.connect()
    console.log chalk.yellow("Check Migrations Table")
    migrationSql = fs.readFileSync("./sql/migrations.sql").toString()
    console.log chalk.yellow("Ensuring that pg_migrations table exists.")
    client.query(migrationSql)
    .then (result) ->


      console.log chalk.green("...done!")
      client.end()
      that.enqueue()
    .catch (err)->
      console.log chalk.red("Error trying to check the pg_migrations table exists")
      console.log err
      client.end()
      that.finish()





  migrate: ()->
    @start()







  finish: ()->
    console.log chalk.green("Migrations execution completed.")






module.exports = PgForwardMigration
