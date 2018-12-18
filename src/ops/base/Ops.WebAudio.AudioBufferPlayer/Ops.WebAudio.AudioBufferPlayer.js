var audioCtx = CABLES.WEBAUDIO.createAudioContext(op);

// input ports
var audioBufferPort = op.inObject("Audio Buffer");
var playPort = op.inValueBool("Start / Stop", false);
var startTimePort = op.inValue("Start Time", 0);
var stopTimePort = op.inValue("Stop Time", 0);
var offsetPort = op.inValue("Offset", 0);
var autoPlayPort = op.inValueBool("Autoplay", false);
var loopPort = op.inValueBool("Loop", false);
var detunePort = op.inValue("Detune", 0);
var playbackRatePort = op.inValue("Playback Rate", 1);

// output ports
var audioOutPort = op.outObject("Audio Out");

// vars
var source = null;

// change listeners
audioBufferPort.onChange = function() {
    createAudioBufferSource();
    if(
        (autoPlayPort.get() && audioBufferPort.get()) ||
    (playPort.get() && audioBufferPort.get())
    ) {
        start(startTimePort.get());
    }
};
playPort.onChange = function() {
    if(source) {
        if(playPort.get()) {
            var startTime = startTimePort.get() || 0;
            start(startTime);    
        } else {
            var stopTime = stopTimePort.get() || 0;
            stop(stopTime);    
        } 
    }
};
loopPort.onChange = function() {
    if(source) {
        source.loop = loopPort.get() ? true : false;
    }
};

detunePort.onChange = setDetune;

function setDetune() {
    if(source) {
        var detune = detunePort.get() || 0;
        if(source.detune) {
            source.detune.setValueAtTime(
                detune,
                audioCtx.currentTime    
            );
        }
    }
}

playbackRatePort.onChange = setPlaybackRate;

function setPlaybackRate() {
    if(source) {
        var playbackRate = playbackRatePort.get() || 0;
        if(playbackRate >= source.playbackRate.minValue && playbackRate <= source.playbackRate.maxValue) {
            source.playbackRate.setValueAtTime(
                playbackRate,
                audioCtx.currentTime    
            );    
        }
    }
}

// functions
function createAudioBufferSource() {
    if(source)stop(0);
    source = audioCtx.createBufferSource();
    var buffer = audioBufferPort.get();
    if(buffer) {
        source.buffer = buffer;
    }
    source.onended = onPlaybackEnded;
    source.loop = loopPort.get();
    setPlaybackRate();
    setDetune();
    audioOutPort.set(source);
}

function start(time) {
    try {
        source.start(time,offsetPort.get()); // 0 = now
    } catch(e){
        // console.log(e);
    } // already playing!?
}

function stop(time) {
    try {
        source.stop(time); // 0 = now
    } catch(e) 
    {
        // console.log(e);
    } // not playing!?
}

function onPlaybackEnded() {
    createAudioBufferSource(); // we can only play back once, so we need to create a new one
}