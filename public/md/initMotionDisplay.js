document.addEventListener('DOMContentLoaded', init);

function init(){
	loadField();

	document.addEventListener('keyup', function(e){
		console.log(e.keyCode);
		if(e.keyCode === 13){
			md.debugField = !md.debugField;
			if(md.debugField) md.showFieldSpeed = !md.showFieldSpeed;

			return;
		}

		if(e.keyCode === 86){
			md.grid.nextVariant();
			return;
		}

		if(e.keyCode === 84){
			md.grid.nextTime();
			return;
		}

		if(e.keyCode === 80){
			md.grid.toggleTimePassing();
		}
	});
}

function loadField(){

	fieldsLoader(function(err, fields){
		console.log(err || 'all fields loaded');

		settings = settings || fieldSettings.defaults;

		if(err) return;

		var contaminatorInfo = { size: contaminatorSize, contaminators: contaminators },
			importedGridOptions = {
				width: fieldInfo.x,
				height: fieldInfo.y,
				fields: fields,
				timePassing: true,
				contaminatorInfo: contaminatorInfo,
				particleSpeed: settings.particleSpeed,
				particleMaxAge: settings.particleMaxAge,
			};

		var winAspect = window.innerWidth / window.innerHeight,
			fieldAspect = importedGridOptions.width / importedGridOptions.height,
			wider = fieldAspect > winAspect,
			scale = wider ? window.innerWidth / importedGridOptions.width : window.innerHeight / importedGridOptions.height;

		var motionDisplay = new MotionDisplay({
			debugField: false,
			gridOptions: importedGridOptions,
			width: Math.floor(importedGridOptions.width * scale),
			height: Math.floor(importedGridOptions.height * scale),
			bounds: fieldInfo.bounds,
			clipPath: clipPath,
			contaminatorInfo: contaminatorInfo,
			particleColor: settings.particleColor,
			particleDensity: settings.particleDensity,
			backgroundColor: settings.backgroundColor,
			trailLength: settings.trailLength,
			timeStep: settings.timeStep,
			minFPS: settings.minFPS
		});

		window.md = motionDisplay;
		
		document.body.appendChild(motionDisplay.canvas);

		motionDisplay.canvas.style.width = Math.floor(importedGridOptions.width * scale) + 'px';
		motionDisplay.canvas.style.height = Math.floor(importedGridOptions.height * scale) + 'px';

		md.createLeafletUnderlay();

	});
}