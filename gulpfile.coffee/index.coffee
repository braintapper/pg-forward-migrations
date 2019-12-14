# Make sure that all gulp libs below are installed using `npm install`

'use strict'

series = require("gulp").series
parallel = require("gulp").parallel
watch = require("gulp").watch
task = require("gulp").task

coffeeTask = require("./coffee.coffee")

task "coffee", coffeeTask



task "watch", (cb)->
  watch coffeeTask.watch, coffeeTask
