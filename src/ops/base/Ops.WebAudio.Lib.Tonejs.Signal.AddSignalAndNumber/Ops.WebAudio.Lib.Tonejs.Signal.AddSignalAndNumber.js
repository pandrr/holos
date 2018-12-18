
CABLES.WEBAUDIO.createAudioContext(op);

// defaults
var VALUE_DEFAULT = 0.5;

// vars
var addNode = new Tone.Add(0);

// input ports
var signalPort = CABLES.WEBAUDIO.createAudioInPort(op, "Signal 1", addNode);
var valuePort = op.inValue("Value", VALUE_DEFAULT);

// listeners
valuePort.onChange = function() {
    op.log("signal before", addNode.value);
    addNode.set("value", valuePort.get());
    op.log("signal after", addNode.value);
};

// output ports
var audioOutPort = CABLES.WEBAUDIO.createAudioOutPort(op, "Audio Out", addNode);








