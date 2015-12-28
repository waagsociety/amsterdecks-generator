var fs = require('fs'),
	async = require('async'),
	_ = require('underscore'),
	geomUtils = require('./lib/geomUtils'),
	termStyles = require('./lib/termStyles');

function opsomming(array){
	var copy = array.slice(),
		last = array.pop();

	return copy.join(', ') + ' and ' + last;
}

//var whitelist = config.polygon_whitelist_enabled ? config.polygon_whitelist : null;

//apply polygon whitelist
// if(whitelist && whitelist.length){
// 	datafiles.polygons.features = datafiles.polygons.features.filter(function(polygon){
// 		return ~whitelist.indexOf(polygon.properties.gml_id);
// 	});
// }


module.exports.load = function(vfg, cb){
	async.waterfall([
		_.partial(loadDataFiles, {
			polygons: './data/water.json',
			channels: './data/flow_channels.json',
			avg_in_points: './data/avg_in.json',
			avg_out_points: './data/avg_out.json',
			wet_in_points: './data/wet_in.json',
			wet_out_points: './data/wet_out.json',
			dry_in_points: './data/dry_in.json',
			dry_out_points: './data/dry_out.json',
		}, vfg),
		setVfgBounds,
		combineFlowPoints,
		populateChannels,
		populatePolygons
	], cb);
};

function loadDataFiles(paths, vfg, cb){
	var results = {
			datasets: {},
			vfg: vfg
		};

	vfg.status.polygons = 'loading data files';

	return async.each(_.pairs(paths), loadDataFile, _.partial(cb, _, results));

	function loadDataFile(tuple, cb){
		var name = tuple[0],
			path = tuple[1];

		fs.readFile(path, 'utf8', function(err, contents){
			var parsed;
			if(err) return cb(err);

			try{
				results.datasets[name] = JSON.parse(contents);
			} catch(e){
				return cb('error parsing ' + name + ' file at ' + path + ' - ' + e.message);
			}

			cb(null, parsed);
		});
	}
};

function setVfgBounds(results, cb){
	results.vfg.bounds = geomUtils.getDecoratedBoundsFromSets([results.datasets.polygons]);
	cb(null, results);
}

function combineFlowPoints(results, cb){
	results.vfg.status.polygons = 'combining flow points';
	console.log('combining flow points');

	var datasets = results.datasets,
		flowDatasets = {
			avg: {
				inward: datasets.avg_in_points,
				outward: datasets.avg_out_points
			},
			wet: {
				inward: datasets.wet_in_points,
				outward: datasets.wet_out_points
			},
			dry: {
				inward: datasets.dry_in_points,
				outward: datasets.dry_out_points
			}
		},
	// 	//flowPoints = [],
		flowPointsById = {},
		maxV = -Infinity,
		maxQ = -Infinity,
		minQ = Infinity
		maxL = -Infinity,
		minL = Infinity;


	return async.forEachOf(flowDatasets.avg.inward.features, combineFlowPoint, function(err){
		results.flowPoints = {
			//all: flowPoints,
			byId: flowPointsById,
			extremes: {
					maxL: maxL,
					minL: minL,
					maxQ: maxQ,
					minQ: minQ,
					maxV: maxV
			}
		};

		cb(err, results);
	});

	function combineFlowPoint(inwardPoint, index, cb){
		var direction = inwardPoint.properties.RICHTING / 360 * τ,
			point = {
				id: inwardPoint.properties.ID,
				name: inwardPoint.properties.NAME,
				type: inwardPoint.properties.TYPE,
				direction: direction,
				uvx: Math.sin(direction),
				uvy: -Math.cos(direction), // negative because y order of grid is reverse of geographical y order
				coordinates: inwardPoint.geometry.coordinates,
				id_reach: inwardPoint.properties.ID_REACH,
				inward: {
					avg: flowDatasets.avg.inward.features[index].properties,
					wet: flowDatasets.wet.inward.features[index].properties,
					dry: flowDatasets.dry.inward.features[index].properties
				},
				outward: {
					avg: flowDatasets.avg.outward.features[index].properties,
					wet: flowDatasets.wet.outward.features[index].properties,
					dry: flowDatasets.dry.outward.features[index].properties
				}
			};

		['inward', 'outward'].forEach(function(direction){
			var set = point[direction];
			['avg', 'wet', 'dry'].forEach(function(variation){
				var data = set[variation],
					i = 0,
					L, Q, V;

				if(!Object.keys(data).length) return;

				while(i < 9){
					i++;
					L = data['L' + i];
					Q = data['Q' + i];
					V = Math.abs(data['V' + i]);

					maxL = Math.max(maxL, L);
					minL = Math.min(minL, L);
					maxQ = Math.max(maxQ, Q);
					minQ = Math.min(minQ, Q);
					maxV = Math.max(maxV, V);
				}
			});
		});

		//flowPoints.push(point);
		flowPointsById[inwardPoint.properties.ID] = point;

		cb();
	}
}

