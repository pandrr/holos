var inObj=op.inObject("Object");
var inTrigger=op.inTriggerButton("Trigger");

var outObj=op.outObject("Result");

inTrigger.onTriggered=function()
{
    outObj.set(inObj.get());
};
