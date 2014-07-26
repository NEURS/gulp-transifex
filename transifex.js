var FormData, assign, chalk, config, env, gutil, httpClient, path, sprintf, through, _paths;

gutil = require('gulp-util');

through = require('through2');

chalk = require('chalk');

path = require('path');

httpClient = require('http');

assign = require('object-assign');

config = require('./config.json');

sprintf = require('sprintf');

FormData = require('form-data');

env = config.env;

_paths = {
  host: config.host,
  base_path: config.base_path,
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
      resources: function(cb) {
        var req, request_options;
        request_options = {
          hostname: _paths.host,
          port: '80',
          path: sprintf(_paths.get_resources(), {
            project: options.project
          }),
          method: 'GET',
          auth: config.user + ':' + options.password
        };
        req = httpClient.request(request_options, function(res) {
          res.on('data', function(data) {
            return cb(JSON.parse(data));
          });
        });
        req.on('error', function(err) {
          console.log(chalk.red(err));
        });
        return req.end();
      },
      push: function(callback) {
        return through.obj((function(file, enc, cb) {
          var form, req, request_options;
          if (file.isNull()) {
            console.log('Is null');
            return cb();
          }
          if (file.isStream()) {
            console.log('We dont take streams');
            return cb();
          }
          if (path.extname(file.path) === '.po') {
            form = new FormData();
            console.log(file.path);
            form.append('files', file.contents.toString());
            request_options = {
              hostname: _paths.host,
              port: '80',
              path: sprintf(_paths.update_resource(), {
                project: options.project,
                resource: path.basename(file.path, '.po') + 'po'
              }),
              method: 'PUT',
              auth: options.user + ':' + options.password,
              headers: form.getCustomHeaders()
            };
            console.log(form);
            req = httpClient.request(request_options);
            form.pipe(req);
            req.on('response', function(res) {
              console.log(chalk.green(res.statusCode));
              req.end();
            });
            req.end();
            return cb();
          }
        }), function(cb) {
          if (callback != null) {
            callback();
          }
          return cb();
        });
      },
      pull: function() {
        return through.obj((function(file, enc, cb) {
          if (file.isNull()) {
            console.log('Is null');
            return cb();
          }
          if (file.isStream()) {
            console.log('We dont take streams');
            return cb();
          }
          if (path.extname(file.path) === '.po') {
            console.log(file.contents.toString());
          }
          return cb();
        }), function(cb) {
          return cb();
        });
      }
    };
  }
};