initLeaflet();

function initLeaflet(){
	var gridFormContainer = document.getElementById('grid'),
		gridFormContainerStyle = window.getComputedStyle(gridFormContainer, null),
		mapContainer = document.getElementById('map'),
		dataset = mapContainer.dataset;

	mapContainer.style.height = gridFormContainerStyle.height;
	mapContainer.style.width = parseInt(window.getComputedStyle(gridFormContainer.parentNode).width) - parseInt(window.getComputedStyle(gridFormContainer).width) - 1 + 'px';

	var minLat = +dataset.minlat,
		maxLat = +dataset.maxlat,
		minLng = +dataset.minlng,
		maxLng = +dataset.maxlng,
		mapBounds = [[minLat, minLng], [maxLat, maxLng]],
		osmUrl = 'http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        osmAttrib = '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="http://cartodb.com/attributions">CartoDB</a>',
        osm = L.tileLayer(osmUrl, { maxZoom: 18, attribution: osmAttrib }),
		map = window.map = L.map('map', { layers: [osm], maxBounds: mapBounds }).fitBounds(mapBounds);

    changeBound();

	Array.prototype.forEach.call(document.getElementsByClassName('boundchanger'), function(elem){
		elem.addEventListener('input', changeBound);
	});

	document.querySelector('input[name=resolution]').addEventListener('input', changeBound);

	map.options.minZoom = map.getZoom();
}

function changeBound(e){
	var bounds = getBoundsFromInputs();
	updateBB(bounds);

	bounds.resolution = document.querySelector('input[name=resolution]').value;
	ajaxRequest('/grid', bounds, updateInfo);
}

function getBoundsFromInputs(){
	return {
		minLat: +document.querySelector('input[name=minLatInput]').value,
		maxLat: +document.querySelector('input[name=maxLatInput]').value,
		minLng: +document.querySelector('input[name=minLngInput]').value,
		maxLng: +document.querySelector('input[name=maxLngInput]').value
	}
}

var boundsLayer;

function updateBB(bounds){
	if(boundsLayer) map.removeLayer(boundsLayer);
	boundsLayer = L.geoJson();

	boundsLayer.addData({
    	type: 'Polygon',
    	coordinates: [[
    		[bounds.minLng, bounds.maxLat],
    		[bounds.minLng, bounds.minLat],
    		[bounds.maxLng, bounds.minLat],
    		[bounds.maxLng, bounds.maxLat]
    	]]
    });

    map.addLayer(boundsLayer);
}

function updateInfo(responseStr){
	if(!responseStr) return;
	var response = JSON.parse(responseStr);
	document.getElementById('area').innerText = response.area.toFixed(5) + 'km²';
	document.getElementById('dimsX').innerText = response.dimsX;
	document.getElementById('dimsY').innerText = response.dimsY;
	document.getElementById('cells').innerText = +response.dimsX * +response.dimsY;
}