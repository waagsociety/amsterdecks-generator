var fs = require('fs'),
	path = require('path'),
	_ = require('underscore'),
	async = require('async');

var QueueRunner = require('./queueRunner'),
	geomUtils = require('./lib/geomUtils'),
	grids = require('./lib/grids');

function addLogEntry(message){
	this.log.push({
		date: new Date(),
		message: message
	});
}

module.exports.createVectorGenerator = function(config){
	var vfg = {
			status: {},
			views: {},
			queue: [],
			create: createView,
			generate: generateView,
			createGridPreview: createGridPreview,
			log: [],
		},
		
		status = vfg.status;

	loadExistingViews(vfg, function(){
		async.parallel({
			polygons: _.partial(require('./polygons').load, vfg)
		}, function(err, results){
			if(err) vfg.log.push(err.message);
			vfg.polygons = results.polygons;
			status.polygons = results.polygons.length + ' polygons loaded';

			vfg.contaminators = require('./data/contaminators.json');

			vfg.queueRunner = new QueueRunner(vfg);
		});
	});

	return vfg;
};

function loadExistingViews(vfg, cb){
	fs.readdir('./views', function(err, dirnames){
		if(err){
			vfg.status.views = 'error loading views dir';
			return;
		}

		return async.each(dirnames, loadView, cb);

		function loadView(name, cb){
			if(name[0] === '.') return cb();

			var view = require('./views/' + name + '/view.json');
			
			vfg.views[view.name] = view;

			view.log = view.log || [];
			view.addLogEntry = addLogEntry;
			
			if(view.status === 'queued'){
				vfg.queue.push(view);
			}

			cb();
		}
	});
}

function createView(options){
	var view = {
			name: options.name,
			description: options.description,
			requested: new Date(),
			bounds: [[+options.minLngInput, +options.minLatInput], [+options.maxLngInput, +options.maxLatInput]],
			status: 'queued',
			resolution: +options.resolution,
			diskName: options.name.replace(' ', ''),
			contaminatorSize: options.contaminatorSize ? +options.contaminatorSize : 0,
			log: [],
			addLogEntry: addLogEntry
		};

	var variants = [];
	if(options.avg) variants.push('avg');
	if(options.wet) variants.push('wet');
	if(options.dry) variants.push('dry');
	if(variants.length) view.variants = variants;

	if(options.whitelist){
		view.whitelist = options.whitelist.split(',').map(function(str){ return str.trim(); });
	}

	if(options.borderfalloffdistance) view.borderFalloffDistance = +options.borderfalloffdistance;
	if(options.borderstraightdistance) view.borderStraightDistance = +options.borderstraightdistance;

	this.queue.push(view);
	this.views[view.name] = view;

	view.addLogEntry('added to queue');

	async.waterfall([
		createViewDir,
		createViewFile
	]);

	return view;

	function createViewDir(cb){
		fs.exists('./views/' + view.name, function(exists){
			if(exists) return cb();

			fs.mkdir('./views/' + view.name, cb);
		});
	}

	function createViewFile(cb){
		fs.writeFile('./views/' + view.name + '/view.json', JSON.stringify(view), cb);
	}
}

