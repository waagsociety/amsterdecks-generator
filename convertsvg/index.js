var fs = require('fs');
var geojson2svg = require('geojson2svg');
var geojson = require('./water.amsterdam.json');

var converter = geojson2svg(
  {
    mapExtent: {left: 4.884195, bottom: 52.347085, right: 4.889144, top: 52.349917},
    output: 'svg'
  }
);
var svgString = converter.convert(geojson);
fs.writeFile('./water.amsterdam.svg', '<svg xmlns="http://www.w3.org/2000/svg">' + svgString + '</svg>');
