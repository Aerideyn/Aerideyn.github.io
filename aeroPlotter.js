var liftMultiplier = 0.036;
var liftDragMultiplier = 0.015;
var d2r = Math.PI / 180;
var r2d = 180 / Math.PI;

 function InterpolateCurve( t, curve)
{
	if (t <= curve[0][0]) { 
		return curve[0][1];
	}

	if (t >= curve[curve.length-1][0]) {
		return curve[curve.length-1][1];
	}

	var keyIndex = -1;
	for (var i = curve.length - 1; i >= 0; i--) {
		if (t >= curve[i][0] ){
			keyIndex = i;
			break;
		}
	}

	var keyframe0 = curve[keyIndex];
	var keyframe1 = curve[keyIndex + 1];

    var dt = keyframe1[0] - keyframe0[0];
    var t = (t - keyframe0[0]) / dt;

    var m0 = keyframe0[2] * dt;
    var m1 = keyframe1[3] * dt;

    var t2 = t * t;
    var t3 = t2 * t;
 
    var a = 2 * t3 - 3 * t2 + 1;
    var b = t3 - 2 * t2 + t;
    var c = t3 - t2;
    var d = -2 * t3 + 3 * t2;
 
    var result = a * keyframe0[1] + b * m0 + c * m1 + d * keyframe1[1];
    return result
}

function getIndexOfLargestNumberInArray(array)
{
	var max = Number.NEGATIVE_INFINITY;
	var index = 0;
	for (var i = 0; i < array.length; i++) {
		if (array[i] > max)
		{
			max = array[i]
			index = i;
		}
	}
	return index;
}

function InitCurveX(lowerBound, upperBound, n)
{
	var list = [];
	var step = (upperBound - lowerBound) / (n-1)
	for (var i = 0; i < n; i++) {
	    list.push(i * step);
	}
	return list;
}

function InitCurveArcSinX(lowerBound, upperBound, n)
{
	var list = [];
	var step = (upperBound - lowerBound) / (n-1)
	for (var i = 0; i < n; i++) {
	    list.push(Math.asin(i * step) * r2d);
	}
	return list;
}

function InitCurveXLog(start, end, total_intervals, base)
{
     var startInterVal = 0, 
     	 endInterval = total_intervals,
         minLog = Math.log(start || 1) / Math.log(base), 
         maxLog = Math.log(end) / Math.log(base),
         scale = (maxLog-minLog) / (endInterval-startInterVal),
         result = [];
          
      for (i = 0; i < total_intervals; i++) {
      	  result.push(Math.pow(base, minLog + scale*(i - startInterVal)));
      }

      result.push(end);
      return result;
}

function InitCurveY(xArray, curve)
{
	var list = [];
	for (var i = 0; i < xArray.length; i++) {
		list.push(InterpolateCurve( xArray[i], curve));
	}
	return list;
}

function SolveLiftToDragRatio(xArray, liftCurve, dragCurve)
{
	var list = [];
	for (var i = 0; i < xArray.length; i++) {
		var lift = InterpolateCurve( xArray[i], liftCurve);
		var drag = InterpolateCurve( xArray[i], dragCurve);
		list.push(lift / drag);
	}
	return list;	
}

function SolveDensityCurve(tempVsAltitude, presVsAltitude, molecularWeight)
{
	var list = [];
	for (var i = 0; i < tempVsAltitude.length; i++) {
		list.push((presVsAltitude[i] * 1000 * molecularWeight) / ( tempVsAltitude[i] * 8.31446261815324));
	}
	return list;	
}

