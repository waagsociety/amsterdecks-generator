var express = require('express'),
    http = require('http'),
    path = require('path'),
    bodyParser = require('body-parser'),
    gzippo = require('gzippo');

//var applyRoutes = require('./hoprouter.js').applyRoutes;

module.exports = {
  init: function(options, vfg, callback){
  	var app = express();

	app.set('views', __dirname + '/jade');
	app.set('view engine', 'jade');

	app.use(bodyParser.urlencoded());

	//app.use(require('less-middleware')(__dirname + '/public' ));
	app.use(express.static(path.join(__dirname, 'public')));
	//app.use(gzippo.staticGzip(path.join(__dirname, 'public'), { contentTypeMatch: /text|javascript|json|svg|ttf|otf|css/ }));

	app.use(function setLocals(req, res, next){
		res.locals.vfg = vfg;
		next();
	});

	app.get('/', function(req, res){
		res.render('index');
	});

	app.get('/status', function(req, res){
		res.render('status');
	});

	app.get('/polygons', function(req, res){
		res.render('polygons');
	});

	app.get('/views', function(req, res){
		res.render('views');
	});

	app.get('/views/new', function(req, res){
		res.render('views-new');
	});

	app.post('/views/new', function(req, res){
		vfg.create(req.body);
		res.redirect('/views/' + req.body.name);
	});

	app.get('/views/:name/show', function(req, res){
		res.render('views-show', { name: req.params.name });
	});

	app.get('/views/:name/edit', function(req, res){
		res.render('views-new', { name: req.params.name });
	});

	app.get('/views/:name', function(req, res){
		res.render('view', { name: req.params.name });
	});


	app.get('/grid', function(req, res){
		var grid = vfg.createGridPreview(req.query);
		res.json({
			dLngM: grid.dLngM,
			dLatML: grid.dLatM,
			dLng: grid.dLng,
			dLat: grid.dLat,
			area: grid.area,
			lngMpD: grid.lngMpD,
			lngDpM: grid.lngDpM,
			latMpD: grid.latMpD,
			latDpM: grid.latDpM,
			dimsX: grid.dimsX,
			dimsY: grid.dimsY
		});
	});

    // app.configure(function(){
    //   app.set('port', process.env.PORT || options.port || 3000);
    
    //   //app.use(express.favicon());
    //   app.use(express.logger('dev'));
    //   app.use(express.methodOverride());
    //   app.use(express.cookieParser(options.secret || 'your secret here'));
    //   app.use(express.session());
    //   app.use(function setLocals(req, res, next){
    //     res.locals.loggedOn = req.session.loggedOn;
    //     res.locals.isAjax = req.headers['x-requested-with'] && req.headers['x-requested-with'] === 'XMLHttpRequest';
    //     next();
    //   });
    //   app.use(app.router);

    // });

    var server = app.listen(3000, function(){
    	var address = server.address();
      console.log("Express server listening");
      console.log(address);
    });

    callback(app, server);
  }
};
