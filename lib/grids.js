var _ = require('underscore'),
	fs = require('fs'),
	util = require('util'),
	geomUtils = require('./geomUtils'),
	termStyles = require('./termStyles'),
	GeoJSON = require('geojson'),
	Canvas = require('canvas'),
	async = require('async');

var DIRECTIONS = ['inward', 'outward'],
	τ = Math.PI * 2;

function debugLine(coordinates, properties){
	return JSON.stringify({
		type: 'Feature',
		geometry: {
			type: 'LineString',
			coordinates: coordinates
		},
		properties: properties || {}
	});
}

function debugPoint(coordinates, properties){
	return JSON.stringify({
		type: 'Feature',
		geometry: {
			type: 'Point',
			coordinates: coordinates
		},
		properties: properties || {}
	});
}

function fitFactory(min, max, start, end){
	var range1 = max - min,
		range2 = end - start;
	return function quickfit(value){
		return (((Math.max(Math.min(value, max), min) - min) / range1) * range2) + start;
	};
}

function getSign(n){
	return n ? n < 0 ? -1 : 1 : 0;
}

function safePower(n, exp){
	return Math.pow(Math.abs(n), exp) * getSign(n);
}

function safeLog(n, base){
	return Math.log(Math.abs(n), base) * getSign(n);
}

function rotateVector(v, a){
	var sin = Math.sin(a),
		cos = Math.cos(a);

	return [
		cos * v[0] - sin * v[1],
		sin * v[0] + cos * v[1]
	];
}

function Grid(options){
	var grid = this;
	if(!options || !options.bounds) throw('No options / bounds given to grid');

	this.buffers = {}; //todo make real buffer
	this.variants = options.variants || ['avg'];
	this.dataPointsPerCell = 2;

	_.extend(this, options.bounds);

	this.latMpD = this.dLatM / this.dLat;
	this.latDpM = this.dLat / this.dLatM;
	this.lngMpD = this.dLngM / this.dLng;
	this.lngDpM = this.dLng / this.dLngM;
	
	var gridDimensions = options.gridDimensions;

	if(!gridDimensions){
		this.stepX = (options.resolution || options.resolutionX) * this.lngDpM;
		this.stepY = (options.resolution || options.resolutionY) * this.latDpM;

		gridDimensions = [
			Math.floor(this.dLng / this.stepX),
			Math.floor(this.dLat / this.stepY)
		];
	} else {
		resolutionX = this.dLatD / gridDimensions[0];
		resolutionY = this.dLngD / gridDimensions[1];
	}

	this.dimsX = gridDimensions[0];
	this.dimsY = gridDimensions[1];

	// create holders for steps
	this.variants.forEach(function(variant){
		var variantBuffer = grid.buffers[variant] = [],
			i = 0;
		while(i++ < 18){
			variantBuffer.push([] || new Float32Array(this.dimsX * this.dimsY * this.dataPointsPerCell));
		}
	});
}

