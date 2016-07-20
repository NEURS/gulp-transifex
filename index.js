'use strict';
var chalk, fs, gutil, httpsClient, path, paths, request, sprintf, through, util,
	async, mkdirp;

gutil = require('gulp-util');
through = require('through2');
chalk = require('chalk');
path = require('path');
request = require('./libs/request');
sprintf = require('sprintf');
util = require('util');
fs = require('fs');
paths = require('./libs/paths.js');
httpsClient = require('https');
async = require('async');
mkdirp = require('mkdirp');

module.exports = {
	createClient: function (options) {
		var _this;
		_this = this;
		options = util._extend({}, options || {});
		_this._paths = paths(options);
		this.resources = function (callback) {
			var req, results = '';

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
						req.emit('error', new Error(res.statusCode + ': ' +
						httpsClient.STATUS_CODES[res.statusCode] + ' reaching the project'));
					}
				});
				res.on('end', function () {
					try {
						callback(JSON.parse(results));
					} catch (err) {
						callback(err);
					}
				});
			});

			req.on('error', function (err) {
				throw new gutil.PluginError ({
					plugin: 'gulp-transifex',
					message: chalk.red(err)
				});
			});
		};

		this.resourceName = function(file) {
			if (typeof options.resource_name === 'function') {
				return options.resource_name(file);
			} else {
				return path.basename(file.path).replace(/\./, '');
			}
		};

		this.targetName = function(file, langIso) {
			if (typeof options.target_name === 'function') {
				return options.target_name(file, langIso);
			} else {
				const ext_name = path.extname(file.path);
				const file_name = path.basename(file.path, ext_name);

				if (ext_name === '.pot') {
					ext_name = '.po';
				}

				return file_name + ext_name;
			}
		};

		this.resourceAttributes = function (resource, callback) {
			var req, attrs = '';
			req = request('GET', _this._paths.get_resource({
				project: options.project,
				resource: resource
			}), {
				user: options.user,
				password: options.password
			}, function (res) {

				res.on('data', function (data) {
					if (parseInt(res.statusCode) < 200 ||
							parseInt(res.statusCode) >= 400) {
						if (parseInt(res.statusCode) === 404) {
							attrs = '{}';
							req.end();
						} else {
							req.emit('error', new Error(res.statusCode +
									'in resourceAttributes(): ' +
									httpsClient.STATUS_CODES[res.statusCode]));
						}
					} else {
						attrs += data.toString('utf8');
					}
				});

				res.on('end', function () {

					if (attrs) {
						callback(JSON.parse(attrs));
					} else {
						req.emit('error', new Error('Invalid data'));
					}
					return attrs;
				});
			});

			req.on('error', function (err) {
				req.emit('error', new gutil.PluginError({
						plugin: 'gulp-transifex',
						message: 'Invalid data: ' + err.message
					}));
			});
		};

		this.isNewer = function (file, callback) {
			var returnValue, localDate,
					resource = '',
					remoteDate = '',
					newFile = false;

			resource = _this.resourceName(file);
			async.series([
				function (cb) {
					_this.resourceAttributes(resource, function (data) {
						if (data && data.last_update) {
							remoteDate =  new Date(Date.parse(data.last_update));
						} else {

							newFile = true;
						}
						cb(null, {remoteDate: remoteDate, newFile: newFile});
					});
				}, function (cb) {
					if (!file.isNull()) {
						localDate = file.stat.mtime;
					}
					returnValue = localDate > remoteDate;
					cb(null, returnValue  || newFile);
				}
			], function (err, results) {
				callback(results[1]);
				return results;
			});
		};

		this.languages = function (opt, callback) {
			var req, request_options;
			if (typeof opt === 'function') {
				if (callback === undefined) {
					callback = opt;
				}
				opt = {
					use_custom_language_codes:false,
					language_codes_as_objects:false
				};
			}
			options = util._extend(options, opt);
			request_options = {
				host: _this._paths.host,
				port: '443',
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
						languages += data.toString('utf8');
					} else {
						res.emit('error', new Error(res.statusCode + ' in languages(): ' +
							httpsClient.STATUS_CODES[res.statusCode]));
					}
				});
				res.on('error', function (err) {
					throw new gutil.PluginError({
						plugin: 'gulp-transifex',
						message: err.message
					});
				});
				res.on('end', function () {
					try {
						languages = JSON.parse(languages);
					} catch (err) {
						res.emit('error', new Error(err));
					}

					languages = languages.map(function (elm) {
						var isoCode, customCode,
							langObj = {};

						if (options.custom_language_codes &&
								options.custom_language_codes[elm.language_code] &&
								options.use_custom_language_codes) {
							if (options.language_codes_as_objects) {
								isoCode = elm.language_code;
								customCode = options.custom_language_codes[isoCode] || isoCode;
								langObj[isoCode] = customCode;

								return langObj;
							}
							return options.custom_language_codes[elm.language_code];
						} else {
							return elm.language_code;
						}
					});

					callback(languages);

				});
			});

			req.on('error', function (err) {
				throw new gutil.PluginError({
						plugin: 'gulp-transifex',
						message: err.message
					});
			});

			req.end();
		};
		this.pushResource = function (callback) {
			var buffer;
			buffer = through.obj((function (file, enc, cb) {
				var data, msg, req, request_options, isNewer = true;

				buffer.setMaxListeners(0);

				if (file.isNull() || file.isDirectory()) {
					cb();

					return;
				}

				if (file.isStream()) {
					buffer.emit('error uploading a resource: ', new gutil.PluginError({
						plugin: 'gulp-transifex',
						message: 'Streams not supported'
					}));
					cb();

					return;
				}

				if (file.isBuffer()) {
					async.series([
						function (cbSync) {
							_this.isNewer(file, function (results) {
								isNewer = results;
								cbSync(null, isNewer);
							});
						}, function (cbSync) {
							if (!isNewer) {
								gutil.log(chalk.blue('Newer version of ') +
									chalk.magenta(path.basename(file.path)) +
									chalk.blue(' on the server. No operation done'));
								cbSync(null, isNewer);
							} else {
								data = {
									content: file.contents.toString('utf8')
								};
								data = JSON.stringify(data);
								request_options = {
									host: _this._paths.host,
									port: '443',
									path: _this._paths.update_resource({
										project: options.project,
										resource: _this.resourceName(file)
									}),
									method: 'PUT',
									auth: options.user + ':' + options.password,
									headers: {
										'content-type': 'application/json',
										'content-length': Buffer.byteLength(data)
									}
								};
								req = httpsClient.request(request_options);

								gutil.log(
									chalk.white('updating: ') +
									chalk.magenta(path.basename(file.path)));

								msg = '';
								req.on('response', function (res) {
									var req2;

									if (parseInt(res.statusCode) < 200 ||
											parseInt(res.statusCode) >= 400) {

										if (parseInt(res.statusCode) === 404) {

											data = {
												content: file.contents
													.toString('utf8'),
												name: path.basename(file.path)
													.replace(path.extname(file.path), ''),
												slug: _this.resourceName(file),
												i18n_type: options.i18n_type
											};
											data = JSON.stringify(data);
											request_options = {
												host: _this._paths.host,
												port: '443',
												path: _this._paths.get_or_create_resources({
													project: options.project
												}),
												method: 'POST',
												auth: options.user + ':' + options.password,
												headers: {
													'content-type': 'application/json',
													'content-length': Buffer.byteLength(data)
												}
											};
											req2 = httpsClient.request(request_options);
											msg = chalk.white('Creating new Resource: ') +
														chalk.blue(path.basename(file.path));
											req2.on('response', function (res2) {
												var msg = 'Uploading';
												if (parseInt(res2.statusCode) === 201) {
													msg = chalk.green('✔ ') +
															chalk.blue('Upload successful');
												} else {
													msg += chalk.red('✘ ');
													msg += chalk.white('Error creating new resource ');
													msg += chalk.magenta(path.basename(file.path)) + ': ';
													msg += chalk.white(httpsClient.STATUS_CODES[res2.statusCode]);

													req2.emit('Error:', new gutil.PluginError({
														plugin: 'gulp-transifex',
														message: msg,
														fileName: file.path
													}));
												}
												res2.on('close', function () {
													gutil.log(msg);
													cbSync(null, res2);
												});
											});
											req2.on('error', function (err) {
												req.emit('err', err);
											});
											req2.end(data);
										} else {
											msg += chalk.red('✘ ');
											msg += chalk.blue('Error: ' +
														httpsClient.STATUS_CODES[res.statusCode]);
											msg += chalk.magenta(' ' +
											path.basename(file.path));

											buffer.emit('error in pushResources ',
												new gutil.PluginError({
													plugin: 'gulp-transifex',
													message: msg,
													fileName: file.path
											}));
										}

										res.on('data', function (data) {
											cbSync(null, data);
										});

										return;
									} else {
										msg = chalk.green('✔ ') +
										chalk.magenta(path.basename(file.path)) +
										chalk.blue(' Uploaded successful');
									}

									res.on('data', function (d) {
										var i, results,
											mod = false;

										results = JSON.parse(d.toString());

										for (i in results) {
											if (results[i] > 0) {
												mod = true;

												gutil.log(chalk.blue(i) + chalk.green(i));
											}
										}

										if (!mod) {
											gutil.log(chalk.blue('no changes done'));
										}

										gutil.log(msg);
										cbSync(null, results);
									});
								});
								req.end(data);
							}
						}
					],
					function (err, results) {

						if (err) {
							gutil.log(chalk.red(err));
						}

						buffer.push(file);

						if (callback) {
							callback();
						}

						cb();
					});
				}
			}), function (cb) {
				cb();
			});

			return buffer;
		};
		this.createNewResource = function (callback) {
			var buffer;
			buffer = through.obj(function (file, enc, cb) {
				buffer.setMaxListeners(0);
				var data, req, request_options;
				if (file.isNull() || file.isDirectory()) {
					cb();
					return;
				}
				if (file.isStream()) {
					buffer.emit('error creating new resource: ',
						new gutil.PluginError('gulp-transifex', 'Error', {
							message: 'Streams not supported'
					}));
					cb();
					return;
				}
				if (file.isBuffer()) {

					data = {
						content: file.contents.toString('utf8'),
						name: path.basename(file.path),
						slug: _this.resourceName(file.path),
						i18n_type: options.i18n_type
					};
					data = JSON.stringify(data);
					request_options = {
						host: _this._paths.host,
						port: '443',
						path: _this._paths.get_or_create_resources({
							project: options.project
						}),
						method: 'POST',
						auth: options.user + ':' + options.password,
						headers: {
							'Content-type': 'application/json',
							'Content-length': data.length
						}
					};

					req = httpsClient.request(request_options);

					req.on('response', function (res) {
						var msg = 'Uploading';
						if (parseInt(res.statusCode) === 201) {
							msg = chalk.green('✔ ') + chalk.blue('Upload successful');
						} else {
							msg += chalk.red('✘ ');
							msg += chalk.white('Error creating new resource ');
							msg += chalk.magenta(path.basename(file.path)) + ': ';
							msg += chalk.white(httpsClient.STATUS_CODES[res.statusCode]);
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
						gutil.log(err);
					});
					req.write(data);
				}
			}, function (cb) {
				if (callback !== null) {
					callback();
				}
				cb();
			});
			return buffer;
		};
		this.pullResource = function (callback) {
			var buffer;

			buffer = through.obj(function (file, enc, cb) {
				var languages, request_options;

				if (file.isNull()) {
					buffer.emit('error', new gutil.PluginError({
						plugin: 'gulp-transifex',
						message: 'Null files are not supported'
					}));
					cb();
					return;
				}

				if (file.isStream()) {
					buffer.emit('error', new gutil.PluginError({
						plugin: 'gulp-transifex',
						message: 'Streams not supported'
					}));
					cb();
					return;
				}

				if (file.isBuffer()) {
					request_options = {
						host: _this._paths.host,
						port: '443',
						method: 'GET',
						auth: options.user + ':' + options.password
					};

					languages = _this.languages({
						use_custom_language_codes:options.use_custom_language_codes,
						language_codes_as_objects:options.language_codes_as_objects
					}, function (data) {
						async.each(data, function (elm, callback) {
							var k, file_name, ext_name, langIso, langPath, local_path, op, output, req;

							if (options.use_custom_language_codes &&
									options.language_codes_as_objects) {

								for (k in elm){
									langIso = k;
									langPath = elm[k];
								}

							} else {
								langIso = langPath = elm;
							}

							op = '';
							local_path = _this._paths.local_path.split('*');

							if (local_path.length > 1 && local_path.length < 3) {
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
								resource: _this.resourceName(file),
								language: langIso
							});
							req = httpsClient.get(request_options, function (res) {
								gutil.log(chalk.white('Downloading file: ') +
									chalk.blue(path.basename(file.path)));

								res.setEncoding('utf8');
								res.on('data', function (data) {
									if (parseInt(res.statusCode) !== 200) {
										if (parseInt(res.statusCode) === 404) {
											gutil.log(chalk.red('✘ ') +
												chalk.blue(request_options.path) +
												chalk.white('Does not exist'));
											buffer.push(file);
											return callback();
										} else {
											res.emit('error', new gutil.PluginError({
												plugin: 'gulp-transifex',
												message: res.statusCode + 'in pullResource()[data]: ' +
													httpsClient.STATUS_CODES[res.statusCode]
											}));
										}
									}
									op += data;
								});

								res.on('error', function (err) {
									gutil.log(err);
									return callback(err);
								});

								res.on('end', function () {
									var data, target;

									target = path.resolve(local_path, _this.targetName(file, langIso));
									if (!fs.existsSync(path.dirname(target))) {
										mkdirp.sync(path.dirname(target));
									}
									output = fs.createWriteStream(target);

									output.on('finish', function () {
										buffer.push(file);
										return callback();
									});

									gutil.log(chalk.green('✔ ') +
										chalk.blue(langIso, path.basename(file.path)) +
										' ' + chalk.white('Downloaded: '));
									try {
										data = JSON.parse(op).content;
										output.write(data);
										output.end();
									} catch (e) {
										buffer.emit('error', new gutil.PluginError({
												plugin: 'gulp-transifex',
												message: res.statusCode +
													' in pullResource()[end]: ' +
													httpsClient.STATUS_CODES[res.statusCode]
										}));
										output.end();
									}
								});
							});

							req.on('error', function (err) {
								gutil.log(err);
								buffer.push(file);
								callback(err);
							});
						}, function (err) {
							cb();
						})
					});
				}
			}, function (cb) {
				if (callback) {
					callback();
				}
				cb();
			});
			return buffer;
		};
		return _this;
	}
};
