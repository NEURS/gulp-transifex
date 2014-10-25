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
async = require('async'),
mkdirp = require('mkdirp');

module.exports = {
	createClient: function (options) {
		var _this;
		_this = this;
		options = util._extend({}, options || {});
		_this._paths = paths(options);
		this.resources = function (callback) {
			var req, results='';

			req = request('GET', _this._paths.get_or_create_resources({
				project: options.project
			}), {
				user: options.user,
				password: options.password
			}, function (res) {
				res.setEncoding('utf8');
				res.on('data', function (data) {
					if (parseInt(res.statusCode) === 200) {
						results += data.toString();
					} else {
						req.emit('error', new Error(res.statusCode + ": " + httpClient.STATUS_CODES[res.statusCode] + " reaching the project"));
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

			req.on('error', function (err) {
				throw new gutil.PluginError ({
					plugin: "gulp-transifex",
					message: chalk.red(err)
				});
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
			}, function (res) {

				res.on('data', function (data) {
					if (parseInt(res.statusCode) < 200 || parseInt(res.statusCode)>=400) {
						if (parseInt(res.statusCode) === 404){
							attrs = '{}'
							req.end();
						} else {
							req.emit('error', new Error(res.statusCode + "in resourceAttributes(): " + httpClient.STATUS_CODES[res.statusCode]));
						}
					} else {
						attrs += data.toString('utf8');
					}
				});

				res.on('end', function () {

					if (attrs){
						callback(JSON.parse(attrs));
					} else {
						req.emit('error', new Error("Invalid data"));
					}
					return attrs;
				});
			});

			req.on('error', function (err) {
				req.emit('error', new gutil.PluginError({
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
					_this.resourceAttributes(resource, function (data) {
						if (data && data.last_update) {
							remoteDate =  new Date(Date.parse(data.last_update));
						} else {

							newFile = true;
						}
						cb();
					});
				}, function (cb) {
					if (!file.isNull()) {
						localDate = file.stat.mtime
					}
					returnValue = localDate > remoteDate

					if (callback) {
						callback(returnValue  || newFile)
					}
					return returnValue  || newFile
					cb()
				}
			], function (err, results) {
				return results
			})
		}

		this.languages = function (opt, callback) {
			var req, request_options;
			if (typeof opt == "function") {
				if (callback == null) {
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
			}, function (res) {
				 var languages = '';
				 res.on('data', function (data) {
					if (parseInt(res.statusCode) === 200) {
						languages += data.toString('utf8')
					} else {
						res.emit('error', new Error(res.statusCode + " in languages(): " + httpClient.STATUS_CODES[res.statusCode]));
					}
				});
				res.on('error', function (err) {
					throw new gutil.PluginError({
						plugin: 'gulp-transifex',
						message: err.message
					})
				});
				res.on('end', function () {
					try {
						languages = JSON.parse(languages);
					} catch (err) {
						res.emit('error', new Error(err));
					}

					languages = languages.map(function (elm, idx, langs) {
						var langObj = {};
						if (options.custom_language_codes && options.custom_language_codes[elm.language_code] && options.use_custom_language_codes) {
							if (options.language_codes_as_objects) {
								isoCode = elm.language_code
								customCode = options.custom_language_codes[isoCode] || isoCode
								langObj[isoCode] = customCode
								return langObj
							}
							return options.custom_language_codes[elm.language_code];
						} else {
							return elm.language_code
						}
					});
					callback(languages);
				})
			});

			req.on('error', function (err) {
				throw new gutil.PluginError({
						plugin: 'gulp-transifex',
						message: err.message
					})
			});

			req.end();
		};
		this.pushResource = function (callback) {
			var buffer;

			return buffer = through.obj((function (file, enc, cb) {
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
						function (cbSync) {
							_this.isNewer(file, function (results) {
								isNewer = results
								cbSync();
							});
						}, function (cbSync) {
							if (!isNewer) {
								gutil.log(chalk.blue("Newer version of ")+chalk.magenta(path.basename(file.path))+chalk.blue(" on the server. No operation done"));
								cbSync();
							} else {
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
								req.on('response', function (res) {

									if (parseInt(res.statusCode) < 200 || parseInt(res.statusCode) >= 400) {

										if (parseInt(res.statusCode) === 404) {

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
											req2.on('response', function (res) {
												var msg = "Uploading";
												if (parseInt(res.statusCode) === 201) {
													msg = chalk.green('✔ ') + chalk.blue('Upload successful');
												} else {
													gutil.log(req2.statusCode);
													gutil.log(req2._headers.host);
													gutil.log(req2._header);
													msg = chalk.red('✘ ') + chalk.white('Error creating new resource ') +chalk.magenta(path.basename(file.path)) + ': ' + chalk.white(httpClient.STATUS_CODES[res.statusCode]);
													req2.emit('Error:', new gutil.PluginError({
														plugin: 'gulp-transifex',
														message: msg,
														fileName: file.path
													}));
												}
												res.on('close', function () {
													gutil.log(msg);
													cbSync();
												});
											});
											req2.on('error', function (err) {
												req.emit('err');
											});
											req2.end(data);
										} else {
											gutil.log(res.statusCode);
											gutil.log(req._headers.host);
											gutil.log(req._header);

											msg = chalk.red('✘ ') + chalk.blue('Error: ' + httpClient.STATUS_CODES[res.statusCode] + chalk.magenta(" " +path.basename(file.path)));

											buffer.emit('error in pushResources ', new gutil.PluginError({
												plugin: 'gulp-transifex',
												message: msg,
												fileName: file.path
											}));
										}
										res.on('data', function (d) {
											cbSync();
										})
										return;
									} else {
										msg = chalk.green('✔ ') + chalk.magenta(path.basename(file.path)) + chalk.blue(' Uploaded successful');
									}
									res.on('data', function (d) {
										var mod = false;
										results = JSON.parse(d.toString());

										for(i in results) {
											if (results[i] >0) {
												mod = true;

												gutil.log(chalk.blue(i) + chalk.green(i))
											}
										}
										if (!mod) {
											gutil.log(chalk.blue("no changes done"));
										}

										gutil.log(msg);
										cbSync();
									});
								});

								req.on('error', function (err) {
									cbSync(err);
								});
								req.end(data);
							}
						}
					],
					function (err, results) {
						if (err) {
							gutil.log(chalk.red(err))
						}
						buffer.push(file);
						if (callback != null) {
							callback();
						}
						cb();
					});
				}
			}), function (cb) {
				cb();
			});
		};
		this.createNewResource = function (callback) {
			var buffer;
			return buffer = through.obj((function (file, enc, cb) {
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

								req.on('response', function (res) {
									var msg = "Uploading";
									if (parseInt(res.statusCode) === 201) {
										msg = chalk.green('✔ ') + chalk.blue('Upload successful');
									} else {
										gutil.log(req.statusCode);
										gutil.log(req._headers.host);
										gutil.log(req._header);
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

								req.on('error', function (err) {
									req.end();
									gutil.log(err)
								});
								req.write(data);
							}
						}), function (cb) {
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
					buffer.emit('error', new gutil.PluginError({
						plugin: 'gulp-transifex',
						message: "Null files are not supported"
					}));
					cb();
					return;
				}

				if (file.isStream()) {
					buffer.emit('error', new gutil.PluginError({
						plugin: 'gulp-transifex',
						message: "Streams not supported"
					}));
					cb();
					return;
				}

				if (file.isBuffer()) {
					request_options = {
						host: _this._paths.host,
						port: '80',
						method: 'GET',
						auth: options.user + ':' + options.password
					};

					languages = _this.languages({
						use_custom_language_codes:options.use_custom_language_codes,
						language_codes_as_objects:options.language_codes_as_objects
					},function(data) {
						data.forEach(function(elm, idx, lst) {
							var file_name, langIso, langPath, local_path, op, output, req;

							if (options.use_custom_language_codes && options.language_codes_as_objects) {

								for (k in elm){
									langIso = k
									langPath = elm[k]
								}

							} else {
								langIso = langPath = elm;
							}

							op = '';
							local_path = _this._paths.local_path.split('*');

							if(local_path.length > 1 && local_path.length < 3) {
								local_path = sprintf('./%(language_root)s/%(language)s/%(language_tail)s/', {
									language_root: local_path[0],
									language: langPath,
									language_tail:local_path[1]
								});
							} else {
								local_path = sprintf('./%(language_root)s/%(language)s/', {
									language_root: local_path[0],
									language: langPath
								});
							}

							request_options.path = _this._paths.get_or_create_translation({
								resource: path.basename(file.path).replace(/[^a-z0-9_-]/ig, ''),
								language: langIso
							});

							req = httpClient.get(request_options, function(res) {
								gutil.log(chalk.white('Downloading file: ') + chalk.blue(path.basename(file.path)));

								res.on('data', function(data) {
									if (parseInt(res.statusCode) !== 200) {
										if (parseInt(res.statusCode) === 404) {
											gutil.log(chalk.red('✘ ') + chalk.blue(request_options.path) + chalk.white("Does not exist"));
											buffer.push(file);
											return cb();
										} else {
											res.emit('error', new gutil.PluginError({
												plugin: 'gulp-transifex',
												message: res.statusCode + "in pullResource()[data]: " + httpClient.STATUS_CODES[res.statusCode]
											}));
										}
									}
									op += data;
								});

								res.on('error', function(err) {
									gutil.log(err)
								});

								res.on('end', function() {
									gutil.log(chalk.green('✔ ') + chalk.blue(path.basename(file.path))) + chalk.white('Downloaded: ');
									try {
										data = JSON.parse(op).content;
										output.write(data);
										output.end();
										buffer.push(file);
									} catch (e) {
										output.end();
										res.emit('error', new gutil.PluginError({
												plugin: 'gulp-transifex',
												message: res.statusCode + " in pullResource()[end]: " + httpClient.STATUS_CODES[res.statusCode]
											}));
									}
									req.end();

									output.on('finish', function () {
										setTimeout(cb, 500);

										if(callback!=null){
											callback()
										}
									});
								});
							});

							local_path = path.resolve(local_path);
							file_name    = local_path + '/' + path.basename(file.path).replace('.pot', '.po');

							if (!fs.existsSync(local_path)) {
								mkdirp.sync(local_path);
							}

							output = fs.createWriteStream(file_name);

							req.on('error', function(err) {
								gutil.log(err);
								buffer.push(file);
								cb();
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
