function QueueRunner(vfg){
	var interval = 1000,
		nextPeek;

	return startWatching();

	function watchQueue(){
		var job;
		if(vfg.queue.length){
			job = vfg.queue.shift();
			vfg.generate(job, vfg, startWatching);
			return true;
		}
	}

	function startWatching(){
		nextPeek = setTimeout(function outer(){
			var item = watchQueue();
			if(!item) nextPeek = setTimeout(arguments.callee, interval);
		}, interval);
	}
}

module.exports = QueueRunner;