Grid.prototype.renderPointsInPolygon = function(feature, view, fun, cb){
	var bounds = geomUtils.getBoundsWithinBounds(feature.bounds, this.boundsArray);

	if(!bounds){
		return setImmediate(cb); //polygon bb does not intersect grid bb
	}

	console.log('rendering feature ' + (feature.properties.naamNL || feature.properties.gml_id));

	var checkIfisInPolygon = _.partial(geomUtils.pointInPolygon, _, feature.geometry),
		dataPointsPerCell = this.dataPointsPerCell,
		variants = this.variants,
		buffers = this.buffers,
		stepX = this.stepX,
		stepY = this.stepY,
		minLng = this.minLng,
		minLat = this.minLat,
		maxLng = this.maxLng,
		maxLat = this.maxLat,
		startX  = Math.ceil((bounds[0][0] - minLng) / stepX),
		startY  = Math.ceil((maxLat - bounds[1][1]) / stepY),
		endX = Math.floor((bounds[1][0] - minLng) / stepX),
		endY = Math.floor((maxLat - bounds[0][1]) / stepY),
		featureWidth = endX - startX,
		carriageReturn = (this.dimsX - featureWidth) * dataPointsPerCell,
		currentIndex = (startX + this.dimsX * startY) * dataPointsPerCell,
		currentX = startX,
		currentY = startY,
		endIndex = (endX + this.dimsX * endY) * dataPointsPerCell,
		checkPoint = { type: 'Point' },
		checkPoint2 = { type: 'Point' },
		borderStraightDistance = view.borderStraightDistance || 0,
		borderFalloffDistance = view.borderFalloffDistance || 0,
		borderAccomodationRange = borderStraightDistance + borderFalloffDistance,
		lng, lat;

	return async.whilst(test, fn, _.partial(setImmediate, cb));

	function test(){
		return currentIndex <= endIndex;
	}

	function fn(cb){
		var nextPoint = _.partial(setImmediate, next),
			closestBorderDistance = Infinity,
			closestBorder, posRelativeToBorder,
			angleRelativeToBorder;

		// skip point if already filled in by another polygon
		if(buffers[variants[0]][0][currentIndex] !== undefined){
			return nextPoint();
		}

		// get corresponding lng,lat
		lng = minLng + stepX * currentX;
		lat = maxLat - stepY * currentY;
		
		checkPoint.coordinates = [lng, lat];

		// is point actually inside polygon?
		if(!checkIfisInPolygon(checkPoint)){
			return nextPoint();
		}

		// generate edge braking angle + edge braking vector
		return async.eachSeries(feature.borderLines, getDistanceToBorder, gotClosestBorder);

		function getDistanceToBorder(border, cb){
			debugLine; debugPoint; //hack: to get in inspector scope
			// get dx in meters
			var avgLat = (lat + border[0][1]) / 2;

			checkPoint.coordinates = [border[0][0], avgLat]
			checkPoint2.coordinates = [lng, avgLat];
			var dx = geomUtils.pointDistance(checkPoint, checkPoint2);

			// get dy in meters
			checkPoint.coordinates = [border[0][0], border[0][1]];
			checkPoint2.coordinates = [border[0][0], lat];
			var dy = geomUtils.pointDistance(checkPoint, checkPoint2);

			if(border[0][0] < lng) dx = -dx;
			if(border[0][1] > lat) dy = -dy;

			//create rotated dx dy with border angle
			var borderAngle = border[2],
				borderDomainLength = border[3],
				rotated = rotateVector([dx, dy], borderAngle),
				distance;

			if(rotated[0] < 0){ // point lies right of border beginning
				distance = Math.sqrt(Math.pow(rotated[0] - borderDomainLength, 2) + Math.pow(rotated[1], 2));
			} else if(rotated[0] > borderDomainLength){ //point lies left of border end
				distance = Math.sqrt(Math.pow(rotated[0], 2) + Math.pow(rotated[1], 2));
			} else { // point lies in domain of border
				distance = rotated[1];
			}
			
			if(distance > 0 && distance < closestBorderDistance){
				closestBorderDistance = distance;
				closestBorder = border;
				posRelativeToBorder = rotated;
				angleRelativeToBorder = borderAngle;
			}

			setImmediate(cb);
		}

		function gotClosestBorder(err){
			var refPoint, avgLat, dx, dy, angle;

			if(!closestBorder){
				console.log('no closest border', feature, {type: 'Point', coordinates: [lng, lat]});
			}

			//// if vertex is beyond border edge, rotate angle to adjust with angle from border edge
			// if(posRelativeToBorder[0] < 0 || posRelativeToBorder > closestBorder[3]){
			// 	if(posRelativeToBorder[0] < 0){
			// 		refPoint = closestBorder[1];
			// 	} else if(posRelativeToBorder[0] > closestBorder[3]){
			// 		refPoint = closestBorder[0];
			// 	}

			// 	// get dx in meters
			// 	avgLat = (lat + refPoint[1]) / 2;
			// 	checkPoint.coordinates = [refPoint[0], avgLat];
			// 	checkPoint2.coordinates = [lng, avgLat];
			// 	dx = geomUtils.pointDistance(checkPoint, checkPoint2);

			// 	// get dy in meters
			// 	checkPoint.coordinates = [lng, refPoint[1]];
			// 	checkPoint2.coordinates = [lng, lat];

			// 	if(refPoint[0] > lng) dx = -dx;
			// 	if(refPoint[1] > lat) dy = -dy;

			// 	angle = Math.atan2(dy, dx);
			// 	if(angle < 0) angle += τ;

			// 	angleRelativeToBorder += (angleRelativeToBorder - angle);
			// }

			var transformationVector = [1,0],
				keepLength = true;

			function accomodateToBorder(v){
				if(!borderAccomodationRange || closestBorderDistance > borderAccomodationRange)  return v;

				var currentLength = Math.sqrt(Math.pow(v[0], 2) + Math.pow(v[1], 2)),
					vR = rotateVector(v, angleRelativeToBorder),
					length, scale;

				//vR[0] *= transformationVector[0];
				vR[1] *= closestBorderDistance < borderStraightDistance ? 0 : (closestBorderDistance - borderStraightDistance) / view.borderFalloffDistance;

				length = Math.sqrt(Math.pow(vR[0], 2) + Math.pow(vR[1], 2));
				scale = currentLength / length;

				vR[0] *= scale;
				vR[1] *= scale;

				return rotateVector(vR, -angleRelativeToBorder);
			}

			// loops through avg, wet, dry
			return async.eachSeries(variants, processVariant, nextPoint);

			function processVariant(variant, cb){
				var variantBuffers = buffers[variant],
					n = 0;

				// loops through inward and outward
				return async.eachSeries(DIRECTIONS, processDirection, cb);
				
				function processDirection(direction, cb){
					var max = 9,
						cV = 1,
						bufferIndex,
						cBuffer,
						point, j;

					return async.whilst(test, fn, nextDirection);

					function test(){
						return cV <= max;
					}

					function fn(cb){
						bufferIndex = (n * max + cV) - 1;

						cBuffer = variantBuffers[bufferIndex];

						return fun(lng, lat, direction, variant, cV, storePoint);

						function storePoint(err, point){
							if(err) return cb(err);

							// todo enable more than 2 channels
							point = accomodateToBorder(point);

							j = 0;

							while(j < dataPointsPerCell){
								cBuffer[currentIndex + j] = point[j];
								j++;
							}

							cV++;

							cb();
						}
					}

					function nextDirection(err){
						if(err) return cb(err);
						n++;
						cb();
					}

				}
			}
		}

		function next(err){
			if(err) return cb(err);

			// check if carriage return needs to happen
			if(currentX === endX){
				currentIndex += carriageReturn;
				currentY++;
				currentX = startX;
				return cb();
			}

			// advance along x axis
			currentIndex += dataPointsPerCell;
			currentX++;

			cb();
		}
	}

};

