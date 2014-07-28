var should = require("should");
var transifex = require("../index.js");
var fs = require('fs');
var gutil = require('gulp-util');
var config = require('../config.json');
var path = require('path')
var env = config.env
var options = {
    host: config.transifex.host,
    base_path: config.transifex.base_path,
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
  
  /*
  describe('#path', function() {
      var client = transifex.createClient(options);
      
      it('should return an object', function(){
        client.paths.should.be.type('object')
      });
      
      it('should return the resources path as string', function(){
        client.paths.get_resources().should.be.a.String;
        client.paths.get_resources().should.eql('/api/2/project/marcoslhc_personal/resources/');
      });
      
    });*/
  
  
  describe('#listResources()', function(){
    it('shold return the data', function(done){
        console.log(config.transifex[env])
      var client = transifex.createClient(options);
      client.resources(function(data) {
        data.should.be.an.Array
        done()
      })
    });
  });

  describe('#pushResources()', function() {
    it('should', function(done){
      var client = transifex.createClient(options);
      file = new gutil.File({
          path: path.resolve(__dirname, '../fixture.po'),
          contents: fs.readFileSync(path.resolve(__dirname, '../fixture.po'))
      });
      console.log(file.contents.toString('utf8'))
      client.push(function() {
          done()
      }).write(file);
      
    })
  });
  
  describe('#updateResource()', function() {

  });
  
  describe('#createNewResource()', function() {

  });
})