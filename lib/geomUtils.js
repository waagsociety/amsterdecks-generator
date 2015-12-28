var fs = require('fs'),
	_ = require('underscore'),
	termStyles = require('./termStyles'),
	GeoJSON = require('geojson');

module.exports = gju = require('geojson-utils');

module.exports.getDecoratedBoundsFromSets = function(sets){
	
	return decorateBounds(
		mergeBounds(
			_.map(sets, getBoundsFromSet)
		)
	);

	// bounds are already set on the polygons when they are loaded in datafiles.js
	function getBoundsFromSet(set){
		return mergeBounds(_.map(set.features, getFeatureBounds));

		function getFeatureBounds(feature){
			if(!feature.bounds){
				feature.bounds = getBoundsFromPolygon(feature.geometry.coordinates);
			}
			return feature.bounds;
		}
	}
};

var getBoundsFromPolygon = module.exports.getBoundsFromPolygon = function(coordinates){
	var lngs, lats;

	if(typeof coordinates[0][0] !== 'number'){ // is multi polygon, take first
		coordinates = coordinates[0]; // just take outer polygon of multipolygon
	}

	lngs = _.pluck(coordinates, 0);
	lats = _.pluck(coordinates, 1);

	return [[
		Math.min.apply(null, lngs), // minLng
		Math.min.apply(null, lats)  // minLat
	], [
		Math.max.apply(null, lngs), // maxLng
		Math.max.apply(null, lats)  // maxLat
	]];
};

function mergeBounds(boundsArrays){
	var mins = _.pluck(boundsArrays, 0),
		maxs = _.pluck(boundsArrays, 1);

	return [[
		Math.min.apply(null, _.pluck(mins, 0)),	// minLng
		Math.min.apply(null, _.pluck(mins, 1))  // minLat
	], [
		Math.max.apply(null, _.pluck(maxs, 0)), // maxLng
		Math.max.apply(null, _.pluck(maxs, 1))  // maxLat
	]];
}

var decorateBounds = module.exports.decorateBounds = function(boundsArray){
	var minLng = boundsArray[0][0],
		minLat = boundsArray[0][1],
		maxLng = boundsArray[1][0],
		maxLat = boundsArray[1][1],
		dLngM = gju.pointDistance({
			type: 'Point', coordinates: [minLng, minLat]
		}, {
			type: 'Point', coordinates: [maxLng, minLat]
		}),
		dLatM = gju.pointDistance({
			type: 'Point', coordinates: [minLng, minLat]
		}, {
			type: 'Point', coordinates: [minLng, maxLat]
		}),
		area = (dLngM / 1000) * (dLatM / 1000);

	return {
		minLat: minLat,
		maxLat: maxLat,
		minLng: minLng,
		maxLng: maxLng,
		dLngM: dLngM,
		dLatM: dLatM,
		dLat: maxLat - minLat,
		dLng: maxLng - minLng,
		area: area,
		center: {
			lat: (minLat + maxLat) / 2,
			lng: (minLng + maxLng) / 2
		},
		boundsArray: boundsArray
	};
}

function getBoundsWithinBounds(bounds, innerBounds){
	var newBounds = [[
		Math.min( Math.max( innerBounds[0][0], bounds[0][0]), bounds[1][0]),
		Math.min( Math.max(innerBounds[0][1], bounds[0][1]), bounds[1][1])
	], [
		Math.max( Math.min(innerBounds[1][0], bounds[1][0]), bounds[0][0]),
		Math.max( Math.min(innerBounds[1][1], bounds[1][1]), bounds[0][1])
	]];

	//return newBounds;

	if(newBounds[0][0] === newBounds[1][0] || newBounds[0][1] === newBounds[1][1]){
		return false;
	}

	return newBounds;
}
module.exports.getBoundsWithinBounds = getBoundsWithinBounds;

module.exports.convertGridToGeoJSON = function(flattenedGrid){
	return GeoJSON.parse(flattenedGrid, {Point: ['y', 'x']});
}
