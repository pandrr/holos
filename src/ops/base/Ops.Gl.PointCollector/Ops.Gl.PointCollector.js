var render=op.inTrigger('render');
var trigger=op.outTrigger('trigger');
var outPoints=op.addOutPort(new CABLES.Port(op,"Points",CABLES.OP_PORT_TYPE_ARRAY));
outPoints.ignoreValueSerialize=true;

var inAbsolute=op.inValueBool("Absolute",true);

var points=[];
var cgl=op.patch.cgl;

var oldSplinePoints=null;

var pos=vec3.create();
var empty=vec3.create();
var m=mat4.create();

var mySplinePoints=[];

render.onTriggered=function()
{
    if(cgl.frameStore.SplinePoints)
    {
        oldSplinePoints=cgl.frameStore.SplinePoints;
        cgl.frameStore.SplinePoints=[];
    }

    cgl.frameStore.SplinePointCounter=0;

    cgl.frameStore.SplinePoints=mySplinePoints;//cgl.frameStore.SplinePoints||[];

    if(cgl.frameStore.SplinePointCounter!=cgl.frameStore.SplinePoints.length)
    cgl.frameStore.SplinePoints.length=cgl.frameStore.SplinePointCounter;

    if(!inAbsolute.get())
    {
        mat4.invert(m,cgl.mMatrix);
        cgl.frameStore.SplinePointsInverseOriginalMatrix=m;
    }
    else
    {
        cgl.frameStore.SplinePointsInverseOriginalMatrix=null;
    }

    trigger.trigger();

    outPoints.set(null);
    outPoints.set(cgl.frameStore.SplinePoints);

    if(oldSplinePoints) cgl.frameStore.SplinePoints=oldSplinePoints;
};
