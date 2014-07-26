var should = require("should");
var transifex = require("../transifex");
var fs = require('fs');

describe('Transifex', function(){
  describe('#createClient()', function(){
    
    it('should return an object', function() {
      var client = transifex.createClient();
      client.should.be.type('object')
    });
    
  });
  
  describe('#path', function() {
    var client = transifex.createClient({
      project:'marcoslhc_personal'
    });
    
    it('should return an object', function(){
      client.paths.should.be.type('object')
    });
    
    it('should return the resources path as string', function(){
      client.paths.get_resources().should.be.a.String;
      client.paths.get_resources().should.eql('/api/2/project/marcoslhc_personal/resources/');
    });
    
  });
  
  describe('#listResources()', function(){
    it('shold return the data', function(done){
      var client = transifex.createClient({
        project:'marcoslhc_personal'
      });
      client.resources(function(data) {
        data.should.be.an.Array
        done()
      })
    });
  });

  describe('#pushResources()', function() {
    it('should', function(done){
      var client = transifex.createClient({
        project:'marcoslhc_personal'
      });
      fs.createReadStream('/Users/marcoslhc/Documents/Projects/marcoslhc.github.com/locale/eng/LC_MESSAGES/accounts.po')
        .pipe(client.push(function(){
          done()
        })
      );
      
    })
  });
  
  describe('#updateResource()', function() {

  });
  
  describe('#createNewResource()', function() {

  });
})