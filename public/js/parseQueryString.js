var qs = location.href.split('?')[1];
qs = qs ? qs.split('&') : [];
var queryParams = {};

qs.forEach(function(part){
	var split = part.split('='),
		key = split.shift(),
		value = split.shift();

	if(+value < 0 || +value > -1) value = +value;

	queryParams[key] = value;
});