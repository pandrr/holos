const
    src = op.inString("URL", "https://undev.studio"),
    elId = op.inString("ID"),
    active = op.inBool("Active", true),
    inStyle = op.inStringEditor("Style", "position:absolute;\nz-index:9999;\nborder:0;\nwidth:50%;\nheight:50%;"),
    outEle = op.outObject("Element");

op.setPortGroup("Attributes", [src, elId]);

let element = null;

op.onDelete = removeEle;

op.onLoadedValueSet = op.init = () =>
{
    addElement();
    updateSoon();
    inStyle.onChange =
        src.onChange =
        elId.onChange = updateSoon;

    active.onChange = updateActive;
};

function addElement()
{
    if (!active.get()) return;
    if (element) removeEle();
    element = document.createElement("iframe");
    updateAttribs();
    const parent = op.patch.cgl.canvas.parentElement;
    parent.appendChild(element);
    outEle.set(element);
}

let timeOut = null;

function updateSoon()
{
    clearTimeout(timeOut);
    timeOut = setTimeout(updateAttribs, 30);
}

function updateAttribs()
{
    if (!element) return;
    element.setAttribute("style", inStyle.get());
    element.setAttribute("src", src.get());
    element.setAttribute("id", elId.get());
}

function removeEle()
{
    if (element && element.parentNode)element.parentNode.removeChild(element);
    element = null;
    outEle.set(element);
}

function updateActive()
{
    if (!active.get())
    {
        removeEle();
        return;
    }

    addElement();
}
