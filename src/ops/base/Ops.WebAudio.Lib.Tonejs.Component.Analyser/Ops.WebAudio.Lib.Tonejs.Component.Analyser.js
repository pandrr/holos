op.name="Analyser";

CABLES.WebAudio.createAudioContext(op);

// default values
var SIZE_DEFAULT = 1024;
//var SIZE_MIN = 32;
//var SIZE_MAX = 32768;
var SIZES = [32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768];
var RETURN_TYPES = ["byte", "float"]; // ?
var RETURN_TYPE_DEFAULT = "byte";
var TYPES = ["fft", "waveform"];
var TYPE_DEFAULT = "fft";
var SMOOTHING_DEFAULT = 0.8;
var SMOOTHING_MIN = 0.0;
var SMOOTHING_MAX = 1.0;
var MAX_DECIBELS_DEFAULT = 0;
var MIN_DECIBELS_DEFAULT = -99;
var DECIBELS_RANGE_MIN = -99;
var DECIBELS_RANGE_MAX = 0;

// vars
var node = new Tone.Analyser(TYPE_DEFAULT, SIZE_DEFAULT);

// in ports
var audioInPort = CABLES.WebAudio.createAudioInPort(op, "Audio In", node);
var refreshPort = op.addInPort( new Port( this, "Refresh", OP_PORT_TYPE_FUNCTION, { "display": "button" } ));
//var sizePort = op.addInPort( new Port( this, "Size", OP_PORT_TYPE_VALUE, { 'display': 'range', 'min': SIZE_MIN, 'max': SIZE_MAX }, SIZE_DEFAULT ));
var sizePort = this.addInPort( new Port( this, "Size", OP_PORT_TYPE_VALUE, { display: 'dropdown', values: SIZES } ) );
sizePort.set(SIZE_DEFAULT);
var typePort = this.addInPort( new Port( this, "Type", OP_PORT_TYPE_VALUE, { display: 'dropdown', values: TYPES } ) );
typePort.set(TYPE_DEFAULT);
var smoothingPort = op.addInPort( new Port( this, "Smoothing", OP_PORT_TYPE_VALUE, { 'display': 'range', 'min': SMOOTHING_MIN, 'max': SMOOTHING_MAX }, SMOOTHING_DEFAULT ));
smoothingPort.set(SMOOTHING_DEFAULT);
var maxDecibelsPort = op.addInPort( new Port( this, "Max Decibels", OP_PORT_TYPE_VALUE, { 'display': 'range', 'min': DECIBELS_RANGE_MIN, 'max': DECIBELS_RANGE_MAX }, MAX_DECIBELS_DEFAULT ));
maxDecibelsPort.set(MAX_DECIBELS_DEFAULT);
var minDecibelsPort = op.addInPort( new Port( this, "Min Decibels", OP_PORT_TYPE_VALUE, { 'display': 'range', 'min': DECIBELS_RANGE_MIN, 'max': DECIBELS_RANGE_MAX }, MIN_DECIBELS_DEFAULT ));
minDecibelsPort.set(MIN_DECIBELS_DEFAULT);
var returnTypePort = this.addInPort( new Port( this, "Return Type", OP_PORT_TYPE_VALUE, { display: 'dropdown', values: RETURN_TYPES } ) );
returnTypePort.set(RETURN_TYPE_DEFAULT);

// output ports
var audioOutPort = CABLES.WebAudio.createAudioOutPort(op, "Audio Out", node);
var analyserArrayPort = op.outArray("Analyser Array");
analyserArrayPort.set([]);

// value change listeners
sizePort.onChange = function(){
    var size = sizePort.get();
    setNodeValue("size", parseInt(size));
};
typePort.onChange = function(){setNodeValue("type", typePort.get());};
smoothingPort.onChange = function(){setNodeValue("smoothing", smoothingPort.get());};
minDecibelsPort.onChange = function(){setNodeValue("minDecibels", parseInt(minDecibelsPort.get()));};
maxDecibelsPort.onChange = function(){setNodeValue("maxDecibels", parseInt(maxDecibelsPort.get()));};
refreshPort.onTriggered = function() {
    var arr = node.analyse();
    analyserArrayPort.set(null);
    analyserArrayPort.set(arr);
    //op.log("Analyser Array: ", arr);
};
returnTypePort.onChange = function() {setNodeValue("returnType", returnTypePort.get());};


function setNodeValue(key, value) {
    op.log("change in key: ", key);
    node.set(key, value);
}

