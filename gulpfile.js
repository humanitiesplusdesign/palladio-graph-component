var gulp = require('gulp');

var merge = require('merge-stream');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var order = require('gulp-order');
var rename = require('gulp-rename');
var angularTemplates = require('gulp-angular-templates');

var palladioSources = [ "palladio-graph-view.js" ];
var palladioCSS = [ "palladio-graph-view.css" ];
var palladioTemplate = [ "template.html" ];

gulp.task('scripts', gulp.series(function (done) {
	var files = gulp.src(palladioSources)
		.pipe(concat('jsFiles.js'));

	var templates = gulp.src(palladioTemplate)
		.pipe(angularTemplates({ module: 'palladio', basePath: 'partials/palladio-graph-component' }))
		.pipe(rename('templates.tmpl'));

	merge(files, templates)
		.pipe(order(['*.js', '*.tmpl']))
        .pipe(concat('palladio-graph-component.js'))
        .pipe(gulp.dest('./dist/'))
        .pipe(uglify())
        .pipe(rename('palladio-graph-component.min.js'))
		.pipe(gulp.dest('./dist/'));
	
	done();
}));

gulp.task('css', gulp.series(function (done) {
	gulp.src(palladioCSS)
		.pipe(concat('palladio-graph-component.css'))
		.pipe(gulp.dest('./dist/'));
	
		done();
}));

// Watch Files For Changes
gulp.task('watch', function() {
  gulp.watch(palladioSources).on('change', gulp.series('scripts'));
  gulp.watch(palladioCSS).on('change', gulp.series('css'));
  gulp.watch(palladioTemplate).on('change', gulp.series('scripts'))
});

gulp.task('default', gulp.series('scripts','css','watch'));