import MemoryFileSystem from 'memory-fs'

// hotdev-webpack Watching
export class HotdevWebpackWatcher {
    constructor(compiler, hotdev) {
        this.watching = null
        this.compiler = compiler
        this.options = hotdev
        if(!compiler.compilers && compiler.outputFileSystem instanceof MemoryFileSystem) {
            this.fs = compiler.outputFileSystem
        } else {
            this.fs = compiler.outputFileSystem = new MemoryFileSystem()
        }
        compiler.plugin('done', (stats) => {
            this.done(stats, () => {
                latestStats = statsResult
                publishStats('built', latestStats, eventStream, opts.log)
            })
        })
        compiler.plugin('compile', () => {
            latestStats = null
            if(opts.log) {
                opts.log('webpack building...')
            }
            eventStream.publish({ action: 'building' })
        })
        compiler.plugin('invalid', this.invalid)
        compiler.plugin('watch-run', this.invalid)
        compiler.plugin('run', this.invalid)
    }

    // start Webpack Watch
    start() {
        const { watchOptions, lazy } = this.options
        if(!lazy) {
            this.watching = this.compiler.watch(watchOptions, this.statsHandle)
        } else {
            this.restart()
        }
    }

    // valid Webpack Watch
    valid(callback = () => { }) {
        if(this.watching) {
            this.watching.invalidate()
        } else {
            callback()
        }
    }

    // close Webpack Watch
    close(callback = () => { }) {
        if(this.watching) {
            this.watching.close(callback)
        } else {
            callback()
        }
    }

    // webpack stats handler
    stats(err, stats) {
        const { statsOptions, log } = this.options
        if(err) {
            log.error('Compiled Failed. \n', err)
        } else if(stats.hasErrors()) {
            log.error('Compiled with erros.\n', stats.toString(statsOptions))
        } else if(stats.hasWarnings()) {
            log.warn('Compiled with warnings.', stats.toString(statsOptions))
        } else {
            log.info('Compiled successfully.', stats.toString(statsOptions))
        }
    }

    // webpack rebuild
    restart() {
        const { log } = this.options
        this.compiler.run((err) => {
            if(err) {
                log.error('Recompiled Failed !', err.stack || err)
                if(err.details) {
                    log.error('Error Details', err.details)
                }
            } else {
                log.info('Recompiled Success !')
            }
        })
    }

    // webpack invalid
    invalid() {

    }

    // webpack Compile Done
    done(stats, callback) {
        // We are now on valid state
        context.state = true
        context.webpackStats = stats

        // Do the stuff in nextTick, because bundle may be invalidated
        // if a change happened while compiling
        process.nextTick(function() {
            // check if still in valid state
            if(!context.state) {
                return
            }

            // print webpack output
            context.options.reporter({
                state: true,
                stats: stats,
                options: context.options
            })

            // execute callback that are delayed
            let cbs = context.callbacks
            context.callbacks = []
            cbs.forEach(function(cb) {
                cb(stats)
            })
        })

        // In lazy mode, we may issue another rebuild
        if(context.forceRebuild) {
            context.forceRebuild = false
            this.rebuild()
        }
    }
}
