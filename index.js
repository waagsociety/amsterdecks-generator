var server = require('./server'),
	vfg = require('./vectorgen').createVectorGenerator(),
	serverOptions = {};

server.init(serverOptions, vfg, function(app, server){
	console.log('succesfully started web interface');
});