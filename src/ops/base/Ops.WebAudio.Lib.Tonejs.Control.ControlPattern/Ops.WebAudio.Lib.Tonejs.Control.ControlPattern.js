op.name="ControlPattern";

CABLES.WebAudio.createAudioContext(op);

// constants / defaults
var TYPES = [
    "up", 
    "down",
    "upDown",
    "downUp",
    "alternateUp",
    "alternateDown",
    "random",
    "randomWalk",
    "randomOnce"
];
var VALUES_DEFAULT = [];
var TYPE_DEFAULT = "up";


var node = new Tone.CtrlPattern(VALUES_DEFAULT, TYPE_DEFAULT);

// inputs
var triggerPort = op.inFunction("Trigger");
var valuesPort = op.inArray("Values");
var typePort = op.addInPort( new Port( op, "Type", OP_PORT_TYPE_VALUE, { display: 'dropdown', values: TYPES } ) );

// output
var triggerNextPort = op.outFunction("Trigger Next");
var valuePort = op.outValue("Value");
var indexPort = op.outValue("Index");

// change listeners
valuesPort.onChange = function() {
    node.set("values", valuesPort.get() || VALUES_DEFAULT);
};
typePort.onTriggered = function() {
    var t = typePort.get();
    if(t && TYPES.indexOf(t) > -1) {
        node.set("type", t);    
    }
};
triggerPort.onTriggered = function() {
    node.next();
    indexPort.set(node.index);
    valuePort.set(node.value);
    triggerNextPort.trigger();
};