var app = new Vue({
	el: '#app',
	data: {
		initialised: false,
		selectedPlanet: {},
		selectedPropeller: {},
		selectedRotor: {},
		numberOfPropellers: 2,
		tipVelocity: 0,
		rpmSetting: 0,
		aoaSetting: 0,
		bestAoAForCL: 0,

		minForwardVel: 0,
		maxForwardVel: 400,
		plotResolution: 100,

		velocityArray : [],
		altitudeArray : [],
		tempVsAltitude: [],
		presVsAltitude: [],
		densVsAltitude: [],

		atmospherePlotData: [
			{
				y: this.presVsAltitude, 
				x: this.presVsAltitude, 
				type: 'lines', 
				name: 'Pressure (Pa)'
			},
			{
				y: this.presVsAltitude, 
				x: this.tempVsAltitude, 
				type: 'lines', 
				name: 'Temperature (K)', 
				yaxis: 'y2'
			},
			{
				y: this.presVsAltitude, 
				x: this.densVsAltitude, 
				type: 'lines', 
				name: 'Density (Kg/m^2)', 
				yaxis: 'y3'
			},
		],

		dataAoA: [ {
				x: this.velocityArray,
				y: this.altitudeArray,
				z: [],
				type: 'heatmap',
				reversescale: true,
				zsmooth: 'best',
			}
		],

		dataThrust: [ {
				x: this.velocityArray,
				y: this.altitudeArray,
				z: [],
				type: 'heatmap',
				zsmooth: 'best',
			}
		],

		dataPitch: [ {
				x: this.velocityArray,
				y: this.altitudeArray,
				z: [],
				type: 'heatmap',
				zsmooth: 'best',
			}
		],

		dataTorque: [ {
				x: this.velocityArray,
				y: this.altitudeArray,
				z: [],
				type: 'heatmap',
				zsmooth: 'best',
			}
		],

		LDxAxisNormalised: InitCurveX(0, 0.5, 200),
		LDxAxis: InitCurveArcSinX(0, 0.5, 200),

		bladePlotData: [
			{x: this.LDxAxis, y: [], type: 'lines'},
			{x: this.LDxAxis, y: [], type: 'lines'},
			{x: this.LDxAxis, y: [], type: 'lines'},
		],

		planets: [
			{name: "Kerbin", id: 1, atmo: planetCurves.Kerbin},
			{name: "Eve"   , id: 2, atmo: planetCurves.Eve},
			{name: "Duna"  , id: 3, atmo: planetCurves.Duna},
			{name: "Laythe", id: 4, atmo: planetCurves.Laythe},
			{name: "Jool"  , id: 5, atmo: planetCurves.Jool},
		],

		propellers: [
			{name: "Large Fan Blade" , id: 1, radius: 0.8375, CoLOffset: -0.4, VelOffset: -5.8, WingArea: 0.1, curves: propAeroCurves.fanBladeAeroCurves},
			{name: "Medium Fan Blade", id: 2, radius: 0.4375, CoLOffset: -0.2, VelOffset: -5.8, WingArea: 0.025, curves: propAeroCurves.fanBladeAeroCurves},
			{name: "Small Fan Blade" , id: 3, radius: 0.1875, CoLOffset: -0.1, VelOffset: -5.8, WingArea: 0.00625, curves: propAeroCurves.fanBladeAeroCurves},

			{name: "Large Helicopter Blade" , id: 4, radius: 7.5875, CoLOffset: -1.2, VelOffset: -3.0, WingArea: 1.6, curves: propAeroCurves.heliBladeAeroCurves},
			{name: "Medium Helicopter Blade", id: 5, radius: 3.7875, CoLOffset: -0.6, VelOffset: -2.5, WingArea: 0.4, curves: propAeroCurves.heliBladeAeroCurves},
			{name: "Small Helicopter Blade" , id: 6, radius: 1.8875, CoLOffset: -0.3, VelOffset: -2.0, WingArea: 0.1, curves: propAeroCurves.heliBladeAeroCurves},

			{name: "Large Propeller Blade" , id: 7, radius: 1.8875, CoLOffset: -0.8, VelOffset: -4.8, WingArea: 0.12, curves: propAeroCurves.propBladeAeroCurves},
			{name: "Medium Propeller Blade", id: 8, radius: 0.9875, CoLOffset: -0.4, VelOffset: -4.8, WingArea: 0.03, curves: propAeroCurves.propBladeAeroCurves},
			{name: "Small Propeller Blade" , id: 9, radius: 0.4875, CoLOffset: -0.2, VelOffset: -4.8, WingArea: 0.0075, curves: propAeroCurves.propBladeAeroCurves},
		],

		rotors: [
			{name: "R121 Turboshaft Engine"  , id: 1, torque: 150, mass: 615 , diameter: 0.425},
			{name: "R7000 Turboshaft Engine" , id: 2, torque: 550, mass: 3415, diameter: 0.625},
			{name: "EM-16S Light Duty Rotor" , id: 3, torque: 20 , mass: 58  , diameter: 0.225},			
			{name: "EM-16 Light Duty Rotor"  , id: 4, torque: 20 , mass: 60  , diameter: 0.425},
			{name: "EM-32S Standard Rotor"   , id: 5, torque: 70 , mass: 300 , diameter: 0.425},
			{name: "EM-32 Standard Rotor"    , id: 6, torque: 70 , mass: 310 , diameter: 0.625},
			{name: "EM-64S Heavy Rotor"		 , id: 7, torque: 400, mass: 2150, diameter: 0.625},
			{name: "EM-64 Heavy Rotor"		 , id: 8, torque: 400, mass: 2200, diameter: 1.225},
		],
	},

	methods: {
		drawPlanetGraphs: function()
		{
			this.atmospherePlotData[0].y = this.presVsAltitude;
			this.atmospherePlotData[0].x = this.altitudeArray;

			this.atmospherePlotData[1].y = this.tempVsAltitude;			
			this.atmospherePlotData[1].x = this.altitudeArray;

			this.atmospherePlotData[2].y = this.densVsAltitude;			
			this.atmospherePlotData[2].x = this.altitudeArray;
			Plotly.redraw('AtmospherePlot');
		},

		drawPropellerGraphs: function()
		{
			this.bladePlotData[0].y = InitCurveY(this.LDxAxisNormalised, this.selectedPropeller.curves.liftCurve);
			this.bladePlotData[1].y = InitCurveY(this.LDxAxisNormalised, this.selectedPropeller.curves.dragCurve);
			this.bladePlotData[2].y = SolveLiftToDragRatio(this.LDxAxisNormalised, this.selectedPropeller.curves.liftCurve, this.selectedPropeller.curves.dragCurve);		
			Plotly.redraw('BladeAeroPlot');
		},

		drawFinalGraphs: function()
		{
			for (var i = 0; i < this.altitudeArray.length; i++) 
			{
				this.dataAoA[0].z[i] = [];
				this.dataPitch[0].z[i] = [];
				this.dataThrust[0].z[i] = [];
				this.dataTorque[0].z[i] = []; 

				for (var j = 0; j < this.velocityArray.length; j++) 
				{
					var machNumber =  this.velocityArray[j] / Math.sqrt(this.selectedPlanet.atmo.AdiabaticIndex * (8.31446261815324 / this.selectedPlanet.atmo.MolecularWeight) * this.tempVsAltitude[i]);
					var propAirSpeed2 = this.velocityArray[j] * this.velocityArray[j] + this.tipVelocity * this.tipVelocity;
					var N_QS = this.numberOfPropellers * 0.5 * propAirSpeed2 * this.densVsAltitude[i] * this.selectedPropeller.WingArea;
					var relativeAirflowAngle = Math.atan(this.velocityArray[j] / this.tipVelocity);

					var machCl = InterpolateCurve(machNumber, this.selectedPropeller.curves.liftMachCurve) * N_QS * liftMultiplier;;
					var machCd = InterpolateCurve(machNumber, this.selectedPropeller.curves.dragMachCurve) * N_QS * liftDragMultiplier;

					var excessTorque = 1;

					var alpha = relativeAirflowAngle;
					var aoa = 0;
					var thrust = 0;
					var torque = 0;

					var targetAoA = this.aoaSetting * d2r;

					var prevCurveIdx = 0;

					while (excessTorque > 0 && aoa <= targetAoA)
					{
						var curveIndex = Math.sin(aoa);
						var lift  = InterpolateCurve(curveIndex, this.selectedPropeller.curves.liftCurve) * machCl; 
						var drag  = InterpolateCurve(curveIndex, this.selectedPropeller.curves.dragCurve) * machCd;

						alpha  = aoa + relativeAirflowAngle;
						torque = (lift * Math.sin(alpha) + drag * Math.cos(alpha)) * (-this.selectedPropeller.CoLOffset + (this.selectedRotor.diameter / 2));
						thrust = lift * Math.cos(alpha) - drag * Math.sin(alpha);
						
						excessTorque = this.selectedRotor.torque - torque;
						
						if (excessTorque >= 0 || aoa == 0)
						{
							this.dataAoA[0].z[i][j]    = aoa * r2d;
							this.dataThrust[0].z[i][j] = thrust;
							this.dataPitch[0].z[i][j]  = alpha * r2d;
							this.dataTorque[0].z[i][j] = (torque / this.selectedRotor.torque) * 100;
						}

						aoa = aoa + (0.1 * d2r);
					}
				}
			}

			this.dataAoA[0].x = this.dataThrust[0].x = this.dataPitch[0].x = this.dataTorque[0].x = this.velocityArray;
			this.dataAoA[0].y = this.dataThrust[0].y = this.dataPitch[0].y = this.dataTorque[0].y = this.altitudeArray;

			Plotly.redraw('MaxAoA');
			Plotly.redraw('MaxThrust');
			Plotly.redraw('PropPitchSetting');
			Plotly.redraw('ReqTorque');
		},
		
		ComputePropellerTipSpeed: function()
		{
			this.tipVelocity = this.rpmSetting * 0.10472 * ((this.selectedRotor.diameter / 2) - this.selectedPropeller.VelOffset);
		}
	},

	watch: {
		aoaSetting:function(newAoA)
		{
			if (!this.initialised) return;
			this.ComputePropellerTipSpeed();
			this.drawFinalGraphs();			
		},

		rpmSetting:function(newRPM)
		{
			if (!this.initialised) return;
			this.ComputePropellerTipSpeed();
			this.drawFinalGraphs();
		},

		selectedPlanet: function (newPlanet, oldPlanet) {
			if (!this.initialised) return;
			this.altitudeArray  = InitCurveXLog(this.selectedPlanet.atmo.Pressure[0][0], this.selectedPlanet.atmo.Pressure[this.selectedPlanet.atmo.Pressure.length - 1][0], this.plotResolution, 100);
			this.presVsAltitude = InitCurveY(this.altitudeArray, this.selectedPlanet.atmo.Pressure);
			this.tempVsAltitude = InitCurveY(this.altitudeArray, this.selectedPlanet.atmo.Temperature);
			this.densVsAltitude = SolveDensityCurve(this.tempVsAltitude, this.presVsAltitude, this.selectedPlanet.atmo.MolecularWeight);

			this.drawPlanetGraphs();
			this.drawFinalGraphs();
		},

		selectedPropeller: function (newPropeller, oldPropeller) {
			if (!this.initialised) return;
			this.ComputePropellerTipSpeed();
			this.drawPropellerGraphs();
			this.aoaSetting = Math.floor(10 * this.bladePlotData[0].x[getIndexOfLargestNumberInArray(this.bladePlotData[0].y)]) / 10; 
			this.drawFinalGraphs();
		},

		selectedRotor: function (newRotor, oldRotor) {
			if (!this.initialised) return;
			this.drawFinalGraphs();
		},

		numberOfPropellers: function(newNumberOfPropellers, oldNumberOfPropellers)
		{
			if (!this.initialised) return;
			this.drawFinalGraphs();
		},
	},

	mounted: function(){
		this.selectedPlanet = this.planets[0];
		this.selectedPropeller = this.propellers[0];
		this.selectedRotor = this.rotors[5];
		this.numberOfPropellers = 2;
		this.rpmSetting = 460;
		this.aoaSetting = 9;
		this.velocityArray = InitCurveX(this.minForwardVel, this.maxForwardVel, this.plotResolution);

		this.bladePlotData[0].x = this.LDxAxis;
		this.bladePlotData[1].x = this.LDxAxis;
		this.bladePlotData[2].x = this.LDxAxis;

		var logYAxis = {
			title: 'Altitude (m)',
			//type: 'log',
			tickmode: 'linear', 
			tick0: 0,
			dtick: 10000, 
			showgrid: true, 
			gridwidth: 1, 
			autorange: true
		};

		var atmospherePlotLayout = {
			title: 'Atmospheric properties vs Altitude' ,
			xaxis: logYAxis,
			yaxis: {
				title:'Pressure (Pa)',
			},
			yaxis2: {
				title:'Temperature (K)',
			    titlefont: {color: '#ff7f0e'},
			    tickfont: {color: '#ff7f0e'},
			    anchor: 'free',
			    overlaying: 'y',
			    side: 'left',
			    position: 0.9
			},
			yaxis3: {
				title:'Density (Kg / m^2)',
			    titlefont: {color: '#d62728'},
			    tickfont: {color: '#d62728'},
			    anchor: 'x',
			    overlaying: 'y',
			    side: 'right'
			},
		}

		Plotly.newPlot('AtmospherePlot', this.atmospherePlotData, atmospherePlotLayout, {displayModeBar: false});
		Plotly.newPlot('BladeAeroPlot'	 , this.bladePlotData   , { title: 'Lift and Drag Coefficients vs Alpha' , xaxis:{title:{text: 'Angle of attack (degrees)'}}}, {displayModeBar: false});
	
		var xAxis = {title:{text: 'Velocity (m/s)'}};
		Plotly.newPlot('MaxAoA'			 , this.dataAoA   , {title: 'Best attainable angle of attack (degrees)',		 yaxis: logYAxis, xaxis: xAxis});
		Plotly.newPlot('MaxThrust'		 , this.dataThrust, {title: 'Thrust produced at best angle of attack',    yaxis: logYAxis, xaxis: xAxis});
		Plotly.newPlot('PropPitchSetting', this.dataPitch , {title: 'Propeller deploy angle(degrees)', yaxis: logYAxis, xaxis: xAxis});
		Plotly.newPlot('ReqTorque'		 , this.dataTorque, {title: 'Percent of rotor torque required',  yaxis: logYAxis, xaxis: xAxis});


		this.initialised = true;		
	}
})