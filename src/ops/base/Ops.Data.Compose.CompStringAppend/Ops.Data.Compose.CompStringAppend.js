const
    update = op.inTrigger("Update"),
    inDir = op.inSwitch("Direction", ["End", "Begin"], "End"),
    inStr = op.inString("String", "."),
    next = op.outTrigger("Next");

update.onTriggered = () =>
{
    op.patch.frameStore.compString = op.patch.frameStore.compString || "";

    if (inDir.get() == "End") op.patch.frameStore.compString += inStr.get();
    else op.patch.frameStore.compString = inStr.get() + op.patch.frameStore.compString;

    next.trigger();
};
