var chalk, fs, gutil, httpClient, path, paths, request, sprintf, through, util;

gutil = require('gulp-util');
through = require('through2');
chalk = require('chalk');
path = require('path');
request = require('./libs/request');
sprintf = require('sprintf');
util = require('util');
fs = require('fs');
paths = require('./libs/paths.js');
httpClient = require('http');
async = require('async');

module.exports = {
  createClient: function(options) {
    var _this;
    _this = this;
    options = util._extend({}, options || {});
    _this._paths = paths(options);
    this.resources = function(callback) {
      var req, results='';
      
      req = request('GET', _this._paths.get_or_create_resources({
        project: options.project
      }), {
        user: options.user,
        password: options.password
      }, function(res) {
        res.setEncoding('utf8');
        res.on('data', function(data) {
          if (parseInt(res.statusCode) === 200) {
            results += data.toString();
          } else {
            req.emit('error in resources()', new Error(res.statusCode + ": " + httpClient.STATUS_CODES[res.statusCode]));
          }
        });
        res.on('end', function () {
          try {
            callback(JSON.parse(results));
          } catch (err) {
            callback(err)
          }
        });
      });
      
      req.on('error', function(err) {
        console.log(chalk.red(err));
      });
    };

    this.resourceAttributes = function (resource, callback) {
      var req, attrs = '', resources = [];
      req = request('GET', _this._paths.get_resource({
        project: options.project,
        resource: resource
      }), {
        user: options.user,
        password: options.password
      }, function(res){
        
        res.on('data', function(data) {

          if(parseInt(res.statusCode) !== 200) {
            if(parseInt(res.statusCode) === 404){
              attrs = '{}'
              req.end();
            }else{
              req.emit('error in resources()', new Error(res.statusCode + ": " + httpClient.STATUS_CODES[res.statusCode]));
            }
          }else{
            attrs += data.toString('utf8');
          }
        });

        res.on('end', function(){

          if(attrs){
            callback(JSON.parse(attrs));
          }else{
            req.emit('error in resources()', new Error("Invalid data"));
          }
          return attrs;
        });
      });

      req.on('error', function(err){
        buffer.emit('Error checking a resource: ', new gutil.PluginError({
            plugin: 'gulp-transifex',
            message: "Invalid data"
          }));
      })
    };

    this.isNewer = function (file, callback) {
      var resource='', remoteDate = '', returnValue, newFile = false;
      resource = path.basename(file.path).replace(/\./,'');
      async.series([
        function (cb) {
          _this.resourceAttributes(resource, function(data) {
            if(data && data.last_update){
              remoteDate =  new Date(Date.parse(data.last_update));
            }else{

              newFile = true;
            }
            cb();
          });
        }, function(cb){
          if(!file.isNull()){
            localDate = file.stat.mtime
          }
          returnValue = localDate > remoteDate

          if(callback){
            callback(returnValue  || newFile)
          }
          return returnValue  || newFile
          cb()
        }
      ], function(err, results){
        return results
      })
    }

    this.languages = function(opt, callback) {
      var req, request_options;
      if(typeof opt == "function"){
        if(callback == null) {
          callback = opt;
        }
        opt = {
          use_custom_language_codes:false,
          language_codes_as_objects:false
        }
      }
      options = util._extend(options, opt)
      request_options = {
        host: _this._paths.host,
        port: '80',
        path: _this._paths.get_languages({
          project: options.project
        }),
        method: 'GET',
        auth: options.user + ':' + options.password
      };
      req = request('GET', this._paths.get_languages({
        project: options.project
      }), {
        user: options.user,
        password: options.password
      }, function(res) {
         var languages = '';
         res.on('data', function(data) {
          if (parseInt(res.statusCode) === 200) {
            languages += data.toString('utf8')
          } else {
            req.emit('error in languages()', new Error(res.statusCode + ": " + httpClient.STATUS_CODES[res.statusCode]));
          }
        });
        res.on('end', function(){
          languages = JSON.parse(languages);
          languages = languages.map(function(elm, idx, langs) {
            var langObj = {};
            if(options.custom_language_codes && options.custom_language_codes[elm.language_code] && options.use_custom_language_codes){
              if(options.language_codes_as_objects){
                isoCode = elm.language_code
                customCode = options.custom_language_codes[elm.language_code]
                langObj[isoCode] = customCode
                return langObj
              }
              return options.custom_language_codes[elm.language_code];
            }else {
              return elm.language_code
            }
          });
          callback(languages);
        })
      });
      
      req.on('error', function(err) {
        console.log(chalk.red(err));
      });
      
      req.end();
    };
    this.pushResource = function(callback) {
      var buffer;

      return buffer = through.obj((function(file, enc, cb) {
        var data, msg, req, request_options, isNewer = true;
        buffer.setMaxListeners(0);
        if (file.isNull() || file.isDirectory()) {
          cb();
          return;
        }
        if (file.isStream()) {
          buffer.emit('error uploading a resource: ', new gutil.PluginError({
            plugin: 'gulp-transifex',
            message: "Streams not supported"
          }));
          cb();
          return;
        }

        if (file.isBuffer() && path.extname(file.path) === '.po') {
          async.series([
            function(cbSync) {
              _this.isNewer(file, function(results){
                isNewer = results
                cbSync();
              });
              
              
            }, function(cbSync){
              if(!isNewer){
                gutil.log(chalk.blue("Newer version of ")+chalk.magenta(path.basename(file.path))+chalk.blue(" on the server. No operation done"));
                buffer.push(file);
                cb();
              }else{
                data = {
                  content: file.contents.toString('utf8')
                };
                data = JSON.stringify(data);
                request_options = {
                  host: _this._paths.host,
                  port: '80',
                  path: _this._paths.update_resource({
                    project: options.project,
                    resource: path.basename(file.path, '.po') + 'po'
                  }),
                  method: 'PUT',
                  auth: options.user + ':' + options.password,
                  headers: {
                    "content-type": "application/json",
                    "content-length": Buffer.byteLength(data)
                  }
                };
                req = httpClient.request(request_options);
                
                gutil.log(chalk.white("updating: ") + chalk.magenta(path.basename(file.path)));
                
                msg = '';
                req.on('response', function(res) {
                  if (parseInt(res.statusCode) === 200) {
                    msg = chalk.green('✔ ') + chalk.magenta(path.basename(file.path)) + chalk.blue(' Uploaded successful');
                    cb();
                  } else {
                    if (parseInt(res.statusCode) === 404 || parseInt(res.statusCode) === 400) {
                      data = {
                        content: file.contents.toString('utf8'),
                        name:path.basename(file.path),
                        slug:path.basename(file.path).replace(/\./,''),
                        i18n_type:'PO'
                      };
                      data = JSON.stringify(data);
                      request_options = {
                        host: _this._paths.host,
                        port: '80',
                        path: _this._paths.get_or_create_resources({
                          project: options.project
                        }),
                        method: 'POST',
                        auth: options.user + ':' + options.password,
                        headers: {
                          "content-type": "application/json",
                          "content-length": Buffer.byteLength(data)
                        }
                      };
                      req2 = httpClient.request(request_options);
                      msg = chalk.white("Creating new Resource: ") + chalk.blue(path.basename(file.path))
                      req2.on('response', function(res){
                        var msg = "Uploading";
                        if (parseInt(res.statusCode) === 201) {
                          msg = chalk.green('✔ ') + chalk.blue('Upload successful');
                        } else {
                          msg = chalk.red('✘ ') + chalk.white('Error creating new resource ') +chalk.magenta(path.basename(file.path)) + ': ' + chalk.white(httpClient.STATUS_CODES[res.statusCode]);
                          buffer.emit('Error:', new gutil.PluginError({
                            plugin: 'gulp-transifex',
                            message: msg,
                            fileName: file.path
                          }));
                          cb();
                        }
                        req2.end();
                        gutil.log(msg);
                      });
                      req2.on('error', function(err) {
                        req.end();
                        buffer.emit('error ', new gutil.PluginError({
                          plugin: 'gulp-transifex',
                          message: err,
                          fileName: file.path
                        }));
                      });
                      req2.write(data);
                    } else {
                      msg = chalk.red('✘ ') + chalk.blue('Error: ' + httpClient.STATUS_CODES[res.statusCode]);
                      buffer.emit('error in pushResources ', new gutil.PluginError({
                        plugin: 'gulp-transifex',
                        message: msg,
                        fileName: file.path
                      }));
                    }
                  }
                  gutil.log(msg);
                  if(callback!=null){
                    callback()
                  }
                });
                
                req.on('error', function(err) {
                  req.end();
                  buffer.emit('error in pushResources ', new gutil.PluginError({
                    plugin: 'gulp-transifex',
                    message: err,
                    fileName: file.path
                  }));
                });
                req.write(data);
              }
            }
          ], function(err, results){
            buffer.push(file);
            cb()
          });
        }
      }), function(cb) {
        console.log(callback.toString());
        if (callback != null) {

          callback();
        }
        cb();
      });
    };
    this.createNewResource = function(callback) {
      var buffer;
      return buffer = through.obj((function(file, enc, cb) {
              console.log("creating: ", file.path);
              buffer.setMaxListeners(0);
              var data, req, request_options;
              if (file.isNull() || file.isDirectory()) {
                cb();
                return;
              }
              if (file.isStream()) {
                buffer.emit('error creating new resource: ', new gutil.PluginError('gulp-transifex', "Error", {
                  message: "Streams not supported"
                }));
                cb();
                return;
              }
              if (file.isBuffer() && path.extname(file.path) === '.po') {
      
                data = {
                  content: file.contents.toString('utf8'),
                  name: path.basename(file.path),
                  slug: path.basename(file.path, '.po') + 'po',
                  i18n_type: 'PO'
                };
                data = JSON.stringify(data);
                request_options = {
                  host: _this._paths.host,
                  port: '80',
                  path: _this._paths.get_or_create_resources({
                    project: options.project
                  }),
                  method: 'POST',
                  auth: options.user + ':' + options.password,
                  headers: {
                    "Content-type": "application/json",
                    "Content-length": data.length
                  }
                };
      
                req = httpClient.request(request_options);
                
                req.on('response', function(res){
                  var msg = "Uploading";
                  if (parseInt(res.statusCode) === 201) {
                    msg = chalk.green('✔ ') + chalk.blue('Upload successful');
                  } else {
                    msg = chalk.red('✘ ') + chalk.white('Error creating new resource ') +chalk.magenta(path.basename(file.path)) + ': ' + chalk.white(httpClient.STATUS_CODES[res.statusCode]);
                    buffer.emit('', new gutil.PluginError({
                      plugin: 'gulp-transifex',
                      message: msg,
                      fileName: file.path
                    }));
                  }
                  req.end();
                  gutil.log(msg);
                  buffer.push(file);
                });
                
                req.on('error', function(err) {
                  req.end();
                  buffer.emit('error ', new gutil.pluginError({
                    plugin: 'gulp-transifex',
                    message: err,
                    fileName: file.path
                  }));
                });
                req.write(data);
              }
            }), function(cb) {
        if (callback != null) {
          callback();
        }
        cb();
      });
    };
    this.pullResource = function(callback) {
      var buffer;
      
      return buffer = through.obj((function(file, enc, cb) {
        var languages, request_options;
        
        if (file.isNull()) {
          buffer.emit('error downloading a translation', new gutil.PluginError({
            plugin: 'gulp-transifex',
            message: "Null files are not supported"
          }));
          cb();
          return;
        }
        if (file.isStream()) {
          buffer.emit('error downloading a translation', new gutil.PluginError({
            plugin: 'gulp-transifex',
            message: "Streams not supported"
          }));
          cb();
          return;
        }
        if (file.isBuffer() && path.extname(file.path) === '.po') {
          request_options = {
            host: _this._paths.host,
            port: '80',
            method: 'GET',
            auth: options.user + ':' + options.password
          };
          languages = _this.languages({use_custom_language_codes:true, language_codes_as_objects:true},function(data) {
            data.forEach(function(elm, idx, lst) {
              var file_name, langIso, langCustomCode, local_path, op, output, req;
              console.log(elm)
              for (k in elm){
                langIso = k
                langCustomCode = elm[k]
              }
              op = '';
              local_path = path.resolve(_this._paths.local_path + '/' + langCustomCode);
              file_name = local_path + '/' + path.basename(file.path);
              request_options.path = _this._paths.get_or_create_translation({
                resource: path.basename(file.path, '.po') + 'po',
                language: langIso
              });
              console.log(local_path);
              console.log(request_options.path)
              req = httpClient.get(request_options, function(res) {
                gutil.log(chalk.white('Downloading file: ') + chalk.blue(path.basename(file.path)));
                
                res.on('data', function(data) {
                  if (parseInt(res.statusCode) !== 200) {
                    if (parseInt(res.statusCode) === 404) {
                      gutil.log(chalk.red('✘ ') + chalk.blue(request_options.path) + chalk.white("Does not exist"));
                      buffer.push(file);
                      return cb();
                    } else {
                      buffer.emit('error downloading a translation', new gutil.PluginError({
                        plugin: 'gulp-transifex',
                        message: res.statusCode + ": " + httpClient.STATUS_CODES[res.statusCode]
                      }));
                    }
                  }
                  return op += data;
                });
                
                return res.on('end', function() {
                  gutil.log(chalk.green('✔ ') + chalk.blue(path.basename(file.path))) + chalk.white('Downloaded: ');
                  try {
                    data = JSON.parse(op).content;
                    output.write(data);
                    buffer.push(file);
                    cb();
                  } catch (e) {
                    output.end();
                    buffer.emit('error downloading a translation', new gutil.PluginError({
                        plugin: 'gulp-transifex',
                        message: res.statusCode + ": " + httpClient.STATUS_CODES[res.statusCode]
                      }));
                  }
                  output.end();
                  req.end();
                  if(callback!=null){
                    callback()
                  }
                });
              });
              if (!fs.existsSync(local_path)) {
                fs.mkdirSync(local_path);
              }

              output = fs.createWriteStream(file_name);
              
              req.on('error', function(err) {
                return buffer.emit('error error downloading a translation', new gutil.PluginError({
                  plugin: 'gulp-transifex',
                  message: err,
                  fileName: file.path
                }));
              });
            });
          });
          
        }

      }), function(cb) {
        if (callback) {
          callback();
        }
        gutil.log("File saved");
        cb();
      });
    };
    return _this;
  }
};