function generateView(view, vfg, cb){
	view.addLogEntry('started generating');
	console.log(view);
	var decoratedBounds = geomUtils.decorateBounds(view.bounds),
		grid = new grids.Grid({ bounds: decoratedBounds, resolution: view.resolution, variants: view.variants || ['avg', 'wet', 'dry'] });

	console.log(grid);

	var t = Date.now();
	var polygons = vfg.polygons;
	va = polygons.length;

	var pixelsRendered = 0;

	async.eachSeries(polygons, renderPolygonInGrid, finalize);

	function renderPolygonInGrid(polygon, cb){

		if(view.whitelist && view.whitelist.indexOf(polygon.properties.gml_id) === -1) return setImmediate(cb);

		grid.renderPointsInPolygon(polygon, view, function(lng, lat, direction, variant, n, cb){
			pixelsRendered++;

			var points = polygon.calculationPoints.slice(),
				totalDistance = 0,
				distances = {},
				relativeDistances = {},
				totalRelativeDistances = 0,
				vectors = {},
				V = [0, 0],
				interpolationTotal = 0,
				closestBorder,
				distRatio;

			// gather data and create vectors
			points.forEach(_.compose(getDistance, createVector));

			points.forEach(getRelativeDistance);

			// distribute data according to distance
			Object.keys(vectors).forEach(addVectorComponent);

			if(interpolationTotal > 1.000002 || interpolationTotal < 0.99999999) {
				console.log(interpolationTotal + ' but should be zero (' + polygon.properties.gml_id + ')');
				console.log({lng: lng, lat: lat}, points);
				process.exit();
			}

			/*
				to prevent particles from running into walls,
				reduce vector component towards all walls of polygon.

				to do so, store wall angle once on walls (wall start - wall end)
				
				for every wall of polygon:
					point angle = angle of wall start - point
					take sine of wall angle - point angle,
					multiply with start point of wall (the diagonal of the triangle)
					result is distance to wall

				throw if any distance < 0, fix distance formula (probably rotate 180)
				sort by distance take closest (if min value under treshold, else return V)

				then take vector [1,0] * reduction factor,
				and rotate it to match wall angle. multiply V with it. then rotate back

				performance cost: interesting?
			 */
			
			return cb(null, V);

			function getDistance(cp){
				var distance = Math.sqrt( //todo use real distance not pytha of latlng diffs
					Math.pow(lng - cp.coordinates[0], 2) +
					Math.pow(lat - cp.coordinates[1], 2)
				);
				
				totalDistance += distance;
				distances[cp.id] = distance;

				return cp;
			}

			function createVector(cp){
				var v = cp[direction][variant]['V' + n];
				vectors[cp.id] = [
					cp.uvx * v,
					cp.uvy * v
				];

				return cp;
			}

			function getRelativeDistance(cp){
				var relativeDistance = totalDistance / distances[cp.id];
				totalRelativeDistances += relativeDistance;
				relativeDistances[cp.id] = relativeDistance;
			}

			function addVectorComponent(id){
				var v = vectors[id],
					rd = relativeDistances[id],
					f = rd / totalRelativeDistances;

				V[0] += v[0] * f;
				V[1] += v[1] * f;

				interpolationTotal += f;
			}
		}, cb);
	}

	function finalize(err){
		view.status = 'finalizing';
		view.addLogEntry('starting png writes');
		var dt = Date.now() - t;
		console.log('grid rendered in ' + (dt / 1000) + 's, ' + (dt / pixelsRendered).toFixed(20) + 'ms per non empty pixel');

		return grid.exportPNGs('./views/' + view.diskName + '/', afterPNGWrites);

		function afterPNGWrites(err, meta){
			view.addLogEntry('starting clippath write');
			console.log('writing ./views/' + view.diskName + '/clip.js');
			var clip = polygons.filter(function(polygon){
				return geomUtils.getBoundsWithinBounds(grid.boundsArray, polygon.bounds);
			}).map( grid.makeShapeRelative.bind(grid) );
			fs.writeFileSync('./views/' + view.diskName + '/clip.js', 'clipPaths[\'' + view.diskName + '\'] = ' + JSON.stringify( clip ) ) + ';';

			console.log('writing ./views/' + view.diskName + '/contaminators.js');
			var contaminators = [],
				contaminatorSize = view.contaminatorSize / view.resolution;

			if(view.contaminatorSize){
				contaminators = vfg.contaminators.features.map(function(contaminator){
					return {
						position: grid.makeShapeRelative(contaminator),
						size: contaminatorSize,
						type: contaminator.properties.TYPE_KNOOP
					};
				}).filter(function(contaminator){
					var position = contaminator.position,
						size = contaminator.size;
					return position[0] + size > 0 && position[0] - size < grid.dimsX && position[1] + size > 0 && position[1] - size < grid.dimsY;
				});
			}

			fs.writeFileSync(
				'./views/' + view.diskName + '/contaminators.js',
				'contaminatorSets[\'' + view.diskName + '\'] = { size: ' + contaminatorSize + ', contaminators: ' + JSON.stringify(contaminators) + ' };'
			);

			view.addLogEntry('starting fieldInfo write');
			console.log('writing ./views/' + view.diskName + '/meta.js');
			fs.writeFileSync(
				'./views/' + view.diskName + '/meta.js',
				[ 'fieldInfos[\'' + view.diskName + '\'] = {',
				  '  x: ' + grid.dimsX + ',',
				  '  y: ' + grid.dimsY + ',',
				  '  bounds: ' + JSON.stringify(view.bounds) + ',',
				  '  diskName: \'' + view.diskName + '\',',
				  '  meta: ' + JSON.stringify(meta),
				'};'].join('\n')
			);

			console.log('done!');
			console.log(meta);
			view.status = 'complete';
			view.addLogEntry('completed');

			fs.writeFile('./views/' + view.name + '/view.json', JSON.stringify(view), cb);
		}
	}
}

function createGridPreview(query){
	var bounds = geomUtils.decorateBounds([[+query.minLng, +query.minLat], [+query.maxLng, +query.maxLat]]),
		resolution = query.resolution,
		grid = new grids.Grid({ bounds: bounds, resolution: resolution, variants: ['avg'] });
	
	return grid;
}