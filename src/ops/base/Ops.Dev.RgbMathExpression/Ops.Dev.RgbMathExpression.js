const
    render = op.inTrigger("Render"),

    inR = op.inString("R =", "color.r*x"),
    inG = op.inString("G =", "color.g*x"),
    inB = op.inString("B =", "color.b*x"),
    inExec = op.inTriggerButton("Update Shader"),

    inX = op.inFloat("x", 1),
    inY = op.inFloat("y", 1),
    inZ = op.inFloat("z", 1),
    inW = op.inFloat("w", 1),

    intexA = op.inTexture("texA"),
    intexB = op.inTexture("texB"),

    trigger = op.outTrigger("trigger");

const cgl = op.patch.cgl;
const shader = new CGL.Shader(cgl, op.name);

shader.setSource(shader.getDefaultVertexShader(), shader.getDefaultFragmentShader());
const
    textureUniform = new CGL.Uniform(shader, "t", "tex", 0),
    textureMaskUniform = new CGL.Uniform(shader, "t", "texMask", 1),
    tex2 = new CGL.Uniform(shader, "t", "utexA", 2),
    tex3 = new CGL.Uniform(shader, "t", "utexB", 3),

    uniformW = new CGL.Uniform(shader, "f", "w", inW),
    uniformX = new CGL.Uniform(shader, "f", "x", inX),
    uniformY = new CGL.Uniform(shader, "f", "y", inY),
    uniformZ = new CGL.Uniform(shader, "f", "z", inZ);

inExec.onTriggered =
op.onLoadedValueSet = () =>
{
    init = true;
};

let init = true;

updateDefines();

inR.onChange =
inG.onChange =
inB.onChange = () =>
{
    op.setUiAttrib({ "extendTitle": "changed" });
    // inExec.setUiAttribs({ "greyout": false });
};

function updateDefines()
{

}

function updateSource()
{
    // inExec.setUiAttribs({ "greyout": true });
    op.setUiAttrib({ "extendTitle": "" });
    let src = "";
    src += "IN vec2 texCoord;".endl();
    src += "UNI float x;".endl();
    src += "UNI float y;".endl();
    src += "UNI float z;".endl();
    src += "UNI sampler2D tex;".endl();
    src += "UNI sampler2D utexA;".endl();
    src += "UNI sampler2D utexB;".endl();

    src += "void main()".endl();
    src += "{".endl().endl();
    src += "vec4 col=vec4(1.0);".endl();
    src += "vec4 color=texture(tex,texCoord);".endl();
    src += "vec4 texA=texture(utexA,texCoord);".endl();
    src += "vec4 texB=texture(utexB,texCoord);".endl().endl();

    src += "// R src".endl();
    src += "col.r=" + inR.get() + ";".endl();
    src += "".endl();

    src += "// G src".endl();
    src += "col.g=" + inG.get() + ";".endl();
    src += "".endl();

    src += "// B src".endl();
    src += "col.b=" + inB.get() + ";".endl();
    src += "".endl();

    src += "outColor=col;".endl().endl();
    src += "}".endl();

    shader.setSource(shader.getDefaultVertexShader(), src);
    shader.compile();
}

render.onTriggered = function ()
{
    if (init)
    {
        updateSource();
        init = false;
    }
    if (!CGL.TextureEffect.checkOpInEffect(op)) return;

    cgl.pushShader(shader);
    cgl.currentTextureEffect.bind();

    cgl.setTexture(0, cgl.currentTextureEffect.getCurrentSourceTexture().tex);
    // if (inTexMask.get())cgl.setTexture(1, inTexMask.get().tex);
    if (intexA.get())cgl.setTexture(2, intexA.get().tex);
    if (intexB.get())cgl.setTexture(3, intexB.get().tex);

    cgl.currentTextureEffect.finish();
    cgl.popShader();

    trigger.trigger();
};

//
