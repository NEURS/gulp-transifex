var assign, chalk, config, env, gutil, httpClient, path, sprintf, through, _paths;

gutil = require('gulp-util');
through = require('through2');
chalk = require('chalk');
path = require('path');
httpClient = require('http');
assign = require('object-assign');
config = require('./config.json');
sprintf = require('sprintf');
env = config.env;

_paths = {
  host: config.transifex.host,
  base_path: config.transifex.base_path,
  get_resources: function() {
    return this.base_path + '%(project)s/resources/';
  },
  update_resource: function() {
    return this.base_path + '%(project)s/resource/%(resource)s/content/';
  }
};

module.exports = {
  createClient: function(options) {
    options = assign(config.transifex[env], options || {});
    return {
      paths: (function() {
        return {
          get_resources: function() {
            return sprintf(_paths.get_resources(), {
              project: options.project
            });
          }
        };
      })(),
      resources: function(callback) {
        var req, request_options;
        request_options = {
          host: _paths.host,
          port: '80',
          path: sprintf(_paths.get_resources(), {
            project: options.project
          }),
          method: 'GET',
          auth: options.user + ':' + options.password
        };
        req = httpClient.request(request_options, function(res) {
          res.on('data', function(data) {
            callback(JSON.parse(data));
            return res.end();
          });
        });
        req.on('error', function(err) {
          console.log(chalk.red(err));
        });
        return req.end();
      },
      push: function(callback) {
        return through.obj((function(file, enc, cb) {
          var data, req, request_options;
          if (file.isNull()) {
            console.log('Is null');
            cb();
            return;
          }
          if (file.isStream()) {
            console.log('We dont take streams');
            cb();
            return;
          }
          if (path.extname(file.path) === '.po') {
            data = {
              content: file.contents.toString('utf8')
            };
            data = JSON.stringify(data);
            request_options = {
              host: _paths.host,
              port: '80',
              path: sprintf(_paths.update_resource(), {
                project: options.project,
                resource: path.basename(file.path, '.po') + 'po'
              }),
              method: 'PUT',
              auth: options.user + ':' + options.password,
              headers: {
                "Content-type": "application/json",
                "Content-length": data.length
              }
            };
            req = httpClient.request(request_options);
            req.on('response', function(res) {
              var msg;
              msg = res.statusCode === 200 ? chalk.green('✔ ') + chalk.blue('Upload succesful') : chalk.red('✘ ') + chalk.blue('There was an error: ' + httpClient.STATUS_CODES[res.statusCode]);
              console.log(msg);
              req.end()
              cb();
            });
            req.on('error', function(err) {
              console.log(chalk.red(err));
              req.end()
              cb();
            });
            req.write(data);
            req.end();
          }
        }), function(cb) {
          if (callback != null) {
            callback();
          }
          return cb();
        });
      }
    };
  }
};