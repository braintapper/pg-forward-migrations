# pg-forward-migrations

A rudimentary forward-only database migration tool for NodeJS and Postgresql.

## How This Works, In a Nutshell

* Migrations are forward only. No rollbacks.
* Migrations are in the form of a .sql file containg the SQL to be run
* Migration files must use a particular naming convention
* PG Only, a `pg_migrations` table will be created
* To run a migration, you must pass a configuration that only consists of:
  * The path to the folder containing your migration files (no subfolders are checked)
  * Your PG database connection information


## Naming Convention for SQL Files

0001__Description_Here.sql

The first part "0001" is the version tag. This can be up to 10 characters, ideally a zero padded number. Migration files are loaded in ascending order. Sorting may be unpredictable if you don't stick to a zero padded number. Each file should be a consecutive number, with no gaps.

The version tag must be followed by EXACTLY TWO underscores `__`.

The second part is a descriptor for the SQL script. You can format this any way you want, as long as the characters are legal in a filename. When logging the file to the migration table, the descriptor will be "spacified" (i.e., camelcase, underscores, and hyphens are change spaces.).

The third part is .sql file extension. This migration tool only works with .sql files. All other file types are ignored.


# Frequently Asked Questions

## Why not use something like Flyway instead?

This tool is actually inspired by Flyway, but I opted against using Flyway instead because I didn't want to install Java in my containers just to run simple migrations.

## What is "forward only" and why do it that way?

The answer is here: https://nickcraver.com/blog/2016/05/03/stack-overflow-how-we-do-deployment-2016-edition/#database-migrations

Rollbacks do not and will never exist in this tool.

## Why PG Only?

 The goal was not to make a solution for everyone. This was created to satisfy the requirements of my own projects, which are mostly PG.

 If you need a cross-database migration tool, there are already "bigger" solutions like Flyway and Liquibase.
