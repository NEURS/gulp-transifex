gulp-transifex
==============

Gulp plugin for uploading resources and downloading translations in Transifex

Usage
------

```javascript
var options = {
    host: <String optional. Defaults to 'www.transifex.com'>,
    base_path: <String optional. Defaults to '/api/2/project/'>,
    user: <String required. Transifex username>,
    password: <String required. Transifex Password>,
    project: <String required. Transifex project's name>,
    local_path: <String optional. Local root path for the translations>
}
```

Uploading Resource files:
-------------------------
gulp-transifex will go file by file uploading them to the project as a resource
Transifex will check if the file has changed and will store the changes

```javascript
var transifex = require('transifex').createClient(options)
var gulp = require('gulp')

gulp.task('upstream', function(){
    gulp.src('path/to/source/language/*')
        .pipe(transifex.pushResource())
})
```

Downloading translation files:
------------------------------
Similarly, for every resource file, gulp-transifex will check on the server for the languages and will start going to every file in each language and copy it in the local translation folder: `options.local_path`

```javascript
var transifex = require('transifex').createClient(options)
var gulp = require('gulp')

gulp.task('downstream', function(){
    gulp.src('path/to/source/language/*')
        .pipe(transifex.pushResource())
})
```

Other methods exposed
---------------------

There are other methods exposed that doesn't return streams but accepts callbacks:

###transifex.get_resources

Gets an array of resources in the project

```javascript
var transifex = require('transifex').createClient(options)

transifex.get_resources(function(data){
    ...
})
```

###transifex.get_resources

Gets an array of language codes in the project

```javascript
var transifex = require('transifex').createClient(options)

transifex.get_languages(function (data){
    ...
})
```

TODO
----

* Add local modifications check. If there's no local modifications, don't bother check the file in transifex
* Add updates check in translation files. If there ain't new translation why download the file.