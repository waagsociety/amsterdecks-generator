function ajaxRequest(url, method, query, callback){
	if(typeof method === 'object'){
		callback = query;
		query = method;
		method = 'GET';
	} else if(typeof method === 'function'){
		callback = method;
		query = {};
		method = 'GET';
	}

	var queryKeys = Object.keys(query);
	queryKeys.forEach(function(key, i){
		url += (i ? '&' : '?') + key + '=' + query[key];
	});

	var httpRequest = new XMLHttpRequest()
	httpRequest.onreadystatechange = function(e){
		callback(e.target.response);
	};
	httpRequest.open(method, url);
	httpRequest.send();
}