var PgForwardMigration, Sugar, chalk, fs, hasha, path;

Sugar = require("sugar");

Sugar.extend();

path = require("path");

hasha = require("hasha");

fs = require("fs-extra");

chalk = require("chalk");

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
      var client, klawSync, migrationFilter, migrationPaths, scannedFiles, sql, that;
      that = this;
      // populate file_migrations array
      klawSync = require('klaw-sync');
      migrationFilter = function(item) {
        return item.path.endsWith(".sql") && item.path.includes("__");
      };
      scannedFiles = klawSync(`${this.config.migrationPath}`, {
        nodir: true,
        filter: migrationFilter
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
      console.log(chalk.gray("Checking for completed migrations"));
      that = this;
      client = new this.client(this.config.database);
      client.connect();
      sql = "select * from pg_migrations order by id asc";
      return client.query(sql).then(function(result) {
        that.executed_migrations = result.rows;
        client.end();
        console.log(chalk.gray("Cleaning up executed migrations from queue..."));
        that.executed_migrations.forEach(function(executed_migration) {
          return that.queued_migrations.remove(function(file_migration) {
            if (file_migration.script_filename === executed_migration.script_filename) {
              console.log(chalk.gray(`${executed_migration.script_filename} already executed. Skipping`));
            }
            return file_migration.script_filename === executed_migration.script_filename;
          });
        });
        that.queued_migrations.forEach(function(queued_migration) {
          return console.log(chalk.white(`${queued_migration.script_filename} is new and will be queued.`));
        });
        console.log(`${that.queued_migrations.length} migrations outstanding.`);
        return that.nextInQueue();
      }).catch(function(err) {
        console.log(chalk.red("Error while retrieving executed migrations"));
        console.log(err);
        client.end();
        return that.finish();
      });
    }

    nextInQueue(rootScope) {
      var client, currentMigration, logSql, migrationSql, that;
      that = this;
      logSql = "insert into pg_migrations (version_tag,description,script_path,script_filename,script_md5, executed_by,executed_at,execution_duration, success) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) ";
      if (this.queued_migrations.length > 0) {
        currentMigration = this.queued_migrations.shift();
        migrationSql = fs.readFileSync(currentMigration.script_path).toString();
        client = new this.client(this.config.database);
        client.connect();
        //console.log sql
        currentMigration.executed_at = Date.create();
        return client.query(migrationSql).then(function(result) {
          // migration completed
          currentMigration.execution_duration = currentMigration.executed_at.millisecondsAgo();
          currentMigration.success = 1;
          that.completed_migrations.push(currentMigration);
          console.info(chalk.green(`Migrating: ${currentMigration.script_filename}`));
          client.end();
          // log migration
          client = new that.client(that.config.database);
          client.connect();
          return client.query(logSql, Object.values(currentMigration)).then(function(result) {
            //console.info "Logged migration #{currentMigration.version_tag}"
            client.end();
            return that.nextInQueue();
          }).catch(function(err) {
            if (err != null) {
              console.error(chalk.red("Error trying to record migration into pg_migrations"));
              console.error(err);
              client.end();
              return that.finish();
            }
          });
        }).catch(function(err) {
          console.error(chalk.red(`Error trying to migrate ${currentMigration.script_filename}`));
          console.error(err);
          client.end();
          return that.finish();
        });
      } else {
        return that.finish();
      }
    }

    // Check the migrations table, create if it doesn't exist, then enqueue migrations
    start() {
      var client, migrationSql, that;
      that = this;
      client = new this.client(this.config.database);
      client.connect();
      console.log(chalk.gray("Check Migrations Table"));
      migrationSql = fs.readFileSync("./sql/migrations.sql").toString();
      console.log(chalk.gray("Ensuring that pg_migrations table exists."));
      return client.query(migrationSql).then(function(result) {
        client.end();
        return that.enqueue();
      }).catch(function(err) {
        console.log(chalk.red("Error trying to check the pg_migrations table exists"));
        console.log(err);
        client.end();
        return that.finish();
      });
    }

    migrate() {
      console.log(chalk.white("PG Forward Migrations"));
      return this.start();
    }

    finish() {
      return console.log(chalk.white(`Task finished. ${this.completed_migrations.length} migrations were executed.`));
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