Grid.prototype.toGridSpace = function(coordinates){
	return [(coordinates[0] - this.minLng) / this.dLng * this.dimsX, this.dimsY - (((coordinates[1] - this.minLat)) / this.dLat * this.dimsY)];
}

Grid.prototype.makeShapeRelative = function(polygon){
	var grid = this;

	if(polygon.geometry.type === 'Point'){
		return grid.toGridSpace(polygon.geometry.coordinates);
	}

	return polygon.geometry.coordinates.map(convertCoordinates);

	function convertCoordinates(coordinates){
		if(coordinates[0] instanceof Array) return coordinates.map(convertCoordinates);
		return grid.toGridSpace(coordinates);
	}
}

Grid.prototype.exportPNGs = function(path, cb){
	if(!path) path = './';

	var grid = this,
		dataPointsPerCell = grid.dataPointsPerCell,
		length = grid.dimsY * grid.dimsX,
		canvas = new Canvas(grid.dimsX, grid.dimsY),
		ctx = canvas.getContext('2d'),
		imageDataObject = ctx.createImageData(grid.dimsX, grid.dimsY),
		imageData = imageDataObject.data,
		variants = Object.keys(this.buffers),
		exp = 0.25,
		resultData = {};

	return async.eachSeries( variants, renderVariant, _.partial(cb, _, resultData) );

	function renderVariant(variant, cb){
		var times = grid.buffers[variant];
		return async.eachSeries(times, renderBuffer, cb);

		function renderBuffer(buffer, cb){
			var filename = variant + '-' + times.indexOf(buffer),
				dest = path + filename + '.png';
			
			var i = 0, r, g;

			var max = -Infinity;

			// get nax values to determine ranges for encoding
			return async.whilst(test, fn, after);

			function test(){
				return i < length;
			}

			function fn(cb){
				r = buffer[i * dataPointsPerCell] || 0;
				g = buffer[i * dataPointsPerCell + 1] || 0;

				max = Math.max.apply(null, [ max, Math.abs(r), Math.abs(g) ]);

				i++;

				setImmediate(cb);
			}

			function after(err){
				if(err) return cb(err);

				max = safeLog(max + 1); // logging/delogging creates artifacts around the 1, so we just add 1 and remove it later

				i = 0;

				var getValue = _.compose(Math.round, fitFactory(-max, max, 1, 255));

				resultData[filename] = max;

				// create channel encodings
				return async.whilst(test, fn, after);

				function test(){
					return i < length;
				}

				function fn(cb){
					r = buffer[i * dataPointsPerCell] || 0;
					g = buffer[i * dataPointsPerCell + 1] || 0
					if(r) r = getValue( safeLog(r + getSign(r)) ); // logging/delogging creates artifacts around the 1, so we just add 1 and remove it later
					if(g) g = getValue( safeLog(g + getSign(g)) );

					var y = Math.floor(i / grid.dimsX),
						x = i - (y * grid.dimsX);
					ctx.fillStyle = 'rgba(' + [r,g,0,255].join(',') + ')';
					ctx.fillRect(x, y, 1, 1);
					// faster but not somehow not working
					// imageData[i * 4] = r;
					// imageData[i * 4 + 1] = g;
					// imageData[i * 4 + 2] = 0;
					// imageData[i * 4 + 3] = 127;
					i++;

					setImmediate(cb);
				}
				
				function after(err){
					if(err) return cb(err);

					//console.log(imageData);
					//ctx.putImageData(imageDataObject, 0, 0);

					//console.log('<img src="' + canvas.toDataURL() + '" />');
					console.log('writing ' + dest);
					var stream = canvas.pngStream(),
						out = fs.createWriteStream(dest);

					stream.on('data', function(chunk){
						out.write(chunk);
					});

					stream.on('end', cb);
				}
			}
		}
	}

};

module.exports.Grid = Grid;