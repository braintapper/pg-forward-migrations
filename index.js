var PgForwardMigration, Sugar, fs, hasha, path;

Sugar = require("sugar");

Sugar.extend();

path = require("path");

hasha = require("hasha");

fs = require("fs-extra");

PgForwardMigration = (function() {
  class PgForwardMigration {
    constructor(config) {
      var pg;
      pg = require('pg');
      this.client = pg.Client;
      this.config = config;
    }

    // build the queue
    enqueue() {
      var client, extensionFilter, klawSync, migrationPaths, scannedFiles, sql, that;
      that = this;
      // populate file_migrations array
      klawSync = require('klaw-sync');
      extensionFilter = function(item) {
        return item.path.endsWith(".sql");
      };
      scannedFiles = klawSync(`${this.config.migrationPath}`, {
        nodir: true,
        filter: extensionFilter
      }).sortBy(function(item) {
        return item.path;
      });
      migrationPaths = scannedFiles.map(function(item) {
        return item.path;
      });
      migrationPaths.forEach(function(item) {
        var description, filename, filename_chunks, version_tag;
        filename = path.basename(item, ".sql");
        filename_chunks = filename.split("__");
        version_tag = filename.split("__")[0];
        description = filename.from(version_tag.length + 2).spacify();
        return that.queued_migrations.push({
          version_tag: version_tag,
          description: description,
          script_path: item,
          script_filename: path.basename(item),
          script_md5: hasha.fromFileSync(item, {
            algorithm: 'md5'
          }),
          executed_by: that.config.database.user,
          executed_at: null,
          execution_duration: null,
          success: 0
        });
      });
      // populate executed_migrations array from db
      console.log("Checking for existing migrations");
      that = this;
      client = new this.client(this.config.database);
      client.connect();
      sql = "select * from pg_migrations order by id asc";
      return client.query(sql).then(function(result) {
        that.executed_migrations = result.rows;
        client.end();
        console.log("Cleaning up executed migrations from queue...");
        that.executed_migrations.forEach(function(executed_migration) {
          return that.queued_migrations.remove(function(file_migration) {
            if (file_migration.version_tag === executed_migration.version_tag) {
              console.log(`Removing executed migration from queue: ${executed_migration.version_tag}`);
            }
            return file_migration.version_tag === executed_migration.version_tag;
          });
        });
        return that.nextInQueue();
      }).catch(function(err) {
        console.log("error");
        console.log(err);
        return client.end();
      });
    }

    nextInQueue(rootScope) {
      var client, currentMigration, logSql, migrationSql, that;
      //rootScope = rootScope || @
      //console.log "next in queue @"
      //console.log @
      // recurse through the migration queue
      that = this;
      logSql = "insert into pg_migrations (version_tag,description,script_path,script_filename,script_md5, executed_by,executed_at,execution_duration, success) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) ";
      if (this.queued_migrations.length > 1) {
        console.log("nextInQueue");
        currentMigration = this.queued_migrations.shift();
        migrationSql = fs.readFileSync(currentMigration.script_path).toString();
        console.log(`migrate this: ${currentMigration.version_tag}`);
        client = new this.client(this.config.database);
        client.connect();
        //console.log sql
        currentMigration.executed_at = Date.create();
        return client.query(migrationSql).then(function(result) {
          // migration completed
          currentMigration.execution_duration = currentMigration.executed_at.millisecondsAgo();
          currentMigration.success = 1;
          that.completed_migrations.push(currentMigration);
          client.end();
          // log migration
          client = new that.client(that.config.database);
          client.connect();
          return client.query(logSql, Object.values(currentMigration)).then(function(result) {
            console.log(`Logged migration ${currentMigration.version_tag}`);
            client.end();
            return that.nextInQueue();
          }).catch(function(err) {
            if (err != null) {
              console.log("logMigration error");
              console.log(err);
              client.end();
              return that.finish();
            }
          });
        }).catch(function(err) {
          console.log("error");
          console.log(err);
          client.end();
          return that.finish();
        });
      } else {
        return that.finish();
      }
    }

    start() {
      var client, migrationSql, that;
      that = this;
      client = new this.client(this.config.database);
      client.connect();
      console.log("Check Migrations Table");
      migrationSql = fs.readFileSync("./sql/migrations.sql").toString();
      return client.query(migrationSql).then(function(result) {
        console.log("Ensuring pg_migrations");
        console.log(result);
        client.end();
        return that.enqueue();
      }).catch(function(err) {
        console.log("error");
        console.log(err);
        client.end();
        return that.finish();
      });
    }

    migrate() {
      return this.start();
    }

    finish() {
      return console.log("done!");
    }

    executeScript(sql, next) {
      var client, that;
      that = this;
      client = new this.client(this.config.database);
      client.connect();
      //console.log sql
      return client.query(sql).then(function(result) {
        client.end();
        if (next != null) {
          return next(result);
        }
      }).catch(function(err) {
        console.log("error");
        console.log(err);
        return client.end();
      });
    }

  };

  PgForwardMigration.prototype.client = {};

  PgForwardMigration.prototype.config = {};

  PgForwardMigration.prototype.executed_migrations = [];

  PgForwardMigration.prototype.queued_migrations = [];

  PgForwardMigration.prototype.completed_migrations = [];

  return PgForwardMigration;

}).call(this);

module.exports = PgForwardMigration;
