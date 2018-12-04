const render=op.inTrigger("Render");
const blendMode=CGL.TextureEffect.AddBlendSelect(op,"Blend Mode","normal");
const amount=op.inValueSlider("Amount",1);
const trigger=op.outTrigger("Trigger");

const strength=op.inValueSlider("Strength",1);
// const lensRadius1=op.inValue("lensRadius1",0.8);
const lensRadius1=op.inValueSlider("Radius",0.5);
const sharp=op.inValueSlider("Sharp",0.25);
const aspect=op.inValue("Aspect",1);


const r=op.addInPort(new CABLES.Port(op,"r",CABLES.OP_PORT_TYPE_VALUE,{ display:'range', colorPick:'true'}));
const g=op.addInPort(new CABLES.Port(op,"g",CABLES.OP_PORT_TYPE_VALUE,{ display:'range' }));
const b=op.addInPort(new CABLES.Port(op,"b",CABLES.OP_PORT_TYPE_VALUE,{ display:'range' }));


const cgl=op.patch.cgl;
const shader=new CGL.Shader(cgl);

const srcFrag=(attachments.vignette_frag||'').replace("{{BLENDCODE}}",CGL.TextureEffect.getBlendCode());
shader.setSource(shader.getDefaultVertexShader(),srcFrag);

const textureUniform=new CGL.Uniform(shader,'t','tex',0);
const amountUniform=new CGL.Uniform(shader,'f','amount',amount);

const uniLensRadius1=new CGL.Uniform(shader,'f','lensRadius1',lensRadius1);
const uniaspect=new CGL.Uniform(shader,'f','aspect',aspect);
const unistrength=new CGL.Uniform(shader,'f','strength',strength);
const unisharp=new CGL.Uniform(shader,'f','sharp',sharp);

const unir=new CGL.Uniform(shader,'f','r',r);
const unig=new CGL.Uniform(shader,'f','g',g);
const unib=new CGL.Uniform(shader,'f','b',b);

CGL.TextureEffect.setupBlending(op,shader,blendMode,amount);

render.onTriggered=function()
{
    if(!CGL.TextureEffect.checkOpInEffect(op)) return;

    cgl.setShader(shader);
    cgl.currentTextureEffect.bind();

    cgl.setTexture(0, cgl.currentTextureEffect.getCurrentSourceTexture().tex );


    cgl.currentTextureEffect.finish();
    cgl.setPreviousShader();

    trigger.trigger();
};
