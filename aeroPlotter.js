liftMultiplier = 1;//0.036;
liftDragMultiplier = 0.015;


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

function InitCurveX(lowerBound, upperBound, n)
{
	var list = [];
	var step = (upperBound - lowerBound) / (n-1)
	for (var i = 0; i < n; i++) {
	    list.push(i * step);
	}
	return list;
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

function SolveDensity(planet, altitude)
{
	var pressure    = InterpolateCurve( altitude, planet.atmo.Pressure) * 1000;
	var temperature = InterpolateCurve( altitude, planet.atmo.Temperature);
	return (pressure * planet.atmo.MolecularWeight) / ( temperature * 8.31446261815324);
}

function WingAreaToSquareMeters(area)
{
	return area * 27.77777;//3.52;
}

function ComputeMachNumber(velocity, altitude, planet)
{
		var temperature = InterpolateCurve( altitude, planet.atmo.Temperature);
		var density     = SolveDensity(planet, altitude);
		var soundSpeed = Math.sqrt(planet.atmo.AdiabaticIndex * (8.31446261815324 / planet.atmo.MolecularWeight) * temperature);
		return velocity / soundSpeed;
}

function ComputeLiftCoefficient(AoA, mach, blade)
{
	var baseCl = InterpolateCurve(AoA, blade.curves.liftCurve);
	var machCl = InterpolateCurve(mach, blade.curves.liftMachCurve);
	return liftMultiplier * baseCl * machCl;
}

function ComputeDragCoefficient(AoA, mach, blade)
{
	var baseCd = InterpolateCurve(AoA, blade.curves.dragCurve);
	var machCd = InterpolateCurve(mach, blade.curves.dragMachCurve);
	return baseCd * machCd;
}

function SolveThrust(rpm, AoA, forwardSpeed, altitude, planet, blade, rotor, numBlades)
{
	var rotationVelocity = rpm * 0.10472 * ((rotor.diameter / 2) - blade.VelOffset);
	var effectiveVelocity2 = forwardSpeed*forwardSpeed + rotationVelocity*rotationVelocity;
	var machNumber = ComputeMachNumber(Math.sqrt(effectiveVelocity2), altitude, planet);
	var Cl = ComputeLiftCoefficient(AoA, machNumber, blade);
	var density = SolveDensity(planet, altitude);
	return Cl * WingAreaToSquareMeters(blade.WingArea); //lift = numBlades * 0.5 * density * effectiveVelocity2 * Cl * WingAreaToSquareMeters(blade.WingArea);
}

function SolveDrag(rpm, AoA, forwardSpeed, altitude, planet, blade, rotor, numBlades)
{
	var rotationVelocity = rpm * 0.10472 * ((rotor.diameter / 2) - blade.VelOffset);
	var effectiveVelocity2 = forwardSpeed*forwardSpeed + rotationVelocity*rotationVelocity;
	var machNumber = ComputeMachNumber(Math.sqrt(effectiveVelocity2), altitude, planet);
	var Cd = ComputeDragCoefficient(AoA, machNumber, blade);
	var density = SolveDensity(planet, altitude);
	var Q = 0.5 * density * effectiveVelocity2;
	return 630 / Q;
	return drag = numBlades * Q * Cd * WingAreaToSquareMeters(blade.WingArea);// * liftDragMultiplier;
}

function SolveDensityCurve(altitudeArray, planet)
{
	var list = [];
	for (var i = 0; i < altitudeArray.length; i++) {
		list.push(SolveDensity(planet, altitudeArray[i]));
	}
	return list;	
}

var app = new Vue({
	el: '#app',
	data: {
		selectedPlanet: {},
		selectedPropeller: {},
		selectedRotor: {},
		numProps: 2,

		pressureLayout: { title: 'Atmospheric Pressure vs Altitude'},
		pressurePlotData: [{x: [], y: [], type: 'lines'}],

		tempLayout: { title: 'Base Atmospheric Temperature vs Altitude'},
		tempPlotData: [{x: [], y: [], type: 'lines'}],

		densityLayout: { title: 'Atmospheric Density vs Altitude'},
		densityPlotData: [{x: [], y: [], type: 'lines'}],

		LDxAxisNormalised: InitCurveX(0, 1, 100),
		LDxAxis: InitCurveX(0, 90, 100),

		liftLayout: { title: 'Lift Coefficient vs Alpha'},
		liftPlotData: [{x: [], y: [], type: 'lines'}],

		dragLayout: { title: 'Drag Coefficient vs Alpha'},
		dragPlotData: [{x: [], y: [], type: 'lines'}],

		ldRatioLayout: { title: 'Lift to Drag Ratio vs Alpha'},
		ldRatioPlotData: [{x: [], y: [], type: 'lines'}],

		planets: [
			{name: "Kerbin", id: 1, atmo: planetCurves.Kerbin},
			{name: "Eve"   , id: 2, atmo: planetCurves.Eve},
			{name: "Duna"  , id: 3, atmo: planetCurves.Duna},
			{name: "Laythe", id: 4, atmo: planetCurves.Laythe},
			{name: "Jool"  , id: 5, atmo: planetCurves.Jool},
		],

		propellers: [
			{name: "Large Fan Blade" , id: 1, CoLOffset: -0.4, VelOffset: -5.8, WingArea: 0.1, curves: propAeroCurves.fanBladeAeroCurves},
			{name: "Medium Fan Blade", id: 2, CoLOffset: -0.2, VelOffset: -5.8, WingArea: 0.025, curves: propAeroCurves.fanBladeAeroCurves},
			{name: "Small Fan Blade" , id: 3, CoLOffset: -0.1, VelOffset: -5.8, WingArea: 0.00625, curves: propAeroCurves.fanBladeAeroCurves},

			{name: "Large Helicopter Blade" , id: 4, CoLOffset: -1.2, VelOffset: -3.0, WingArea: 1.6, curves: propAeroCurves.heliBladeAeroCurves},
			{name: "Medium Helicopter Blade", id: 5, CoLOffset: -0.6, VelOffset: -2.5, WingArea: 0.4, curves: propAeroCurves.heliBladeAeroCurves},
			{name: "Small Helicopter Blade" , id: 6, CoLOffset: -0.3, VelOffset: -2.0, WingArea: 0.1, curves: propAeroCurves.heliBladeAeroCurves},

			{name: "Large Propeller Blade" , id: 7, CoLOffset: -0.8, VelOffset: -4.8, WingArea: 0.12, curves: propAeroCurves.propBladeAeroCurves},
			{name: "Medium Propeller Blade", id: 8, CoLOffset: -0.4, VelOffset: -4.8, WingArea: 0.03, curves: propAeroCurves.propBladeAeroCurves},
			{name: "Small Propeller Blade" , id: 9, CoLOffset: -0.2, VelOffset: -4.8, WingArea: 0.0075, curves: propAeroCurves.propBladeAeroCurves},
		],

		rotors: [
			{name: "R121 Turboshaft Engine" , id: 1, torque: 150, mass: 615 , diameter: 0.625},
			{name: "EM-16S Light Duty Rotor", id: 2, torque: 550, mass: 1215, diameter: 0.625},			
			{name: "EM-16 Light Duty Rotor" , id: 3, torque: 20 , mass: 60  , diameter: 0.625},
			{name: "EM-16S Light Duty Rotor", id: 4, torque: 20 , mass: 58  , diameter: 0.625},
			{name: "EM-32 Standard Rotor"   , id: 5, torque: 70 , mass: 310 , diameter: 0.625},
			{name: "EM-32S Standard Rotor"  , id: 6, torque: 70 , mass: 300 , diameter: 0.625},
			{name: "EM-64 Heavy Rotor"		, id: 7, torque: 400, mass: 2200, diameter: 0.625},
			{name: "EM-64S Heavy Rotor"		, id: 8, torque: 400, mass: 2150, diameter: 0.625},
		],
	},

	watch: {
		selectedPlanet: function (newPlanet, oldPlanet) {
			Plotly.purge('PressureCurve');
			Plotly.purge('TempCurve');
			Plotly.purge('DensityCurve');

			this.pressurePlotData[0].y = InitCurveX(newPlanet.atmo.Pressure[0][0], newPlanet.atmo.Pressure[newPlanet.atmo.Pressure.length - 1][0], 100);
			this.pressurePlotData[0].x = InitCurveY(this.pressurePlotData[0].y, newPlanet.atmo.Pressure);
			Plotly.newPlot('PressureCurve', this.pressurePlotData, this.pressureLayout, {displayModeBar: false});

			this.tempPlotData[0].y = InitCurveX(newPlanet.atmo.Temperature[0][0], newPlanet.atmo.Temperature[newPlanet.atmo.Temperature.length - 1][0], 100);
			this.tempPlotData[0].x = InitCurveY(this.tempPlotData[0].y, newPlanet.atmo.Temperature);
			Plotly.newPlot('TempCurve', this.tempPlotData, this.tempLayout, {displayModeBar: false});

			this.densityPlotData[0].y = InitCurveX(newPlanet.atmo.Temperature[0][0], newPlanet.atmo.Temperature[newPlanet.atmo.Temperature.length - 1][0], 100);
			this.densityPlotData[0].x = SolveDensityCurve(this.densityPlotData[0].y, newPlanet);
			Plotly.newPlot('DensityCurve', this.densityPlotData, this.densityLayout, {displayModeBar: false});
		},

		selectedPropeller: function (newPropeller, oldPropeller) {
			Plotly.purge('LiftCurve');
			Plotly.purge('DragCurve');
			Plotly.purge('LDRatioCurve');

			this.liftPlotData[0].x = this.LDxAxis;
			this.liftPlotData[0].y = InitCurveY(this.LDxAxisNormalised, newPropeller.curves.liftCurve);
			Plotly.newPlot('LiftCurve', this.liftPlotData, this.liftLayout, {displayModeBar: false});

			this.dragPlotData[0].x = this.LDxAxis;
			this.dragPlotData[0].y = InitCurveY(this.LDxAxisNormalised, newPropeller.curves.dragCurve);
			Plotly.newPlot('DragCurve', this.dragPlotData, this.dragLayout, {displayModeBar: false});

			this.ldRatioPlotData[0].x = this.LDxAxis;
			this.ldRatioPlotData[0].y = SolveLiftToDragRatio(this.LDxAxisNormalised, newPropeller.curves.liftCurve, newPropeller.curves.dragCurve);
			Plotly.newPlot('LDRatioCurve', this.ldRatioPlotData, this.ldRatioLayout, {displayModeBar: false});
		},

		selectedRotor: function (newRotor, oldRotor) {
			var velocity = InitCurveX(0, 250, 100);
			var altitude = InitCurveX(this.selectedPlanet.atmo.Pressure[0][0], this.selectedPlanet.atmo.Pressure[this.selectedPlanet.atmo.Pressure.length - 1][0], 100);
			var requiredTorque = new Array(velocity.length);
			for (var i = 0; i < velocity.length; i++) {
				requiredTorque[i] = [];
				for (var j = 0; j < altitude.length; j++) {
					requiredTorque[i][j] = SolveDrag(215, 9/90, velocity[i], altitude[j], this.selectedPlanet, this.selectedPropeller, this.selectedRotor, this.numProps);
				}
			}

			var data = [ {
					y: velocity,
					x: altitude,
					z: requiredTorque,
					type: 'contour',
				  	contours: {
    					coloring: 'heatmap'
  					}
				}
			];

			var layout = {
			  title: 'Basic Contour Plot',
			  //xaxis: {
			  //  type: 'log',
			  //  autorange: true
			  //},
			}

			Plotly.newPlot('MaxTorque', data, layout);

		},
	},

	mounted: function(){
		this.selectedPlanet = this.planets[0];
		this.selectedPropeller = this.propellers[0];
		this.selectedRotor = this.rotors[0];
	}
})