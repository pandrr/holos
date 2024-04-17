const
    inObject = op.inObject("Object"),
    outObject = op.outObject("Result Object"),
    inKey = op.inString("Key"),
    inValue = op.inFloat("Number");

inObject.onChange =
    inValue.onChange = update;

inKey.setUiAttribs({ "stringTrim": true });

function update()
{
    let obj = inObject.get();
    if (!obj)obj = {};

    const newObj = JSON.parse(JSON.stringify(obj));

    newObj[inKey.get()] = inValue.get();

    outObject.setRef(newObj);
}

inKey.onChange = () =>
{
    op.setUiAttrib({ "extendTitle": inKey.get() });
    update();
};
