gulp   = require('gulp')
coffee = require("gulp-coffee")


sourcePath = ["src/**/*.coffee"]
destinationPath = "./"



module.exports = (cb)->


  stream = gulp.src(sourcePath).pipe(coffee({bare:true})).pipe(gulp.dest(destinationPath))
  stream.on 'end', ()->
    console.log "Compiled!"
    cb()

module.exports.watch = sourcePath
module.exports.displayName = "coffee"
