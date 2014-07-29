var should = require("should");
var transifex = require("../index.js");
var fs = require('fs');
var gutil = require('gulp-util');
var path = require('path')

var config = require('../config.json');
var env = config.env
var options = {
    host: config.transifex.host,
    base_path: config.transifex.base_path,
    local_path: config.transifex.local_path,
    user: config.transifex[env].user,
    password: config.transifex[env].password,
    project: config.transifex[env].project
};

describe('Transifex', function(){

    describe('#createClient()', function(){

	it('should return an object', function() {
	    var client = transifex.createClient(options);
	    client.should.be.type('object')
	});

    });

    describe('#_path', function() {
      var client = transifex.createClient(options);

      it('should return an object', function(){
	client._paths.should.be.type('object')
      });

      it('should return the resources path as string', function(){
	client._paths.get_or_create_resources().should.be.a.String;
	client._paths.get_or_create_resources().should.eql('/api/2/project/marcoslhc_personal/resources/');
      });
      it('should return the languages paths as string', function(){
	client._paths.get_languages().should.be.a.String;
	client._paths.get_languages().should.eql('/api/2/project/marcoslhc_personal/languages/');
      })

    });

    describe('#listResources()', function(){
      it('should return the data', function(done){
	var client = transifex.createClient(options);
	client.resources(function(data) {
	  data.should.be.an.Array
	  console.log(data);
          done()
	})
      });
    });
  
    describe('#listLanguages()', function(){
	it('should return the data', function(done) {
	    var client = transifex.createClient(options);
	    client.languages(function(data){
		data.should.be.an.Array
		console.log(data);
		done()
	    })
	})
    })

    describe('#pushResources()', function() {

	it('should upload the resource', function(done){
	    var client = transifex.createClient(options);
	    file = new gutil.File({
		path: path.resolve(__dirname, '../fixture.po'),
		contents: fs.readFileSync(path.resolve(__dirname, '../fixture.po'))
	    });
	    client.pushResource(function(data) {
		done()
	    }).write(file);
	});

    });

    describe('#pullResource()', function() {

	it('should upload the resource', function(done){
	    var client = transifex.createClient(options);
	    file = new gutil.File({
		path: path.resolve(__dirname, '../fixture.po'),
		contents: fs.readFileSync(path.resolve(__dirname, '../fixture.po'))
	    });
	    client.pullResource(function(data) {
		done()
	    }).write(file);
	});

    });
})