function populateChannels(results, cb){
	results.vfg.status.polygons = 'populating channels';
	console.log('populating channels');
	
	var channels = results.datasets.channels.features,
		flowPointsById = results.flowPoints.byId,
		channelsByFromId = {},
		channelsByToId = {};

	results.channels = {
		all: channels,
		byFromId: channelsByFromId,
		byToId: channelsByToId
	};

	return async.each(channels, populateChannel, _.partial(cb, _, results));

	function populateChannel(channel, cb){
		channel.properties.calcPoint = flowPointsById[channel.properties.calcpoint_id];
		channel.bounds = geomUtils.getBoundsFromPolygon(channel.geometry.coordinates);
		channelsByFromId[channel.properties.ID_FROM] = channel;
		channelsByToId[channel.properties.ID_TO] = channel;
		cb();
	}
}

	
var τ = 2 * Math.PI

function populatePolygons(results, cb){
	console.log('populating polygons');
	results.vfg.status.polygons = 'populating polygons';

	var oldFeaturesLength = results.datasets.polygons.features.length,
		channels = results.channels,
		flowPoints = results.flowPoints,
		sparsePolygons = {};

	return async.map(results.datasets.polygons.features, populatePolygon, after);
	
	function populatePolygon(polygon, cb){
		polygon.bounds = geomUtils.getBoundsFromPolygon(polygon.geometry.coordinates);
		
		polygon.channels = [];
		polygon.calculationPoints = [];

		// create line segments to create borders from
		polygon.borderLines = [];
		polygon.geometry.coordinates.forEach(function(ring){
			ring.slice(0, ring.length - 1).forEach(function(coordinates, index){
				polygon.borderLines.push([coordinates, ring[index + 1]]);
			});
		});

		//determine channels (and thus calcpoints) relating to polygon
		var getOverlap = _.partial(geomUtils.getBoundsWithinBounds, polygon.bounds),
			getIfIsInside = _.partial(geomUtils.pointInPolygon, _, polygon.geometry),
			checkPoint = { type: 'Point' };

		channels.all.forEach(addChannelToPolygon);

		if(polygon.calculationPoints.length < 2){
			sparsePolygons[polygon.properties.gml_id] = {
				points: polygon.calculationPoints,
				channels: polygon.channels,
				polygon: polygon
			};
		}

		return cb(null, polygon);

		function addChannelToPolygon(channel){
			if(!getOverlap(channel.bounds)) return;

			var calculationPoints = getChannelCalculationPoints(channel),
				intersectsChannel = _.partial(geomUtils.lineStringsIntersect, channel.geometry),
				startIsInside, endIsInside,
				intersects = false,
				i = 0,
				subpolygons = polygon.geometry.coordinates,
				len = polygon.geometry.coordinates.length,
				j, len2, subpolygon;

			if(_.contains(polygon.calculationPoints, calculationPoints.start) && _.contains(polygon.calculationPoints, calculationPoints.end)){
				return; // these have been added already, skip!
			}

			checkPoint.coordinates = [channel.geometry.coordinates[0][0], channel.geometry.coordinates[0][1]]; 
			
			startIsInside = getIfIsInside(checkPoint);
			
			checkPoint.coordinates = [channel.geometry.coordinates[1][0], channel.geometry.coordinates[1][1]];
			
			endIsInside = getIfIsInside(checkPoint);
			
			if(!(startIsInside || endIsInside)){ // still need to check if channel crosses polygon
				while(i < len && !intersects){
					subpolygon = subpolygons[i];
					j = 0;
					len2 = subpolygon.length - 1;
					while(j < len2 && !intersects){
						intersects = intersectsChannel({
							type: 'LineString', coordinates: [subpolygon[j], subpolygon[j + 1]]
						});
						j++;
					}
					i++;
				}
			}

			if(startIsInside || endIsInside || intersects){
				if(!_.contains(polygon.channels, channel)){
					polygon.channels.push(channel);
				}

				if(calculationPoints.start && !_.contains(polygon.calculationPoints, calculationPoints.start)){
					polygon.calculationPoints.push(calculationPoints.start);
				}
				
				if(calculationPoints.end && !_.contains(polygon.calculationPoints, calculationPoints.end)){
					polygon.calculationPoints.push(calculationPoints.end);
				}
			}
		}
	}

	function after(err, polygons){
		polygons = _.compact(polygons);

		// 	var sparsePolygonIds = Object.keys(sparsePolygons);

		// if(sparsePolygonIds.length){
		// 	console.log('sparse polygons found... :(');
		// 	console.log('sparse polygons: ' + opsomming(sparsePolygonIds));
		// }

		var reduced = oldFeaturesLength - polygons.length;

		console.log('polygons reduced: ' + reduced + ', ' + (100 - (reduced / oldFeaturesLength) * 100).toFixed(1) + '% remains');

		console.log('cleaning borders, creating edge data');
		// dedupe polygon borderLines
		var foundDupes = [];

		var point1 = { type: 'Point' },
			point2 = { type: 'Point' };

		return async.forEachOf(polygons, _.compose(createEdgeData, dedupeBorderLines), finish);

		function dedupeBorderLines(polygon, i, cb){
			var borderLines = polygon.borderLines;

			//check each of its borderLines against all subsequent polygons borderLines
			var getJoinedBounds = _.partial(geomUtils.getBoundsWithinBounds, polygon.bounds);

			polygons.slice(i + 1).forEach(findDupes);

			// store cleaned list of borderLines on polygon
			polygon.borderLines = borderLines;
			
			// pass polygon and cb to createEdgeData
			return {
				polygon: polygon,
				cb: cb
			};

			function findDupes(otherPolygon){
				var joinedBounds = getJoinedBounds(otherPolygon.bounds),
					otherBorderLines;
				
				if(!joinedBounds) return;

				borderLines = borderLines.filter(checkBorderLine);
				return;

				function checkBorderLine(line){
					var otherBorderLines = otherPolygon.borderLines,
						foundIt = false;

					otherBorderLines = otherPolygon.borderLines.filter(checkSameAsOtherLine);

					foundIt = otherBorderLines.length < otherPolygon.borderLines.length;
					if(foundIt){
						foundDupes.push(line);	
					}
					otherPolygon.borderLines = otherBorderLines;
					if(!otherPolygon.borderLines.length) console.log(otherPolygon.properties.gml_id + '(' + otherPolygon.properties.naamNL + ') is a duplicate of ' + polygon.properties.gml_id + ' (' + polygon.properties.naamNL + ')');
					return !foundIt;

					function checkSameAsOtherLine(otherLine){
						return !(
							(line[0][0] === otherLine[0][0] && line[0][1] === otherLine[0][1]) ?
								line[1][0] === otherLine[1][0] && line[1][1] === otherLine[1][1]
							: line[1][0] === otherLine[0][0] && line[1][1] === otherLine[0][1] ?
								line[0][0] === otherLine[1][0] && line[0][1] === otherLine[1][1]
							: false
						);
					}
				}
			}
		}


		function createEdgeData(args){
			async.each(args.polygon.borderLines, precalculateLineData, args.cb);
		}

		function precalculateLineData(border, cb){
			// dx
			var avgLat = ( border[0][1] + border[1][1] ) * 0.5;

			point1.coordinates = [border[0][0], avgLat];
			point2.coordinates = [border[1][0], avgLat];
			var dx = geomUtils.pointDistance(point1, point2);
			
			// dy
			point1.coordinates = [border[0][0], border[0][1]];
			point2.coordinates = [border[0][0], border[1][1]];
			var dy = geomUtils.pointDistance(point1, point2);
			
			if(border[0][0] < border[1][0]) dx = -dx;
			if(border[0][1] < border[1][1]) dy = -dy;
			
			var angle = Math.atan2(dy, dx),
				diagonal = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2)); // diagonal is in meters
			
			while(angle < 0){
				angle += τ;
			}

			border.push(angle, diagonal);

			cb();
		}

		function finish(err){
			if(err){
				console.log(err.message);
				return cb(err);
			}

			console.log('polygons loaded, ready to do some serious stuff!');
			cb(null, polygons);
		}
	}

	function getChannelCalculationPoints(channel){
		var startPoint, endPoint,
			currentChannel = channel;

		while(!startPoint && currentChannel){
			startPoint = flowPoints.byId[currentChannel.properties.calcpoint_id] || flowPoints.byId[currentChannel.properties.ID_FROM];
			currentChannel = channels.byToId[currentChannel.properties.ID_FROM];
		}

		currentChannel = channel;

		while(!endPoint && currentChannel){
			endPoint = flowPoints.byId[currentChannel.properties.ID_TO];
			currentChannel = channels.byFromId[currentChannel.properties.ID_TO];
			endPoint = endPoint || currentChannel && flowPoints.byId[currentChannel.properties.calcpoint_id];
		}

		return {
			start: startPoint,
			end: endPoint
		};
	}
}
